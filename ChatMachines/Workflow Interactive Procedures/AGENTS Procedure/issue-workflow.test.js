const assert=require('node:assert/strict');
const {startRun,applyReturn,acceptToolInvocationSubmission,parseReturn,renderIssue,triggerIdentifier,triggerPathForRecord,toolInvocationArtifactPath,toolInvocationArtifactUrl,toolInvocationArtifact,issueNumberForEvent}=require('./issue-workflow.js');
assert.equal(issueNumberForEvent({},'42'),42);
assert.equal(issueNumberForEvent({issue:{number:19}}),19);
assert.equal(issueNumberForEvent({},'0'),null);
assert.equal(triggerIdentifier({body:'<!-- agents-procedure-trigger:buildProcedure12 -->'}),'buildProcedure12');
assert.equal(startRun({body:'<!-- agents-procedure-trigger:buildProcedure12 -->'}).triggerIdentifier,'buildProcedure12');
assert.equal(triggerPathForRecord({triggerIdentifier:'buildProcedure12'}),require('node:path').join(__dirname,'issue-run-triggers','buildProcedure12.json'));
assert.throws(()=>triggerPathForRecord({triggerIdentifier:'../escape'}));
assert.equal(toolInvocationArtifactPath(45),require('node:path').join(__dirname,'issue-runs','45-tool-invocations.json'));
assert.throws(()=>toolInvocationArtifactPath(0));
assert.equal(toolInvocationArtifactUrl('BestNameYet/StateMachines',45),'https://github.com/BestNameYet/StateMachines/blob/main/ChatMachines/Workflow%20Interactive%20Procedures/AGENTS%20Procedure/issue-runs/45-tool-invocations.json');
const r=startRun({body:'Test request'}),root=__dirname+'/fixtures';
renderIssue(r,7);
const before=structuredClone(r);
assert.throws(()=>applyReturn(r,parseReturn('${userIntent}: "wrong variable"'),root));
assert.deepEqual(r,before);
assert.throws(()=>parseReturn('{"values":{}}'));
assert.throws(()=>applyReturn(r,parseReturn('${verbatimUserPrompt}: 12'),root));
assert.deepEqual(r,before);
const send=text=>{applyReturn(r,parseReturn(text),root);renderIssue(r,7);};
send('${procedureMode}: "normal"');
send('${verbatimUserPrompt}: "What does JSON stand for?"');
send('${userIntent}: "Expand JSON."');
send('${exampleMatch}: true');
send('{}');
send('${userIntent}: "Expand JSON."');
send('{}');
send('${minimalResult}: {"result":"JavaScript Object Notation"}');
assert.equal(r.done,true);
assert.equal(r.state.minimalResult.result,'JavaScript Object Notation');
assert.deepEqual(parseReturn('${requirements}: []'),{variable:'requirements',value:[]});
assert.throws(()=>parseReturn('${userIntent}: process.exit()'));
assert.throws(()=>parseReturn('${userIntent} = "old format"'));
console.log('Named colon returns, variable/type checks, arrays, objects, and halt passed.');

assert(!renderIssue(startRun({body:'test'}),7).includes('Return schema'));
const wrapped=renderIssue(startRun({}),7);
assert(wrapped.includes('comment-boilerplate.md'));
assert(!wrapped.includes('60 seconds total'));
assert(!wrapped.includes('resubmit the exact same return once'));
assert(!renderIssue(r,7).includes('comment-boilerplate.md'));
console.log('Issue output contains the procedure without a generated return schema.');

const filesRun=startRun({});
renderIssue(filesRun,7);
const step=text=>{applyReturn(filesRun,parseReturn(text),root);renderIssue(filesRun,7);};
step('${procedureMode}: "normal"');
step('${verbatimUserPrompt}: "Create a new file and edit notes."');
step('${userIntent}: "Create a file and edit notes."');
step('${exampleMatch}: false');
const unchanged=structuredClone(filesRun);
assert.throws(()=>step('${targetFiles}: ["created.txt"]'));
assert.throws(()=>step('${targetFiles}: [{"filename":"missing.txt","newFile":false}]'));
assert.throws(()=>step('${targetFiles}: [{"filename":"../escape.txt","newFile":true}]'));
assert.throws(()=>step('${targetFiles}: [{"filename":"created.txt","newFile":"true"}]'));
assert.deepEqual(filesRun,unchanged);
step('${targetFiles}: [{"filename":"created.txt","newFile":true},{"filename":"notes.txt","newFile":false}]');
assert.equal(filesRun.state.render,9);
assert.deepEqual(filesRun.newFiles,['created.txt']);
step('${requirements}: [{"filename":"created.txt","frombyte":0,"tobyte":0,"description":"Create file","intent":"Requested","operator":"create"}]');
assert.equal(filesRun.state.render,10);
console.log('New-file targets persist their designation into requirements; invalid targets leave state unchanged.');

