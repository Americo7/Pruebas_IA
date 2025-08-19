import { test, expect } from '@playwright/test';
import { auto } from '../utils/natural-playwright.js';

test('Entrar a la página de AGETIC', async ({ page }) => {
  await auto('abre https://reclamos.demo.agetic.gob.bo/ y pulsa el boton de Ingresa con Ciudadanía Digital, que espere unos 5 segundos.. ', { page, test });


});
