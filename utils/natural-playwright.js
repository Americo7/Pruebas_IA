// natural-playwright-robusto.js
import { test, expect } from '@playwright/test';
import axios from 'axios';
import 'dotenv/config';

class RobustNaturalPlaywright {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY || 'ollama';
    this.baseUrl = options.baseUrl || process.env.OPENAI_BASE_URL || 'http://192.168.24.20:11434/v1';
    this.model = options.model || process.env.AI_MODEL || 'llama3:latest';
    this.debug = options.debug || process.env.DEBUG_MODE === 'true';
    this.temperature = options.temperature || 0.1;
    this.timeout = options.timeout || 30000;
    this.maxRetries = 3;

    if (this.debug) {
      console.log(`🤖 Configuración IA Robusta:
      - URL: ${this.baseUrl}
      - Modelo: ${this.model}
      - Reintentos: ${this.maxRetries}`);
    }
  }

  async executeNaturalCommand(command, page, testContext = null) {
    if (this.debug) {
      console.log(`\n🎯 Procesando comando: "${command}"`);
    }

    // Dividir comando complejo en pasos simples
    const steps = this.parseCommandSteps(command);
    let finalResult = null;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (this.debug) {
        console.log(`📋 Paso ${i + 1}/${steps.length}: ${step}`);
      }

      try {
        // Esperar entre pasos si es necesario
        if (i > 0) {
          await page.waitForTimeout(1000);
        }

        const result = await this.executeSingleStep(step, page, testContext);
        if (result) finalResult = result;

      } catch (error) {
        console.error(`❌ Error en paso ${i + 1}: ${error.message}`);
        
        // Intentar estrategia alternativa
        try {
          await this.executeAlternativeStrategy(step, page);
        } catch (altError) {
          if (this.debug) {
            console.error(`❌ Estrategia alternativa falló: ${altError.message}`);
          }
          throw new Error(`Falló paso: "${step}". Error: ${error.message}`);
        }
      }
    }

    return finalResult;
  }

  // Dentro de RobustNaturalPlaywright
async ensureActivePage(page) {
  // Si la página se cerró, toma la última del contexto
  if (!page || page.isClosed()) {
    const ctx = page?.context?.() || globalThis.__lastContext;
    if (!ctx) throw new Error('No hay contexto activo para recuperar una página.');
    const pages = ctx.pages();
    if (pages.length === 0) throw new Error('No hay páginas activas en el contexto.');
    return pages[pages.length - 1];
  }
  return page;
}