const executionRun=startRun({});
executionRun.state.render=17;
executionRun.state.mode='accountability';
executionRun.state.loopNumber=1;
renderIssue(executionRun,99);
const invocation={cwd:null,command_line_verbatim:null,tool:'test-tool',invocation_verbatim:'{}',final_output_after_completion_of_tool_call:'simulated test output',unavailable_reason:null,new:false,filename:'notes.txt',frombyte:0,tobyte:1,description:'Test reporting',intent:'Test intent',operator:'edit',specifiedOperatorByUser:null,chosenOperator:'edit',outcome:'succeeded'};
assert.throws(()=>applyReturn(executionRun,parseReturn('{}'),root));
assert.throws(()=>applyReturn(executionRun,{variable:'toolInvocations',value:[invocation]},root),/must be submitted in the run-specific JSON file/);
acceptToolInvocationSubmission(executionRun,[invocation],root);
assert.equal(executionRun.state.render,18);
assert.deepEqual(executionRun.toolInvocations,[invocation]);
assert.deepEqual(executionRun.lastToolInvocationSummary,{submittedRecords:1,totalRecords:1,byTool:{'test-tool':1},byRuntime:{'not specified':1},commandLineRecords:0});
assert(renderIssue(executionRun,99,{toolInvocationReportUrl:toolInvocationArtifactUrl('BestNameYet/StateMachines',99)}).includes('Accepted 1 records in this file; 1 records total in this run.'));
assert(!Object.hasOwn(executionRun.state,'toolInvocations'));
assert(renderIssue(executionRun,99).includes('simulated test output'));
const reportUrl=toolInvocationArtifactUrl('BestNameYet/StateMachines',99);
const linkedReport=renderIssue(executionRun,99,{toolInvocationReportUrl:reportUrl});
assert(linkedReport.includes('[Open the complete tool-invocation JSON](<'+reportUrl+'>)'));
assert(!linkedReport.includes('simulated test output'));
const linkedJson=JSON.parse(linkedReport.match(/`{3,}json\n([\s\S]*?)\n`{3,}/)[1]);
assert.deepEqual(linkedJson.toolInvocationReport,{procedureIssueNumber:99,recordCount:1,file:reportUrl});
assert.deepEqual(toolInvocationArtifact(executionRun,99),{procedureIssueNumber:99,toolInvocations:[invocation],submissionAccepted:true});
const toolFileRun=structuredClone(executionRun);toolFileRun.state.render=17;
const toolFileInstruction=JSON.parse(renderIssue(toolFileRun,99).match(/`{3,}json\n([\s\S]*?)\n`{3,}/)[1]).toolInvocationFile;
assert.equal(toolFileInstruction.path,'ChatMachines/Workflow Interactive Procedures/AGENTS Procedure/issue-runs/99-tool-invocations.json');
assert.equal(toolFileInstruction.format.procedureIssueNumber,99);
assert.equal(toolFileInstruction.format.toolInvocations[0].outcome,'succeeded');
const oversizedReportRun=startRun({});
oversizedReportRun.state.render=18;oversizedReportRun.state.mode='accountability';oversizedReportRun.state.loopNumber=1;
oversizedReportRun.toolInvocations=Array.from({length:18},(_,i)=>({...invocation,id:i,invocation_verbatim:'x'.repeat(6000)}));
const oversizedLinkedComment=renderIssue(oversizedReportRun,99,{toolInvocationReportUrl:reportUrl});
assert(oversizedLinkedComment.length<65000);
assert(!oversizedLinkedComment.includes('x'.repeat(100)));
assert.equal(JSON.parse(oversizedLinkedComment.match(/`{3,}json\n([\s\S]*?)\n`{3,}/)[1]).toolInvocationReport.recordCount,18);
const restored=JSON.parse(JSON.stringify(executionRun));
restored.state.render=17;
restored.request=2;
restored.state.expectedInputs={request:2,render:17,inputs:[]};
renderIssue(restored,99);
acceptToolInvocationSubmission(restored,[{...invocation,url:'https://example.test',http_method:'GET'}],root);
assert.equal(restored.toolInvocations.length,2);
assert(renderIssue(restored,99).includes('https://example.test'));
console.log('Runner-held invocation records survive serialization, accumulate, and render in full at change-list steps.');

