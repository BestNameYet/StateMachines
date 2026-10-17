/**
 * Convert Gemini's JSON message into a JSON-serializable screen object.
 * The same object is stored in the run and consumed by the renderer.
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
  if (!Array.isArray(message.expectedInputs) || !message.expectedInputs.length) {
    throw new Error('Gemini screen expectedInputs must be a nonempty array.');
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
  return {
    instruction: message.instruction,
    expectedInputs: structuredClone(message.expectedInputs)
  };
}

/** Save a generated screen through the caller's existing run-record saver.
 * Its zero-based array position is the render address; no address is stored in
 * the screen itself. Publication remains the caller's responsibility.
 */
async function saveGeminiScreen(record, response, saveRecord) {
  if (record?.state?.procedureMode !== 'gemini') {
    throw new Error('Generated screens can only be saved in Gemini mode.');
  }
  if (typeof saveRecord !== 'function') throw new Error('A run-record saver is required.');
  const previous = record.state;
  if (previous.renderedScreens !== undefined && !Array.isArray(previous.renderedScreens)) {
    throw new Error('renderedScreens must be an array.');
  }
  const screen = screenFromGeminiResponse(response);
  if(previous.standingInstructions)screen.standingInstructions=previous.standingInstructions;
  const renderedScreens = [...(previous.renderedScreens || []), screen];
  record.state = {...previous, renderedScreens, render: renderedScreens.length - 1};
  try {
    await saveRecord();
  } catch (error) {
    record.state = previous;
    throw error;
  }
  return record.state.renderedScreens[record.state.render];
}

module.exports = { screenFromGeminiResponse, saveGeminiScreen };
