import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAI } from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources';
import { smartFixJson } from './helpers/smart-fix-json';
import { extractJsonBlock } from './helpers/extract-json-block';
import { normalizeDeepWaterAnalysis } from './helpers/normalize-deep-water-analysis';
import { TRealEstateType } from '../real-estate/types/t-real-estate-type';

@Injectable()
export class OpenaiService {
    private readonly openai: OpenAI;
    private readonly logger = new Logger(OpenaiService.name);
    private readonly model: string;
    private readonly modelExtra: string;

    constructor(private readonly configService: ConfigService) {
        this.openai = new OpenAI({
            apiKey: this.configService.get<string>('OPENAI_API_KEY'),
            baseURL: this.configService.get<string>('OPENAI_API_BASE_URL'),
        });
        this.model = this.configService.get<string>('OPENAI_API_MODEL');
        this.modelExtra = this.configService.get<string>('OPENAI_API_MODEL_EXTRA');
        this.logger.log('OpenAI client initialized');
    }

    async analyzeWater(text: string): Promise<any> {
        this.logger.log('analyzeWater called');
        const prompt = `Вот текст анализа воды:
---
${text}
---
1. Проанализируй его, извлеки и выведи в JSON следующую структуру:
{
  "blankNumber": "",
  "analysisDate": "",
  "customerName": "",
  "customerPhone": "",
  "objectAddress": "",
  "intakeType": "",
  "appearance": "",
  "sampleDate": "",
  "testDate": "",
  "params": [
    {
      "name": "Жесткость общая",
      "value": 8.3,
      "unit": "мг-экв/л",
      "pdk": 7.0,
      "paramCode": "hardness"
    }
  ],
  "modelAnalysis": ""
}
2. Для каждого показателя указывай ключи: name (на русском), value (только число, без лишних символов), unit (единицы измерения), pdk (ПДК по СанПиН или другой норме, если есть, иначе null), paramCode (короткий латиницей — например, hardness, ph, iron, manganese, nitrate, sulphide, fluoride, turbidity, tds, conductivity и пр.).
3. params — это массив всех количественных показателей воды с бланка. Используй только числовые значения для value и pdk.
4. После этого дай краткие советы пользователя по подбору оборудования для фильтрации и рекомендации.
5. Всегда используй формат вывода JSON как в примере выше, не добавляй лишних обёрток, не добавляй пояснений.`;

        const messages: ChatCompletionMessageParam[] = [
            { role: 'system', content: 'Ты — эксперт по анализу воды. Тебе нужно структурировать показатели для автоматизации подбора фильтров. Используй строго camelCase для всех ключей.' },
            { role: 'user', content: prompt }
        ];

        this.logger.log('Отправка запроса на OpenAI...');
        try {
            const response = await this.openai.chat.completions.create({
                model: this.model,
                messages,
                max_tokens: 7000
            });
            this.logger.log('Ответ от OpenAI получен');

            const modelReply = response.choices?.[0]?.message?.content || '';
            const jsonStr = extractJsonBlock(modelReply);

            if (!jsonStr) {
                this.logger.error('extractJsonBlock: Не удалось найти JSON в ответе OpenAI');
                throw new InternalServerErrorException('Не удалось найти JSON в ответе OpenAI');
            }

            const parsed = smartFixJson(jsonStr, this.logger);

            if (!parsed) {
                throw new InternalServerErrorException('Не удалось восстановить JSON из ответа OpenAI');
            }

            // Приведение param_code → paramCode если вдруг LLM ошибся
            if (parsed.params && Array.isArray(parsed.params)) {
                parsed.params = parsed.params.map((p: any) => ({
                    ...p,
                    paramCode: p.paramCode || p.param_code,
                }));
            }

            return {
                ...parsed,
                ocrText: text
            };
        } catch (err) {
            this.logger.error('Ошибка при работе с OpenAI', err);
            throw err;
        }
    }

