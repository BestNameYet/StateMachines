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

// Compile JSON control flow into executable state transformations once.
function compileTransitionMap(source) {
  const root = source === null ? [] : Array.isArray(source) ? source : source?.transitions;
  if (!Array.isArray(root)) throw Error("Transitions must be an array.");
  const renders = new Map(), entries = new Map(), references = [];
  const halt = () => "halt";
  const controls = new Set(["entry","pointer","call","Boolean","return","onTrue"]);
  function pointer(name) {
    references.push(name);
    return state => entries.get(name)(state);
  }
  function sequence(items, initial = false) {
    const flat = items.flat(Infinity);
    let next = halt;
    for (let index = flat.length - 1; index >= 0; index--) {
      const item = flat[index], following = next;
      if (item === null) { next = halt; continue; }
      if (!item || typeof item !== "object" || Array.isArray(item)) throw Error("Invalid transition item.");
      if (Object.hasOwn(item,"onTrue")) continue;
      let route = following;
      if (item.return === null) route = halt;
      else if (item.pointer) route = pointer(item.pointer);
      else if (item.Boolean) {
        const branch = flat[index + 1]?.onTrue;
        const destinations = {};
        for (const result of ["true","false"]) {
          if (!Object.hasOwn(item.return || {},result)) throw Error("Missing Boolean destination.");
          const target = item.return[result];
          if (target === null) destinations[result] = halt;
          else if (target === "continue") destinations[result] = following;
          else if (target === "onTrue" && Array.isArray(branch)) destinations[result] = sequence(branch);
          else if (target?.pointer) destinations[result] = pointer(target.pointer);
          else throw Error("Unknown transition destination.");
        }
        const condition = item.Boolean;
        route = state => destinations[String(evaluateCondition(state,condition))];
      }
      const fields = Object.entries(item).filter(([key,value]) => !controls.has(key) && !(key === "render" && value === null));
      const initialize = initial && index === 0;
      const call = item.call;
      const config = call ? loadConfig() : null;
      const hasRender = item.render !== undefined && item.render !== null;
      const operation = state => {
        for (const [key,value] of fields) {
          if (initialize || Object.hasOwn(state,key)) state[key] = resolveValue(state,value);
        }
        if (call) runCall(state,call,config);
        if (hasRender) return state;
        return route;
      };
      if (hasRender) {
        if (renders.has(item.render)) throw Error("Duplicate render address.");
        renders.set(item.render,following);
      }
      if (item.entry) {
        if (entries.has(item.entry)) throw Error("Duplicate entry address.");
        entries.set(item.entry,operation);
      }
      next = operation;
    }
    return next;
  }
  const initialize = sequence(root,true);
  for (const name of references) if (!entries.has(name)) throw Error("Unknown entry point: " + name);
  return function stateToState(state) {
    if (!state || typeof state !== "object" || Array.isArray(state)) throw Error("State must be an object.");
    const working = structuredClone(state);
    let operation = working.render == null ? initialize : renders.get(working.render);
    if (!operation) {
      if (source === null) return "halt";
      throw Error("Current render is not in the transition map.");
    }
    let result = operation;
    while (typeof result === "function") result = result(working);
    Object.assign(state,working);
    return result === "halt" ? "halt" : structuredClone(working);
  };
}

if (require.main === module) {
  const state = JSON.parse(process.argv[2] || "{}");
  if (process.argv[3]) applyValidatedValues(state,process.argv[3]);
  const map = compileTransitionMap(loadTransitionMap());
  const result = map(state);
  process.stdout.write(result === "halt" ? "halt\n" : JSON.stringify(result,null,2)+"\n");
}
module.exports = { applyValidatedValues, evaluateCondition, loadTransitionMap, compileTransitionMap };
