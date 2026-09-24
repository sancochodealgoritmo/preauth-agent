import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import cron from "node-cron";
import multer from "multer";
import { config } from "./config.js";
import { log } from "./utils/logger.js";
import { bus } from "./events/bus.js";
import { procesarConTraza } from "./agent/tracedEngine.js";
import { procesarPendientes, ingresarSolicitud } from "./agent/decisionEngine.js";
import { listarSolicitudesRecientes, getDetalleSolicitud } from "./notion/dashboardReader.js";
import { adminRouter } from "./api/admin.js";
import { revisionRouter } from "./api/revision.js";
import { sincronizar } from "./config/ajustes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));
app.use("/admin", express.static(path.join(__dirname, "..", "admin")));
app.use("/api/admin", adminRouter);
app.use("/api/revision", revisionRouter);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), env: config.env, ts: new Date().toISOString() });
});

// Ingesta v1.5: recibe el formulario PREAUTH-GEN-1.0 y sus adjuntos (multipart).
app.post(
  "/api/solicitudes",
  upload.fields([{ name: "formulario", maxCount: 1 }, { name: "adjuntos", maxCount: 20 }]),
  async (req, res) => {
    try {
      const formulario = req.files?.formulario?.[0];
      if (!formulario) return res.status(400).json({ error: "Falta el archivo del formulario PDF" });
      const adjuntos = (req.files?.adjuntos || []).map((f) => ({ buffer: f.buffer, nombre: f.originalname }));
      const resultado = await ingresarSolicitud(formulario.buffer, adjuntos);
      res.json({ ok: true, id: resultado.id, idSolicitud: resultado.idSolicitud });
    } catch (e) {
      log.error("Error en /api/solicitudes:", e.message);
      res.status(400).json({ error: e.message });
    }
  }
);

app.get("/api/casos", async (req, res) => {
  try { res.json(await listarSolicitudesRecientes(50)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/casos/:pageId", async (req, res) => {
  try { res.json(await getDetalleSolicitud(req.params.pageId)); }
  catch (e) { res.status(404).json({ error: e.message }); }
});

app.post("/api/procesar/:pageId", async (req, res) => {
  const caseId = "CASE-" + randomBytes(4).toString("hex").toUpperCase();
  const pageId = req.params.pageId;
  procesarConTraza(caseId, pageId).catch((e) =>
    bus.emit(caseId, { type: "error", mensaje: e.message })
  );
  res.json({ caseId });
});

app.get("/api/stream/:caseId", (req, res) => {
  const { caseId } = req.params;
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  const ka = setInterval(() => res.write(": keepalive\n\n"), 15000);
  const onEvent = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    if (payload.type === "fin" || payload.type === "error") {
      clearInterval(ka);
      res.end();
    }
  };
  bus.on(caseId, onEvent);
  req.on("close", () => { clearInterval(ka); bus.off(caseId, onEvent); });
});

app.post("/webhook/notion", async (req, res) => {
  if (req.body?.verification_token) return res.json({ ok: true });
  const secret = req.headers["x-webhook-secret"];
  if (config.webhookSecret !== "insecure" && secret !== config.webhookSecret) {
    return res.status(401).json({ error: "unauthorized" });
  }
  res.status(200).send("ok");
  try {
    const pageId = req.body?.entity?.id || req.body?.page_id;
    if (pageId) {
      const caseId = "CASE-" + randomBytes(4).toString("hex").toUpperCase();
      await procesarConTraza(caseId, pageId);
    }
  } catch (e) { log.error("Webhook error:", e.message); }
});

app.post("/preauth/:id", async (req, res) => {
  try {
    const caseId = "CASE-" + randomBytes(4).toString("hex").toUpperCase();
    procesarConTraza(caseId, req.params.id).catch((e) =>
      bus.emit(caseId, { type: "error", mensaje: e.message })
    );
    res.json({ ok: true, caseId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

cron.schedule("*/30 * * * * *", async () => {
  try { await procesarPendientes(); }
  catch (e) { log.error("Cron error:", e.message); }
});

sincronizar(); // Carga la configuración del agente desde Notion (no bloquea el arranque).

app.listen(config.port, "127.0.0.1", () => {
  log.ok(`🚀 PreAuth Agent escuchando en http://127.0.0.1:${config.port}`);
  log.info(`Ambiente: ${config.env}`);
});

process.on("unhandledRejection", (e) => log.error("UnhandledRejection:", e));
process.on("uncaughtException", (e) => log.error("UncaughtException:", e));
