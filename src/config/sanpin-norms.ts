import type { SanPinNorm } from '../types/index.js';

/**
 * Справочник норм СанПиН 1.2.3685-21 для питьевой воды
 * Используется для валидации и генерации рекомендаций
 */
export const SANPIN_NORMS: Record<string, SanPinNorm> = {
  ph: { min: 6.0, max: 9.0, unit: 'pH', nameRu: 'Водородный показатель (pH)' },
  hardness: { max: 7.0, unit: 'мг-экв/л', nameRu: 'Жёсткость общая' },
  iron: { max: 0.3, unit: 'мг/л', nameRu: 'Железо общее' },
  manganese: { max: 0.1, unit: 'мг/л', nameRu: 'Марганец' },
  turbidity: { max: 2.6, unit: 'НТУ', nameRu: 'Мутность' },
  color: { max: 20, unit: 'градусы', nameRu: 'Цветность' },
  odor: { max: 2, unit: 'баллы', nameRu: 'Запах' },
  chlorides: { max: 350, unit: 'мг/л', nameRu: 'Хлориды' },
  sulfates: { max: 500, unit: 'мг/л', nameRu: 'Сульфаты' },
  nitrates: { max: 45, unit: 'мг/л', nameRu: 'Нитраты' },
  nitrites: { max: 3.0, unit: 'мг/л', nameRu: 'Нитриты' },
  ammonia: { max: 2.0, unit: 'мг/л', nameRu: 'Аммиак (аммоний)' },
  tds: { max: 1000, unit: 'мг/л', nameRu: 'Сухой остаток (TDS)' },
  oxidizability: { max: 5.0, unit: 'мг O₂/л', nameRu: 'Окисляемость перманганатная' },
  fluoride: { max: 1.5, unit: 'мг/л', nameRu: 'Фториды' },
  conductivity: { max: 2000, unit: 'мкСм/см', nameRu: 'Электропроводность' },
  alkalinity: { max: 6.5, unit: 'мг-экв/л', nameRu: 'Щёлочность' },
  sulphide: { max: 0.003, unit: 'мг/л', nameRu: 'Сероводород' },
};

/**
 * Получить норму по коду параметра
 */
export function getNorm(paramCode: string): SanPinNorm | undefined {
  return SANPIN_NORMS[paramCode.toLowerCase()];
}

/**
 * Проверить превышает ли значение норму
 */
export function isExceedsNorm(paramCode: string, value: number): boolean {
  const norm = getNorm(paramCode);
  if (!norm) return false;

  if (norm.min !== undefined && value < norm.min) return true;
  if (norm.max !== undefined && value > norm.max) return true;

  return false;
}
