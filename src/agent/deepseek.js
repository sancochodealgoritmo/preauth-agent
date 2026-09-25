import OpenAI from "openai";
import { config } from "../config.js";
import { buildUserPrompt } from "./prompts.js";
import { obtenerPromptSistema } from "../config/ajustes.js";
import { log } from "../utils/logger.js";

const client = new OpenAI({
  apiKey: config.deepseek.apiKey,
  baseURL: config.deepseek.baseURL,
  timeout: 45_000,
  maxRetries: 1, // Reintentos HTTP. NO confundir con Iteración documental.
});

export async function analizarSolicitud({ informe, poliza, catalogo, procedimiento, iteracion }) {
  const messages = [
    { role: "system", content: obtenerPromptSistema() },
    { role: "user", content: buildUserPrompt({ informe, poliza, catalogo, procedimiento, iteracion }) },
  ];

  const t0 = Date.now();
  try {
    log.info("Consultando DeepSeek R1...");
    const res = await client.chat.completions.create({
      model: config.deepseek.modeloPrimario,
      messages,
      temperature: config.deepseek.temperatura,
    });
    const ms = Date.now() - t0;
    log.ok(`R1 respondió en ${ms} ms`);
    return { ...safeJsonParse(res.choices[0].message.content), _modelo: "R1", _latencia_ms: ms };
  } catch (err) {
    log.warn(`R1 falló en ${Date.now() - t0} ms (${err.message}). Fallback a V3...`);
    const t1 = Date.now();
    const res = await client.chat.completions.create({
      model: config.deepseek.modeloFallback,
      messages,
      response_format: { type: "json_object" },
      temperature: config.deepseek.temperatura,
    });
    const ms = Date.now() - t1;
    log.ok(`V3 respondió en ${ms} ms`);
    return { ...safeJsonParse(res.choices[0].message.content), _modelo: "V3", _latencia_ms: ms };
  }
}

function safeJsonParse(text) {
  const cleaned = text
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    log.error("JSON no parseable:", text.slice(0, 400));
    throw new Error("DeepSeek devolvió JSON inválido");
  }
}
