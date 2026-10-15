const assert = require("node:assert/strict");
const fs = require("node:fs");
const { transition } = require("./transitions.js");
const transitionMap = JSON.parse(fs.readFileSync("./transitions.json", "utf8"));
const initial = JSON.parse(fs.readFileSync("./state.json", "utf8"));
const req = [{ filename: "a.json", frombyte: 0, tobyte: 1, description: "change", intent: "requested", operator: "edit" }];
function run(kind) {
  const state = structuredClone(initial), trace = [];
  let content = transition(state, transitionMap), passes = 0;
  while (content !== "halt") {
    trace.push(state.render);
    let values = {};
    switch (state.render) {
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
assert.deepEqual(minimal.trace, [1,2,3,4,5,6,7]);
assert.deepEqual(minimal.state.minimalResult, { result: "answer" });
const fidelity = run("fidelity");
assert.deepEqual(fidelity.trace, [1,2,3,8,9,10,11,12,13,14]);
assert.equal(fidelity.state.mode, "fidelity");
assert.deepEqual(fidelity.state.changeList, req);
const accountability = run("accountability");
assert.deepEqual(accountability.trace, [1,2,3,8,9,10,11,15,16,17,18,19,20,21,22,23]);
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
assert.equal(union.size, 23);
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
assert.equal(transition({render:null},[{render:null}]),'halt');
assert.equal(transition({render:null,flag:true},[{Boolean:"${flag}",return:{true:null,false:'continue'}}]),'halt');
console.log('State outputs, irregular arrays, array endings, and null terminal destinations passed.');
