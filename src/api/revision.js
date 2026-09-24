import { Router } from "express";
import { listarEscalados } from "../notion/readers.js";
import { resolverEscalado } from "../notion/writers.js";

export const revisionRouter = Router();

revisionRouter.get("/escalados", async (req, res) => {
  try {
    res.json(await listarEscalados());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

revisionRouter.post("/:pageId/resolver", async (req, res) => {
  try {
    const nota = req.body?.nota || "";
    res.json(await resolverEscalado(req.params.pageId, nota));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
