import "dotenv/config";
import { DEFAULTS } from "./config/defaults.js";

// Configuración central. Las credenciales provienen del entorno (.env); los
// parámetros operativos vienen de DEFAULTS (única fuente) y ajustes.js los
// sobrescribe en caliente desde Notion.
export const config = {
  env: process.env.NODE_ENV || "production",
  port: Number(process.env.PORT) || 3000,
  notion: {
    token: process.env.NOTION_TOKEN,
    databases: {
      polizas: process.env.NOTION_DB_POLIZAS,
      catalogo: process.env.NOTION_DB_CATALOGO,
      preautorizaciones: process.env.NOTION_DB_SOLICITUDES,
      prestadores: process.env.NOTION_DB_PRESTADORES,
      configuracion: process.env.NOTION_DB_CONFIGURACION,
    },
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    ...DEFAULTS.deepseek,
  },
  webhookSecret: process.env.WEBHOOK_SECRET || "insecure",

  // Parámetros operativos (por defecto; sobrescritos en caliente desde Notion).
  umbralConfianza: DEFAULTS.umbralConfianza,
  umbralTinta: DEFAULTS.umbralTinta,
  cacheTtlMs: DEFAULTS.cacheTtlMs,
  timeouts: { ...DEFAULTS.timeouts },
  rateLimitNotion: { ...DEFAULTS.rateLimitNotion },
  maxIteraciones: DEFAULTS.maxIteraciones,
  rulesVersion: DEFAULTS.rulesVersion,
};
