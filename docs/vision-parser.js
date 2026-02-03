import ollama from 'ollama';
import { SANPIN_NORMS } from './schema.js';
import { imageToBase64, generateRecommendations } from './utils.js';

const DEFAULT_MODEL = 'llama3.2-vision:11b';

const SYSTEM_PROMPT = `Ты эксперт по анализу качества воды. Твоя задача — извлечь данные из бланка/протокола анализа воды.

Внимательно изучи изображение и извлеки ВСЕ параметры, которые найдёшь.

ВАЖНО:
- Числовые значения должны быть числами, не строками
- Если значение указано как "<0.1" или "менее 0.1", используй 0.05 (половина порога)
- Если значение "не обнаружено" или "н/о", используй 0
- Единицы измерения сохраняй как в документе
- Если норма указана в документе — используй её, иначе используй СанПиН

Отвечай ТОЛЬКО валидным JSON без markdown-разметки и пояснений.`;

const EXTRACTION_PROMPT = `Извлеки данные из этого бланка анализа воды.

Верни JSON в формате:
{
  "date": "YYYY-MM-DD или null",
  "sample_id": "номер пробы или null",
  "source": "источник воды или null",
  "address": "адрес или null",
  "lab_name": "название лаборатории или null",
  "parameters": {
    "ph": { "value": число, "unit": "pH" },
    "hardness": { "value": число, "unit": "мг-экв/л" },
    "iron": { "value": число, "unit": "мг/л" },
    "manganese": { "value": число, "unit": "мг/л" },
    "turbidity": { "value": число, "unit": "НТУ" },
    "color": { "value": число, "unit": "градусы" },
    "odor": { "value": число, "unit": "баллы" },
    "chlorides": { "value": число, "unit": "мг/л" },
    "sulfates": { "value": число, "unit": "мг/л" },
    "nitrates": { "value": число, "unit": "мг/л" },
    "nitrites": { "value": число, "unit": "мг/л" },
    "ammonia": { "value": число, "unit": "мг/л" },
    "tds": { "value": число, "unit": "мг/л" },
    "oxidizability": { "value": число, "unit": "мг О2/л" },
    "fluoride": { "value": число, "unit": "мг/л" }
  },
  "conclusion": "заключение из документа или null"
}

Включай только те параметры, которые реально есть в документе.
Отвечай ТОЛЬКО JSON, без \`\`\` и пояснений.`;

/**
 * Парсит изображение бланка анализа воды
 * @param {string} imagePath - путь к изображению
 * @param {object} options - опции
 * @returns {Promise<object>} результат парсинга
 */
export async function parseWaterAnalysis(imagePath, options = {}) {
  const {
    model = DEFAULT_MODEL,
    verbose = false
  } = options;

  const startTime = Date.now();

  if (verbose) {
    console.log(`📄 Обработка: ${imagePath}`);
    console.log(`🤖 Модель: ${model}`);
  }

  // Конвертируем изображение в base64
  const base64Image = imageToBase64(imagePath);

  if (verbose) {
    console.log(`📊 Размер изображения: ${(base64Image.length / 1024).toFixed(1)} KB (base64)`);
  }

  try {
    // Отправляем запрос к Vision LLM
    const response = await ollama.chat({
      model,
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: EXTRACTION_PROMPT,
          images: [base64Image]
        }
      ],
      options: {
        temperature: 0.1,  // Низкая температура для точного извлечения данных
        num_predict: 2048
      }
    });

    const rawResponse = response.message.content;
    
    if (verbose) {
      console.log(`📝 Raw response length: ${rawResponse.length}`);
    }

    // Парсим JSON из ответа
    const result = parseJsonResponse(rawResponse);

    // Добавляем проверку норм и рекомендации
    if (result.parameters) {
      result.parameters = addNormChecks(result.parameters);
      result.recommendations = generateRecommendations(result.parameters);
    }

    const elapsed = Date.now() - startTime;

    if (verbose) {
      console.log(`✅ Успешно за ${elapsed}ms`);
    }

    return {
      success: true,
      data: result,
      meta: {
        model,
        elapsed_ms: elapsed,
        source_file: imagePath
      }
    };

  } catch (error) {
    const elapsed = Date.now() - startTime;
    
    console.error(`❌ Ошибка: ${error.message}`);
    
    return {
      success: false,
      error: error.message,
      meta: {
        model,
        elapsed_ms: elapsed,
        source_file: imagePath
      }
    };
  }
}

/**
 * Парсит JSON из ответа LLM (убирает markdown если есть)
 * @param {string} response 
 * @returns {object}
 */
function parseJsonResponse(response) {
  let cleaned = response.trim();
  
  // Убираем markdown code blocks если есть
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  
  cleaned = cleaned.trim();
  
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Пробуем найти JSON в тексте
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error(`Не удалось распарсить JSON: ${e.message}`);
  }
}

/**
 * Добавляет проверку норм СанПиН к параметрам
 * @param {object} parameters 
 * @returns {object}
 */
function addNormChecks(parameters) {
  const result = { ...parameters };
  
  for (const [key, param] of Object.entries(result)) {
    if (param && typeof param === 'object' && param.value !== undefined) {
      const norm = SANPIN_NORMS[key];
      
      if (norm) {
        if (norm.min !== undefined) {
          result[key].norm_min = norm.min;
        }
        if (norm.max !== undefined) {
          result[key].norm_max = norm.max;
        }
        
        // Проверяем соответствие норме
        const value = param.value;
        let isNormal = true;
        
        if (norm.min !== undefined && value < norm.min) {
          isNormal = false;
        }
        if (norm.max !== undefined && value > norm.max) {
          isNormal = false;
        }
        
        result[key].is_normal = isNormal;
      }
    }
  }
  
  return result;
}

/**
 * Batch обработка нескольких файлов
 * @param {string[]} imagePaths 
 * @param {object} options 
 * @returns {Promise<object[]>}
 */
export async function parseBatch(imagePaths, options = {}) {
  const results = [];
  
  for (let i = 0; i < imagePaths.length; i++) {
    console.log(`\n[${i + 1}/${imagePaths.length}]`);
    const result = await parseWaterAnalysis(imagePaths[i], options);
    results.push(result);
  }
  
  return results;
}

/**
 * Проверяет доступность Ollama и модели
 * @param {string} model 
 * @returns {Promise<{ available: boolean, error?: string }>}
 */
export async function checkOllamaStatus(model = DEFAULT_MODEL) {
  try {
    const response = await ollama.list();
    const models = response.models || [];
    
    const hasModel = models.some(m => m.name.includes(model.split(':')[0]));
    
    if (!hasModel) {
      return {
        available: false,
        error: `Модель ${model} не найдена. Запустите: ollama pull ${model}`
      };
    }
    
    return { available: true };
    
  } catch (error) {
    return {
      available: false,
      error: `Ollama недоступна: ${error.message}. Запустите: docker compose up -d`
    };
  }
}
