#!/usr/bin/env node
// Genera los 3 manuales de usuario en PDF (pdf-lib) en docs/manuales/.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "..", "docs", "manuales");
fs.mkdirSync(OUT, { recursive: true });

const ink = rgb(0.09, 0.11, 0.15);
const gris = rgb(0.42, 0.45, 0.5);
const accent = rgb(0.04, 0.24, 0.42);

const manuales = [
  {
    archivo: "manual-hospital.pdf",
    titulo: "PreAuth Agent · Manual de Usuario",
    subtitulo: "Rol: Hospital / Clínica  ·  https://preauth.sancochodev.com/",
    bloques: [
      ["h", "Descripción del rol"],
      ["p", "Este panel es el punto de entrada del hospital: permite enviar la solicitud de pre-autorización quirúrgica. El agente la procesa automáticamente y el resultado queda registrado en Notion."],
      ["h", "1. Enviar formulario"],
      ["b", "En “Formulario PREAUTH-GEN-1.0 (PDF)” seleccione el formulario lleno y firmado."],
      ["b", "En “Adjuntos (PDF, opcional)” agregue informes médicos, exámenes, preanestésica, etc."],
      ["b", "Pulse “Enviar solicitud”. El sistema confirma con un ID tipo INF-2026-XXXX."],
      ["p", "El agente procesa la solicitud automáticamente (cron, cada 30 segundos); no hay que pulsar ningún botón adicional."],
      ["h", "2. Casos procesados"],
      ["b", "La tabla “Casos procesados” muestra cada solicitud con su decisión: APROBADO, APROBADO_CON_CONDICION, SEGUNDA_OPINION, DOCUMENTOS_FALTANTES, RECHAZADO o ESCALADO_HUMANO."],
      ["b", "Haga clic en una fila para ver el detalle completo: resolución, mensajes, datos extraídos, interpretación de la IA y reglas evaluadas."],
      ["b", "El botón “Refrescar” actualiza la lista al instante (también se refresca sola cada 15 segundos)."],
    ],
  },
  {
    archivo: "manual-aseguradora.pdf",
    titulo: "PreAuth Agent · Manual de Usuario",
    subtitulo: "Rol: Aseguradora  ·  https://preauth.sancochodev.com/admin/ (pestaña Aseguradora)",
    bloques: [
      ["h", "Descripción del rol"],
      ["p", "Este panel es para el personal de la aseguradora: consulta métricas y administra las pólizas, el catálogo de procedimientos y los prestadores. Los cambios se guardan en Notion y el motor de reglas los usa al instante."],
      ["h", "1. Métricas"],
      ["b", "Muestra el total de solicitudes y el desglose por decisión."],
      ["h", "2. Pólizas"],
      ["b", "Ver: la tabla lista cédula, póliza, paciente, plan, copago, reembolso, tope y estado de pago."],
      ["b", "Crear: despliegue “Nueva póliza”, complete los campos y pulse “Guardar póliza”. La cédula es la clave."],
      ["b", "Editar: pulse “Editar” en una fila; el formulario se precarga. Modifique y guarde."],
      ["b", "Eliminar: pulse “Eliminar” y confirme; la póliza se archiva en Notion."],
      ["p", "Campos clave: copago y reembolso se expresan en fracción (0.2 = 20 %). “Red” y “Exclusiones plan” se separan con el símbolo |."],
      ["h", "3. Catálogo de procedimientos"],
      ["b", "Mismo esquema CRUD que pólizas: crear, editar y eliminar por código CPT."],
      ["b", "Incluye CIE-10 asociado, sinónimos, categoría, cubierto, carencia, copago, tope, documentos requeridos y auditoría."],
      ["p", "Los cambios del catálogo invalidan la caché y aplican de inmediato en el motor de reglas."],
      ["h", "4. Prestadores"],
      ["b", "Directorio de clínicas y hospitales: nombre, código, red, ciudad, dirección, teléfono, email, activo y notas."],
      ["b", "Crear, editar y eliminar con el mismo patrón CRUD."],
      ["h", "5. Configuración del agente"],
      ["b", "Pestaña “Configuración”: permite ajustar en caliente umbrales (confianza, tinta), iteraciones, timeouts, rate limit, cache, modelo primario/fallback, temperatura, versión de reglas y el prompt del sistema."],
      ["b", "Pulse “Guardar” para aplicar; “Restablecer valores” vuelve a los valores por defecto."],
    ],
  },
  {
    archivo: "manual-revisor.pdf",
    titulo: "PreAuth Agent · Manual de Usuario",
    subtitulo: "Rol: Revisor  ·  https://preauth.sancochodev.com/admin/ (pestaña Revisión)",
    bloques: [
      ["h", "Descripción del rol"],
      ["p", "Este panel es para el analista humano: atiende los casos que el agente escaló por no poder decidir con seguridad (ESCALADO_HUMANO)."],
      ["h", "1. Cola de escalados"],
      ["b", "La tabla lista el ID de solicitud, el paciente, el motivo del escalado y el estado."],
      ["b", "Cada fila corresponde a un caso con decisión ESCALADO_HUMANO aún sin resolver."],
      ["h", "2. Resolver un caso"],
      ["b", "Pulse “Resolver” en la fila correspondiente."],
      ["b", "Escriba la nota de resolución (por ejemplo, el CPT confirmado o la decisión manual)."],
      ["b", "El caso se marca como Resuelto y desaparece de la cola."],
      ["p", "La nota queda registrada como auditoría en el campo Motivo con el prefijo [REVISADO]."],
      ["h", "3. Motivos comunes"],
      ["b", "[ESCALADO:CODIFICACION] — CPT vacío o ambiguo; se requiere confirmar el código."],
      ["b", "[ESCALADO:AFILIADO] — cédula sin póliza asociada."],
      ["b", "[ESCALADO:PRESTADOR] — prestador no reconocido en ninguna red."],
      ["b", "[ESCALADO:DOCUMENTAL] — agotadas las iteraciones documentales."],
      ["b", "[ESCALADO:PROVEEDOR] — falla del proveedor de IA."],
    ],
  },
];

