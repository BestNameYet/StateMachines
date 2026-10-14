const fs = require("node:fs");
const path = require("node:path");

function render(entries) {
  return "{\n" + entries.map((entry) =>
    "  " + JSON.stringify(entry[0]) + ": " +
    JSON.stringify(entry[1], null, 2).replace(/\n/g, "\n  ")
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

if (require.main === module) {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
  const state = JSON.parse(fs.readFileSync(path.join(__dirname, config.state), "utf8"));
  const template = JSON.parse(fs.readFileSync(path.join(__dirname, config.instructionRender), "utf8"));
  process.stdout.write(renderState(state, template.screens) + "\n");
}

module.exports = { render, renderScreen, renderState };
