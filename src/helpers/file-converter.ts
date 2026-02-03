import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
const PDF_EXTENSION = '.pdf';
const DOCX_EXTENSIONS = ['.doc', '.docx'];

export type FileType = 'image' | 'pdf' | 'docx' | 'unknown';

/**
 * Определяет тип файла
 */
export function getFileType(filePath: string): FileType {
  const ext = extname(filePath).toLowerCase();

  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (ext === PDF_EXTENSION) return 'pdf';
  if (DOCX_EXTENSIONS.includes(ext)) return 'docx';

  return 'unknown';
}

/**
 * Проверяет, поддерживается ли файл
 */
export function isSupportedFile(filePath: string): boolean {
  return getFileType(filePath) !== 'unknown';
}

/**
 * Конвертирует PDF в изображения (одно на страницу)
 * Возвращает массив путей к изображениям
 */
export function convertPdfToImages(pdfPath: string): string[] {
  const tempDir = join(tmpdir(), `water-parser-${randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });

  const outputBase = join(tempDir, 'page');

  try {
    // pdftoppm -png input.pdf output_prefix
    execSync(`pdftoppm -png "${pdfPath}" "${outputBase}"`, {
      encoding: 'utf-8',
      timeout: 60000,
    });

    const files = readdirSync(tempDir)
      .filter((f) => f.endsWith('.png'))
      .sort()
      .map((f) => join(tempDir, f));

    return files;
  } catch (error) {
    // Очистка при ошибке
    cleanupTempDir(tempDir);
    throw new Error(`Ошибка конвертации PDF: ${(error as Error).message}`);
  }
}

/**
 * Конвертирует DOCX в изображения через LibreOffice → PDF → PNG
 */
export function convertDocxToImages(docxPath: string): string[] {
  const tempDir = join(tmpdir(), `water-parser-${randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });

  try {
    // Конвертируем DOCX → PDF через LibreOffice
    execSync(
      `libreoffice --headless --convert-to pdf --outdir "${tempDir}" "${docxPath}"`,
      { encoding: 'utf-8', timeout: 120000 }
    );

    // Находим созданный PDF
    const pdfFile = readdirSync(tempDir).find((f) => f.endsWith('.pdf'));
    if (!pdfFile) {
      throw new Error('LibreOffice не создал PDF файл');
    }

    const pdfPath = join(tempDir, pdfFile);

    // Конвертируем PDF → PNG
    const outputBase = join(tempDir, 'page');
    execSync(`pdftoppm -png "${pdfPath}" "${outputBase}"`, {
      encoding: 'utf-8',
      timeout: 60000,
    });

    // Удаляем промежуточный PDF
    unlinkSync(pdfPath);

    const files = readdirSync(tempDir)
      .filter((f) => f.endsWith('.png'))
      .sort()
      .map((f) => join(tempDir, f));

    return files;
  } catch (error) {
    cleanupTempDir(tempDir);
    throw new Error(`Ошибка конвертации DOCX: ${(error as Error).message}`);
  }
}

/**
 * Конвертирует файл в массив изображений
 * Для изображений возвращает массив из одного элемента
 */
export function convertToImages(filePath: string): { images: string[]; tempDir?: string } {
  const fileType = getFileType(filePath);

  switch (fileType) {
    case 'image':
      return { images: [filePath] };

    case 'pdf': {
      const images = convertPdfToImages(filePath);
      const tempDir = images.length > 0 ? join(images[0], '..') : undefined;
      return { images, tempDir };
    }

    case 'docx': {
      const images = convertDocxToImages(filePath);
      const tempDir = images.length > 0 ? join(images[0], '..') : undefined;
      return { images, tempDir };
    }

    default:
      throw new Error(`Неподдерживаемый формат файла: ${extname(filePath)}`);
  }
}

/**
 * Очищает временную директорию
 */
export function cleanupTempDir(tempDir: string): void {
  if (!tempDir || !existsSync(tempDir)) return;

  try {
    const files = readdirSync(tempDir);
    for (const file of files) {
      unlinkSync(join(tempDir, file));
    }
    rmdirSync(tempDir);
  } catch {
    // Игнорируем ошибки очистки
  }
}
