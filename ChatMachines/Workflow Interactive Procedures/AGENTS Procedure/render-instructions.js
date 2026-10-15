const fs = require("node:fs");
const path = require("node:path");

function loadScreens() {
  const configPath = path.join(__dirname, "config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const templatePath = path.join(__dirname, config.instructionRender);
  const template = JSON.parse(fs.readFileSync(templatePath, "utf8"));
  const lookupPath = path.join(__dirname, config.instructionLookup);
  const lookup = JSON.parse(fs.readFileSync(lookupPath, "utf8"));
  return template.map(({ render: renderNumber, positions }) => {
    renderNumber = String(renderNumber);
    return positions.map(position => {
      const element = lookup[renderNumber]?.[position];
      if (!Number.isInteger(position) || !Array.isArray(element)) {
        throw new Error("Invalid lookup: render " + renderNumber + ", position " + position);
      }
      return element;
    });
  });
}

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

function entriesForState(state, screens = loadScreens(), toolInvocations = []) {
  return (screens[state.render-1] || []).map(([key,value])=>[
    key,key==='toolInvocationReport'?structuredClone(toolInvocations):structuredClone(value)
  ]);
}

function renderState(state, screens = loadScreens()) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new Error("Renderer requires a state object.");
  }
  return render(entriesForState(state,screens));
}

if (require.main === module) {
  const state = JSON.parse(process.argv[2] || "{}");
  process.stdout.write(renderState(state) + "\n");
}

module.exports = { loadScreens, render, renderScreen, renderState, entriesForState };
