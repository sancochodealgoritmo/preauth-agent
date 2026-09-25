import { config } from "../config.js";
import { notion, consultarNotion } from "./client.js";
import { invalidarCache } from "./cache.js";
import { normalizeCedula } from "../utils/normalize.js";
import { extraer } from "./readers.js";

const titulo = (v) => ({ title: [{ text: { content: String(v ?? "") } }] });
const rich = (v) => ({ rich_text: v ? [{ text: { content: String(v) } }] : [] });
const numero = (v) => ({ number: v == null ? null : Number(v) });
const seleccion = (v) => ({ select: v ? { name: v } : null });
const fecha = (v) => ({ date: v ? { start: v } : null });
const checkbox = (v) => ({ checkbox: Boolean(v) });
const multi = (arr) => ({ multi_select: (arr || []).map((n) => ({ name: n })) });
const email = (v) => ({ email: v || null });
const telefono = (v) => ({ phone_number: v || null });
const archivos = (arr) => ({ files: arr || [] });
const relacion = (ids) => ({ relation: (ids || []).map((id) => ({ id })) });

// Propiedades de entrada (Fase 0) para la fila de preautorización.
export function construirPropiedadesEntrada(p) {
  return {
    "ID Solicitud": rich(p["ID Solicitud"]),
    "Cédula": rich(p["Cédula"]),
    "Paciente": rich(p["Paciente"]),
    "Póliza No.": rich(p["Póliza No."]),
    "Tipo de servicio": seleccion(p["Tipo de servicio"]),
    "Carácter": seleccion(p["Carácter"]),
    "Origen de la condición": seleccion(p["Origen de la condición"]),
    "Fecha primera evaluación": fecha(p["Fecha primera evaluación"]),
    "Fecha cirugía": fecha(p["Fecha cirugía"]),
    "CIE-10": rich(p["CIE-10"]),
    "Diagnóstico (descripción)": rich(p["Diagnóstico (descripción)"]),
    "CPT": rich(p["CPT"]),
    "Procedimiento (texto)": rich(p["Procedimiento (texto)"]),
    "Justificación": rich(String(p["Justificación"] || "").slice(0, 1900)),
    "Monto solicitado": numero(p["Monto solicitado"]),
    "Prestador": rich(p["Prestador"]),
    "Médico": rich(p["Médico"]),
    "Documentos adjuntos": multi(p["Documentos adjuntos"]),
    "Firma asegurado": checkbox(p["Firma asegurado"]),
    "Firma médico": checkbox(p["Firma médico"]),
    "Sello presente": checkbox(p["Sello presente"]),
    "Verificación de firmas": rich(p["Verificación de firmas"]),
    "Extracción": rich(p["Extracción"]),
  };
}

// Propiedades de decisión (Fase 5).
export function construirPropiedadesDecision(d) {
  return {
    "Estado": seleccion(d.estado),
    "Iteración": numero(d.iteracion),
    "Decisión": seleccion(d.decision),
    "Motivo": rich(d.motivo),
    "Cláusula": rich(d.clausula),
    "Trazas": rich(d.trazas),
    "Documentos faltantes": rich(d.documentosFaltantes),
    "Código AUT": rich(d.codigoAut),
    "Vigencia": fecha(d.vigencia),
    "Mensaje paciente": rich(d.mensajePaciente),
    "Mensaje hospital": rich(d.mensajeHospital),
    "Modalidad": seleccion(d.modalidad),
    "Copago %": numero(d.copagoPct),
    "Reembolso %": numero(d.reembolsoPct),
    "Tope": numero(d.tope),
    "Monto aprobado": numero(d.montoAprobado),
    "CPT resuelto": rich(d.cptResuelto),
    "Interpretación": rich(d.interpretacion),
    "Confianza": numero(d.confianza),
    "Modelo": seleccion(d.modelo),
    "Rules version": rich(d.rulesVersion),
    "Latencia (ms)": numero(d.latenciaMs),
    "Póliza": relacion(d.polizaId ? [d.polizaId] : []),
  };
}

export async function buscarPorId(id) {
  const res = await consultarNotion(() =>
    notion.databases.query({
      database_id: config.notion.databases.preautorizaciones,
      filter: { property: "ID", title: { equals: id } },
    })
  );
  return res.results[0] || null;
}

