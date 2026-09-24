import { config } from "../config.js";
import { notion, consultarNotion } from "./client.js";
import { obtenerCache, guardarCache } from "./cache.js";
import { normalizeCedula } from "../utils/normalize.js";

// Extracción de propiedades Notion a valores planos.
export const extraer = {
  title: (p) => p?.title?.map((t) => t.plain_text).join("") ?? "",
  rich_text: (p) => p?.rich_text?.map((t) => t.plain_text).join("") ?? "",
  select: (p) => p?.select?.name ?? "",
  multi_select: (p) => p?.multi_select?.map((s) => s.name) ?? [],
  number: (p) => (p?.number == null ? null : p.number),
  date: (p) => p?.date?.start ?? "",
  checkbox: (p) => p?.checkbox ?? false,
  email: (p) => p?.email ?? "",
  phone: (p) => p?.phone_number ?? "",
  files: (p) => (p?.files ?? []).map((f) => ({ nombre: f.name, url: f.file?.url ?? f.external?.url ?? "" })),
  relation: (p) => p?.relation?.map((r) => r.id) ?? [],
};

function mapearCatalogo(page) {
  const props = page.properties || {};
  return {
    id: page.id,
    codigoCpt: extraer.title(props["Código CPT"]),
    nombre: extraer.rich_text(props["Nombre"]),
    cie10Asociado: extraer.rich_text(props["CIE-10 asociado"]),
    sinonimos: extraer.rich_text(props["Sinónimos"]),
    categoria: extraer.select(props["Categoría"]),
    cubierto: extraer.checkbox(props["Cubierto"]),
    motivoExclusion: extraer.rich_text(props["Motivo exclusión"]),
    clausula: extraer.rich_text(props["Cláusula"]),
    carenciaMeses: extraer.number(props["Carencia (meses)"]),
    copagoPct: extraer.number(props["Copago %"]),
    tope: extraer.number(props["Tope"]),
    docsRequeridos: extraer.multi_select(props["Docs requeridos"]),
    requiereAuditoria: extraer.checkbox(props["Requiere auditoría"]),
  };
}

