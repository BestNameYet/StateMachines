// Gemini content is already selected. Render its instruction verbatim.
function renderGeminiScreen(screen) {
  if (!screen || typeof screen.instruction !== 'string') {
    throw new Error('A saved Gemini screen with instruction text is required.');
  }
  return screen.instruction;
}

function lastGeminiScreen(state) {
  if (!Array.isArray(state?.renderedScreens) || !state.renderedScreens.length) {
    throw new Error('No saved Gemini screen is available.');
  }
  return state.renderedScreens[state.renderedScreens.length - 1];
}

module.exports = {renderGeminiScreen, lastGeminiScreen};
