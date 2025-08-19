// natural-playwright.js - Adaptado para tu configuración
import { test, expect } from '@playwright/test';
import axios from 'axios';
import 'dotenv/config';

class NaturalLanguagePlaywright {
  constructor(options = {}) {
    // Usar tu configuración específica
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY || 'ollama';
    this.baseUrl = options.baseUrl || process.env.OPENAI_BASE_URL || 'http://192.168.24.20:11434/v1';
    this.model = options.model || process.env.AI_MODEL || 'llama3:latest';
    this.debug = options.debug || process.env.DEBUG_MODE === 'true';
    this.temperature = options.temperature || parseFloat(process.env.TEMPERATURE) || 0.1;
    this.timeout = options.timeout || parseInt(process.env.TIMEOUT_MS) || 30000;

    if (this.debug) {
      console.log(`🤖 Configuración IA:
      - URL: ${this.baseUrl}
      - Modelo: ${this.model}
      - Temperatura: ${this.temperature}`);
    }
  }

  async executeNaturalCommand(command, page, testContext = null) {
    if (this.debug) {
      console.log(`\n🎯 Procesando comando: "${command}"`);
    }

    try {
      // 1. Obtener contexto de la página
      const pageContext = await this.getPageContext(page);
      
      // 2. Generar código usando tu Ollama
      const playwrightCode = await this.generatePlaywrightCode(command, pageContext);
      
      // 3. Ejecutar código generado
      const result = await this.executeSafeCode(playwrightCode, page, testContext);
      
      if (this.debug) {
        console.log(`✅ Comando ejecutado exitosamente`);
      }
      
      return result;

    } catch (error) {
      console.error(`❌ Error ejecutando "${command}":`, error.message);
      throw error;
    }
  }

  async getPageContext(page) {
    try {
      const url = page.url();
      const title = await page.title();
      
      // Obtener elementos principales de la página
      const buttons = await page.$$eval('button:visible, input[type="button"]:visible, input[type="submit"]:visible', 
        els => els.slice(0, 15).map(el => ({ 
          type: 'button', 
          text: (el.textContent || el.value || '').trim(), 
          id: el.id || null,
          class: el.className || null
        }))
      ).catch(() => []);
      
      const links = await page.$$eval('a:visible', 
        els => els.slice(0, 10).map(el => ({ 
          type: 'link', 
          text: (el.textContent || '').trim(), 
          href: el.href || null
        }))
      ).catch(() => []);
      
      const inputs = await page.$$eval('input:visible, textarea:visible, select:visible', 
        els => els.slice(0, 10).map(el => ({ 
          type: 'input', 
          inputType: el.type || el.tagName.toLowerCase(), 
          placeholder: el.placeholder || null,
          name: el.name || null,
          id: el.id || null
        }))
      ).catch(() => []);

      return {
        url,
        title,
        elements: [...buttons, ...links, ...inputs].filter(el => el.text || el.placeholder || el.id)
      };
    } catch (error) {
      console.warn('Error obteniendo contexto:', error.message);
      return { 
        url: page.url(), 
        title: await page.title().catch(() => 'Sin título'), 
        elements: [] 
      };
    }
  }

  async generatePlaywrightCode(command, context) {
    const systemPrompt = this.buildSystemPrompt(context);
    
    try {
      const response = await axios.post(`${this.baseUrl}/chat/completions`, {
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Convierte este comando a código Playwright: "${command}"` }
        ],
        temperature: this.temperature,
        max_tokens: 400,
        stream: false
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: this.timeout
      });

      const aiResponse = response.data.choices[0].message.content;
      return this.extractCode(aiResponse);

    } catch (error) {
      console.error('Error llamando a IA:', error.message);
      // Fallback a acciones básicas si la IA falla
      return this.generateBasicAction(command);
    }
  }

  buildSystemPrompt(context) {
    const elementsInfo = context.elements.length > 0 
      ? `\nElementos disponibles en la página:\n${JSON.stringify(context.elements.slice(0, 20), null, 2)}`
      : '\nNo se encontraron elementos específicos en la página.';

    return `Eres un experto en automatización web con Playwright. Convierte comandos en español a código JavaScript ejecutable.

CONTEXTO ACTUAL:
- URL: ${context.url}
- Título: ${context.title}${elementsInfo}

REGLAS ESTRICTAS:
1. Responde SOLO con código JavaScript, sin explicaciones
2. No uses markdown ni bloques de código
3. Usa await para operaciones asíncronas
4. Para retornar valores usa 'return'
5. Usa selectores robustos basados en texto visible

PATRONES DE CÓDIGO:
- Click: await page.click('button:has-text("Texto del botón")');
- Escribir: await page.fill('input[placeholder="Email"]', 'valor');
- Navegar: await page.goto('https://url.com');
- Obtener texto: return await page.textContent('selector');
- Esperar: await page.waitForSelector('selector:visible');
- Verificar: const text = await page.textContent('selector'); if (!text.includes('esperado')) throw new Error('No encontrado');

SELECTORES PREFERIDOS:
- Botones: 'button:has-text("texto")'
- Enlaces: 'a:has-text("texto")'
- Inputs: 'input[placeholder="texto"]' o 'input[name="campo"]'
- Por texto: '*:has-text("texto exacto")'

Genera código que funcione con la página actual.`;
  }

  extractCode(aiResponse) {
    let code = aiResponse.trim();
    
    // Limpiar respuesta de la IA
    code = code.replace(/```javascript|```js|```/g, '');
    code = code.replace(/^.*?await/m, 'await'); // Empezar desde el primer await
    
    // Filtrar líneas de código válidas
    const lines = code.split('\n')
      .map(line => line.trim())
      .filter(line => 
        line && 
        !line.startsWith('//') && 
        !line.startsWith('/*') &&
        !line.includes('Explicación') &&
        !line.includes('Este código')
      );
    
    return lines.join('\n');
  }

  generateBasicAction(command) {
    const cmd = command.toLowerCase();
    
    // Patrones básicos para casos comunes
    if (cmd.includes('clic') || cmd.includes('hacer clic')) {
      const match = cmd.match(/["']([^"']+)["']|en (.+)/);
      const target = match ? (match[1] || match[2]) : 'button';
      return `await page.click('button:has-text("${target}"), a:has-text("${target}")');`;
    }
    
    if (cmd.includes('escribir') || cmd.includes('llenar')) {
      const textMatch = cmd.match(/["']([^"']+)["']/);
      const text = textMatch ? textMatch[1] : '';
      return `await page.fill('input:visible', '${text}');`;
    }
    
    if (cmd.includes('navegar') || cmd.includes('ir a')) {
      const urlMatch = cmd.match(/https?:\/\/[^\s]+/) || cmd.match(/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      const url = urlMatch ? urlMatch[0] : 'about:blank';
      return `await page.goto('${url.startsWith('http') ? url : 'https://' + url}');`;
    }
    
    if (cmd.includes('obtener') || cmd.includes('título')) {
      return 'return await page.title();';
    }
    
    // Acción genérica
    return `await page.waitForLoadState('networkidle');`;
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
          console.error('Error en código generado:', error.message);
          throw error;
        }
      })
    `;

    try {
      const executableFunction = eval(safeCode);
      return await executableFunction(page, testContext, expect);
    } catch (error) {
      if (this.debug) {
        console.error('Error ejecutando código:', error.message);
      }
      throw error;
    }
  }
}

// Función principal para usar en tests
async function auto(command, { page, test }) {
  const nlp = new NaturalLanguagePlaywright();
  return await nlp.executeNaturalCommand(command, page, test);
}

export { NaturalLanguagePlaywright, auto };