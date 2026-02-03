/**
 * Параметр воды из бланка анализа
 * Гибкая структура — набор параметров зависит от лаборатории
 */
export interface WaterParam {
  /** Название параметра на русском (как в бланке) */
  name: string;
  /** Числовое значение */
  value: number;
  /** Единицы измерения */
  unit: string;
  /** ПДК по СанПиН (null если не определено) */
  pdk: number | null;
  /** Код параметра латиницей (hardness, ph, iron, manganese, etc.) */
  paramCode: string;
}

/**
 * Результат парсинга бланка анализа воды
 */
export interface WaterAnalysisResult {
  /** Номер бланка/протокола */
  blankNumber: string;
  /** Дата анализа */
  analysisDate: string;
  /** ФИО заказчика */
  customerName: string;
  /** Телефон заказчика */
  customerPhone: string;
  /** Адрес объекта */
  objectAddress: string;
  /** Тип водозабора (скважина, колодец, водопровод) */
  intakeType: string;
  /** Внешний вид воды */
  appearance: string;
  /** Дата отбора пробы */
  sampleDate: string;
  /** Дата проведения анализа */
  testDate: string;
  /** Массив параметров воды */
  params: WaterParam[];
  /** Анализ/рекомендации от модели */
  modelAnalysis: string;
}

/**
 * Норма СанПиН для параметра
 */
export interface SanPinNorm {
  min?: number;
  max?: number;
  unit: string;
  nameRu: string;
}

/**
 * Ответ парсера
 */
export interface ParseResult {
  success: boolean;
  data?: WaterAnalysisResult;
  error?: string;
  meta: {
    model: string;
    elapsed_ms: number;
    source_file: string;
  };
}

/**
 * Опции парсера
 */
export interface ParseOptions {
  /** Модель Ollama (по умолчанию llama3.2-vision:11b) */
  model?: string;
  /** Подробный вывод в консоль */
  verbose?: boolean;
}

/**
 * Статус Ollama
 */
export interface OllamaStatus {
  available: boolean;
  error?: string;
  models?: string[];
}

/**
 * Логгер (совместим с console и NestJS Logger)
 */
export interface Logger {
  log: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string, ...args: unknown[]) => void;
}
