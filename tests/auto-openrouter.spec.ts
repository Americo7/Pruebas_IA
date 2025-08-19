import { test, expect } from "@playwright/test";
test.setTimeout(300_000); // 5 min
import { auto } from "auto-playwright/dist/index.js";

const IA = {
  openaiApiKey: process.env.OPENROUTER_API_KEY, // viene del .env
  openaiBaseUrl: "https://openrouter.ai/api/v1",
  model: "deepseek/deepseek-chat-v3-0324:free", // o el free que probaste en curl
  maxTokens: 256,
  debug: true,
};

test("Flujo completo en un solo mensaje", async ({ page }) => {

  const result = await auto(`
    Navega a https://www.wikipedia.org/
    Escribe 'Playwright' en el buscador,
    presiona Enter,
    abre el primer resultado que hable del framework de testing
    y dime el título de la página resultante
  `, { page, test }, IA);

  console.log("RESULTADO:", result);
  expect(String(result)).toContain("Playwright");
});
