const fs = require("node:fs");
const path = require("node:path");
const renderer = require("./render-instructions.js");

function loadConfig() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
}

function loadTransitionMap(config = loadConfig()) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, config.transitions), "utf8"));
}

function resolvePath(scope, expression) {
  const match = expression.match(/^\$\{([A-Za-z_$][\w$]*)\}(\.length)?$/);
  if (!match || !Object.hasOwn(scope, match[1])) {
    throw new Error("Unknown transition reference: " + expression);
  }
  const value = scope[match[1]];
  if (match[2]) {
    if (!Array.isArray(value)) throw new Error("Length requires an array: " + expression);
    return value.length;
  }
  return value;
}

function resolveValue(scope, value) {
  if (typeof value !== "string" || !value.startsWith("${")) return structuredClone(value);
  const increment = value.match(/^(\$\{[A-Za-z_$][\w$]*\})\s*\+\s*(\d+)$/);
  if (increment) {
    const current = resolvePath(scope, increment[1]);
    if (!Number.isInteger(current)) throw new Error("Counter must be an integer.");
    return current + Number(increment[2]);
  }
  return structuredClone(resolvePath(scope, value));
}

function evaluateCondition(state, condition) {
  if (/^\$\{[A-Za-z_$][\w$]*\}$/.test(condition)) {
    const value = resolvePath(state, condition);
    if (typeof value !== "boolean") throw new Error("Boolean decision requires a Boolean value.");
    return value;
  }
  const match = condition.match(/^(\$\{[A-Za-z_$][\w$]*\}(?:\.length)?)\s*(=|!=|>)\s*(.+)$/);
  if (!match) throw new Error("Unsupported Boolean expression: " + condition);
  const actual = resolvePath(state, match[1]);
  const expected = JSON.parse(match[3]);
  if (match[2] === "=") return actual === expected;
  if (match[2] === "!=") return actual !== expected;
  return actual > expected;
}

function applyValidatedValues(state, valuesJson = "{}") {
  const values = JSON.parse(valuesJson);
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new Error("Workflow values must be a JSON object.");
  }
  const entries = Object.entries(values).map(([variable, value]) => {
    const match = variable.match(/^\$(?:\{([A-Za-z_][\w$]*)\}|([A-Za-z_][\w$]*))$/);
    const key = match && (match[1] || match[2]);
    if (!key || !Object.hasOwn(state, key) || ["render", "loopNumber", "mode"].includes(key)) {
      throw new Error("Unknown or controller-owned workflow variable: " + variable);
    }
    return [key, value];
  });
  for (const [key, value] of entries) state[key] = value;
}

function findPosition(array, predicate) {
  for (let index = 0; index < array.length; index++) {
    const item = array[index];
    if (predicate(item)) return { array, index };
    if (Array.isArray(item.onTrue)) {
      const result = findPosition(item.onTrue, predicate);
      if (result) return result;
    }
  }
  return null;
}

function runCall(state, call, config) {
  const definition = config.functions?.[call.function];
  if (!definition) throw new Error("Unregistered function: " + call.function);
  const fn = require(path.join(__dirname, definition.file))[definition.export];
  if (typeof fn !== "function") throw new Error("Registered export is not a function.");
  const scope = { ...state };
  if (config.lookupTable) {
    scope.lookupTable = JSON.parse(fs.readFileSync(path.join(__dirname, config.lookupTable), "utf8"));
  }
  const target = call.return?.match(/^\$\{([A-Za-z_$][\w$]*)\}$/)?.[1];
  if (!target || !Object.hasOwn(state, target) || ["render", "loopNumber"].includes(target)) {
    throw new Error("Invalid function return target.");
  }
  state[target] = fn(...call.arguments.map(arg => resolveValue(scope, arg)));
}

function transition(state, valuesJson) {
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("State must be an object.");
  const config = loadConfig();
  const root = loadTransitionMap(config).transitions;
  if (!Array.isArray(root)) throw new Error("Transitions must be an array.");
  const working = structuredClone(state);
  let position;
  if (working.render === null) {
    position = { array: root, index: 0 };
  } else {
    position = findPosition(root, item => item.render === working.render);
    if (!position) throw new Error("Current render is not in the transition map.");
    applyValidatedValues(working, valuesJson);
    position.index++;
  }
  let output = null;
  while (position.index < position.array.length) {
    const item = position.array[position.index];
    if (Object.hasOwn(item, "onTrue")) {
      position.index++;
      continue;
    }
    for (const [key, value] of Object.entries(item)) {
      if (Object.hasOwn(working, key)) working[key] = resolveValue(working, value);
    }
    if (item.call) runCall(working, item.call, config);
    if (item.Boolean) {
      const target = item.return[String(evaluateCondition(working, item.Boolean))];
      if (target === "onTrue") {
        position = { array: position.array[position.index + 1].onTrue, index: 0 };
      } else if (target === "continue") {
        position.index += 2;
      } else {
        position = findPosition(root, entry => entry.entry === target.pointer);
        if (!position) throw new Error("Unknown entry point.");
      }
      continue;
    }
    if (Object.hasOwn(item, "render")) {
      output = renderer.renderState(working);
      break;
    }
    position.index++;
  }
  Object.assign(state, working);
  return output;
}

if (require.main === module) {
  const config = loadConfig();
  const state = JSON.parse(fs.readFileSync(path.join(__dirname, config.state), "utf8"));
  const content = transition(state, process.argv[2]);
  fs.writeFileSync(path.join(__dirname, config.state), JSON.stringify(state, null, 2) + "\n");
  if (content !== null) process.stdout.write(content + "\n");
}

module.exports = { applyValidatedValues, evaluateCondition, loadTransitionMap, transition };
