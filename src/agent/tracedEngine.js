import { bus } from "../events/bus.js";
import { procesarInforme } from "./decisionEngine.js";

// Envoltorio con traza SSE: cada evento del motor se emite al bus bajo el caseId.
export async function procesarConTraza(caseId, pageId) {
  const emitir = (payload) => bus.emit(caseId, payload);
  return procesarInforme(pageId, { emitir });
}
