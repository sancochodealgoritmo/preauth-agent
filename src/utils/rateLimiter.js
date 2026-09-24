// Rate limiter en proceso para Notion: N req/s con backoff exponencial (sección 10).
// El valor por segundo se lee de config en caliente (configurable desde /admin).
import { config } from "../config.js";

const intervaloMs = () => Math.ceil(1000 / (config.rateLimitNotion.porSegundo || 3));

// El módulo ESM es singleton: este contador compartido espacia TODAS las llamadas.
let ultimoDespacho = 0;

function dormir(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

export async function conLimite(tarea) {
  const ahora = Date.now();
  const espera = Math.max(0, ultimoDespacho + intervaloMs() - ahora);
  if (espera > 0) await dormir(espera);
  ultimoDespacho = Date.now();
  return ejecutarConBackoff(tarea, 0);
}

async function ejecutarConBackoff(tarea, intento) {
  try {
    return await tarea();
  } catch (err) {
    const esRateLimit =
      err?.status === 429 ||
      err?.code === "rate_limited" ||
      /rate.?limit/i.test(err?.message || "");
    if (esRateLimit && intento < 5) {
      const espera = Math.min(60_000, 1000 * 2 ** intento);
      await dormir(espera);
      return ejecutarConBackoff(tarea, intento + 1);
    }
    throw err;
  }
}
