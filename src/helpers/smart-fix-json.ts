import type { Logger } from '../types/index.js';

/**
 * Пытается исправить типичные ошибки JSON от LLM и распарсить
 */
export function smartFixJson(jsonStr: string, logger?: Logger): unknown | null {
  // Сначала пробуем как есть
  try {
    return JSON.parse(jsonStr);
  } catch {
    // продолжаем исправлять
  }

  let fixed = jsonStr;

  // Убираем trailing commas перед } или ]
  fixed = fixed.replace(/,\s*([}\]])/g, '$1');

  // Заменяем одинарные кавычки на двойные (но не внутри строк)
  // Простой вариант — только для ключей
  fixed = fixed.replace(/'([^']+)':/g, '"$1":');

  // Убираем комментарии // ...
  fixed = fixed.replace(/\/\/[^\n]*/g, '');

  // Убираем NaN, Infinity — заменяем на null
  fixed = fixed.replace(/:\s*NaN/g, ': null');
  fixed = fixed.replace(/:\s*Infinity/g, ': null');
  fixed = fixed.replace(/:\s*-Infinity/g, ': null');

  // Пробуем ещё раз
  try {
    return JSON.parse(fixed);
  } catch (e) {
    logger?.warn?.(`smartFixJson: не удалось исправить JSON: ${(e as Error).message}`);
  }

  // Пробуем найти валидный JSON внутри
  const match = fixed.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      // не получилось
    }
  }

  logger?.error?.('smartFixJson: JSON невосстановим');
  return null;
}
