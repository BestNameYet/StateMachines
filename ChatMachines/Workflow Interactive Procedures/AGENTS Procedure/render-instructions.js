const fs = require("node:fs");
const path = require("node:path");

function render(entries) {
  return "{\n" + entries.map((_, i) =>
    "  " + JSON.stringify(entries[i][0]) + ": " +
    JSON.stringify(entries[i][1], null, 2).replace(/\n/g, "\n  ")
  ).join(",\n") + "\n}";
}

function renderScreen(screens, renderNumber) {
  const screenIndex = renderNumber - 1;
  if (
    !Number.isInteger(renderNumber) ||
    renderNumber < 1 ||
    !Array.isArray(screens[screenIndex])
  ) {
    throw new Error("Render number is out of range.");
  }
  return render(screens[screenIndex]);
}

function renderState(state, screens) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new Error("Renderer requires a state object.");
  }
  return renderScreen(screens, state.render);
}

function initialize(state, screens) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new Error("Initialization requires a state object.");
  }
  if (state.render !== null) {
    throw new Error("Initialization requires state.render to be null.");
  }

  for (const key of Object.keys(state)) {
    if (key !== "render") state[key] = null;
  }

  state.render = 1;
  return renderState(state, screens);
}

if (require.main === module) {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
  const state = JSON.parse(fs.readFileSync(path.join(__dirname, config.state), "utf8"));
  const template = JSON.parse(fs.readFileSync(path.join(__dirname, config.instructionRender), "utf8"));
  const output = state.render === null
    ? initialize(state, template.screens)
    : renderState(state, template.screens);
  process.stdout.write(output + "\n");
}

module.exports = { render, renderScreen, renderState, initialize };
