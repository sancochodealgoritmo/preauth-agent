import { log } from "../utils/logger.js";
import { config } from "../config.js";
import { normalizeCedula } from "../utils/normalize.js";
import { extraerFormulario } from "../ingest/extractor.js";
import { leerPoliza, leerCatalogo, leerPendientes, leerPreautorizacion } from "../notion/readers.js";
import {
  escribirPreautorizacion,
  actualizarPreautorizacion,
  construirPropiedadesEntrada,
  construirPropiedadesDecision,
  subirArchivoNotion,
} from "../notion/writers.js";
import { precheckR0, aplicarReglas } from "../rules/businessRules.js";
import { analizarSolicitud } from "./deepseek.js";
import { armarRespuestas } from "../templates/messages.js";

const sel = (v) => ({ select: { name: v } });
const num = (v) => ({ number: v });
const archivos = (arr) => ({ files: arr || [] });

function parsearExtraccion(txt) {
  try {
    const d = JSON.parse(txt);
    return { faltantes: d?.faltantes || [], ratios: d?.ratios || {}, camposPdf: d?.camposPdf || {} };
  } catch {
    return { faltantes: [], ratios: {}, camposPdf: {} };
  }
}

function generarCodigoAut(idSolicitud) {
  return `AUT-${new Date().getFullYear()}-${String(idSolicitud || "").replace(/\W/g, "").slice(-8)}`;
}

// Fase 0 + creación de la fila en Notion (POST /api/solicitudes).
export async function ingresarSolicitud(pdfBytes, adjuntos = []) {
  const extraido = await extraerFormulario(pdfBytes);
  const idSolicitud = extraido.propiedades["ID Solicitud"];
  const iteracion = 1;
  const id = `PA-${idSolicitud}-${iteracion}`;

  const pdfFile = await subirArchivoNotion(pdfBytes, `formulario-${idSolicitud}.pdf`);
  const adjFiles = [];
  for (const a of adjuntos || []) {
    const f = await subirArchivoNotion(a.buffer, a.nombre);
    if (f) adjFiles.push(f);
  }

  const entrada = construirPropiedadesEntrada({
    ...extraido.propiedades,
    Extracción: JSON.stringify({
      faltantes: extraido.faltantes,
      ratios: extraido.ratios,
      soloPdf: extraido.soloPdf,
    }).slice(0, 1900),
  });

  const propiedades = {
    ...entrada,
    "Estado": sel("Pendiente"),
    "Iteración": num(iteracion),
    "Formulario PDF": archivos(pdfFile ? [pdfFile] : []),
    "Adjuntos": archivos(adjFiles),
  };

  const fila = await escribirPreautorizacion(id, propiedades);
  return { id: fila.id, idSolicitud, iteracion, faltantes: extraido.faltantes };
}

// Punto de entrada del cron: procesa todas las filas Pendiente.
export async function procesarPendientes() {
  const pendientes = await leerPendientes();
  log.info(`📋 ${pendientes.length} solicitud(es) pendiente(s) por procesar`);
  for (const p of pendientes) {
    try {
      await procesarInforme(p.id);
    } catch (e) {
      log.error(`Error procesando ${p.idSolicitud || p.id}: ${e.message}`);
    }
  }
}