async function generar({ archivo, titulo, subtitulo, bloques }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 52;
  const ancho = W - 2 * M;
  let page = doc.addPage([W, H]);
  let y = H - 58;

  const asegurar = (n) => { if (y < n) { page = doc.addPage([W, H]); y = H - 58; } };

  const escribir = (texto, size, f, color, interlinea, sangria = 0) => {
    const max = ancho - sangria;
    const palabras = String(texto).split(" ");
    let linea = "";
    for (const p of palabras) {
      const prueba = linea ? `${linea} ${p}` : p;
      if (f.widthOfTextAtSize(prueba, size) > max && linea) {
        asegurar(size + interlinea);
        page.drawText(linea, { x: M + sangria, y, size, font: f, color });
        y -= size + interlinea;
        linea = p;
      } else linea = prueba;
    }
    if (linea) {
      asegurar(size + interlinea);
      page.drawText(linea, { x: M + sangria, y, size, font: f, color });
      y -= size + interlinea;
    }
  };

  asegurar(46);
  page.drawText(titulo, { x: M, y, size: 18, font: bold, color: ink });
  y -= 24;
  page.drawText(subtitulo, { x: M, y, size: 10, font: font, color: gris });
  y -= 8;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: rgb(0.8, 0.83, 0.87) });
  y -= 20;

  for (const [tipo, texto] of bloques) {
    if (tipo === "h") {
      asegurar(26);
      page.drawText(texto, { x: M, y, size: 12.5, font: bold, color: accent });
      y -= 18;
    } else if (tipo === "p") {
      escribir(texto, 10.5, font, ink, 4);
      y -= 6;
    } else {
      escribir("•  " + texto, 10.5, font, ink, 3);
      y -= 2;
    }
  }

  const bytes = await doc.save();
  const destino = path.join(OUT, archivo);
  fs.writeFileSync(destino, bytes);
  console.log(destino + " (" + bytes.length + " bytes)");
}

for (const m of manuales) await generar(m);
console.log("\n3 manuales generados en docs/manuales/");
