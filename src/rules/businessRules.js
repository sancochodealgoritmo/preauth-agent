import { config } from "../config.js";

function sumarMeses(fechaISO, meses) {
  if (!fechaISO) return "";
  const [anio, mes, dia] = fechaISO.split("-").map(Number);
  const d = new Date(Date.UTC(anio, mes - 1 + meses, dia));
  return d.toISOString().slice(0, 10);
}

function prefijo3(codigo) {
  return String(codigo || "").trim().toUpperCase().slice(0, 3);
}

// Fase 1 · Pre-check determinista (R0), sin IA.
export function precheckR0(solicitud) {
  const faltantes = solicitud.faltantes || [];
  if (faltantes.length) {
    return { ok: false, motivo: `Formulario incompleto. Faltan: ${faltantes.join(", ")}`, faltantes };
  }
  const esUrgente = solicitud.caracter === "Urgente";
  const tieneReporte = (solicitud.documentosAdjuntos || []).includes("Reporte de cuarto de urgencia");
  if (esUrgente && !tieneReporte) {
    return { ok: false, motivo: "Solicitud URGENTE sin reporte del cuarto de urgencia", faltantes: [] };
  }
  return { ok: true, motivo: "", faltantes };
}

// Motor de reglas R1-R12. Función pura: no llama a Notion ni al LLM.
export function aplicarReglas({ solicitud, poliza, catalogo, interpretacion, prestadores = [] }) {
  const trazas = [];
  const ok = (paso, detalle) => trazas.push({ paso, ok: true, detalle });
  const falla = (paso, detalle, decision, motivo, extra = {}) => {
    trazas.push({ paso, ok: false, detalle });
    return { decision, motivo, trazas, ...extra };
  };

  ok("R0", "Formulario completo con las 3 marcas");

  // R1 · Existe póliza para la cédula normalizada.
  if (!poliza) {
    return falla(
      "R1",
      `Sin póliza para la cédula ${solicitud.cedula}`,
      "ESCALADO_HUMANO",
      "[ESCALADO:AFILIADO] Cédula sin póliza asociada"
    );
  }
  ok("R1", `Póliza ${poliza.polizaNo || ""} encontrada`);

  // R2 · El Póliza No. del formulario coincide.
  if (String(solicitud.polizaNo || "").trim() !== String(poliza.polizaNo || "").trim()) {
    return falla(
      "R2",
      `Póliza No. del formulario ${solicitud.polizaNo} ≠ ${poliza.polizaNo}`,
      "ESCALADO_HUMANO",
      "[ESCALADO:AFILIADO] Póliza No. no coincide con la póliza del afiliado"
    );
  }
  ok("R2", `Póliza No. ${poliza.polizaNo} coincide`);

  // R3 · Fecha de cirugía dentro de la vigencia.
  const fecha = solicitud.fechaCirugia;
  const vigente = fecha >= poliza.vigenciaDesde && fecha <= poliza.vigenciaHasta;
  if (!vigente) {
    return falla(
      "R3",
      `Fecha de cirugía ${fecha} fuera de vigencia ${poliza.vigenciaDesde}~${poliza.vigenciaHasta}`,
      "RECHAZADO",
      "Póliza fuera de vigencia a la fecha de la cirugía",
      { clausula: poliza.clausulas }
    );
  }
  ok("R3", `Vigente de ${poliza.vigenciaDesde} a ${poliza.vigenciaHasta}`);

  // R4 · Estado de pago "Al día".
  if (poliza.estadoPago !== "Al día") {
    return falla(
      "R4",
      `Estado de pago: ${poliza.estadoPago}`,
      "RECHAZADO",
      "Póliza en mora",
      { clausula: poliza.clausulas }
    );
  }
  ok("R4", "Pago al día");

  // R5 · Prestador: red directa, reembolso fuera de red, o no reconocido.
  const prestador = String(solicitud.prestador || "").trim();
  const enRed = (poliza.redHospitalaria || []).some(
    (r) => r.trim().toLowerCase() === prestador.toLowerCase()
  );
  const conocido = (prestadores || []).some(
    (p) => String(p.nombre || "").trim().toLowerCase() === prestador.toLowerCase()
  );
  let modalidad = "No aplica";
  if (enRed) {
    modalidad = "Red (pago directo)";
    ok("R5", `${prestador} está en la red del plan`);
  } else if (conocido) {
    const reembolso = Number(poliza.reembolsoFueraRed || 0);
    if (reembolso > 0) {
      modalidad = "Reembolso fuera de red";
      ok("R5", `${prestador} fuera de red; reembolso ${(reembolso * 100).toFixed(0)} %`);
    } else {
      return falla(
        "R5",
        `${prestador} fuera de red y el plan no cubre reembolso`,
        "RECHAZADO",
        "Prestador fuera de la red y el plan no cubre reembolso fuera de red",
        { clausula: poliza.clausulas }
      );
    }
  } else {
    return falla(
      "R5",
      `Prestador no reconocido: ${prestador}`,
      "ESCALADO_HUMANO",
      `[ESCALADO:PRESTADOR] Prestador no reconocido: ${prestador}`
    );
  }

  // R6 · CPT informado y en catálogo; si vacío, lo propone la Fase 2.
  let cptFinal = String(solicitud.cpt || "").trim();
  let procedimiento = null;
  if (cptFinal) {
    procedimiento = catalogo.find((c) => c.codigoCpt === cptFinal) || null;
    if (!procedimiento) {
      return falla(
        "R6",
        `CPT ${cptFinal} no existe en el catálogo`,
        "ESCALADO_HUMANO",
        "[ESCALADO:CODIFICACION] CPT inexistente en el catálogo"
      );
    }
    ok("R6", `CPT ${cptFinal} en catálogo`);
  } else {
    const resuelto = interpretacion && String(interpretacion.cpt_resuelto || "").trim();
    const confianza = Number(interpretacion && interpretacion.confianza);
    const alternativas = (interpretacion && interpretacion.alternativas) || [];
    if (!resuelto || !Number.isFinite(confianza) || confianza < config.umbralConfianza || alternativas.length > 1) {
      return falla(
        "R6",
        `CPT vacío/ambiguo (confianza ${Number.isFinite(confianza) ? confianza.toFixed(2) : "—"})`,
        "ESCALADO_HUMANO",
        "[ESCALADO:CODIFICACION] CPT vacío o ambiguo; se requiere confirmación"
      );
    }
    cptFinal = resuelto;
    procedimiento = catalogo.find((c) => c.codigoCpt === cptFinal) || null;
    if (!procedimiento) {
      return falla(
        "R6",
        `CPT propuesto ${cptFinal} no está en el catálogo`,
        "ESCALADO_HUMANO",
        "[ESCALADO:CODIFICACION] CPT propuesto inexistente en el catálogo"
      );
    }
    ok("R6", `CPT resuelto por Fase 2: ${cptFinal} (confianza ${confianza.toFixed(2)})`);
  }

  // R7 · Cubierto y categoría no excluida por el plan.
  const exclusiones = (poliza.exclusionesPlan || []).map((e) => e.toLowerCase());
  const excluido = !procedimiento.cubierto || exclusiones.includes(String(procedimiento.categoria).toLowerCase());
  if (excluido) {
    const clausula = procedimiento.motivoExclusion || procedimiento.clausula || poliza.clausulas;
    const causa = !procedimiento.cubierto
      ? "procedimiento no cubierto"
      : `categoría ${procedimiento.categoria} excluida del plan`;
    return falla("R7", causa, "RECHAZADO", `Procedimiento rechazado: ${causa}`, { clausula });
  }
  ok("R7", "Procedimiento cubierto y categoría no excluida");

  // R8 · CIE-10 coherente con el procedimiento (categoría de 3 caracteres).
  const dx = String(solicitud.cie10 || "").trim().toUpperCase();
  const ciesCatalogo = String(procedimiento.cie10Asociado || "")
    .split("|")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  const coherente = ciesCatalogo.some((c) => prefijo3(c) === prefijo3(dx));
  if (!coherente) {
    return falla(
      "R8",
      `${dx} no es coherente con ${procedimiento.codigoCpt} (${procedimiento.cie10Asociado})`,
      "ESCALADO_HUMANO",
      "[ESCALADO:CLINICO] CIE-10 incoherente con el procedimiento"
    );
  }
  ok("R8", `${dx} coherente con ${procedimiento.codigoCpt}`);

  // R9 · Sin preexistencia declarada y primera evaluación ≥ fecha de inicio.
  const preexistencias = String(poliza.preexistencias || "")
    .split("|")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  const preexistenciaDeclarada = preexistencias.some(
    (c) => c === dx || prefijo3(c) === prefijo3(dx)
  );
  const primeraEvaluacion = solicitud.fechaPrimeraEvaluacion;
  const evaluacionPrevia = primeraEvaluacion && primeraEvaluacion < poliza.fechaInicio;
  if (preexistenciaDeclarada || evaluacionPrevia) {
    const detalle = preexistenciaDeclarada
      ? `Preexistencia declarada (${dx})`
      : `Primera evaluación ${primeraEvaluacion} anterior al inicio ${poliza.fechaInicio}`;
    return falla("R9", detalle, "RECHAZADO", `Preexistencia no cubierta: ${detalle}`, {
      clausula: poliza.clausulas,
    });
  }
  ok("R9", "Sin preexistencia bloqueante");

  // R10 · Carencia cumplida; no aplica a accidentes.
  if (solicitud.origenCondicion === "Accidente") {
    ok("R10", "Accidente: la carencia no aplica");
  } else {
    const carenciaCumplida =
      poliza.fechaInicio && fecha && sumarMeses(poliza.fechaInicio, procedimiento.carenciaMeses || 0) <= fecha;
    if (!carenciaCumplida) {
      return falla(
        "R10",
        `Carencia de ${procedimiento.carenciaMeses} meses no cumplida`,
        "RECHAZADO",
        "Carencia no cumplida a la fecha de la cirugía",
        { clausula: poliza.clausulas }
      );
    }
    ok("R10", `Carencia de ${procedimiento.carenciaMeses} meses cumplida`);
  }

  // R11 · Documentos requeridos adjuntos; el formulario firmado cuenta como informe médico.
  const docsDisponibles = new Set([
    ...(solicitud.documentosAdjuntos || []),
    "Informe médico firmado", // el formulario firmado y sellado
  ]);
  const requeridos = procedimiento.docsRequeridos || [];
  const faltanDocs = requeridos.filter((d) => !docsDisponibles.has(d));
  if (faltanDocs.length) {
    if (faltanDocs.includes("Segunda opinión médica")) {
      return falla(
        "R11",
        `Falta segunda opinión médica para ${procedimiento.codigoCpt}`,
        "SEGUNDA_OPINION",
        "El procedimiento requiere segunda opinión médica adjunta"
      );
    }
    return falla(
      "R11",
      `Faltan documentos: ${faltanDocs.join(", ")}`,
      "DOCUMENTOS_FALTANTES",
      `Documentación incompleta: ${faltanDocs.join(", ")}`
    );
  }
  ok("R11", "Documentos requeridos adjuntos");

  // R12 · Montos y modalidad (sección 9.2).
  const monto = Number(solicitud.montoSolicitado || 0);
  const saldoAnual = (poliza.topeAnual || 0) - (poliza.topeConsumido || 0);
  const topeProc = Number(procedimiento.tope || 0);
  let decision, motivo, montoAprobado = null, copagoPct = null, reembolsoPct = null, tope = topeProc;

  if (modalidad === "Red (pago directo)") {
    const disponible = Math.min(topeProc, saldoAnual);
    copagoPct = Math.max(Number(poliza.copagoPct || 0), Number(procedimiento.copagoPct || 0));
    montoAprobado = Math.round(Math.min(monto, disponible) * (1 - copagoPct) * 100) / 100;
    if (monto <= disponible) {
      decision = "APROBADO";
      motivo = "Cumple todas las reglas; prestador en red";
    } else {
      decision = "APROBADO_CON_CONDICION";
      motivo = `Monto supera el tope disponible; se aprueba por ${disponible}`;
    }
    ok("R12", `Red: disponible ${disponible}, copago ${(copagoPct * 100).toFixed(0)} %, aprobado ${montoAprobado}`);
  } else {
    // Reembolso fuera de red
    const base = Math.min(monto, topeProc, saldoAnual);
    reembolsoPct = Number(poliza.reembolsoFueraRed || 0);
    montoAprobado = Math.round(base * reembolsoPct * 100) / 100;
    decision = "APROBADO_CON_CONDICION";
    motivo = `Prestador fuera de red; reembolso del ${(reembolsoPct * 100).toFixed(0)} % sobre ${base}`;
    ok("R12", `Reembolso: base ${base}, ${(reembolsoPct * 100).toFixed(0)} % → ${montoAprobado}`);
  }

  if (procedimiento.requiereAuditoria) {
    trazas.push({ paso: "auditoria", ok: true, detalle: "Marca para auditoría médica posterior" });
  }

  return {
    decision,
    motivo,
    trazas,
    modalidad,
    cptFinal,
    procedimiento,
    copagoPct,
    reembolsoPct,
    tope,
    montoAprobado,
  };
}
