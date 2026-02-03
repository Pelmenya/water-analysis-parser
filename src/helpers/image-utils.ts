import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];

/**
 * Проверяет, поддерживается ли формат изображения
 */
export function isSupportedImage(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(ext);
}

/**
 * Конвертирует изображение в base64
 */
export function imageToBase64(filePath: string): string {
  const buffer = readFileSync(filePath);
  return buffer.toString('base64');
}

/**
 * Получает размер файла в KB
 */
export function getFileSizeKB(filePath: string): number {
  const buffer = readFileSync(filePath);
  return buffer.length / 1024;
}