async function checkCommunicationState() {
  const {publishCurrent,restoreCommunicationState}=require('./issue-workflow.js');
  const record=startRun({});
  assert.equal(record.state.expectedInputs,null);
  renderIssue(record,7);
  assert.equal(record.state.expectedInputs.render,24);
  assert.equal(record.state.expectedInputs.inputs[0].name,'procedureMode');
  assert.deepEqual(record.state.renderedRequests,[]);
  assert(!renderIssue(record,7).includes('expectedInputs'));
  assert(!renderIssue(record,7).includes('renderedRequests'));
  let posts=0,saves=0;
  const post=async()=>{posts++;};
  const save=async()=>{saves++;};
  assert.equal(await publishCurrent(record,7,post,save),true);
  const restored=JSON.parse(JSON.stringify(record));
  assert.equal(await publishCurrent(restored,7,post,save),false);
  assert.equal(posts,1);
  assert.equal(saves,1);
  const cached=restored.state.expectedInputs;
  restoreCommunicationState(restored,[],7);
  assert.strictEqual(restored.state.expectedInputs,cached);
  const before=structuredClone(restored);
  assert.throws(()=>applyReturn(restored,{variable:'userIntent',value:'wrong'},root));
  assert.deepEqual(restored,before);
  applyReturn(restored,{variable:'procedureMode',value:'normal'},root);
  assert.equal(restored.state.expectedInputs.inputs[0].name,'procedureMode');
  const pending=structuredClone(restored);
  assert.throws(()=>applyReturn(restored,{variable:'userIntent',value:'test'},root),/has not been rendered/);
  assert.deepEqual(restored,pending);
  renderIssue(restored,7);
  assert.equal(restored.state.expectedInputs.inputs[0].name,'verbatimUserPrompt');
  assert.deepEqual(restored.state.renderedRequests,[1]);
  await assert.rejects(()=>publishCurrent(restored,7,async()=>{throw Error('post failed');},save));
  assert.deepEqual(restored.state.renderedRequests,[1]);
  await publishCurrent(restored,7,post,save);
  assert.deepEqual(restored.state.renderedRequests,[1,2]);
  // Revisiting a render is a new request and must still publish.
  restored.state.render=1;
  restored.request=3;
  await publishCurrent(restored,7,post,save);
  assert.deepEqual(restored.state.renderedRequests,[1,2,3]);
  const legacy=startRun({});
  delete legacy.state.renderedRequests;
  delete legacy.state.expectedInputs;
  restoreCommunicationState(legacy,[
    {user:{type:'Bot'},body:'<!-- agents-procedure:7:request:1:named-return -->'},
    {user:{type:'User'},body:'<!-- agents-procedure:7:request:99:named-return -->'},
    {user:{type:'Bot'},body:'<!-- agents-procedure:8:request:2:named-return -->'}
  ],7);
  assert.deepEqual(legacy.state.renderedRequests,[1]);
  assert.equal(await publishCurrent(legacy,7,post,save),false);
  console.log('Expected inputs, unchanged rejected returns, publication tracking, retries, loop renders, and legacy migration passed.');
}
checkCommunicationState().catch(error=>{console.error(error);process.exitCode=1;});




for (const procedureMode of ['normal','gemini']) {
  const selected=startRun({});
  assert.equal(selected.state.render,24);
  assert.equal(selected.state.procedureMode,null);
  renderIssue(selected,123);
  const before=structuredClone(selected);
  for (const value of ['other','Gemini',null,true,{}]) {
    assert.throws(()=>applyReturn(selected,{variable:'procedureMode',value},root));
    assert.deepEqual(selected,before);
  }
  applyReturn(selected,{variable:'procedureMode',value:procedureMode},root);
  assert.equal(selected.state.render,1);
  assert.equal(selected.state.procedureMode,procedureMode);
  const restored=JSON.parse(JSON.stringify(selected));
  renderIssue(restored,123);
  applyReturn(restored,{variable:'verbatimUserPrompt',value:'Preserve this prompt.'},root);
  assert.equal(restored.state.verbatimUserPrompt,'Preserve this prompt.');
  assert.equal(restored.state.procedureMode,procedureMode);
  assert.equal(restored.geminiStarted,procedureMode==='gemini'?true:undefined);
  assert.equal(restored.state.render,procedureMode==='gemini'?1:2);
  assert.equal(restored.history[0].values.$procedureMode,procedureMode);
}
// A previously saved run continues at its current screen, without reinitializing.
const legacyMode=startRun({});
legacyMode.state.render=1;
delete legacyMode.state.procedureMode;
renderIssue(legacyMode,123);
applyReturn(legacyMode,{variable:'verbatimUserPrompt',value:'Existing run'},root);
assert.equal(legacyMode.state.render,2);
console.log('Both procedure modes, rejected choices, persistence, prompt capture, and existing-run compatibility passed.');

