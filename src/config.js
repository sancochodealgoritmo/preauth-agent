import "dotenv/config";

// Configuración central. Todas las credenciales provienen del entorno (.env).
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
    modeloPrimario: "deepseek-reasoner",
    modeloFallback: "deepseek-chat",
    temperatura: 0.1,
  },
  webhookSecret: process.env.WEBHOOK_SECRET || "insecure",

  // Parámetros operativos (v1.5).
  umbralConfianza: 0.8,
  umbralTinta: 0.004, // 0.4 % de píxeles oscuros en zona de firma/sello
  cacheTtlMs: 5 * 60 * 1000,
  timeouts: { r1: 45_000, v3: 30_000, notion: 20_000 },
  rateLimitNotion: { porSegundo: 3 },
  maxIteraciones: 3,
  rulesVersion: "reglas-2026.09.23",
};