async clickPossiblyOpeningNewPage(page, clickFn) {
  const ctx = page.context();
  // Guarda el contexto por si luego se cierra "page"
  globalThis.__lastContext = ctx;

  const [maybeNew] = await Promise.all([
    ctx.waitForEvent('page').then(p => p).catch(() => null), // si no abre popup, devuelve null
    (async () => { await clickFn(); })(),
  ]);

  if (maybeNew) {
    await maybeNew.waitForLoadState('domcontentloaded').catch(() => {});
    return maybeNew;
  }

  // Si no hubo popup, intenta mantener la página actual, o la última
  return this.ensureActivePage(page);
}

  parseCommandSteps(command) {
    // Dividir comando en pasos lógicos
    let steps = [];
    
    // Separar por conectores comunes
    const separators = [
      ' y luego ', ' y después ', ' después ', ' luego ',
      ' y pulsa ', ' y haz clic ', ' y presiona ', ' y escribe ',
      ' y selecciona ', ' y espera ', ', ', ' y '
    ];

    let currentCommand = command;
    
    // Buscar patrones de tiempo de espera
    const waitPattern = /espera[rn]?\s+(\d+)\s+segundos?/gi;
    const waitMatches = [...currentCommand.matchAll(waitPattern)];
    
    // Separar por conectores
    for (const sep of separators) {
      if (currentCommand.includes(sep)) {
        steps = currentCommand.split(sep);
        break;
      }
    }
    
    if (steps.length === 0) {
      steps = [currentCommand];
    }

    return steps.map(step => step.trim()).filter(step => step.length > 0);
  }

  async executeSingleStep(step, page, testContext) {
    try {
      // 1. Obtener contexto detallado de la página
      const pageContext = await this.getDetailedPageContext(page);
      
      // 2. Detectar tipo de acción
      const actionType = this.detectActionType(step);
      
      // 3. Generar código específico según el tipo
      let playwrightCode;
      if (actionType === 'navigate') {
        playwrightCode = await this.generateNavigationCode(step);
      } else if (actionType === 'wait') {
        playwrightCode = this.generateWaitCode(step);
      } else {
        playwrightCode = await this.generateSmartPlaywrightCode(step, pageContext, actionType);
      }
      
      // 4. Ejecutar con reintentos
      return await this.executeWithRetries(playwrightCode, page, testContext);

    } catch (error) {
      throw error;
    }
  }

  async getDetailedPageContext(page) {
    try {
      const url = page.url();
      const title = await page.title();
      
      // Obtener elementos de forma más detallada y estructurada
      const elements = await page.evaluate(() => {
        const result = {
          buttons: [],
          inputs: [],
          links: [],
          textElements: [],
          interactive: []
        };

        // Botones (múltiples tipos)
        const buttonSelectors = 'button, input[type="button"], input[type="submit"], [role="button"], .btn, .button';
        document.querySelectorAll(buttonSelectors).forEach((el, index) => {
          if (el.offsetParent !== null) { // Solo elementos visibles
            const rect = el.getBoundingClientRect();
            result.buttons.push({
              index,
              text: (el.textContent || el.value || el.title || '').trim(),
              id: el.id || null,
              className: el.className || null,
              name: el.name || null,
              type: el.type || el.tagName.toLowerCase(),
              position: `${Math.round(rect.x)},${Math.round(rect.y)}`,
              size: `${Math.round(rect.width)}x${Math.round(rect.height)}`
            });
          }
        });

        // Inputs más detallados
        document.querySelectorAll('input, textarea, select').forEach((el, index) => {
          if (el.offsetParent !== null) {
            const label = document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() || '';
            result.inputs.push({
              index,
              type: el.type || el.tagName.toLowerCase(),
              placeholder: el.placeholder || '',
              name: el.name || null,
              id: el.id || null,
              label: label,
              value: el.value || '',
              required: el.required || false,
              className: el.className || null
            });
          }
        });

        // Enlaces
        document.querySelectorAll('a[href]').forEach((el, index) => {
          if (el.offsetParent !== null && el.textContent.trim()) {
            result.links.push({
              index,
              text: el.textContent.trim(),
              href: el.href,
              id: el.id || null,
              className: el.className || null
            });
          }
        });

        // Elementos con texto importante
        document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, div').forEach(el => {
          const text = el.textContent?.trim();
          if (text && text.length > 3 && text.length < 100) {
            result.textElements.push({
              tag: el.tagName.toLowerCase(),
              text: text,
              id: el.id || null,
              className: el.className || null
            });
          }
        });

        return result;
      });

      if (this.debug) {
        console.log(`📄 Contexto de página:
        - URL: ${url}
        - Botones: ${elements.buttons.length}
        - Inputs: ${elements.inputs.length}
        - Enlaces: ${elements.links.length}`);
      }

      return { url, title, elements };
    } catch (error) {
      console.warn('Error obteniendo contexto detallado:', error.message);
      return await this.getBasicPageContext(page);
    }
  }

  detectActionType(step) {
    const stepLower = step.toLowerCase();
    
    if (stepLower.includes('navega') || stepLower.includes('abre') || stepLower.includes('ve a') || stepLower.includes('ir a')) {
      return 'navigate';
    }
    if (stepLower.includes('espera') || stepLower.includes('segundos')) {
      return 'wait';
    }
    if (stepLower.includes('escribe') || stepLower.includes('ingresa') || stepLower.includes('llena') || stepLower.includes('completa')) {
      return 'type';
    }
    if (stepLower.includes('clic') || stepLower.includes('pulsa') || stepLower.includes('presiona') || stepLower.includes('hace click') || stepLower.includes('selecciona')) {
      return 'click';
    }
    if (stepLower.includes('obtén') || stepLower.includes('extrae') || stepLower.includes('lee') || stepLower.includes('captura')) {
      return 'extract';
    }
    
    return 'general';
  }

  async generateSmartPlaywrightCode(step, context, actionType) {
    const systemPrompt = this.buildEnhancedSystemPrompt(context, actionType);
    
    try {
      const response = await axios.post(`${this.baseUrl}/chat/completions`, {
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `ACCIÓN: ${step}` }
        ],
        temperature: this.temperature,
        max_tokens: 300
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: this.timeout
      });

      const aiResponse = response.data.choices[0].message.content;
      return this.extractAndValidateCode(aiResponse);

    } catch (error) {
      console.error('Error llamando a IA:', error.message);
      return this.generateFallbackCode(step, context, actionType);
    }
  }

  buildEnhancedSystemPrompt(context, actionType) {
    const elementsInfo = this.formatElementsForPrompt(context.elements);
    
    return `Eres un experto en automatización web. Genera código Playwright robusto y específico.

PÁGINA ACTUAL: ${context.url}
TÍTULO: ${context.title}

${elementsInfo}

ACCIÓN REQUERIDA: ${actionType}

REGLAS CRÍTICAS:
1. Usa MÚLTIPLES estrategias de selección en orden de preferencia
2. Para clicks: Busca por texto exacto, luego parcial, luego por atributos
3. Para inputs: Busca por placeholder, label, name, luego por posición
4. SIEMPRE incluye esperas (waitForSelector, waitForLoadState)
5. Responde SOLO con código JavaScript ejecutable
6. No uses markdown, comentarios ni explicaciones

PATRONES OBLIGATORIOS:
- Click: await page.locator('selector').click(); o page.getByText('texto').click();
- Type: await page.locator('input').fill('texto');
- Wait: await page.waitForSelector('selector', {visible: true});
- Navigate: await page.goto('url'); await page.waitForLoadState('networkidle');

ESTRATEGIAS DE SELECCIÓN:
1. Por texto visible: page.getByText('texto exacto')
2. Por rol: page.getByRole('button', {name: 'texto'})  
3. Por placeholder: page.getByPlaceholder('placeholder')
4. Por atributos: page.locator('[name="campo"]')
5. Combinaciones: page.locator('button').filter({hasText: 'texto'})

Genera código que funcione con los elementos disponibles.`;
  }

  formatElementsForPrompt(elements) {
    let prompt = 'ELEMENTOS DISPONIBLES:\n';
    
    if (elements.buttons.length > 0) {
      prompt += '\nBOTONES:\n';
      elements.buttons.slice(0, 10).forEach(btn => {
        prompt += `- "${btn.text}" (${btn.type}${btn.id ? ', id:' + btn.id : ''}${btn.className ? ', class:' + btn.className : ''})\n`;
      });
    }
    
    if (elements.inputs.length > 0) {
      prompt += '\nCAMPOS DE ENTRADA:\n';
      elements.inputs.slice(0, 10).forEach(input => {
        prompt += `- ${input.type}${input.placeholder ? ' placeholder:"' + input.placeholder + '"' : ''}${input.label ? ' label:"' + input.label + '"' : ''}${input.name ? ' name:"' + input.name + '"' : ''}\n`;
      });
    }
    
    if (elements.links.length > 0) {
      prompt += '\nENLACES:\n';
      elements.links.slice(0, 8).forEach(link => {
        prompt += `- "${link.text}"\n`;
      });
    }
    
    return prompt;
  }

  generateNavigationCode(step) {
    const urlMatch = step.match(/https?:\/\/[^\s]+/) || step.match(/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const url = urlMatch ? urlMatch[0] : null;
    
    if (!url) {
      throw new Error('No se encontró URL válida en el comando de navegación');
    }
    
    return `await page.goto('${url.startsWith('http') ? url : 'https://' + url}');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);`;
  }

  generateWaitCode(step) {
    const timeMatch = step.match(/(\d+)\s*segundos?/);
    const seconds = timeMatch ? parseInt(timeMatch[1]) : 5;
    const milliseconds = seconds * 1000;
    
    return `await page.waitForTimeout(${milliseconds});`;
  }

  generateFallbackCode(step, context, actionType) {
    const stepLower = step.toLowerCase();
    
    switch (actionType) {
      case 'click':
        // Buscar texto del botón en el comando
        const buttonText = this.extractTextFromCommand(step);
        if (buttonText) {
          return `
            try {
              await page.getByText('${buttonText}').click();
            } catch {
              try {
                await page.locator('button').filter({hasText: '${buttonText}'}).click();
              } catch {
                await page.locator('[role="button"]').filter({hasText: '${buttonText}'}).click();
              }
            }`;
        }
        break;
        
      case 'type':
        const textToType = this.extractTextFromCommand(step);
        if (textToType) {
          return `
            const inputs = await page.locator('input:visible, textarea:visible').all();
            if (inputs.length > 0) {
              await inputs[0].fill('${textToType}');
            }`;
        }
        break;
        
      default:
        return 'await page.waitForTimeout(1000);';
    }
    
    return 'await page.waitForTimeout(1000);';
  }

  extractTextFromCommand(command) {
    // Extraer texto entre comillas
    const quotedMatch = command.match(/["'](.*?)["']/);
    if (quotedMatch) return quotedMatch[1];
    
    // Extraer después de palabras clave
    const patterns = [
      /(?:escribe|ingresa|llena)\s+(.+)/i,
      /(?:clic|pulsa|presiona).*?(?:en|el|la)\s+(.+)/i,
      /(?:busca|encuentra)\s+(.+)/i
    ];
    
    for (const pattern of patterns) {
      const match = command.match(pattern);
      if (match) return match[1].trim();
    }
    
    return null;
  }

  async executeWithRetries(code, page, testContext) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        if (this.debug && attempt > 1) {
          console.log(`🔄 Reintento ${attempt}/${this.maxRetries}`);
        }
        
        return await this.executeSafeCode(code, page, testContext);
        
      } catch (error) {
        lastError = error;
        if (attempt < this.maxRetries) {
          await page.waitForTimeout(1000 * attempt); // Espera progresiva
        }
      }
    }
    
    throw lastError;
  }

  async executeAlternativeStrategy(step, page) {
    const stepLower = step.toLowerCase();
    
    if (stepLower.includes('clic') || stepLower.includes('pulsa')) {
      // Estrategia: hacer click en el primer elemento clickeable visible
      await page.locator('button:visible, [role="button"]:visible, a:visible').first().click();
    } else if (stepLower.includes('escribe')) {
      // Estrategia: escribir en el primer input visible
      await page.locator('input:visible, textarea:visible').first().fill('');
    }
  }

  extractAndValidateCode(aiResponse) {
    let code = aiResponse.trim();
    
    // Limpiar respuesta
    code = code.replace(/```javascript|```js|```/g, '');
    code = code.replace(/^.*?await/m, 'await');
    
    // Validar que tenga comandos await
    if (!code.includes('await')) {
      throw new Error('Código generado no contiene operaciones asíncronas válidas');
    }
    
    return code.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('//'))
      .join('\n');
  }

  async executeSafeCode(code, page, testContext) {
    if (this.debug) {
      console.log(`🔧 Ejecutando código:\n${code}`);
    }

    const safeCode = `
      (async function(page, test, expect) {
        try {
          ${code}
        } catch (error) {
          console.error('Error en ejecución:', error.message);
          throw error;
        }
      })
    `;

    try {
      const executableFunction = eval(safeCode);
      return await executableFunction(page, testContext, expect);
    } catch (error) {
      if (this.debug) {
        console.error('❌ Error ejecutando:', error.message);
      }
      throw error;
    }
  }

  async getBasicPageContext(page) {
    return {
      url: page.url(),
      title: await page.title().catch(() => 'Sin título'),
      elements: { buttons: [], inputs: [], links: [], textElements: [] }
    };
  }
}

// Función principal mejorada
async function auto(command, { page, test }) {
  const nlp = new RobustNaturalPlaywright({ debug: true });
  return await nlp.executeNaturalCommand(command, page, test);
}

export { RobustNaturalPlaywright, auto };