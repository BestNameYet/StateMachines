/**
 * Convert Gemini's JSON message into the entry-pair format used by loadScreens()
 * and consumed by render(), renderScreen(), and entriesForState().
 *
 * Input: { instruction: string, expectedInputs: [{ name: string, schema: object }] }
 * Expected inputs are supplied by Gemini, never inferred from instruction text.
 * This pure adapter does not publish, persist, or advance a procedure run.
 */
function screenFromGeminiResponse(response) {
  const message = typeof response === 'string' ? JSON.parse(response) : response;
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    throw new Error('Gemini screen must be a JSON object.');
  }
  if (Object.keys(message).some(key => !['instruction', 'expectedInputs'].includes(key))) {
    throw new Error('Gemini screen accepts only instruction and expectedInputs.');
  }
  if (typeof message.instruction !== 'string' || !message.instruction.trim()) {
    throw new Error('Gemini screen instruction must be a nonempty string.');
  }
  if (!Array.isArray(message.expectedInputs)) {
    throw new Error('Gemini screen expectedInputs must be an array.');
  }
  const names = new Set();
  for (const input of message.expectedInputs) {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).some(key => !['name', 'schema'].includes(key)) ||
        typeof input.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(input.name) ||
        !input.schema || typeof input.schema !== 'object' || Array.isArray(input.schema)) {
      throw new Error('Each expected input must contain a variable name and schema object.');
    }
    if (names.has(input.name)) throw new Error('Duplicate expected input: ' + input.name);
    names.add(input.name);
  }
  return [
    ['instruction', message.instruction],
    ['expectedInputs', structuredClone(message.expectedInputs)]
  ];
}

module.exports = { screenFromGeminiResponse };
