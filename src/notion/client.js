import { Client } from "@notionhq/client";
import { config } from "../config.js";
import { conLimite } from "../utils/rateLimiter.js";

// Cliente único de Notion con timeout explícito (sección 10).
export const notion = new Client({
  auth: config.notion.token,
  timeoutMs: config.timeouts.notion,
});

// Envoltura que pasa TODA llamada a Notion por el rate limiter (3 req/s + backoff).
export function consultarNotion(tarea) {
  return conLimite(tarea);
}
