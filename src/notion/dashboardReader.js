import { config } from "../config.js";
import { notion, consultarNotion } from "./client.js";
import { extraer } from "./readers.js";

function parsearJson(txt) {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

export async function listarSolicitudesRecientes(limite = 50) {
  const res = await consultarNotion(() =>
    notion.databases.query({
      database_id: config.notion.databases.preautorizaciones,
      page_size: limite,
      sorts: [{ timestamp: "created_time", direction: "descending" }],
    })
  );
  return res.results.map((p) => {
    const props = p.properties || {};
    return {
      id: p.id,
      idSolicitud: extraer.rich_text(props["ID Solicitud"]),
      paciente: extraer.rich_text(props["Paciente"]),
      decision: extraer.select(props["Decisión"]) || extraer.select(props["Estado"]) || "PENDIENTE",
      modelo: extraer.select(props["Modelo"]),
      latencia_ms: extraer.number(props["Latencia (ms)"]),
      modalidad: extraer.select(props["Modalidad"]),
      monto_aprobado: extraer.number(props["Monto aprobado"]),
      timestamp: p.created_time,
    };
  });
}

export async function getDetalleSolicitud(pageId) {
  const page = await consultarNotion(() => notion.pages.retrieve({ page_id: pageId }));
  const props = page.properties || {};

  const extraccion = parsearJson(extraer.rich_text(props["Extracción"]));
  const interpretacion = parsearJson(extraer.rich_text(props["Interpretación"]));
  const trazas = parsearJson(extraer.rich_text(props["Trazas"]));
  const documentos = parsearJson(extraer.rich_text(props["Documentos faltantes"]));

  return {
    id: page.id,
    idSolicitud: extraer.rich_text(props["ID Solicitud"]),
    paciente: extraer.rich_text(props["Paciente"]),
    prestador: extraer.rich_text(props["Prestador"]),
    cpt: extraer.rich_text(props["CPT"]),
    cie10: extraer.rich_text(props["CIE-10"]),
    decision: extraer.select(props["Decisión"]),
    motivo: extraer.rich_text(props["Motivo"]),
    codigo_autorizacion: extraer.rich_text(props["Código AUT"]),
    copago_pct: extraer.number(props["Copago %"]),
    reembolso_pct: extraer.number(props["Reembolso %"]),
    tope_autorizado: extraer.number(props["Tope"]),
    monto_aprobado: extraer.number(props["Monto aprobado"]),
    modalidad: extraer.select(props["Modalidad"]),
    vigencia_autorizacion: extraer.date(props["Vigencia"]),
    documentos_faltantes: Array.isArray(documentos) ? documentos : [],
    clausula_citada: extraer.rich_text(props["Cláusula"]),
    mensaje_paciente: extraer.rich_text(props["Mensaje paciente"]),
    mensaje_hospital: extraer.rich_text(props["Mensaje hospital"]),
    extraccion: extraccion && typeof extraccion === "object" ? extraccion : {},
    interpretacion: interpretacion && typeof interpretacion === "object" ? interpretacion : {},
    trazas: Array.isArray(trazas) ? trazas : [],
    texto_informe: extraer.rich_text(props["Justificación"]),
    modelo: extraer.select(props["Modelo"]),
    latencia_ms: extraer.number(props["Latencia (ms)"]),
  };
}
