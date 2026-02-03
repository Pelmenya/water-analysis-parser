# Water Analysis Parser v2.0

OCR-free парсер бланков анализа воды с использованием Vision LLM (llama3.2-vision через Ollama).

## Требования

- Node.js 18+
- Docker с поддержкой NVIDIA GPU
- NVIDIA GPU с 8+ GB VRAM (протестировано на RTX 4070 Ti Super 16GB)

## Быстрый старт

```bash
# 1. Клонируем/копируем проект
cd water-analysis-parser

# 2. Устанавливаем зависимости
npm install

# 3. Запускаем Ollama и качаем модель (займёт ~5-10 минут)
npm run setup

# 4. Проверяем что всё работает
npm run test

# 5. Парсим бланк
node src/index.js ./path/to/analysis.jpg
```

## Использование

### Один файл

```bash
node src/index.js ./blank.jpg
```

### Папка с файлами

```bash
node src/index.js ./blanks/ -o results.json
```

### С подробным выводом

```bash
node src/index.js ./blank.jpg -v
```

### Проверка статуса Ollama

```bash
node src/index.js --check
```

## Как это работает

1. Изображение бланка конвертируется в base64
2. Отправляется в llama3.2-vision через Ollama API
3. Vision LLM "читает" документ и извлекает структурированные данные
4. Результат проверяется на соответствие нормам СанПиН
5. Генерируются рекомендации по водоподготовке

## Формат результата

```json
{
  "success": true,
  "data": {
    "date": "2024-01-15",
    "sample_id": "А-123",
    "source": "скважина",
    "parameters": {
      "ph": { "value": 7.2, "unit": "pH", "norm_min": 6.0, "norm_max": 9.0, "is_normal": true },
      "hardness": { "value": 8.5, "unit": "мг-экв/л", "norm_max": 7.0, "is_normal": false },
      "iron": { "value": 0.8, "unit": "мг/л", "norm_max": 0.3, "is_normal": false }
    },
    "recommendations": [
      "Требуется обезжелезивание воды",
      "Требуется умягчение воды"
    ]
  },
  "meta": {
    "model": "llama3.2-vision:11b",
    "elapsed_ms": 3245
  }
}
```

## Поддерживаемые параметры

| Параметр | Ключ | Норма СанПиН |
|----------|------|--------------|
| pH | `ph` | 6.0 - 9.0 |
| Жёсткость | `hardness` | ≤ 7.0 мг-экв/л |
| Железо общее | `iron` | ≤ 0.3 мг/л |
| Марганец | `manganese` | ≤ 0.1 мг/л |
| Мутность | `turbidity` | ≤ 2.6 НТУ |
| Цветность | `color` | ≤ 20 градусов |
| Запах | `odor` | ≤ 2 балла |
| Хлориды | `chlorides` | ≤ 350 мг/л |
| Сульфаты | `sulfates` | ≤ 500 мг/л |
| Нитраты | `nitrates` | ≤ 45 мг/л |
| Нитриты | `nitrites` | ≤ 3.0 мг/л |
| Аммиак | `ammonia` | ≤ 2.0 мг/л |
| Сухой остаток | `tds` | ≤ 1000 мг/л |
| Окисляемость | `oxidizability` | ≤ 5.0 мг O₂/л |
| Фториды | `fluoride` | ≤ 1.5 мг/л |

## Управление Ollama

```bash
# Запуск
npm run ollama:start

# Остановка  
npm run ollama:stop

# Логи
npm run ollama:logs

# Статус моделей
npm run ollama:ps

# Скачать другую модель
docker exec ollama-vision ollama pull moondream
```

## Альтернативные модели

Если llama3.2-vision:11b работает медленно, можно попробовать более лёгкие:

```bash
# Moondream — очень быстрая, но менее точная
docker exec ollama-vision ollama pull moondream
node src/index.js ./blank.jpg -m moondream

# MiniCPM-V — хороший баланс скорость/качество
docker exec ollama-vision ollama pull minicpm-v
node src/index.js ./blank.jpg -m minicpm-v
```

## Программное использование

```javascript
import { parseWaterAnalysis, parseBatch } from './src/vision-parser.js';

// Один файл
const result = await parseWaterAnalysis('./blank.jpg', { verbose: true });
console.log(result.data.parameters);

// Batch
const results = await parseBatch(['./blank1.jpg', './blank2.jpg']);
```

## Troubleshooting

### Ollama не видит GPU

```bash
# Проверить что Docker видит GPU
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi
```

### Модель не загружается

```bash
# Проверить место на диске (модель ~8GB)
df -h

# Перекачать модель
docker exec ollama-vision ollama rm llama3.2-vision:11b
docker exec ollama-vision ollama pull llama3.2-vision:11b
```

### Медленная работа

- Проверить `nvidia-smi` — GPU должен быть загружен
- Попробовать модель `moondream` (быстрее, но менее точная)
- Уменьшить разрешение входных изображений

## Лицензия

MIT
