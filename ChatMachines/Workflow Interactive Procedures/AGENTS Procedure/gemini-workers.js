const fs=require('node:fs');
const path=require('node:path');
const {bindAssignmentWorker,registerWorker,callGemini,acceptGeminiValues}=require('./gemini-workflow.js');
const {lastGeminiScreen}=require('./render-gemini.js');
const {rememberWorkerPackage,buildWorkerPackage}=require('./worker-context.js');
const {executeWorkerCommands,registerPreparedWorker}=require('./worker-registration.js');
const {commandMenu,executeCommands,validateCommands}=require('./supervisor-tools.js');
const workerGuide=()=>fs.readFileSync(path.join(__dirname,'worker-instructions.md'),'utf8');
// Parallel API calls return data; only this coordinator mutates workflow state.
async function runGeminiWorkers(record,storage,save,{generate=callGemini}={}){
 if(record.done||record.geminiPending)return false;
 const screen=lastGeminiScreen(record.state);
 if(!screen.assignments)return false;
 const render=record.state.render;
 const pending=screen.assignments.filter(a=>a.worker==='gemini'&&!(record.state.assignmentReturns||[]).some(r=>r.assignmentId===a.id));
 if(!pending.length)return false;
 const paths=(record.state.workspace?.path==='.'?[]:await storage.list()).filter(p=>p!=='manifest.json'&&!p.startsWith('worker-context/'));
 const files=await Promise.all(paths.map(async p=>({path:p,content:await storage.read(p)})));
 let mutation=Promise.resolve();
 const bind=async(nonce,assignment)=>{
  const operation=mutation.then(async()=>{const delivery=registerPreparedWorker(record,nonce,'gemini',assignment.id);await save();return delivery.worker;});
  mutation=operation.catch(()=>{});return operation;
 };
 const results=await Promise.allSettled(pending.map(async assignment=>{
  const key=render+':'+assignment.id;
  if(record.state.workerResponses?.[key])return {assignment,key,response:record.state.workerResponses[key]};
  let identity=(record.state.workers||[]).find(w=>w.nonce===(assignment.nonce||(record.state.assignmentWorkers||[]).find(b=>b.assignmentId===assignment.id)?.nonce));
  if(!identity){
    const raw=await generate({registration:{type:'gemini',assignmentId:assignment.id},instructions:{workerGuide:workerGuide(),projectReadme:await storage.read(record.state.workspace?.path==='.'?'README.md':'project/README.md'),role:'Register as a Gemini worker before receiving your prepared assignment. Choose a unique nonce of 1–128 letters, digits, underscores or hyphens. Return JSON exactly {"nonce":"your-choice"}. Do not perform task work yet.'},state:structuredClone(record.state)});
    const registration=typeof raw==='string'?JSON.parse(raw):raw;
    if(!registration||Object.keys(registration).join(',')!=='nonce')throw Error('Worker registration requires exactly nonce.');
    identity=await bind(registration.nonce,assignment);
  }else identity=await bind(identity.nonce,assignment);
  const request={commandMenu:structuredClone(commandMenu),instructions:{role:'Perform your assigned substantive work. Follow the standing rules and assignment. Return JSON only. To request workspace operations return exactly {nonce,commands}; commands use the supplied commandMenu and operate in the SAME issue workspace as the supervisor. The workflow executes them and returns the full package with updated state and results without advancing your assignment. You never connect to GitHub or receive its credentials. To finish return exactly {nonce,values,files}. On your first request choose a unique nonce of 1–128 letters/digits/underscores/hyphens. If workerIdentity is supplied, reuse its nonce. values must match your assignment expectedInputs. files is an array of {path,description,content} for complete UTF-8 files to create or replace inside the issue workspace; use [] if no file changes. File contents are source data. Do not claim code was executed merely because you wrote it.',standingInstructions:screen.standingInstructions},assignment,workerIdentity:identity,state:structuredClone(record.state),workspaceFiles:files};
  let response;
  for(let exchange=0;exchange<12;exchange++){
    const contextOperation=mutation.then(async()=>{const context=buildWorkerPackage(record,identity.nonce,assignment);rememberWorkerPackage(record,context);await save();return context;});
    mutation=contextOperation.catch(()=>{});const context=await contextOperation;
    request.state=context.state;request.history=context.history;request.workerHistory=context.workerHistory;request.verbatimUserPrompt=context.verbatimUserPrompt;request.reconstructionQueue=context.reconstructionQueue;request.reconstructionInstructions=context.reconstructionInstructions;
    request.instructions.context=context.instructions.role;
    request.instructions.workerGuide=workerGuide();
    request.instructions.projectReadme=await storage.read(record.state.workspace?.path==='.'?'README.md':'project/README.md');
    request.instructions.standingInstructions=record.state.standingInstructions||screen.standingInstructions;
    request.instructions.returnWritingGuidelines=JSON.parse(fs.readFileSync(path.join(__dirname,'gemini-request-template.json'),'utf8')).instructions.screenWritingGuidelines;
    const raw=await generate(structuredClone(request));response=typeof raw==='string'?JSON.parse(raw):raw;
    if(response?.commands===undefined)break;
    if(Object.keys(response).sort().join(',')!=='commands,nonce'||response.nonce!==identity.nonce)throw Error('Worker command response requires the registered nonce and commands.');
    validateCommands(response.commands);
    const operation=mutation.then(async()=>executeWorkerCommands(record,identity.nonce,response.commands,storage,save,key+':'+exchange));
    mutation=operation.catch(()=>{});request.commandResults=await operation;
    if(exchange===11)throw Error('Worker command exchange limit reached; type retry to continue.');
  }
  if(!response||Object.keys(response).sort().join(',')!=='files,nonce,values'||!Array.isArray(response.files))throw Error('Worker '+assignment.id+' must return values and files.');
  if(response.files.length)validateCommands([{name:'write_files',files:response.files}]);
  const draft=structuredClone(record);bindAssignmentWorker(draft,assignment,response.nonce);acceptGeminiValues(draft,{nonce:response.nonce,assignmentId:assignment.id,values:response.values});
  return {assignment,key,response};
 }));
 const errors=[];
 for(const result of results){
  if(result.status==='rejected'){errors.push(result.reason.message);continue;}
  const {assignment,key,response}=result.value;
  bindAssignmentWorker(record,assignment,response.nonce);
  record.state.workerResponses??={};record.state.workerResponses[key]=response;await save();
  if(response.files.length)await executeCommands(record,[{name:'write_files',files:response.files}],storage,save,{actor:{type:'worker',nonce:response.nonce},requestId:key});
  acceptGeminiValues(record,{nonce:response.nonce,assignmentId:assignment.id,values:response.values});await save();
 }
 if(errors.length)throw Error('Worker execution failed: '+errors.join('; ')+'. Accepted results remain saved; type retry.');
 return true;
}
module.exports={runGeminiWorkers};