// Idempotencia: crea o actualiza la fila por el ID PA-{ID Solicitud}-{iteración}.
export async function escribirPreautorizacion(id, propiedades) {
  const existente = await buscarPorId(id);
  if (existente) {
    const actualizado = await consultarNotion(() =>
      notion.pages.update({ page_id: existente.id, properties: propiedades })
    );
    return { id: actualizado.id, creado: false };
  }
  const creado = await consultarNotion(() =>
    notion.pages.create({
      parent: { database_id: config.notion.databases.preautorizaciones },
      properties: { ID: titulo(id), ...propiedades },
    })
  );
  return { id: creado.id, creado: true };
}

export async function actualizarPreautorizacion(pageId, propiedades) {
  return consultarNotion(() =>
    notion.pages.update({ page_id: pageId, properties: propiedades })
  );
}

// Sube un archivo a Notion con la File Upload API; si falla, devuelve null.
export async function subirArchivoNotion(buffer, nombre) {
  try {
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: "application/pdf" }), nombre);
    const res = await fetch("https://file-api.notion.com/v1/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.notion.token}`,
        "Notion-Version": "2022-06-28",
      },
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(data));
    return { name: data.name || nombre, type: "file", file: data.file };
  } catch (e) {
    return null;
  }
}

// ── Administración (aseguradora): pólizas y catálogo ─────────────

export function propsPoliza(d) {
  return {
    "Paciente": rich(d.paciente),
    "Póliza No.": rich(d.polizaNo),
    "Plan": seleccion(d.plan),
    "Fecha inicio": fecha(d.fechaInicio),
    "Vigencia desde": fecha(d.vigenciaDesde),
    "Vigencia hasta": fecha(d.vigenciaHasta),
    "Estado de pago": seleccion(d.estadoPago),
    "Red hospitalaria": multi(d.redHospitalaria),
    "Reembolso fuera de red %": numero(d.reembolsoFueraRed),
    "Copago %": numero(d.copagoPct),
    "Tope anual": numero(d.topeAnual),
    "Tope consumido": numero(d.topeConsumido),
    "Preexistencias": rich(d.preexistencias),
    "Exclusiones plan": multi(d.exclusionesPlan),
    "Cláusulas": rich(d.clausulas),
  };
}

export async function crearActualizarPoliza(d) {
  const cedula = normalizeCedula(d.cedula);
  const res = await consultarNotion(() =>
    notion.databases.query({ database_id: config.notion.databases.polizas, page_size: 100 })
  );
  const existente = res.results.find(
    (p) => normalizeCedula(extraer.title(p.properties["Cédula"])) === cedula
  );
  if (existente) {
    await consultarNotion(() => notion.pages.update({ page_id: existente.id, properties: propsPoliza(d) }));
    return { id: existente.id, creado: false };
  }
  const creado = await consultarNotion(() =>
    notion.pages.create({
      parent: { database_id: config.notion.databases.polizas },
      properties: { "Cédula": titulo(d.cedula), ...propsPoliza(d) },
    })
  );
  return { id: creado.id, creado: true };
}

export function propsCatalogo(d) {
  return {
    "Nombre": rich(d.nombre),
    "CIE-10 asociado": rich(d.cie10Asociado),
    "Sinónimos": rich(d.sinonimos),
    "Categoría": seleccion(d.categoria),
    "Cubierto": checkbox(d.cubierto),
    "Motivo exclusión": rich(d.motivoExclusion),
    "Cláusula": rich(d.clausula),
    "Carencia (meses)": numero(d.carenciaMeses),
    "Copago %": numero(d.copagoPct),
    "Tope": numero(d.tope),
    "Docs requeridos": multi(d.docsRequeridos),
    "Requiere auditoría": checkbox(d.requiereAuditoria),
  };
}

