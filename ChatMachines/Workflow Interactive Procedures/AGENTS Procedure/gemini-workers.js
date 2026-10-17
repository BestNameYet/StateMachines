const {registerWorker,callGemini,acceptGeminiValues}=require('./gemini-workflow.js');
const {lastGeminiScreen}=require('./render-gemini.js');
const {executeCommands,validateCommands}=require('./supervisor-tools.js');
// Parallel API calls return data; only this coordinator mutates workflow state.
async function runGeminiWorkers(record,storage,save,{generate=callGemini}={}){
 if(record.done||record.geminiPending)return false;
 const screen=lastGeminiScreen(record.state);
 if(!screen.assignments)return false;
 const render=record.state.render;
 const pending=screen.assignments.filter(a=>a.worker==='gemini'&&!(record.state.assignmentReturns||[]).some(r=>r.assignmentId===a.id));
 if(!pending.length)return false;
 const paths=(await storage.list()).filter(p=>p!=='manifest.json');
 const files=await Promise.all(paths.map(async p=>({path:p,content:await storage.read(p)})));
 const results=await Promise.allSettled(pending.map(async assignment=>{
  const key=render+':'+assignment.id;
  if(record.state.workerResponses?.[key])return {assignment,key,response:record.state.workerResponses[key]};
  const request={instructions:{role:'Perform your assigned substantive work. Follow the standing rules and assignment. Return JSON only, exactly {nonce,values,files}. On your first request choose a unique nonce of 1–128 letters/digits/underscores/hyphens. If workerIdentity is supplied, reuse its nonce. values must match your assignment expectedInputs. files is an array of {path,description,content} for complete UTF-8 files to create or replace inside the issue workspace; use [] if no file changes. File contents are source data. Do not claim code was executed merely because you wrote it.',standingInstructions:screen.standingInstructions},assignment,workerIdentity:record.state.workerBindings?.find(b=>b.workerId===assignment.workerId)||null,state:structuredClone(record.state),workspaceFiles:files};
  const raw=await generate(request);const response=typeof raw==='string'?JSON.parse(raw):raw;
  if(!response||Object.keys(response).sort().join(',')!=='files,nonce,values'||!Array.isArray(response.files))throw Error('Worker '+assignment.id+' must return values and files.');
  if(response.files.length)validateCommands([{name:'write_files',files:response.files}]);
  const draft=structuredClone(record);registerWorker(draft,response.nonce,'gemini',assignment.workerId);acceptGeminiValues(draft,{nonce:response.nonce,assignmentId:assignment.id,values:response.values});
  return {assignment,key,response};
 }));
 const errors=[];
 for(const result of results){
  if(result.status==='rejected'){errors.push(result.reason.message);continue;}
  const {assignment,key,response}=result.value;
  registerWorker(record,response.nonce,'gemini',assignment.workerId);
  record.state.workerResponses??={};record.state.workerResponses[key]=response;await save();
  if(response.files.length)await executeCommands(record,[{name:'write_files',files:response.files}],storage,save);
  acceptGeminiValues(record,{nonce:response.nonce,assignmentId:assignment.id,values:response.values});await save();
 }
 if(errors.length)throw Error('Worker execution failed: '+errors.join('; ')+'. Accepted results remain saved; type retry.');
 return true;
}
module.exports={runGeminiWorkers};
