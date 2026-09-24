import { readFile } from "node:fs/promises";
import { PDFDocument, PDFName, PDFRef } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { normalizeCedula } from "../utils/normalize.js";
import { config } from "../config.js";

const MAPA_URL = new URL(
  "../../formulario-preautorizacion-generico.map.json",
  import.meta.url
);

// Fase 0 · Ingesta y extracción determinista del formulario PREAUTH-GEN-1.0.
export async function extraerFormulario(pdfBytes) {
  const mapa = JSON.parse(await readFile(MAPA_URL, "utf8"));
  const bytes = Buffer.isBuffer(pdfBytes)
    ? pdfBytes
    : Buffer.from(pdfBytes);

  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const form = doc.getForm();
  const campos = new Map(form.getFields().map((f) => [f.getName(), f]));
  const raw = mapearRaw(doc);
  const ctx = doc.context;

  // Control de plantilla (campo oculto form_version).
  const campoVersion = campos.get("form_version");
  const version =
    campoVersion && campoVersion.constructor.name === "PDFTextField"
      ? campoVersion.getText().trim()
      : "";
  if (version !== mapa.plantilla) {
    throw new Error(`Plantilla no reconocida: ${version || "(sin versión)"}`);
  }

  const faltantes = [];
  const extraccion = {};
  const soloPdf = {};
  const propiedades = {};
  const documentos = [];

  for (const c of mapa.campos) {
    const field = campos.get(c.campo_pdf);
    const rawField = raw.get(c.campo_pdf);
    let valor = null;

    if (c.tipo === "text") {
      valor = field && field.constructor.name === "PDFTextField" ? field.getText().trim() : "";
    } else if (c.tipo === "date") {
      const t = field && field.constructor.name === "PDFTextField" ? field.getText().trim() : "";
      valor = fechaAIso(t);
    } else if (c.tipo === "number") {
      const t = field && field.constructor.name === "PDFTextField" ? field.getText().trim() : "";
      valor = normalizarNumero(t);
    } else if (c.tipo === "radio") {
      valor = valorRadio(rawField, c.opciones, ctx);
    } else if (c.tipo === "checkbox") {
      valor = valorCheckbox(rawField);
    } else if (c.tipo === "choice") {
      const sel = field && field.constructor.name === "PDFDropdown" ? field.getSelected() : [];
      valor = Array.isArray(sel) && sel.length ? sel[0] : "";
    }

    if (c.campo_pdf === "numero_documento" && valor) valor = normalizeCedula(valor);

    extraccion[c.campo_pdf] = valor;
    if (!c.notion) soloPdf[c.campo_pdf] = valor;

    if (c.tipo === "checkbox") {
      if (valor === true && c.valor_notion) documentos.push(c.valor_notion);
      continue;
    }

    if (c.obligatorio && (valor === null || valor === "")) faltantes.push(c.etiqueta);

    if (c.notion) {
      let prop = c.notion.replace(/^Informes\./, "").replace(/^Solicitudes\./, "");
      // El mapa referencia la propiedad antigua "Hospital"; la base real usa "Prestador".
      if (c.campo_pdf === "prestador") prop = "Prestador";
      propiedades[prop] = valor;
    }
  }
  propiedades["Documentos adjuntos"] = documentos;

  // Verificación de tinta en las 3 zonas fijas (firma médico, sello, firma asegurado).
  const { firmas, ratios } = await detectarFirmas(bytes, mapa.zonas_firma);
  propiedades["Firma asegurado"] = firmas.firma_asegurado;
  propiedades["Firma médico"] = firmas.firma_medico;
  propiedades["Sello presente"] = firmas.sello;
  propiedades["Verificación de firmas"] = JSON.stringify(ratios);

  if (!firmas.firma_asegurado) faltantes.push("Firma del asegurado");
  if (!firmas.firma_medico) faltantes.push("Firma del médico");
  if (!firmas.sello) faltantes.push("Sello del médico o del centro");

  return { version, faltantes, firmas, ratios, extraccion, soloPdf, propiedades };
}

function mapearRaw(doc) {
  const ctx = doc.context;
  const resolve = (o) => (o instanceof PDFRef ? ctx.lookup(o) : o);
  const acroForm = resolve(doc.catalog.get(PDFName.of("AcroForm")));
  const fields = resolve(acroForm.get(PDFName.of("Fields")));
  const map = new Map();
  for (let i = 0; i < fields.size(); i++) {
    const f = resolve(fields.get(i));
    const T = f.get(PDFName.of("T"));
    const name = T ? (T.decodeText ? T.decodeText() : String(T)) : null;
    if (name) map.set(name, f);
  }
  return map;
}

function valorRadio(raw, opciones, ctx) {
  if (!raw) return "";
  const resolve = (o) => (o instanceof PDFRef ? ctx.lookup(o) : o);
  const kids = resolve(raw.get(PDFName.of("Kids")));
  if (!kids) return "";
  for (let k = 0; k < kids.size(); k++) {
    const w = resolve(kids.get(k));
    const as = w.get(PDFName.of("AS"));
    if (as && String(as) !== "/Off") {
      const exportValue = String(as).replace(/^\//, "");
      return opciones && opciones[exportValue] !== undefined ? opciones[exportValue] : exportValue;
    }
  }
  return "";
}

function valorCheckbox(raw) {
  if (!raw) return false;
  const as = raw.get(PDFName.of("AS"));
  return Boolean(as && String(as) !== "/Off");
}

function fechaAIso(t) {
  if (!t) return "";
  const m = String(t).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return String(t).trim();
  const [, d, mes, anio] = m;
  return `${anio}-${mes.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function normalizarNumero(t) {
  if (t === null || t === undefined || String(t).trim() === "") return null;
  const n = String(t).replace(/[\s$,]/g, "");
  const parsed = Number(n);
  return Number.isFinite(parsed) ? parsed : null;
}

async function detectarFirmas(bytes, zonas) {
  const pdf = await getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    isEvalSupported: false,
    verbosity: 0,
  }).promise;
  const page = await pdf.getPage(2);
  const scale = 2.0;
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(viewport.width, viewport.height);
  const c2d = canvas.getContext("2d");
  await page.render({ canvasContext: c2d, viewport }).promise;

  const firmas = {};
  const ratios = {};
  const INSET = 4; // excluye el borde del recuadro (aporta ~1% de píxeles oscuros)

  for (const z of zonas) {
    const [x1, y1, x2, y2] = z.rect_pt;
    const cx = Math.floor((x1 + INSET) * scale);
    const cy = Math.floor((viewport.height - (y2 - INSET) * scale));
    const cw = Math.max(1, Math.floor((x2 - x1 - 2 * INSET) * scale));
    const ch = Math.max(1, Math.floor((y2 - y1 - 2 * INSET) * scale));
    const img = c2d.getImageData(cx, cy, cw, ch).data;
    let dark = 0;
    for (let i = 0; i < img.length; i += 4) {
      if (0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2] < 128) dark++;
    }
    const total = img.length / 4;
    const ratio = total ? dark / total : 0;
    ratios[z.clave] = Number(ratio.toFixed(4));
    firmas[z.clave] = ratio >= config.umbralTinta;
  }

  return { firmas, ratios };
}
