import ollama from 'ollama';
import type { OllamaStatus, WaterAnalysisResult, WaterParam, ParseOptions, ParseResult } from '../types/index.js';
import {
  extractJsonBlock,
  smartFixJson,
  imageToBase64,
  convertToImages,
  cleanupTempDir,
  getFileType,
} from '../helpers/index.js';

const DEFAULT_MODEL = 'llama3.2-vision:11b';

const SYSTEM_PROMPT = `Ты — эксперт по анализу воды. Тебе нужно структурировать показатели для автоматизации подбора фильтров. Используй строго camelCase для всех ключей JSON.`;

const EXTRACTION_PROMPT = `Проанализируй изображение бланка/протокола анализа воды и извлеки данные в JSON:

{
  "blankNumber": "номер бланка или пустая строка",
  "analysisDate": "дата анализа или пустая строка",
  "customerName": "ФИО заказчика или пустая строка",
  "customerPhone": "телефон или пустая строка",
  "objectAddress": "адрес объекта или пустая строка",
  "intakeType": "тип водозабора (скважина/колодец/водопровод) или пустая строка",
  "appearance": "внешний вид воды или пустая строка",
  "sampleDate": "дата отбора пробы или пустая строка",
  "testDate": "дата проведения анализа или пустая строка",
  "params": [
    {
      "name": "Название показателя на русском",
      "value": 8.3,
      "unit": "единицы измерения",
      "pdk": 7.0,
      "paramCode": "код латиницей"
    }
  ],
  "modelAnalysis": "краткие рекомендации по водоподготовке"
}

ВАЖНО:
- params — массив ВСЕХ количественных показателей из документа
- value — только число (если "<0.1" или "менее 0.1" — используй 0.05, если "не обнаружено" — используй 0)
- pdk — ПДК по СанПиН если известна, иначе null
- paramCode — короткий код латиницей (hardness, ph, iron, manganese, nitrates, tds, conductivity и т.д.)
- Отвечай ТОЛЬКО валидным JSON без markdown-разметки`;

/**
 * Сервис для работы с Ollama Vision API
 */
export class OllamaService {
  private model: string;
  private verbose: boolean;

  constructor(options: ParseOptions = {}) {
    this.model = options.model || DEFAULT_MODEL;
    this.verbose = options.verbose || false;
  }

  /**
   * Проверяет доступность Ollama и наличие модели
   */
  async checkStatus(): Promise<OllamaStatus> {
    try {
      const response = await ollama.list();
      const models = response.models?.map((m) => m.name) || [];

      const hasModel = models.some((m) => m.includes(this.model.split(':')[0]));

      if (!hasModel) {
        return {
          available: false,
          error: `Модель ${this.model} не найдена. Запустите: ollama pull ${this.model}`,
          models,
        };
      }

      return { available: true, models };
    } catch (error) {
      return {
        available: false,
        error: `Ollama недоступна: ${(error as Error).message}. Запустите: docker compose up -d`,
      };
    }
  }

  /**
   * Парсит файл (изображение, PDF или DOCX)
   */
  async parseFile(filePath: string): Promise<ParseResult> {
    const startTime = Date.now();
    const fileType = getFileType(filePath);

    if (this.verbose) {
      console.log(`[PARSE] Файл: ${filePath}`);
      console.log(`[PARSE] Тип: ${fileType}`);
      console.log(`[PARSE] Модель: ${this.model}`);
    }

    let tempDir: string | undefined;

    try {
      // Конвертируем в изображения если нужно
      const { images, tempDir: td } = convertToImages(filePath);
      tempDir = td;

      if (this.verbose) {
        console.log(`[PARSE] Страниц/изображений: ${images.length}`);
      }

      // Парсим каждое изображение
      const pageResults: WaterAnalysisResult[] = [];

      for (let i = 0; i < images.length; i++) {
        if (this.verbose && images.length > 1) {
          console.log(`[PARSE] Обработка страницы ${i + 1}/${images.length}`);
        }

        const result = await this.parseImage(images[i]);
        if (result.success && result.data) {
          pageResults.push(result.data);
        }
      }

      // Объединяем результаты со всех страниц
      const merged = this.mergeResults(pageResults);

      const elapsed = Date.now() - startTime;

      if (this.verbose) {
        console.log(`[PARSE] Успешно за ${elapsed}ms`);
      }

      return {
        success: true,
        data: merged,
        meta: {
          model: this.model,
          elapsed_ms: elapsed,
          source_file: filePath,
        },
      };
    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.error(`[ERROR] ${(error as Error).message}`);

      return {
        success: false,
        error: (error as Error).message,
        meta: {
          model: this.model,
          elapsed_ms: elapsed,
          source_file: filePath,
        },
      };
    } finally {
      // Очищаем временные файлы
      if (tempDir) {
        cleanupTempDir(tempDir);
      }
    }
  }

