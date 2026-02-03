#!/usr/bin/env node

import { existsSync, statSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { OllamaService } from './services/ollama.service.js';
import { isSupportedFile } from './helpers/index.js';
import type { ParseResult } from './types/index.js';

const DEFAULT_MODEL = 'llama3.2-vision:11b';

interface CliArgs {
  input: string;
  output?: string;
  model: string;
  verbose: boolean;
  check: boolean;
  help: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    input: '',
    model: DEFAULT_MODEL,
    verbose: false,
    check: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      result.help = true;
    } else if (arg === '-v' || arg === '--verbose') {
      result.verbose = true;
    } else if (arg === '--check') {
      result.check = true;
    } else if (arg === '-m' || arg === '--model') {
      result.model = args[++i] || DEFAULT_MODEL;
    } else if (arg === '-o' || arg === '--output') {
      result.output = args[++i];
    } else if (!arg.startsWith('-')) {
      result.input = arg;
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
Water Analysis Parser v2.0

Парсер бланков анализа воды с использованием Vision LLM (Ollama)

Использование:
  npx tsx src/index.ts <файл или папка> [опции]

Примеры:
  npx tsx src/index.ts ./blank.jpg               # изображение
  npx tsx src/index.ts ./protocol.pdf            # PDF документ
  npx tsx src/index.ts ./report.docx             # Word документ
  npx tsx src/index.ts ./blanks/ -o results.json # папка с файлами
  npx tsx src/index.ts ./blank.jpg -v            # подробный вывод
  npx tsx src/index.ts --check                   # проверить Ollama

Опции:
  -o, --output <file>   Сохранить результат в JSON файл
  -m, --model <name>    Модель Ollama (по умолчанию: ${DEFAULT_MODEL})
  -v, --verbose         Подробный вывод
  --check               Проверить доступность Ollama и модели
  -h, --help            Показать справку

Поддерживаемые форматы: jpg, jpeg, png, webp, gif, bmp, pdf, doc, docx
`);
}

async function checkOllama(service: OllamaService): Promise<void> {
  console.log('Проверка Ollama...\n');

  const status = await service.checkStatus();

  if (status.available) {
    console.log('Ollama доступна');
    console.log(`Модели: ${status.models?.join(', ')}`);
  } else {
    console.error(`Ошибка: ${status.error}`);
    process.exit(1);
  }
}

async function processFile(service: OllamaService, filePath: string): Promise<ParseResult> {
  const absolutePath = resolve(filePath);

  if (!existsSync(absolutePath)) {
    return {
      success: false,
      error: `Файл не найден: ${absolutePath}`,
      meta: { model: '', elapsed_ms: 0, source_file: filePath },
    };
  }

  if (!isSupportedFile(absolutePath)) {
    return {
      success: false,
      error: `Неподдерживаемый формат файла: ${extname(filePath)}`,
      meta: { model: '', elapsed_ms: 0, source_file: filePath },
    };
  }

  return service.parseFile(absolutePath);
}

async function processDirectory(
  service: OllamaService,
  dirPath: string,
  verbose: boolean
): Promise<ParseResult[]> {
  const absolutePath = resolve(dirPath);
  const files = readdirSync(absolutePath)
    .filter((f) => isSupportedFile(f))
    .map((f) => join(absolutePath, f));

  if (files.length === 0) {
    console.log('В папке нет поддерживаемых файлов');
    return [];
  }

  console.log(`Найдено файлов: ${files.length}\n`);

  const results: ParseResult[] = [];

  for (let i = 0; i < files.length; i++) {
    if (verbose) {
      console.log(`\n[${i + 1}/${files.length}]`);
    }

    const result = await processFile(service, files[i]);
    results.push(result);

    if (!verbose) {
      const status = result.success ? 'OK' : 'FAIL';
      console.log(`[${i + 1}/${files.length}] ${files[i]} - ${status}`);
    }
  }

  return results;
}

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    return;
  }

  const service = new OllamaService({
    model: args.model,
    verbose: args.verbose,
  });

  if (args.check) {
    await checkOllama(service);
    return;
  }

  if (!args.input) {
    console.error('Ошибка: укажите файл или папку для обработки\n');
    printHelp();
    process.exit(1);
  }

  const inputPath = resolve(args.input);

  if (!existsSync(inputPath)) {
    console.error(`Ошибка: путь не существует: ${inputPath}`);
    process.exit(1);
  }

  const stat = statSync(inputPath);

  let results: ParseResult | ParseResult[];

  if (stat.isDirectory()) {
    results = await processDirectory(service, inputPath, args.verbose);
  } else {
    results = await processFile(service, inputPath);
  }

  // Выводим результат
  const output = JSON.stringify(results, null, 2);

  if (args.output) {
    writeFileSync(args.output, output, 'utf-8');
    console.log(`\nРезультат сохранён в: ${args.output}`);
  } else {
    console.log('\n--- Результат ---');
    console.log(output);
  }

  // Exit code
  if (Array.isArray(results)) {
    const failed = results.filter((r) => !r.success).length;
    if (failed > 0) {
      console.log(`\nОшибок: ${failed}/${results.length}`);
      process.exit(1);
    }
  } else if (!results.success) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
