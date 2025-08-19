// test-optimizado.spec.js
import { test, expect } from '@playwright/test';
import { auto } from '../utils/natural-playwright.js';

test('Flujo completo de AGETIC con búsquedas', async ({ page }) => {
  // Navegación inicial
  await auto('abre https://reclamos.demo.agetic.gob.bo/', { page });
  
  // Interacción con botones (mejor detección)
  await auto('haz clic en el botón que dice "Ingresa con Ciudadanía Digital"', { page });
  
  // Espera inteligente
  await auto('espera a que cargue la página de login', { page });
  
  // Escritura en campo específico (mejor extracción)
  await auto('escribe "3124538684-6L" en el campo de cédula de identidad', { page });

});