export async function leerCatalogo() {
  const enCache = obtenerCache("catalogo");
  if (enCache) return enCache;
  let cursor;
  const items = [];
  do {
    const res = await consultarNotion(() =>
      notion.databases.query({
        database_id: config.notion.databases.catalogo,
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      })
    );
    items.push(...res.results.map(mapearCatalogo));
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  guardarCache("catalogo", items, config.cacheTtlMs);
  return items;
}

export async function leerProcedimiento(codigoCpt) {
  const catalogo = await leerCatalogo();
  return catalogo.find((c) => c.codigoCpt === String(codigoCpt).trim()) || null;
}

function mapearPoliza(page) {
  const props = page.properties || {};
  return {
    id: page.id,
    cedula: normalizeCedula(extraer.title(props["Cédula"])),
    polizaNo: extraer.rich_text(props["Póliza No."]),
    paciente: extraer.rich_text(props["Paciente"]),
    plan: extraer.select(props["Plan"]),
    fechaInicio: extraer.date(props["Fecha inicio"]),
    vigenciaDesde: extraer.date(props["Vigencia desde"]),
    vigenciaHasta: extraer.date(props["Vigencia hasta"]),
    estadoPago: extraer.select(props["Estado de pago"]),
    redHospitalaria: extraer.multi_select(props["Red hospitalaria"]),
    reembolsoFueraRed: extraer.number(props["Reembolso fuera de red %"]),
    copagoPct: extraer.number(props["Copago %"]),
    topeAnual: extraer.number(props["Tope anual"]),
    topeConsumido: extraer.number(props["Tope consumido"]),
    preexistencias: extraer.rich_text(props["Preexistencias"]),
    exclusionesPlan: extraer.multi_select(props["Exclusiones plan"]),
    clausulas: extraer.rich_text(props["Cláusulas"]),
  };
}

// Las cédulas en Pólizas pueden estar sin normalizar; se compara normalizado.
export async function leerPoliza(cedula) {
  const res = await consultarNotion(() =>
    notion.databases.query({
      database_id: config.notion.databases.polizas,
      page_size: 100,
    })
  );
  const match = res.results.find(
    (p) => mapearPoliza(p).cedula === normalizeCedula(cedula)
  );
  return match ? mapearPoliza(match) : null;
}

export function mapearPreautorizacion(page) {
  const props = page.properties || {};
  return {
    id: page.id,
    idSolicitud: extraer.rich_text(props["ID Solicitud"]),
    iteracion: extraer.number(props["Iteración"]) ?? 0,
    estado: extraer.select(props["Estado"]),
    decision: extraer.select(props["Decisión"]),
    cedula: extraer.rich_text(props["Cédula"]),
    polizaNo: extraer.rich_text(props["Póliza No."]),
    paciente: extraer.rich_text(props["Paciente"]),
    tipoServicio: extraer.select(props["Tipo de servicio"]),
    caracter: extraer.select(props["Carácter"]),
    origenCondicion: extraer.select(props["Origen de la condición"]),
    fechaPrimeraEvaluacion: extraer.date(props["Fecha primera evaluación"]),
    fechaCirugia: extraer.date(props["Fecha cirugía"]),
    cie10: extraer.rich_text(props["CIE-10"]),
    cpt: extraer.rich_text(props["CPT"]),
    procedimientoTexto: extraer.rich_text(props["Procedimiento (texto)"]),
    justificacion: extraer.rich_text(props["Justificación"]),
    montoSolicitado: extraer.number(props["Monto solicitado"]),
    prestador: extraer.rich_text(props["Prestador"]),
    medico: extraer.rich_text(props["Médico"]),
    documentosAdjuntos: extraer.multi_select(props["Documentos adjuntos"]),
    firmaAsegurado: extraer.checkbox(props["Firma asegurado"]),
    firmaMedico: extraer.checkbox(props["Firma médico"]),
    selloPresente: extraer.checkbox(props["Sello presente"]),
    extraccionCruda: extraer.rich_text(props["Extracción"]),
    motivo: extraer.rich_text(props["Motivo"]),
  };
}

export async function leerPreautorizacion(pageId) {
  const page = await consultarNotion(() => notion.pages.retrieve({ page_id: pageId }));
  return mapearPreautorizacion(page);
}

export async function leerPendientes() {
  const res = await consultarNotion(() =>
    notion.databases.query({
      database_id: config.notion.databases.preautorizaciones,
      page_size: 100,
      filter: {
        and: [
          { property: "Estado", select: { equals: "Pendiente" } },
          { property: "Iteración", number: { less_than: config.maxIteraciones } },
        ],
      },
    })
  );
  return res.results.map(mapearPreautorizacion);
}

export async function listarPolizas() {
  const res = await consultarNotion(() =>
    notion.databases.query({ database_id: config.notion.databases.polizas, page_size: 100 })
  );
  return res.results.map(mapearPoliza);
}

function mapearPrestador(page) {
  const props = page.properties || {};
  return {
    id: page.id,
    nombre: extraer.title(props["Nombre"]),
    codigo: extraer.rich_text(props["Código"]),
    red: extraer.multi_select(props["Red"]),
    ciudad: extraer.select(props["Ciudad"]),
    direccion: extraer.rich_text(props["Dirección"]),
    telefono: extraer.phone(props["Teléfono"]),
    email: extraer.email(props["Email"]),
    activo: extraer.checkbox(props["Activo"]),
    notas: extraer.rich_text(props["Notas"]),
  };
}

export async function listarPrestadores() {
  const res = await consultarNotion(() =>
    notion.databases.query({ database_id: config.notion.databases.prestadores, page_size: 100 })
  );
  return res.results.map(mapearPrestador);
}

export async function listarEscalados() {
  const res = await consultarNotion(() =>
    notion.databases.query({
      database_id: config.notion.databases.preautorizaciones,
      page_size: 100,
      filter: {
        and: [
          { property: "Decisión", select: { equals: "ESCALADO_HUMANO" } },
          { property: "Estado", select: { does_not_equal: "Resuelto" } },
        ],
      },
      sorts: [{ timestamp: "created_time", direction: "descending" }],
    })
  );
  return res.results.map((p) => ({
    id: p.id,
    idSolicitud: extraer.rich_text(p.properties["ID Solicitud"]),
    paciente: extraer.rich_text(p.properties["Paciente"]),
    motivo: extraer.rich_text(p.properties["Motivo"]),
    decision: extraer.select(p.properties["Decisión"]),
    estado: extraer.select(p.properties["Estado"]),
  }));
}