// Motor de decisión v1.5 (Fases 1 a 5) sobre una fila ya ingerida.
export async function procesarInforme(pageId, { emitir = () => {} } = {}) {
  const t0 = Date.now();
  const emitirPaso = (id, nm, tipo, estado) =>
    emitir({ type: "paso", id, nm, tipo, ms: Date.now() - t0, estado });

  emitirPaso("N0", "Solicitud leída", "det", "active");
  const fila = await leerPreautorizacion(pageId);
  emitir({ type: "informe", texto: fila.justificacion || "" });
  emitirPaso("N0", "Solicitud leída", "det", "done");

  const extra = parsearExtraccion(fila.extraccionCruda);
  const solicitud = {
    cedula: normalizeCedula(fila.cedula),
    polizaNo: fila.polizaNo,
    paciente: fila.paciente,
    caracter: fila.caracter,
    origenCondicion: fila.origenCondicion,
    fechaPrimeraEvaluacion: fila.fechaPrimeraEvaluacion,
    fechaCirugia: fila.fechaCirugia,
    cie10: fila.cie10,
    cpt: fila.cpt,
    procedimientoTexto: fila.procedimientoTexto,
    justificacion: fila.justificacion,
    montoSolicitado: fila.montoSolicitado,
    prestador: fila.prestador,
    documentosAdjuntos: fila.documentosAdjuntos,
    faltantes: extra.faltantes,
    firmas: { firma_asegurado: fila.firmaAsegurado, firma_medico: fila.firmaMedico, sello: fila.selloPresente },
  };

  emitirPaso("N1", "Datos extraídos", "det", "done");
  emitir({ type: "extraccion", campos: extra.camposPdf });

  const iteracion = fila.iteracion || 1;

  // Eje de negocio: agotadas las iteraciones → escalado documental.
  if (iteracion >= config.maxIteraciones) {
    return finalizar({
      fila, solicitud,
      decision: "ESCALADO_HUMANO",
      motivo: "[ESCALADO:DOCUMENTAL] Agotadas las iteraciones documentales",
      emitir, t0,
    });
  }

  // Fase 1 · Pre-check R0 (sin IA).
  emitirPaso("N2", "Validación mecánica", "det", "active");
  const r0 = precheckR0(solicitud);
  emitirPaso("N2", "Validación mecánica", "det", r0.ok ? "done" : "fail");
  if (!r0.ok) {
    return finalizar({
      fila, solicitud,
      decision: "DOCUMENTOS_FALTANTES",
      motivo: r0.motivo,
      faltantes: r0.faltantes,
      emitir, t0,
    });
  }

  const poliza = await leerPoliza(solicitud.cedula);
  const catalogo = await leerCatalogo();

  // Fase 2 · Interpretación clínica (una sola llamada).
  emitirPaso("N1b", "Interpretación clínica", "ia", "active");
  let ia;
  try {
    ia = await analizarSolicitud({
      informe: solicitud,
      poliza,
      catalogo,
      procedimiento: { cpt: solicitud.cpt || null, texto: solicitud.procedimientoTexto || null },
      iteracion,
    });
  } catch (e) {
    log.error("DeepSeek falló (R1 y V3):", e.message);
    return finalizar({
      fila, solicitud,
      decision: "ESCALADO_HUMANO",
      motivo: "[ESCALADO:PROVEEDOR] Falla de DeepSeek R1 y V3",
      emitir, t0,
    });
  }
  emitir({ type: "modelo", nombre: ia._modelo, ms: ia._latencia_ms });
  emitirPaso("N1b", "Interpretación clínica", "ia", "done");
  emitir({ type: "interpretacion", data: ia.interpretacion });

  // Fase 3 · Reglas R1-R12.
  emitirPaso("N3", "Reglas evaluadas", "det", "active");
  const reglas = aplicarReglas({ solicitud, poliza, catalogo, interpretacion: ia.interpretacion || {} });
  const aprobadas = reglas.decision === "APROBADO" || reglas.decision === "APROBADO_CON_CONDICION";
  emitirPaso("N3", "Reglas evaluadas", "det", aprobadas ? "done" : "fail");

  // Fase 4 · Cláusula verbatim + mensajes.
  const clausula = reglas.clausula || null;
  const respuestas = armarRespuestas({
    ia,
    decision: reglas.decision,
    motivo: reglas.motivo,
    clausulaVerbatim: clausula,
    modalidad: reglas.modalidad,
    copagoPct: reglas.copagoPct,
    reembolsoPct: reglas.reembolsoPct,
    montoAprobado: reglas.montoAprobado,
  });

  return finalizar({
    fila, solicitud, poliza, reglas, ia, clausula, respuestas,
    decision: reglas.decision,
    motivo: reglas.motivo,
    emitir, t0,
  });
}

