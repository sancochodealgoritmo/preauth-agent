// Fase 4 · Ensamblado de mensajes SIN volver a llamar al modelo.
// La cláusula se inyecta VERBATIM desde Catálogo o Póliza; nunca se parafrasea.
export function armarRespuestas({
  ia = null,
  decision = "",
  motivo = "",
  clausulaVerbatim = null,
  modalidad = "",
  copagoPct = null,
  reembolsoPct = null,
  montoAprobado = null,
  faltantes = [],
}) {
  if (ia) {
    const clausula = clausulaVerbatim || null;
    const extras = [`Decisión: ${decision}.`];
    if (motivo) extras.push(motivo);
    if (modalidad) extras.push(`Modalidad: ${modalidad}`);
    if (montoAprobado != null) extras.push(`Monto aprobado: USD ${montoAprobado}`);
    if (reembolsoPct != null) extras.push(`Reembolso: ${(reembolsoPct * 100).toFixed(0)} %`);
    if (copagoPct != null) extras.push(`Copago: ${(copagoPct * 100).toFixed(0)} %`);
    if (clausula) extras.push(`Cláusula contractual (textual): ${clausula}`);
    const mensajeHospital = `${ia.mensaje_hospital || ""}${extras.length ? "\n\n" + extras.join("\n") : ""}`;
    return {
      mensajePaciente: ia.mensaje_paciente || "",
      mensajeHospital,
      clausula,
    };
  }

  // Sin IA (falla en R0): mensajes deterministas.
  const lista = (faltantes || []).join(", ");
  return {
    mensajePaciente: `Tu solicitud no pudo evaluarse porque falta información. Faltan: ${lista}. Coordina con tu hospital para completarla y reenviarla.`,
    mensajeHospital: `Solicitud incompleta. Documentos o datos faltantes: ${lista}.`,
    clausula: null,
  };
}
