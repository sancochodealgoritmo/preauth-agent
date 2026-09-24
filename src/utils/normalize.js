export function normalizeCedula(cedula) {
  if (!cedula) return "";
  return String(cedula).replace(/[\s.\-]/g, "").toUpperCase();
}