  /**
   * Парсит одно изображение
   */
  private async parseImage(imagePath: string): Promise<ParseResult> {
    const startTime = Date.now();

    try {
      const base64Image = imageToBase64(imagePath);

      if (this.verbose) {
        console.log(`[PARSE] Размер: ${(base64Image.length / 1024).toFixed(1)} KB`);
      }

      const response = await ollama.chat({
        model: this.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: EXTRACTION_PROMPT, images: [base64Image] },
        ],
        options: {
          temperature: 0.1,
          num_predict: 4096,
        },
      });

      const rawResponse = response.message.content;

      if (this.verbose) {
        console.log(`[PARSE] Длина ответа: ${rawResponse.length}`);
      }

      const jsonStr = extractJsonBlock(rawResponse);

      if (!jsonStr) {
        throw new Error('Не удалось найти JSON в ответе модели');
      }

      const parsed = smartFixJson(jsonStr, this.verbose ? console : undefined);

      if (!parsed) {
        throw new Error('Не удалось распарсить JSON из ответа модели');
      }

      const data = this.normalizeResult(parsed as Record<string, unknown>);
      const elapsed = Date.now() - startTime;

      return {
        success: true,
        data,
        meta: {
          model: this.model,
          elapsed_ms: elapsed,
          source_file: imagePath,
        },
      };
    } catch (error) {
      const elapsed = Date.now() - startTime;

      return {
        success: false,
        error: (error as Error).message,
        meta: {
          model: this.model,
          elapsed_ms: elapsed,
          source_file: imagePath,
        },
      };
    }
  }

  /**
   * Объединяет результаты с нескольких страниц
   */
  private mergeResults(results: WaterAnalysisResult[]): WaterAnalysisResult {
    if (results.length === 0) {
      return this.emptyResult();
    }

    if (results.length === 1) {
      return results[0];
    }

    // Берём метаданные с первой страницы, где они есть
    const base = results[0];

    // Собираем все параметры, убираем дубликаты по paramCode
    const paramsMap = new Map<string, WaterParam>();

    for (const result of results) {
      for (const param of result.params) {
        const key = param.paramCode || param.name;
        // Если уже есть — оставляем первое значение
        if (!paramsMap.has(key)) {
          paramsMap.set(key, param);
        }
      }
    }

    // Объединяем рекомендации
    const analyses = results
      .map((r) => r.modelAnalysis)
      .filter((a) => a && a.trim())
      .join('\n');

    return {
      ...base,
      blankNumber: this.firstNonEmpty(results.map((r) => r.blankNumber)),
      analysisDate: this.firstNonEmpty(results.map((r) => r.analysisDate)),
      customerName: this.firstNonEmpty(results.map((r) => r.customerName)),
      customerPhone: this.firstNonEmpty(results.map((r) => r.customerPhone)),
      objectAddress: this.firstNonEmpty(results.map((r) => r.objectAddress)),
      intakeType: this.firstNonEmpty(results.map((r) => r.intakeType)),
      appearance: this.firstNonEmpty(results.map((r) => r.appearance)),
      sampleDate: this.firstNonEmpty(results.map((r) => r.sampleDate)),
      testDate: this.firstNonEmpty(results.map((r) => r.testDate)),
      params: Array.from(paramsMap.values()),
      modelAnalysis: analyses,
    };
  }

  /**
   * Возвращает первое непустое значение
   */
  private firstNonEmpty(values: string[]): string {
    return values.find((v) => v && v.trim()) || '';
  }

  /**
   * Пустой результат
   */
  private emptyResult(): WaterAnalysisResult {
    return {
      blankNumber: '',
      analysisDate: '',
      customerName: '',
      customerPhone: '',
      objectAddress: '',
      intakeType: '',
      appearance: '',
      sampleDate: '',
      testDate: '',
      params: [],
      modelAnalysis: '',
    };
  }

  /**
   * Нормализует результат парсинга
   */
  private normalizeResult(parsed: Record<string, unknown>): WaterAnalysisResult {
    let params = parsed.params;
    if (Array.isArray(params)) {
      params = params.map((p: Record<string, unknown>) => ({
        name: String(p.name || ''),
        value: Number(p.value) || 0,
        unit: String(p.unit || ''),
        pdk: p.pdk !== null && p.pdk !== undefined ? Number(p.pdk) : null,
        paramCode: String(p.paramCode || p.param_code || ''),
      }));
    } else {
      params = [];
    }

    return {
      blankNumber: String(parsed.blankNumber || parsed.blank_number || ''),
      analysisDate: String(parsed.analysisDate || parsed.analysis_date || ''),
      customerName: String(parsed.customerName || parsed.customer_name || ''),
      customerPhone: String(parsed.customerPhone || parsed.customer_phone || ''),
      objectAddress: String(parsed.objectAddress || parsed.object_address || ''),
      intakeType: String(parsed.intakeType || parsed.intake_type || ''),
      appearance: String(parsed.appearance || ''),
      sampleDate: String(parsed.sampleDate || parsed.sample_date || ''),
      testDate: String(parsed.testDate || parsed.test_date || ''),
      params,
      modelAnalysis: String(parsed.modelAnalysis || parsed.model_analysis || ''),
    };
  }
}
