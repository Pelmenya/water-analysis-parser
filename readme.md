# Water Analysis Parser v2.0

OCR-free парсер бланков анализа воды с использованием Vision LLM (llama3.2-vision через Ollama).

Автоматически извлекает параметры качества воды из изображений, PDF и DOCX-документов, сравнивает с нормами СанПиН 1.2.3685-21 и формирует рекомендации по водоподготовке.

## Требования

- **Node.js** >= 18.0.0
- **Docker** + Docker Compose
- **NVIDIA GPU** с 8+ GB VRAM (протестировано на RTX 4070 Ti Super 16GB)
- **NVIDIA Container Toolkit** (для GPU-ускорения в Docker)

### Поддерживаемые форматы файлов

Изображения: `jpg`, `jpeg`, `png`, `webp`, `gif`, `bmp`
Документы: `pdf`, `doc`, `docx`

## Быстрый старт

```bash
# 1. Клонируем проект
git clone <repo-url>
cd water-analysis-parser

# 2. Устанавливаем зависимости
npm install

# 3. Запускаем Ollama в Docker и скачиваем модель (~8 GB)
npm run setup

# 4. Проверяем что Ollama работает и модель загружена
npx tsx src/index.ts --check

# 5. Парсим бланк анализа воды
npx tsx src/index.ts ./path/to/blank.jpg
```

## Использование (CLI)

```bash
# Один файл
npx tsx src/index.ts ./blank.jpg

# Папка с файлами (batch)
npx tsx src/index.ts ./blanks/ -o results.json

# С подробным выводом
npx tsx src/index.ts ./blank.jpg -v

# Указать другую модель
npx tsx src/index.ts ./blank.jpg -m moondream

# Сохранить результат в файл
npx tsx src/index.ts ./blank.pdf -o result.json

# Проверить статус Ollama
npx tsx src/index.ts --check

# Помощь
npx tsx src/index.ts --help
```

### Опции CLI

| Флаг | Описание |
|------|----------|
| `-h, --help` | Показать справку |
| `-v, --verbose` | Подробный вывод (размер файла, время, промежуточные данные) |
| `-m, --model <name>` | Модель Ollama (по умолчанию: `llama3.2-vision:11b`) |
| `-o, --output <file>` | Сохранить JSON-результат в файл |
| `--check` | Проверить доступность Ollama и установленные модели |

## npm-скрипты

```bash
npm run setup          # Первоначальная настройка (Docker + модель)
npm run parse          # Запуск парсера (аналог npx tsx src/index.ts)
npm run dev            # Режим разработки с hot-reload
npm run build          # Компиляция TypeScript в dist/
npm run start          # Запуск скомпилированной версии
npm run test           # Запуск тестов

npm run ollama:start   # Запустить контейнер Ollama
npm run ollama:stop    # Остановить контейнер Ollama
npm run ollama:logs    # Логи Ollama (в реальном времени)
npm run ollama:pull    # Скачать модель llama3.2-vision:11b
npm run ollama:ps      # Список загруженных моделей
```

## Управление Ollama

### Запуск и остановка

```bash
# Запуск контейнера
npm run ollama:start

# Остановка
npm run ollama:stop

# Логи
npm run ollama:logs
```

### Альтернативные модели

Если llama3.2-vision:11b работает медленно, можно попробовать более легкие:

```bash
# Moondream — быстрая, менее точная
docker exec ollama-vision ollama pull moondream
npx tsx src/index.ts ./blank.jpg -m moondream

# MiniCPM-V — баланс скорость/качество
docker exec ollama-vision ollama pull minicpm-v
npx tsx src/index.ts ./blank.jpg -m minicpm-v
```

## Формат результата

```json
{
  "success": true,
  "data": {
    "blankNumber": "А-123",
    "analysisDate": "2024-01-15",
    "customerName": "Иванов И.И.",
    "customerPhone": "+7 999 123-45-67",
    "objectAddress": "г. Москва, ул. Примерная, д. 1",
    "intakeType": "скважина",
    "appearance": "прозрачная, без запаха",
    "sampleDate": "2024-01-14",
    "testDate": "2024-01-15",
    "params": [
      {
        "name": "Водородный показатель",
        "value": 7.2,
        "unit": "pH",
        "pdk": 9.0,
        "paramCode": "ph"
      },
      {
        "name": "Жёсткость общая",
        "value": 8.5,
        "unit": "мг-экв/л",
        "pdk": 7.0,
        "paramCode": "hardness"
      }
    ],
    "modelAnalysis": "Рекомендуется установка фильтра-умягчителя..."
  },
  "error": null,
  "meta": {
    "model": "llama3.2-vision:11b",
    "elapsed_ms": 3245,
    "source_file": "./blank.jpg"
  }
}
```

