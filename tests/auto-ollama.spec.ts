import { test, expect } from "@playwright/test";
import { auto } from "auto-playwright/dist/index.js";

const IA = {
  openaiApiKey: "ollama",                   
  openaiBaseUrl: "http://10.188.103.140:11434/v1",
  model: "llama3.2:latest",
  debug: true,
};


test.setTimeout(120_000);

test("Flujo completo en un solo mensaje", async ({ page }) => {
  const result = await auto(`
    Abre google.com y Escribe 'Playwright' en el buscador,
    presiona Enter
  `, { page, test }, IA);

  console.log("RESULTADO:", result);
  expect(String(result)).toContain("Playwright");
});