    async deepAnalyzeWaterParams(context: {
        address?: string;
        coordinates?: any;
        intakeType?: string;
        residents: number;
        depthWaterSource?: number;
        waterIntakePoints?: any;
        appearance?: string;
        params: any[];
        realEstateType?: TRealEstateType
    }): Promise<any> {
const prompt = `
Ты — эксперт по анализу воды и подбору фильтрационного оборудования. Для формирования рекомендаций и схемы очистки воды используй ТОЛЬКО методы, причины и решения из справочника ниже (не придумывай свои методы и фильтры!):

СПРАВОЧНИК ПО ПРОБЛЕМАМ С ВОДОЙ:

Проблема — Причины — Устранение:
- Жесткая вода: соли кальция/магния >1.5 мг-экв; решения: ионообменные умягчители, обратный осмос.
- Песок в воде: осадок, абразив, частицы; решения: дисковый фильтр, осадочный фильтр, фильтр механической очистки.
- Запах (рыбный/затхлый/землистый/древесный): органика; решения: угольный фильтр, обратный осмос (питье), аэрация.
- Запах хлора: хлорирование; решения: угольный фильтр, обратный осмос (питье), аэрация.
- Запах тухлых яиц/пятна: сероводород; решения: фильтр-обезжелезиватель, постоянная регенерация.
- Сульфидные бактерии: дезинфекция хлоркой, постоянное хлорирование, угольный фильтр (для дехлорирования).
- Запах моющих/септик: угольный фильтр, обратный осмос, устранить утечку, дезинфекция.
- Запах бензина/нефтепродуктов: устранить утечку, угольный фильтр, частая замена угля.
- Запах метана/мутная вода: аэрация с дегазацией.
- Запах фенола: устранить источник, угольный фильтр.
- Вкус солоноватый: деонизация (ионообмен), обратный осмос.
- Вкус щелочи/пятна: деминерализация (ионообмен), обратный осмос.
- Металлический привкус: коррекция pH, фильтр-обезжелезиватель, ионообменный фильтр.
- Повышенная кислотность: коррекция pH.
- Коррозия нержавейки: обессоливание (деионизация, осмос).
- Мутность: механический фильтр, дисковый фильтр.
- Хлопья ржавчины: обезжелезиватель, ионообменный фильтр.
- Серые волокна: хлорирование, механика, угольный фильтр, обратный осмос.
- Кислая вода: коррекция pH.
- Кислородная коррозия: ингибиторы коррозии.
- Железистая вода: ионообменный фильтр, обезжелезиватель.
- Желтая вода: ионообменный + угольный фильтр.
- Черноватая вода: ионообменный фильтр, обезжелезиватель.
- Вода молочного цвета: продувка нагревателя, отстаивание, обратный осмос, аэрация с дегазацией.

(Если проблема не описана в справочнике — напиши "Необходимо экспертное заключение" и не подбирай оборудование.)

---

Вот структура, по которой нужно вернуть ответ (ВСЕ поля обязательны!):

{
  "problems": [
    {
      "param": "string (например, 'odor')",
      "name": "string (например, 'Запах')",
      "value": "number (например, 3.5)",
      "pdk": "number (например, 2)",
      "unit": "string (например, 'мг/л')",
      "risk": "string (коротко, 1-2 предложения)",
      "possibleCauses": ["string", "..."]
    }
  ],
  "recommendations": [
    {
      "param": "string (например, 'odor' или 'Общая система')",
      "name": "string (например, 'Запах')",
      "system": "string (описание фильтрации)"
    }
  ],
  "equipmentScheme": {
    "nodes": [ {"id": "string", "data": {"label": "string"}, "position": {"x": number, "y": number} } ],
    "edges": [ {"id": "string", "source": "string", "target": "string"} ]
  },
  "html": "string (Для сайта — дружелюбное продающее объяснение, минимум технических терминов)",
  "markdown": "string (Для внутреннего отчёта — строгое перечисление выявленных проблем и рекомендаций, только факты, списком)",
  "summary": "string (Кратко — что не так и что делать, для SMS или крупной плашки)",
  "riskLevel": "string ('low'|'medium'|'high') (уровень риска — для цветовой индикации)",
  "economicEffect": "string (Объясни, чем фильтрация выгодна — здоровье, техника, бюджет)",
  "estimatedCost": { 
    "min": "number (минимальная цена в RUB)", 
    "max": "number (максимальная цена в RUB)", 
    "currency": "RUB", 
    "comment": "string (любые пояснения)",
    "date": "string (дата актуальности стоимости, в формате YYYY-MM-DD)"
  },
  "nextActions": ["string (следующие шаги для клиента)"],
  "questionsToClient": ["string (если что-то нужно уточнить для 100% подбора)"],
  "regionComparison": "string (сравни с типовой ситуацией по району)",
  "regionRisks": "string (риски и особенности региона)"
}

---

Например:

{
  "problems": [
    {
      "param": "odor",
      "name": "Запах",
      "value": 3,
      "pdk": 2,
      "unit": "баллы",
      "risk": "Повышенный запах, возможен сероводород.",
      "possibleCauses": ["Органика", "Сероводород"]
    }
  ],
  "recommendations": [
    {
      "param": "odor",
      "name": "Запах",
      "system": "Аэрация и угольный фильтр"
    }
  ],
  "equipmentScheme": {
    "nodes": [
      { "id": "well", "data": { "label": "Скважина" }, "position": { "x": 0, "y": 0 } }
    ],
    "edges": [
      { "id": "e1", "source": "well", "target": "filter" }
    ]
  },
  "html": "<div><h2>Вода требует доочистки!</h2><p>Рекомендуем установить аэрацию и фильтры, чтобы вода была безопасной и вкусной.</p></div>",
  "markdown": "- **Запах**: 3 балла (ПДК 2). Возможен сероводород. Рекомендуем аэрацию и угольный фильтр.",
  "summary": "Обнаружено превышение по запаху — рекомендуем установить фильтр.",
  "riskLevel": "medium",
  "economicEffect": "Фильтрация воды продлит срок службы сантехники в 2 раза и убережёт здоровье семьи.",
  "estimatedCost": { 
    "min": 25000, 
    "max": 45000, 
    "currency": "RUB", 
    "comment": "Цена зависит от выбранной схемы и расхода воды.",
    "date": "2025-07-11"
  },
  "nextActions": [
    "Свяжитесь с экспертом компании",
  ],
  "questionsToClient": [
    "Планируете ли пить воду из скважины?",
    "Есть ли дети или аллергики в доме?"
  ],
  "regionComparison": "В вашем районе обычно превышают железо, но у вас также выявлен сероводород.",
  "regionRisks": "В Московской области часто встречаются органика и железо."
}

---

Дано:

- Адрес: ${context.address ?? ''}
- Координаты: ${context.coordinates ? JSON.stringify(context.coordinates) : 'не указаны'}
- Тип объекта недвижимости (дом, квартира, промышленный объект): ${context.realEstateType ? context.realEstateType : 'не указано' }
- Источник воды: ${context.intakeType ?? 'не указан'}
- Глубина: ${context.depthWaterSource ?? 'не указана'}
- Количество и типы точек водоразбора: ${context.waterIntakePoints ? JSON.stringify(context.waterIntakePoints) : 'не указаны'}
- Количество потребителей (жильцов): ${context.residents ? context.residents : 'не указано'}
- Внешний вид воды: ${context.appearance ?? 'не указано'}
- Параметры анализа воды (массив): ${JSON.stringify(context.params, null, 2)}

---

Ответ — только валидный JSON по этой структуре, без описаний и комментариев вне JSON.  
ВСЕ ПОЛЯ ДОЛЖНЫ БЫТЬ (даже если пустые)! Если что-то не применимо, вставь [] или "".
`.trim();

        const messages: ChatCompletionMessageParam[] = [
            { role: 'system', content: 'Ты — эксперт по анализу воды. Возвращай строго валидный JSON по описанной выше структуре. Не добавляй текст вне JSON.' },
            { role: 'user', content: prompt }
        ];

        this.logger.log('Отправка запроса на OpenAI (deepAnalyzeWaterParams)...');
        this.logger.warn('PROMPT:\n' + prompt);

        const response = await this.openai.chat.completions.create({
            model: this.modelExtra,
            messages,
            max_tokens: 32000,
        });

        this.logger.log('Ответ от OpenAI получен (deepAnalyzeWaterParams)');
        const modelReply = response.choices?.[0]?.message?.content || '';
        this.logger.warn('modelReply (deepAnalyzeWaterParams):\n' + modelReply);

        const jsonStr = extractJsonBlock(modelReply);
        if (!jsonStr) {
            this.logger.error('extractJsonBlock: Не удалось найти JSON в ответе OpenAI (deepAnalyzeWaterParams)');
            throw new InternalServerErrorException('Не удалось найти JSON в ответе OpenAI (deepAnalyzeWaterParams)');
        }

        this.logger.warn('Извлечённый JSON (deepAnalyzeWaterParams): ' + jsonStr.slice(0, 1000));

        const parsed = smartFixJson(jsonStr, this.logger);

        if (!parsed) {
            this.logger.error('smartFixJson: Не удалось восстановить JSON из ответа OpenAI (deepAnalyzeWaterParams)');
            throw new InternalServerErrorException('Не удалось восстановить JSON из ответа OpenAI (deepAnalyzeWaterParams)');
        }

        const normalized = normalizeDeepWaterAnalysis(parsed);

        // Логируем отсутствие обязательных полей
        for (const key of ['problems', 'recommendations', 'equipmentScheme', 'html', 'markdown', 'regionRisks']) {
            if (!(key in normalized)) {
                this.logger.warn(`Ответ не содержит обязательного поля: ${key}`);
            }
        }
        if (!normalized.equipmentScheme.nodes || !normalized.equipmentScheme.edges) {
            this.logger.warn('equipmentScheme, но нет nodes/edges!');
            normalized.equipmentScheme.nodes = normalized.equipmentScheme.nodes ?? [];
            normalized.equipmentScheme.edges = normalized.equipmentScheme.edges ?? [];
        }

        this.logger.log('deepAnalyzeWaterParams успешно завершён');
        return normalized;
    }
}
