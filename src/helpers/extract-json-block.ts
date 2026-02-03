/**
 * Извлекает JSON блок из ответа LLM
 * Обрабатывает markdown code blocks и находит JSON в тексте
 */
export function extractJsonBlock(text: string): string | null {
  if (!text || typeof text !== 'string') {
    return null;
  }

  let cleaned = text.trim();

  // Убираем markdown code blocks
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  // Если начинается с { или [ — ищем полный JSON
  if (cleaned.startsWith('{') || cleaned.startsWith('[')) {
    const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      return jsonMatch[1];
    }
  }

  // Ищем JSON объект в тексте
  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    return objectMatch[0];
  }

  // Ищем JSON массив в тексте
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    return arrayMatch[0];
  }

  return null;
}
