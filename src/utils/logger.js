const ts = () => new Date().toISOString();

export const log = {
  info:  (...a) => console.log(`[${ts()}] INFO `, ...a),
  warn:  (...a) => console.warn(`[${ts()}] WARN `, ...a),
  error: (...a) => console.error(`[${ts()}] ERROR `, ...a),
  ok:    (...a) => console.log(`[${ts()}] OK `, ...a),
  step:  (n, msg) => console.log(`[${ts()}] [${n}] ${msg}`),
};
