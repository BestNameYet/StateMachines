const assert = require("node:assert/strict");
const fs = require("node:fs");
const { compileTransitionMap,applyValidatedValues } = require("./transitions.js");
const compiled = new Map();
function transition(state,source,values) {
  if (!compiled.has(source)) compiled.set(source,compileTransitionMap(source));
  const draft=structuredClone(state);
  if(values)applyValidatedValues(draft,values);
  const result=compiled.get(source)(draft);
  Object.assign(state,draft);
  return result;
}
const transitionMap = JSON.parse(fs.readFileSync("./transitions.json", "utf8"));
const initial = {};
const req = [{ filename: "a.json", frombyte: 0, tobyte: 1, description: "change", intent: "requested", operator: "edit" }];
function run(kind) {
  const state = structuredClone(initial), trace = [];
  let content = transition(state, transitionMap), passes = 0;
  while (content !== "halt") {
    trace.push(state.render);
    let values = {};
    switch (state.render) {
      case 24: values = { "$procedureMode": "normal" }; break;
      case 1: values = { "$verbatimUserPrompt": "test request" }; break;
      case 2: values = { "$userIntent": "test intent" }; break;
      case 3: values = { "$exampleMatch": kind === "minimal" }; break;
      case 5: values = { "$userIntent": "test intent" }; break;
      case 6: values = { "$minimalResult": { result: "answer" } }; break;
      case 8: values = { "$targetFiles": ["a.json"] }; break;
      case 9: values = { "$requirements": req }; break;
      case 10: values = { "$userIntent": "test intent" }; break;
      case 11: values = { "$matchedExample": { example: kind === "fidelity" ? 1 : 2, promptText: "test" } }; break;
      case 12: values = { "$requirements": req }; break;
      case 13: values = { "$changeList": req }; break;
      case 15: values = { "$requirementsCompleted": [] }; break;
      case 16: values = { "$requirements": req }; break;
      case 17: values = { "$changeList": req }; break;
      case 18: values = { "$changeAssessment": { reconciliation: [], missedRequirements: [], unapprovedChanges: [] } }; break;
      case 19: values = { "$completionAssessment": { requirementAssessments: [], remainderRequirements: [] } }; break;
      case 20: values = { "$requirementsCompleted": req }; break;
      case 21: values = { "$rescissionRequirements": [] }; break;
      case 22: passes++; values = { "$requirements": kind === "repeat" && passes === 1 ? req : [] }; break;
    }
    if (trace.length > 80) throw Error("Non-terminating simulation");
    content = transition(state, transitionMap, JSON.stringify(values));
  }
  return { state, trace };
}
const minimal = run("minimal");
assert.deepEqual(minimal.trace, [24,1,2,3,4,5,6,7]);
assert.deepEqual(minimal.state.minimalResult, { result: "answer" });
const fidelity = run("fidelity");
assert.deepEqual(fidelity.trace, [24,1,2,3,8,9,10,11,12,13,14]);
assert.equal(fidelity.state.mode, "fidelity");
assert.deepEqual(fidelity.state.changeList, req);
const accountability = run("accountability");
assert.deepEqual(accountability.trace, [24,1,2,3,8,9,10,11,15,16,17,18,19,20,21,22,23]);
assert.equal(accountability.state.mode, "accountability");
assert.equal(accountability.state.loopNumber, 1);
const repeat = run("repeat");
assert.deepEqual(repeat.trace, [...accountability.trace,17,18,19,20,21,22,23]);
assert.equal(repeat.state.loopNumber, 2);
assert.deepEqual(repeat.state.requirements, []);
assert.deepEqual(repeat.state.requirementsCompleted, req);
assert.equal(repeat.trace.filter(x => x === 15).length, 1);
const rejected = structuredClone(initial); transition(rejected, transitionMap);
const before = structuredClone(rejected);
assert.throws(() => transition(rejected, transitionMap, '{"$render":99}'));
assert.deepEqual(rejected, before);
const union = new Set([...minimal.trace, ...fidelity.trace, ...accountability.trace]);
assert.equal(union.size, 24);
console.log(JSON.stringify({ scenarios: 4, coveredRenders: union.size, minimal: minimal.trace, fidelity: fidelity.trace, accountability: accountability.trace, repeat: repeat.trace, invalidInputLeavesStateUnchanged: true }, null, 2));

const shapeState={render:null,value:null};
const irregular=[[[{render:1}]],[],[{value:"${value}",render:2}],[null]];
let result=transition(shapeState,irregular);
assert.equal(result.render,1);
assert.equal(typeof result,'object');
result=transition(shapeState,irregular,'{"$value":"retained"}');
assert.deepEqual(result,{render:2,value:"retained"});
assert.equal(transition(shapeState,irregular),'halt');
assert.equal(shapeState.value,'retained');
assert.equal(transition({render:null},null),'halt');
assert.equal(transition({render:null},[{return:null}]),'halt');
assert.equal(transition({render:null},[{render:null},{render:1}]).render,1);
assert.equal(transition({render:null,flag:true},[{Boolean:"${flag}",return:{true:null,false:'continue'}}]),'halt');
console.log('State outputs, irregular arrays, array endings, and null returns, and non-null render boundaries passed.');

const initialized=transition({},transitionMap);
assert.equal(initialized.render,24);
for(const [key,value] of Object.entries(initialized))if(key!=="render")assert.equal(value,null);
assert.deepEqual(initialized,transitionMap.transitions[0]);

const source=[{render:101,value:null},{render:102,value:"${value}"}];
const operator=compileTransitionMap(source);
source[1].render=999;
const a=operator({});
a.value="external input";
assert.deepEqual(operator(a),{render:102,value:"external input"});
assert.equal(operator({render:102,value:7}),"halt");
console.log("Compiled operator accepts state only; JSON control flow compiled before invocation.");

