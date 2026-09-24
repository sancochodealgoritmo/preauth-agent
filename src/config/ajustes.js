// Ajustes en caliente del agente, persistidos en la base Notion "PreAuth · Configuración".
// Los escalares viven como filas Clave/Valor; el prompt del sistema vive en los bloques
// de la página "promptSistema" (para no chocar con el límite de 2000 de rich_text).
import { config } from "../config.js";
import { notion, consultarNotion } from "../notion/client.js";
import { log } from "../utils/logger.js";
import { SYSTEM_PROMPT } from "../agent/prompts.js";

const PROMPT_CLAVE = "promptSistema";
const LIMITE_BLOQUE = 1900;

let promptActual = SYSTEM_PROMPT;

const N = "numero";
const E = "entero";
const T = "texto";

export const AJUSTES = [
  { clave: "umbralConfianza", tipo: N, etiqueta: "Umbral de confianza (CPT, 0-1)", def: 0.8, min: 0, max: 1, paso: 0.05, aplicar: (v) => (config.umbralConfianza = v) },
  { clave: "umbralTinta", tipo: N, etiqueta: "Umbral de tinta (firma/sello, 0-0.02)", def: 0.004, min: 0, max: 0.02, paso: 0.001, aplicar: (v) => (config.umbralTinta = v) },
  { clave: "maxIteraciones", tipo: E, etiqueta: "Iteraciones documentales (1-5)", def: 3, min: 1, max: 5, paso: 1, aplicar: (v) => (config.maxIteraciones = v) },
  { clave: "timeoutR1", tipo: E, etiqueta: "Timeout R1 (ms)", def: 45000, min: 5000, max: 180000, paso: 1000, aplicar: (v) => (config.timeouts.r1 = v) },
  { clave: "timeoutV3", tipo: E, etiqueta: "Timeout V3 (ms)", def: 30000, min: 5000, max: 180000, paso: 1000, aplicar: (v) => (config.timeouts.v3 = v) },
  { clave: "timeoutNotion", tipo: E, etiqueta: "Timeout Notion (ms)", def: 20000, min: 5000, max: 120000, paso: 1000, aplicar: (v) => (config.timeouts.notion = v) },
  { clave: "rateLimitNotion", tipo: E, etiqueta: "Rate limit Notion (req/s)", def: 3, min: 1, max: 10, paso: 1, aplicar: (v) => (config.rateLimitNotion.porSegundo = v) },
  { clave: "cacheTtlMs", tipo: E, etiqueta: "TTL cache catálogo (ms)", def: 300000, min: 10000, max: 3600000, paso: 10000, aplicar: (v) => (config.cacheTtlMs = v) },
  { clave: "modeloPrimario", tipo: T, etiqueta: "Modelo primario", def: "deepseek-reasoner", aplicar: (v) => (config.deepseek.modeloPrimario = v) },
  { clave: "modeloFallback", tipo: T, etiqueta: "Modelo fallback", def: "deepseek-chat", aplicar: (v) => (config.deepseek.modeloFallback = v) },
  { clave: "temperatura", tipo: N, etiqueta: "Temperatura (0-1)", def: 0.1, min: 0, max: 1, paso: 0.05, aplicar: (v) => (config.deepseek.temperatura = v) },
  { clave: "rulesVersion", tipo: T, etiqueta: "Versión de reglas", def: "reglas-2026.09.23", aplicar: (v) => (config.rulesVersion = v) },
];

const porClave = Object.fromEntries(AJUSTES.map((m) => [m.clave, m]));

const clamp = (v, m) => Math.min(m.max, Math.max(m.min, v));
const titulo = (v) => ({ title: [{ text: { content: String(v ?? "") } }] });
const rich = (v) => ({ rich_text: v ? [{ text: { content: String(v) } }] : [] });

function convertir(valor, meta) {
  if (valor == null || valor === "") return meta.def;
  if (meta.tipo === N) {
    const n = Number(valor);
    return Number.isFinite(n) ? clamp(n, meta) : meta.def;
  }
  if (meta.tipo === E) {
    const n = Math.round(Number(valor));
    return Number.isFinite(n) ? clamp(n, meta) : meta.def;
  }
  return String(valor);
}