export async function crearActualizarProcedimiento(d) {
  const cpt = String(d.codigoCpt || "").trim();
  const res = await consultarNotion(() =>
    notion.databases.query({
      database_id: config.notion.databases.catalogo,
      filter: { property: "Código CPT", title: { equals: cpt } },
    })
  );
  if (res.results.length) {
    await consultarNotion(() => notion.pages.update({ page_id: res.results[0].id, properties: propsCatalogo(d) }));
    invalidarCache("catalogo");
    return { id: res.results[0].id, creado: false };
  }
  const creado = await consultarNotion(() =>
    notion.pages.create({
      parent: { database_id: config.notion.databases.catalogo },
      properties: { "Código CPT": titulo(cpt), ...propsCatalogo(d) },
    })
  );
  invalidarCache("catalogo");
  return { id: creado.id, creado: true };
}

// ── Administración: prestadores ──────────────────────────────────

export function propsPrestador(d) {
  return {
    "Código": rich(d.codigo),
    "Red": multi(d.red),
    "Ciudad": seleccion(d.ciudad),
    "Dirección": rich(d.direccion),
    "Teléfono": telefono(d.telefono),
    "Email": email(d.email),
    "Activo": checkbox(d.activo),
    "Notas": rich(d.notas),
  };
}

export async function crearActualizarPrestador(d) {
  const nombre = String(d.nombre || "").trim();
  if (!nombre) throw new Error("El nombre del prestador es obligatorio");
  const res = await consultarNotion(() =>
    notion.databases.query({
      database_id: config.notion.databases.prestadores,
      filter: { property: "Nombre", title: { equals: nombre } },
    })
  );
  if (res.results.length) {
    await consultarNotion(() => notion.pages.update({ page_id: res.results[0].id, properties: propsPrestador(d) }));
    return { id: res.results[0].id, creado: false };
  }
  const creado = await consultarNotion(() =>
    notion.pages.create({
      parent: { database_id: config.notion.databases.prestadores },
      properties: { "Nombre": titulo(nombre), ...propsPrestador(d) },
    })
  );
  return { id: creado.id, creado: true };
}

// ── Archivado (eliminación lógica en Notion) ─────────────────────

async function archivarPagina(pageId) {
  return consultarNotion(() => notion.pages.update({ page_id: pageId, archived: true }));
}

export async function archivarPoliza(pageId) {
  return archivarPagina(pageId);
}

export async function archivarProcedimiento(pageId) {
  const res = await archivarPagina(pageId);
  invalidarCache("catalogo");
  return res;
}

export async function archivarPrestador(pageId) {
  return archivarPagina(pageId);
}

// ── Revisión (analista): resolver escalados ──────────────────────

export async function resolverEscalado(pageId, nota) {
  const page = await consultarNotion(() => notion.pages.retrieve({ page_id: pageId }));
  const motivoActual = extraer.rich_text(page.properties["Motivo"]);
  const nuevoMotivo = nota ? `${motivoActual} · [REVISADO] ${nota}` : motivoActual;
  return consultarNotion(() =>
    notion.pages.update({
      page_id: pageId,
      properties: { "Estado": seleccion("Resuelto"), "Motivo": rich(nuevoMotivo) },
    })
  );
}

// ── Reenvío documental: devuelve un caso Reenviado a Pendiente ────

export async function reenviarPreautorizacion(pageId, adjuntos = []) {
  const page = await consultarNotion(() => notion.pages.retrieve({ page_id: pageId }));
  const estado = extraer.select(page.properties["Estado"]);
  const decision = extraer.select(page.properties["Decisión"]);
  if (estado !== "Reenviado" && decision !== "DOCUMENTOS_FALTANTES") {
    throw new Error("La solicitud no está pendiente de documentos");
  }
  const iteracion = extraer.number(page.properties["Iteración"]) ?? 1;
  const nuevaIteracion = Math.min(iteracion + 1, config.maxIteraciones);

  // Anexa los documentos corregidos a la propiedad "Adjuntos" (conservando los previos).
  const adjuntosPrevios = page.properties["Adjuntos"]?.files ?? [];
  const nuevos = [];
  for (const a of adjuntos || []) {
    const f = await subirArchivoNotion(a.buffer, a.nombre);
    if (f) nuevos.push(f);
  }

  const propiedades = {
    "Estado": seleccion("Pendiente"),
    "Iteración": numero(nuevaIteracion),
  };
  if (nuevos.length) propiedades["Adjuntos"] = { files: [...adjuntosPrevios, ...nuevos] };

  return consultarNotion(() => notion.pages.update({ page_id: pageId, properties: propiedades }));
}
