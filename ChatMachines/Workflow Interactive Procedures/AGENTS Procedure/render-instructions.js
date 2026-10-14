const fs = require("node:fs");
const path = require("node:path");

function render(entries) {
  return "{\n" + entries.map((_, i) =>
    "  " + JSON.stringify(entries[i][0]) + ": " +
    JSON.stringify(entries[i][1], null, 2).replace(/\n/g, "\n  ")
  ).join(",\n") + "\n}";
}

function renderScreen(screens, screenIndex) {
  if (!Number.isInteger(screenIndex) || !Array.isArray(screens[screenIndex])) {
    throw new Error("Screen index is out of range.");
  }
  return render(screens[screenIndex]);
}

if (require.main === module) {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
  const template = JSON.parse(fs.readFileSync(path.join(__dirname, config.instructionRender), "utf8"));
  if (process.argv[2] === undefined) throw new Error("Supply a zero-based screen index.");
  process.stdout.write(renderScreen(template.screens, Number(process.argv[2])) + "\n");
}

module.exports = { render, renderScreen };
