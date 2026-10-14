const fs = require("node:fs");
const path = require("node:path");
const renderer = require("./render-instructions.js");

function loadConfig() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
}

function loadTransitionMap(config = loadConfig()) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, config.transitions), "utf8"));
}

function resolvePath(state, expression) {
  const match = expression.match(/^\$\{([A-Za-z_$][\w$]*)\}(\.length)?$/);
  if (!match) throw new Error("Unsupported transition expression: " + expression);
  const value = state[match[1]];
  return match[2] ? (value == null ? undefined : value.length) : value;
}

function parseLiteral(source) {
  const value = source.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith('"') && value.endsWith('"')) return JSON.parse(value);
  throw new Error("Unsupported transition value: " + source);
}

function evaluateCondition(state, condition) {
  const match = condition.match(/^(\$\{[A-Za-z_$][\w$]*\}(?:\.length)?)\s*(=|!=|>)\s*(.+)$/);
  if (!match) throw new Error("Unsupported transition condition: " + condition);
  const actual = resolvePath(state, match[1]);
  const expected = parseLiteral(match[3]);
  if (match[2] === "=") return actual === expected;
  if (match[2] === "!=") return actual !== expected;
  if (match[2] === ">") return actual > expected;
  throw new Error("Unsupported transition operator: " + match[2]);
}

function selectNext(state, next) {
  if (!Array.isArray(next)) return next;
  const branch = next.find(item => evaluateCondition(state, item.if));
  if (!branch) throw new Error("No transition branch matched render " + state.render + ".");
  return branch.render;
}

function setValues(state, values) {
  for (const [key, value] of Object.entries(values)) {
    if (key === "inputValues") {
      for (const stateKey of Object.keys(state)) {
        if (stateKey !== "render") state[stateKey] = value;
      }
    } else {
      state[key] = value;
    }
  }
}

function parseValuesJson(valuesJson) {
  if (typeof valuesJson !== "string") {
    throw new Error("Workflow must pass prevalidated values as JSON text.");
  }

  let pair;
  try {
    pair = JSON.parse(valuesJson);
  } catch (error) {
    throw new Error("Workflow values must be valid JSON: " + error.message);
  }
  if (
    !pair ||
    typeof pair !== "object" ||
    Array.isArray(pair) ||
    typeof pair["$key"] !== "string" ||
    !Object.hasOwn(pair, "value")
  ) {
    throw new Error('Workflow values JSON must have the shape {"$key":"stateField","value":...}.');
  }
  return [pair["$key"], pair.value];
}

function applyValidatedValues(state, valuesJson) {
  const [key, value] = parseValuesJson(valuesJson);
  if (key === "render" || !Object.hasOwn(state, key)) {
    throw new Error("Workflow supplied a value for an unknown or controller-owned field: " + key);
  }
  state[key] = value;
}

function transition(state, valuesJson) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new Error("Transition requires a state object.");
  }

  const transitionMap = loadTransitionMap();
  if (!Array.isArray(transitionMap.transitions)) {
    throw new Error("Transition map must contain a transitions array.");
  }

  const initializing = state.render === null;
  if (!initializing) applyValidatedValues(state, valuesJson);

  const currentRender = state.render;
  const definition = transitionMap.transitions.find(item =>
    Object.hasOwn(item, "render") &&
    item.render === currentRender &&
    (item.on === undefined || (initializing && item.on === "initialize"))
  );
  if (!definition) throw new Error("No transition found for render " + currentRender + ".");

  if (definition.actions) {
    for (const action of definition.actions) {
      if (action.set) {
        setValues(state, action.set);
      } else if (action.call) {
        if (
          action.call.renderer !== "render-instructions.js" ||
          action.call.argument !== "state"
        ) {
          throw new Error("Unsupported renderer call in transition.");
        }
        return renderer.renderState(state);
      } else {
        throw new Error("Unsupported transition action.");
      }
    }
    return null;
  }

  if (!Object.hasOwn(definition, "next")) {
    throw new Error("Transition for render " + currentRender + " has no next state.");
  }
  state.render = selectNext(state, definition.next);
  return state.render === null ? null : renderer.renderState(state);
}

if (require.main === module) {
  const config = loadConfig();
  const state = JSON.parse(fs.readFileSync(path.join(__dirname, config.state), "utf8"));
  const valuesJson = process.argv[2];
  const issueContent = transition(state, valuesJson);
  if (issueContent !== null) process.stdout.write(issueContent + "\n");
}

module.exports = { applyValidatedValues, evaluateCondition, loadTransitionMap, transition };
