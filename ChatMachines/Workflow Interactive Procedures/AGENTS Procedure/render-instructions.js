const fs = require("node:fs");
const path = require("node:path");

function consume(procedure, position) {
  const [instructionIndex, stepIndex] = position;
  const parent = procedure[instructionIndex];
  const object = stepIndex === undefined ? parent : parent?.procedure?.[stepIndex];
  if (!object || Array.isArray(object) || typeof object !== "object") {
    throw new Error("Instruction position does not resolve to an object.");
  }
  return Object.entries(object);
}

function render(entries) {
  return "{\n" + entries.map((entry, i) => {
    const key = entries[i][0];
    const value = entries[i][1];
    return "  " + JSON.stringify(key) + ": " +
      JSON.stringify(value, null, 2).replace(/\n/g, "\n  ");
  }).join(",\n") + "\n}";
}

function renderScreen(procedure, mapping, screenIndex) {
  if (!Number.isInteger(screenIndex) || !mapping[screenIndex]) {
    throw new Error("Screen index is out of range.");
  }
  return render(consume(procedure, mapping[screenIndex]));
}

if (require.main === module) {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
  const procedure = JSON.parse(fs.readFileSync(path.join(__dirname, config.procedure), "utf8"));
  const template = JSON.parse(fs.readFileSync(path.join(__dirname, config.instructionRender), "utf8"));
  const index = Number(process.argv[2]);
  if (process.argv[2] === undefined) throw new Error("Supply a zero-based screen index.");
  process.stdout.write(renderScreen(procedure, template.positions, index) + "\n");
}

module.exports = { consume, render, renderScreen };
