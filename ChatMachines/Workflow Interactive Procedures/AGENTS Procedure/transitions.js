const fs = require("node:fs");
const path = require("node:path");

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

function compileTransitionMap(source) {
  const sourceArray = Array.isArray(source) ? source : source?.transitions;
  if (source === null) return { root: [], renders: new Map(), entries: new Map() };
  if (!Array.isArray(sourceArray)) throw new Error("Transitions must be an array.");
  const renders = new Map(), entries = new Map();
  function sequence(items) {
    const array = items.flat(Infinity).map(item =>
      item && Array.isArray(item.onTrue) ? { ...item, onTrue: sequence(item.onTrue) } : item
    );
    array.forEach((item,index) => {
      if (item === null) return;
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid transition item.");
      const position = { array, index };
      if (item.render !== undefined && item.render !== null) {
        if (renders.has(item.render)) throw new Error("Duplicate render address.");
        renders.set(item.render, position);
      }
      if (item.entry) {
        if (entries.has(item.entry)) throw new Error("Duplicate entry address.");
        entries.set(item.entry, position);
      }
    });
    return array;
  }
  const root = sequence(sourceArray);
  return { root, renders, entries };
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

function transition(state, transitionMap, valuesJson) {
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("State must be an object.");
  const map = compileTransitionMap(transitionMap);
  const working = structuredClone(state);
  let position;
  const initializing = working.render == null;
  if (initializing) {
    position = { array: map.root, index: 0 };
  } else {
    const current = map.renders.get(working.render);
    if (!current) {
      if (transitionMap === null) return "halt";
      throw new Error("Current render is not in the transition map.");
    }
    position = { array: current.array, index: current.index + 1 };
    applyValidatedValues(working, valuesJson);
  }
  const finish = result => {
    Object.assign(state, working);
    return result;
  };
  while (position.index < position.array.length) {
    const item = position.array[position.index];
    if (item === null) return finish("halt");
    if (Object.hasOwn(item, "onTrue")) {
      position.index++;
      continue;
    }
    for (const [key,value] of Object.entries(item)) {
      if ((Object.hasOwn(working,key) || (initializing && position.array === map.root && position.index === 0 && !["entry","pointer","call","Boolean","return"].includes(key))) && !(key === "render" && value === null)) {
        working[key] = resolveValue(working,value);
      }
    }
    if (Object.hasOwn(item,"return") && item.return === null) return finish("halt");
    if (item.pointer) {
      const destination = map.entries.get(item.pointer);
      if (!destination) throw new Error("Unknown entry point.");
      position = { ...destination };
      continue;
    }
    if (item.call) runCall(working,item.call,loadConfig());
    if (item.Boolean) {
      const result = String(evaluateCondition(working,item.Boolean));
      if (!Object.hasOwn(item.return || {},result)) throw new Error("Missing Boolean destination.");
      const target = item.return[result];
      if (target === null) return finish("halt");
      if (target === "onTrue") {
        const branch = position.array[position.index + 1]?.onTrue;
        if (!Array.isArray(branch)) throw new Error("Missing onTrue branch.");
        position = { array: branch, index: 0 };
      } else if (target === "continue") {
        position.index += Array.isArray(position.array[position.index + 1]?.onTrue) ? 2 : 1;
      } else if (target?.pointer && map.entries.has(target.pointer)) {
        const destination = map.entries.get(target.pointer);
        position = { ...destination };
      } else {
        throw new Error("Unknown transition destination.");
      }
      continue;
    }
    if (Object.hasOwn(item,"render") && item.render !== null) {
      return finish(structuredClone(working));
    }
    position.index++;
  }
  return finish("halt");
}

if (require.main === module) {
  const config = loadConfig();
  const state = JSON.parse(process.argv[2] || "{}");
  const result = transition(state,loadTransitionMap(config),process.argv[3]);
  process.stdout.write(result === "halt" ? "halt\n" : JSON.stringify(result,null,2)+"\n");
}

module.exports = { applyValidatedValues, evaluateCondition, loadTransitionMap, compileTransitionMap, transition };
