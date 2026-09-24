const ts = () => new Date().toISOString();

export const log = {
  info:  (...a) => console.log(`[${ts()}] ℹ️ `, ...a),
  warn:  (...a) => console.warn(`[${ts()}] ⚠️ `, ...a),
  error: (...a) => console.error(`[${ts()}] ❌ `, ...a),
  ok:    (...a) => console.log(`[${ts()}] ✅ `, ...a),
  step:  (n, msg) => console.log(`[${ts()}] ▶ [${n}] ${msg}`),
};
