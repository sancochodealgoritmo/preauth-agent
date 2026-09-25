#!/usr/bin/env node
// Archiva TODAS las filas de la base Preautorizaciones, dejando el sistema en 0.
// Conserva las bases de referencia: Pólizas, Catálogo y Prestadores.
import { config } from "../src/config.js";
import { notion, consultarNotion } from "../src/notion/client.js";

const db = config.notion.databases.preautorizaciones;
let cursor;
let total = 0;
do {
  const res = await consultarNotion(() =>
    notion.databases.query({ database_id: db, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) })
  );
  for (const p of res.results) {
    await consultarNotion(() => notion.pages.update({ page_id: p.id, archived: true }));
    total += 1;
  }
  cursor = res.has_more ? res.next_cursor : undefined;
} while (cursor);

console.log(`Archivadas ${total} fila(s) de Preautorizaciones. Sistema en 0.`);
