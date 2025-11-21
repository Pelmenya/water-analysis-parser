const express = require('express');
const multer  = require('multer');
const Tesseract = require('tesseract.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const upload = multer({ dest: 'uploads/' });
const app = express();
const PORT = 3000;

// Вспомогательная функция для OCR одного изображения
async function ocrImage(imagePath) {
  console.log(`[OCR] Начало распознавания изображения: ${imagePath}`);
  const { data: { text } } = await Tesseract.recognize(imagePath, 'rus+eng');
  console.log(`[OCR] Готово. Длина текста: ${text.length}`);
  return text;
}

app.post('/parse', upload.single('image'), async (req, res) => {
  console.log(`[API] Получен запрос /parse`);
  if (!req.file) {
    console.error(`[API] Нет файла!`);
    return res.status(400).json({error: 'No file'});
  }
  const filePath = req.file.path;
  const ext = path.extname(req.file.originalname).toLowerCase();
  let text = '';

  try {
    if (ext === '.pdf') {
      // PDF → PNG через pdftoppm
      const outputDir = path.join('uploads', `${req.file.filename}_pages`);
      fs.mkdirSync(outputDir, { recursive: true });
      const outputBase = path.join(outputDir, 'page');
      console.log(`[PDF] Конвертация PDF в PNG: ${filePath} → ${outputDir}`);
      execSync(`pdftoppm -png "${filePath}" "${outputBase}"`);
      const files = fs.readdirSync(outputDir)
        .filter(f => f.endsWith('.png'))
        .map(f => path.join(outputDir, f));
      console.log(`[PDF] Кол-во изображений: ${files.length}`);
      for (const img of files) {
        text += await ocrImage(img) + '\n';
        fs.unlinkSync(img);
      }
      fs.rmdirSync(outputDir);
    } else {
      // Просто картинка
      text = await ocrImage(filePath);
    }
    fs.unlinkSync(filePath);
    console.log(`[OCR] Итоговый текст после распознавания: ${text.length} символов`);

    // Пример логики парсинга (можно сделать свою)
    // console.log('[PARSE] Распознанный текст:', text);

    // Запрос к Ollama
    const prompt = `Проанализируй этот текст анализа воды и сделай выводы для пользователя, отвечай на русском языкеdocker compose :\n${text}`;
    console.log(`[LLM] Отправка промпта в Ollama: длина промпта ${prompt.length}`);
    const ollamaRes = await axios.post(process.env.OLLAMA_URL, {
      model: "deepseek-r1:8b",
      prompt,
      stream: false
    });
    console.log(`[LLM] Ответ получен. Длина ответа: ${ollamaRes.data.response.length}`);
    console.warn(`[LLM] Ответ модели:\n${ollamaRes.data.response}`);

    res.json({
      ocr_text: text,
      llama_reply: ollamaRes.data.response
    });

  } catch (err) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    console.error(`[ERROR] ${err.message}`);
    res.status(500).json({error: err.message});
  }
});

app.listen(PORT, () => console.log(`[START] Water analysis parser listening on ${PORT}`));
