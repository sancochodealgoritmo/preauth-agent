// Caché en memoria con TTL. Usada para el Catálogo de Procedimientos (5 min).
const almacen = new Map();

export function obtenerCache(clave) {
  const item = almacen.get(clave);
  if (!item) return null;
  if (Date.now() > item.expiraEn) {
    almacen.delete(clave);
    return null;
  }
  return item.valor;
}

export function guardarCache(clave, valor, ttlMs) {
  almacen.set(clave, { valor, expiraEn: Date.now() + ttlMs });
}

export function invalidarCache(clave) {
  almacen.delete(clave);
}

export function limpiarCache() {
  almacen.clear();
}