async function finalizar({
  fila,
  solicitud,
  poliza = null,
  ia = null,
  reglas = null,
  clausula = null,
  respuestas = null,
  decision,
  motivo,
  faltantes = [],
  emitir,
  t0,
}) {
  const emitirPaso = (id, nm, tipo, estado) =>
    emitir({ type: "paso", id, nm, tipo, ms: Date.now() - t0, estado });
  const latenciaMs = Date.now() - t0;
  const iteracion = fila.iteracion || 1;

  emitirPaso("N4", "Respuesta redactada", "ia", "active");
  const r = respuestas || armarRespuestas({ ia, decision, motivo, clausulaVerbatim: clausula, faltantes });
  emitirPaso("N4", "Respuesta redactada", "ia", "done");

  if (decision === "DOCUMENTOS_FALTANTES" && iteracion >= config.maxIteraciones) {
    decision = "ESCALADO_HUMANO";
    motivo = "[ESCALADO:DOCUMENTAL] Agotadas las iteraciones documentales";
  }

  const estadoFinal =
    decision === "DOCUMENTOS_FALTANTES"
      ? "Reenviado"
      : decision === "ESCALADO_HUMANO"
        ? "Escalado"
        : "Resuelto";

  const esAprobado = decision === "APROBADO" || decision === "APROBADO_CON_CONDICION";
  const datos = {
    estado: estadoFinal,
    iteracion,
    decision,
    motivo,
    clausula: clausula || null,
    trazas: JSON.stringify(reglas?.trazas || []),
    documentosFaltantes: JSON.stringify(faltantes || []),
    codigoAut: esAprobado ? generarCodigoAut(fila.idSolicitud) : null,
    vigencia: esAprobado ? fila.fechaCirugia || null : null,
    mensajePaciente: r.mensajePaciente,
    mensajeHospital: r.mensajeHospital,
    modalidad: reglas?.modalidad || "No aplica",
    copagoPct: reglas?.copagoPct ?? null,
    reembolsoPct: reglas?.reembolsoPct ?? null,
    tope: reglas?.tope ?? null,
    montoAprobado: reglas?.montoAprobado ?? null,
    cptResuelto: reglas?.cptFinal || (ia?.interpretacion?.cpt_resuelto || ""),
    interpretacion: ia ? JSON.stringify(ia.interpretacion || {}) : "",
    confianza: ia?.interpretacion?.confianza ?? null,
    modelo: ia?._modelo || null,
    rulesVersion: config.rulesVersion,
    latenciaMs,
    polizaId: poliza?.id || null,
  };

  emitirPaso("N5", "Escrito en Notion", "det", "active");
  await actualizarPreautorizacion(fila.id, construirPropiedadesDecision(datos));
  emitirPaso("N5", "Escrito en Notion", "det", "done");

  const resultado = {
    decision,
    motivo,
    id: fila.id,
    codigo_autorizacion: datos.codigoAut,
    copago_pct: datos.copagoPct,
    reembolso_pct: datos.reembolsoPct,
    tope_autorizado: datos.tope,
    monto_aprobado: datos.montoAprobado,
    modalidad: datos.modalidad,
    vigencia_autorizacion: datos.vigencia,
    documentos_faltantes: faltantes,
    clausula_citada: clausula,
    mensaje_paciente: r.mensajePaciente,
    mensaje_hospital: r.mensajeHospital,
    interpretacion: ia?.interpretacion || {},
    trazas: reglas?.trazas || [],
    texto_informe: fila.justificacion || "",
    modelo: ia?._modelo || null,
    latencia_ms: latenciaMs,
  };

  emitir({ type: "resultado", data: resultado });
  emitir({ type: "fin" });
  log.ok(`✅ ${fila.idSolicitud || fila.id} → ${decision} (${latenciaMs} ms)`);
  return resultado;
}