## Поддерживаемые параметры воды

| Параметр | Код | Единица | Норма СанПиН |
|----------|-----|---------|--------------|
| pH | `ph` | pH | 6.0 - 9.0 |
| Жёсткость общая | `hardness` | мг-экв/л | <= 7.0 |
| Железо общее | `iron` | мг/л | <= 0.3 |
| Марганец | `manganese` | мг/л | <= 0.1 |
| Мутность | `turbidity` | НТУ | <= 2.6 |
| Цветность | `color` | градусы | <= 20 |
| Запах | `odor` | баллы | <= 2 |
| Хлориды | `chlorides` | мг/л | <= 350 |
| Сульфаты | `sulfates` | мг/л | <= 500 |
| Нитраты | `nitrates` | мг/л | <= 45 |
| Нитриты | `nitrites` | мг/л | <= 3.0 |
| Аммиак | `ammonia` | мг/л | <= 2.0 |
| Сухой остаток | `tds` | мг/л | <= 1000 |
| Окисляемость | `oxidizability` | мг O2/л | <= 5.0 |
| Фториды | `fluoride` | мг/л | <= 1.5 |
| Электропроводность | `conductivity` | мкСм/см | <= 2000 |
| Щёлочность | `alkalinity` | мг-экв/л | <= 6.5 |
| Сероводород | `sulphide` | мг/л | <= 0.003 |

## Как это работает

```
Входной файл (JPG/PDF/DOCX)
       |
       v
Определение типа файла
       |
       v
Конвертация (если нужно)
  PDF  --> pdftoppm --> PNG (постранично)
  DOCX --> LibreOffice --> PDF --> pdftoppm --> PNG
       |
       v
Кодирование в Base64
       |
       v
Ollama Vision API (llama3.2-vision:11b)
  - System prompt: эксперт по анализу воды
  - User prompt: извлечь JSON с параметрами
       |
       v
Извлечение JSON из ответа LLM
  - Удаление markdown-обёрток
  - Восстановление битого JSON (smartFixJson)
       |
       v
Нормализация данных
  - camelCase / snake_case -> единый формат
  - Приведение типов (string -> number)
       |
       v
Слияние страниц (для многостраничных PDF/DOCX)
       |
       v
Результат в JSON
```

## Структура проекта

```
water-analysis-parser/
├── src/
│   ├── index.ts                 # CLI точка входа
│   ├── types/
│   │   └── index.ts             # TypeScript-интерфейсы
│   ├── services/
│   │   └── ollama.service.ts    # Сервис работы с Ollama
│   ├── config/
│   │   └── sanpin-norms.ts      # Нормы СанПиН 1.2.3685-21
│   └── helpers/
│       ├── index.ts             # Реэкспорт
│       ├── file-converter.ts    # Конвертация PDF/DOCX
│       ├── image-utils.ts       # Работа с изображениями
│       ├── extract-json-block.ts # Извлечение JSON из ответа LLM
│       └── smart-fix-json.ts    # Восстановление битого JSON
├── docker-compose.yml           # Ollama с NVIDIA GPU
├── Dockerfile                   # Контейнеризация парсера
├── package.json
├── tsconfig.json
└── readme.md
```

## Docker-сборка парсера

Для запуска парсера в контейнере (включает poppler-utils и libreoffice для конвертации PDF/DOCX):

```bash
# Собрать образ
docker build -t water-analysis-parser .

# Запустить
docker run --rm -v $(pwd)/blanks:/app/blanks water-analysis-parser node dist/index.js /app/blanks/blank.jpg
```

## Разработка

```bash
# Установить зависимости
npm install

# Запустить в dev-режиме с hot-reload
npm run dev

# Собрать проект
npm run build

# Запустить тесты
npm run test
```

## Troubleshooting

### Ollama не видит GPU

```bash
# Проверить что Docker видит GPU
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi

# Убедиться что NVIDIA Container Toolkit установлен
nvidia-ctk --version
```

### Модель не загружается

```bash
# Проверить место на диске (модель ~8 GB)
df -h

# Удалить и перекачать модель
docker exec ollama-vision ollama rm llama3.2-vision:11b
docker exec ollama-vision ollama pull llama3.2-vision:11b
```

### Медленная работа

- Проверить загрузку GPU: `nvidia-smi`
- Попробовать модель `moondream` (быстрее, менее точная)
- Уменьшить разрешение входных изображений

### Ollama не отвечает

```bash
# Проверить статус контейнера
docker ps | grep ollama-vision

# Перезапустить
npm run ollama:stop
npm run ollama:start

# Проверить логи
npm run ollama:logs
```

## Лицензия

MIT
