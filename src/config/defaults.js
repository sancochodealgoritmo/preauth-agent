// Valores por defecto del agente. Única fuente de verdad para los parámetros
// operativos: config.js los usa como valor inicial y ajustes.js como fallback
// y semilla al restaurar la base de Configuración en Notion.
export const DEFAULTS = {
  umbralConfianza: 0.8,
  umbralTinta: 0.004, // 0.4 % de píxeles oscuros en zona de firma/sello
  cacheTtlMs: 5 * 60 * 1000,
  timeouts: { r1: 45_000, v3: 30_000, notion: 20_000 },
  rateLimitNotion: { porSegundo: 3 },
  maxIteraciones: 3,
  rulesVersion: "reglas-2026.09.23",
  deepseek: {
    modeloPrimario: "deepseek-reasoner",
    modeloFallback: "deepseek-chat",
    temperatura: 0.1,
  },
};