export async function leerAjustes() {
  let cursor;
  const filas = [];
  do {
    const res = await consultarNotion(() =>
      notion.databases.query({
        database_id: config.notion.databases.configuracion,
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      })
    );
    filas.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  const escalares = {};
  let paginaPrompt = null;
  for (const p of filas) {
    const clave = p.properties["Clave"]?.title?.map((t) => t.plain_text).join("") ?? "";
    const valor = p.properties["Valor"]?.rich_text?.map((t) => t.plain_text).join("") ?? "";
    if (clave === PROMPT_CLAVE) {
      paginaPrompt = p.id;
      continue;
    }
    const meta = porClave[clave];
    if (meta) escalares[clave] = convertir(valor, meta);
  }

  let prompt = promptActual;
  if (paginaPrompt) {
    const bloques = await consultarNotion(() => notion.blocks.children.list({ block_id: paginaPrompt }));
    const texto = bloques.results
      .filter((b) => b.type === "paragraph")
      .map((b) => b.paragraph.rich_text.map((t) => t.plain_text).join(""))
      .join("\n");
    if (texto.trim()) prompt = texto;
  }
  return { escalares, prompt };
}

export function aplicarAjustes({ escalares = {}, prompt = null } = {}) {
  for (const meta of AJUSTES) {
    if (meta.clave in escalares) meta.aplicar(escalares[meta.clave]);
  }
  if (prompt && String(prompt).trim()) promptActual = String(prompt);
}

export function obtenerPromptSistema() {
  return promptActual;
}

export async function sincronizar() {
  try {
    const a = await leerAjustes();
    aplicarAjustes(a);
    log.info("⚙️ Configuración del agente sincronizada desde Notion");
  } catch (e) {
    log.warn("No se pudo sincronizar la configuración; se usan valores por defecto: " + e.message);
  }
}

export async function restablecerAjustes() {
  const escalares = Object.fromEntries(AJUSTES.map((m) => [m.clave, m.def]));
  for (const meta of AJUSTES) await upsertFila(meta.clave, String(meta.def), meta.etiqueta);
  await guardarPrompt(SYSTEM_PROMPT);
  aplicarAjustes({ escalares, prompt: SYSTEM_PROMPT });
  return { escalares, prompt: SYSTEM_PROMPT };
}

export async function guardarAjustes(datos = {}) {
  const escalares = {};
  for (const meta of AJUSTES) {
    if (meta.clave in datos) escalares[meta.clave] = convertir(datos[meta.clave], meta);
  }

  for (const meta of AJUSTES) {
    if (!(meta.clave in escalares)) continue;
    await upsertFila(meta.clave, String(escalares[meta.clave]), meta.etiqueta);
  }

  if (PROMPT_CLAVE in datos && datos[PROMPT_CLAVE] != null) {
    await guardarPrompt(String(datos[PROMPT_CLAVE]));
  }

  aplicarAjustes({ escalares, prompt: datos[PROMPT_CLAVE] ?? null });
  return { escalares, prompt: promptActual };
}

async function upsertFila(clave, valor, descripcion) {
  const res = await consultarNotion(() =>
    notion.databases.query({
      database_id: config.notion.databases.configuracion,
      filter: { property: "Clave", title: { equals: clave } },
    })
  );
  const props = { "Valor": rich(valor), "Descripción": rich(descripcion) };
  if (res.results.length) {
    return consultarNotion(() => notion.pages.update({ page_id: res.results[0].id, properties: props }));
  }
  return consultarNotion(() =>
    notion.pages.create({
      parent: { database_id: config.notion.databases.configuracion },
      properties: { "Clave": titulo(clave), ...props },
    })
  );
}

function partir(texto, max = LIMITE_BLOQUE) {
  const lineas = String(texto).split("\n");
  const trozos = [];
  let actual = "";
  for (const linea of lineas) {
    const cand = actual ? `${actual}\n${linea}` : linea;
    if (cand.length > max && actual) {
      trozos.push(actual);
      actual = linea;
    } else actual = cand;
  }
  if (actual || trozos.length === 0) trozos.push(actual);
  return trozos;
}

async function guardarPrompt(texto) {
  const pagina = await upsertFila(PROMPT_CLAVE, "(contenido en la página)", "Prompt del sistema");
  const existentes = await consultarNotion(() => notion.blocks.children.list({ block_id: pagina.id }));
  for (const b of existentes.results) {
    await consultarNotion(() => notion.blocks.delete({ block_id: b.id }));
  }
  const trozos = partir(texto);
  const bloques = trozos.map((t) => ({
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: [{ type: "text", text: { content: t } }] },
  }));
  for (let i = 0; i < bloques.length; i += 100) {
    await consultarNotion(() => notion.blocks.children.append({ block_id: pagina.id, children: bloques.slice(i, i + 100) }));
  }
}
