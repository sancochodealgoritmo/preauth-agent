import OpenAI from "openai";
import { config } from "../src/config.js";
import { log } from "../src/utils/logger.js";

const client = new OpenAI({
  apiKey: config.deepseek.apiKey,
  baseURL: config.deepseek.baseURL,
  timeout: 45_000,
});

async function medir(modelo) {
  const t0 = Date.now();
  try {
    const res = await client.chat.completions.create({
      model: modelo,
      messages: [{ role: "user", content: "Responde exclusivamente con la palabra: ok" }],
      temperature: 0.1,
    });
    return {
      modelo,
      ms: Date.now() - t0,
      tokens: res.usage?.total_tokens ?? null,
      error: null,
    };
  } catch (e) {
    return { modelo, ms: Date.now() - t0, tokens: null, error: e.message };
  }
}

const resultados = [];
for (const modelo of ["deepseek-reasoner", "deepseek-chat"]) {
  log.info(`Midiendo ${modelo}...`);
  resultados.push(await medir(modelo));
}
console.table(resultados);
