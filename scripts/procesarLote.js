#!/usr/bin/env node
// Procesa en lote los 17 escenarios de preautorizaciones-prueba contra el backend.
// Uso:
//   node scripts/procesarLote.js --reset   # archiva filas existentes y reenvía los 17
//   node scripts/procesarLote.js           # solo envía los 17 (sin reset)
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CARPETA = path.join(ROOT, "preautorizaciones-prueba");
const BASE = process.env.PREAUTH_BASE_URL || "https://preauth.sancochodev.com";

const reset = process.argv.includes("--reset");

async function archivarTodas() {
  const { config } = await import("../src/config.js");
  const { notion, consultarNotion } = await import("../src/notion/client.js");
  const db = config.notion.databases.preautorizaciones;
  let cursor;
  let total = 0;
  do {
    const res = await consultarNotion(() =>
      notion.databases.query({ database_id: db, page_size: 100, start_cursor: cursor || undefined })
    );
    for (const p of res.results) {
      await consultarNotion(() => notion.pages.update({ page_id: p.id, archived: true }));
      total += 1;
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  console.log(`🧹 Archivadas ${total} fila(s) existentes en Preautorizaciones`);
}

async function enviarCarpeta(idFolder) {
  const dir = path.join(CARPETA, idFolder);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".pdf")).sort();
  const form = files.find((f) => f.startsWith("01_"));
  const adjs = files.filter((f) => !f.startsWith("01_"));
  if (!form) throw new Error(`Falta formulario 01_ en ${idFolder}`);

  const fd = new FormData();
  const formBuf = await readFile(path.join(dir, form));
  fd.append("formulario", new Blob([formBuf], { type: "application/pdf" }), form);
  for (const a of adjs) {
    const b = await readFile(path.join(dir, a));
    fd.append("adjuntos", new Blob([b], { type: "application/pdf" }), a);
  }

  const r = await fetch(`${BASE}/api/solicitudes`, { method: "POST", body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

const carpetas = (await readdir(CARPETA, { withFileTypes: true }))
  .filter((e) => e.isDirectory() && /^INF-2026-\d{4}$/.test(e.name))
  .map((e) => e.name)
  .sort();

if (reset) await archivarTodas();

const resultados = [];
for (const c of carpetas) {
  try {
    const j = await enviarCarpeta(c);
    resultados.push({ ok: true, folder: c, idSolicitud: j.idSolicitud, faltantes: j.faltantes?.length ?? 0 });
    console.log(`✅ ${c} → ${j.idSolicitud} (faltantes: ${j.faltantes?.length ?? 0})`);
  } catch (e) {
    resultados.push({ ok: false, folder: c, error: e.message });
    console.error(`❌ ${c} → ${e.message}`);
  }
}

const ok = resultados.filter((r) => r.ok).length;
console.log(`\n${ok}/${carpetas.length} enviadas correctamente`);
if (ok !== carpetas.length) process.exit(1);
