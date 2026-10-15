const assert=require('node:assert/strict');
const {startRun,applyReturn,parseReturn,renderIssue,requestSchema}=require('./issue-workflow.js');
const root=__dirname+'/fixtures';
const fresh=()=>startRun({body:'Test request'});
let r=fresh();
assert.equal(r.state.render,1);
assert.match(renderIssue(r,99),/Repeat the user prompt verbatim/);
assert.equal(Object.keys(requestSchema(r).properties.values.properties)[0],'$verbatimUserPrompt');
const before=structuredClone(r);
assert.throws(()=>applyReturn(r,{request:1,values:{'$verbatimUserPrompt':5}},root));
assert.deepEqual(r,before);
assert.deepEqual(parseReturn('```json\n{"request":1,"values":{}}\n```'),{request:1,values:{}});
function send(record,values){applyReturn(record,{request:record.request,values},root);}
send(r,{'$verbatimUserPrompt':'Hello'});assert.equal(r.state.render,2);
assert.throws(()=>applyReturn(r,{request:1,values:{'$userIntent':'stale'}},root));
send(r,{'$userIntent':'Say hello'});
send(r,{'$exampleMatch':true});assert.equal(r.state.render,4);
send(r,{});send(r,{'$userIntent':'Say hello'});send(r,{});
assert.equal(r.state.render,7);
send(r,{'$minimalResult':{result:'Hello'}});assert.equal(r.done,true);assert.match(renderIssue(r,99),/Procedure complete/);
const other=fresh();assert.equal(other.state.verbatimUserPrompt,null);
assert(!renderIssue(other,100).includes('Construct \\u0024{changeList}'));
console.log('Issue adapter: initialization, current instruction, schema, rejected type, stale reply, independent state, and minimal completion passed.');

const {canonicalTitle}=require('./issue-workflow.js');
const created_at='2026-10-15T06:00:00Z';
assert.equal(canonicalTitle({title:'Custom title',created_at}),'AGENTS Procedure — 2026-10-15T06:00:00.000Z');
assert.equal(canonicalTitle({title:'AGENTS Procedure — wrong',created_at}),'AGENTS Procedure — 2026-10-15T06:00:00.000Z');
console.log('Canonical title uses creation timestamp regardless of edited title.');

