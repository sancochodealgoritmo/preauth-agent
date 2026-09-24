import { Router } from "express";
import { listarPolizas, listarPrestadores, leerCatalogo } from "../notion/readers.js";
import {
  crearActualizarPoliza,
  crearActualizarProcedimiento,
  crearActualizarPrestador,
  archivarPoliza,
  archivarProcedimiento,
  archivarPrestador,
} from "../notion/writers.js";
import { listarSolicitudesRecientes } from "../notion/dashboardReader.js";

import { AJUSTES, leerAjustes, guardarAjustes, restablecerAjustes } from "../config/ajustes.js";

export const adminRouter = Router();

// Configuración del agente (parámetros en caliente + prompt).
adminRouter.get("/configuracion", async (req, res) => {
  try {
    const { escalares, prompt } = await leerAjustes();
    res.json({
      escalares,
      prompt,
      esquema: AJUSTES.map(({ clave, etiqueta, tipo, def, min, max, paso }) => ({ clave, etiqueta, tipo, def, min, max, paso })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

adminRouter.post("/configuracion", async (req, res) => {
  try {
    res.json(await guardarAjustes(req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

adminRouter.post("/configuracion/reset", async (req, res) => {
  try {
    res.json(await restablecerAjustes());
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Pólizas
adminRouter.get("/polizas", async (req, res) => {
  try {
    res.json(await listarPolizas());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

adminRouter.post("/polizas", async (req, res) => {
  try {
    res.json(await crearActualizarPoliza(req.body));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

adminRouter.delete("/polizas/:id", async (req, res) => {
  try {
    res.json(await archivarPoliza(req.params.id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Catálogo de procedimientos
adminRouter.get("/catalogo", async (req, res) => {
  try {
    res.json(await leerCatalogo());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

adminRouter.post("/catalogo", async (req, res) => {
  try {
    res.json(await crearActualizarProcedimiento(req.body));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

adminRouter.delete("/catalogo/:id", async (req, res) => {
  try {
    res.json(await archivarProcedimiento(req.params.id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Prestadores
adminRouter.get("/prestadores", async (req, res) => {
  try {
    res.json(await listarPrestadores());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

adminRouter.post("/prestadores", async (req, res) => {
  try {
    res.json(await crearActualizarPrestador(req.body));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

adminRouter.delete("/prestadores/:id", async (req, res) => {
  try {
    res.json(await archivarPrestador(req.params.id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Métricas
adminRouter.get("/metricas", async (req, res) => {
  try {
    const casos = await listarSolicitudesRecientes(100);
    const porDecision = {};
    for (const c of casos) {
      const d = c.decision || "PENDIENTE";
      porDecision[d] = (porDecision[d] || 0) + 1;
    }
    res.json({ total: casos.length, porDecision });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
