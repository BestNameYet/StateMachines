const fs = require("node:fs");
const path = require("node:path");
const renderer = require("./render-instructions.js");

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

function captureInput(state, screens, input) {
  if (input === undefined) {
    throw new Error("A new input value is required for the current render.");
  }
  const screen = screens[state.render - 1];
  if (!Array.isArray(screen)) {
    throw new Error("Cannot accept input for render " + state.render + ".");
  }
  const returnEntry = screen.find(entry => entry[0] === "return");
  const match = returnEntry && typeof returnEntry[1] === "string"
    ? returnEntry[1].match(/^\$\{([A-Za-z_$][\w$]*)\}$/)
    : null;
  if (!match) {
    throw new Error("The current screen must return one state field placeholder.");
  }
  const field = match[1];
  if (!Object.hasOwn(state, field)) {
    throw new Error("The return field is missing from state: " + field);
  }
  state[field] = input;
  return field;
}

function transition(state, transitionMap, screens, input) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new Error("Transition requires a state object.");
  }
  if (!transitionMap || !Array.isArray(transitionMap.transitions)) {
    throw new Error("Transition map must contain a transitions array.");
  }

  const initializing = state.render === null;
  if (!initializing) captureInput(state, screens, input);

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
        return renderer.renderState(state, screens);
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
  return state.render === null ? null : renderer.renderState(state, screens);
}

if (require.main === module) {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
  const state = JSON.parse(fs.readFileSync(path.join(__dirname, config.state), "utf8"));
  const transitionMap = JSON.parse(fs.readFileSync(path.join(__dirname, config.transitions), "utf8"));
  const template = JSON.parse(fs.readFileSync(path.join(__dirname, config.instructionRender), "utf8"));
  const input = process.argv.length > 2 ? JSON.parse(process.argv[2]) : undefined;
  const issueContent = transition(state, transitionMap, template.screens, input);
  if (issueContent !== null) process.stdout.write(issueContent + "\n");
}

module.exports = { captureInput, evaluateCondition, transition };
