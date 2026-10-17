const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {localStorage,relativePath}=require('./supervisor-tools.js');
const {bindAssignmentWorker,registerWorker,requestWorkerInstruction,generateGeminiScreen,acceptGeminiValues,validateGeminiResponse}=require('./gemini-workflow.js');
const {broadcastParts}=require('./render-gemini.js');const {publishCurrent}=require('./issue-workflow.js');
const control={target:{outcome:'Files inspected',process:'Independent work'},current:{outcome:'In progress',process:'Preparing'},gap:{outcome:['Work remains'],process:[]},progress:{reduced:true,description:'Required information obtained'},mode:'continue'};
const assignment=(id,worker,name)=>({id,worker,instruction:'Return the result as {$'+name+'}.',expectedInputs:[{name,schema:{type:'integer'}}]});
async function test(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'supervisor-tools-'));const storage=localStorage(root);
 const record={issueNumber:99,request:1,history:[],geminiStarted:true,geminiPending:true,state:{procedureMode:'gemini',verbatimUserPrompt:'Inspect files and coordinate workers.',variables:[],renderedScreens:[{instruction:'Old screen',expectedInputs:[{name:'old',schema:{type:'string'}}]}],controls:[],renderedRequests:[]}};
 const requests=[];let calls=0;
 await generateGeminiScreen(record,async()=>{}, {storage,generate:async request=>{
  requests.push(request);assert.equal(request.commandMenu.length,5);assert(request.instructions.screenWritingGuidelines.includes('{$variableName}'));
  if(calls++===0)return {control,commands:[{name:'write_files',files:[{path:'nested/rules.js',description:'Worker rule source',content:'module.exports = 60;'}]},{name:'set_standing_instructions',instruction:'Verify your result and report evidence.'}]};
  if(calls===2){assert.equal(request.state.renderedScreens.length,1);assert.equal(request.state.commandResults.length,2);return {control,commands:[{name:'view_inventory'},{name:'read_files',paths:['nested/rules.js','missing.txt']}]};}
  assert.equal(request.state.commandResults.length,4);assert.equal(request.state.commandResults[2].result.files[0].description,'Worker rule source');assert.equal(request.state.commandResults[3].result.files[0].content,'module.exports = 60;');
  return {control,assignments:[assignment('one','chatgpt','result'),assignment('two','gemini','result'),assignment('three','gemini','third'),assignment('four','gemini','fourth')]};
 }});
 assert.equal(record.state.renderedScreens.length,2);assert.equal(record.state.controls.length,3);
 const screen=record.state.renderedScreens.at(-1),parts=broadcastParts(screen);assert.equal(parts.length,3);assert(parts[0].includes('Verify your result'));assert(parts[1].includes('one'));assert(parts[2].includes('third'));assert(parts.join('\n').includes('API worker instruction echo'));assert.equal(broadcastParts({...screen,assignments:screen.assignments.filter(a=>a.worker==='gemini')}).length,3);
 let posts=[],saves=0;
 await assert.rejects(()=>publishCurrent(record,99,async text=>{if(posts.length===1)throw Error('Post failed');posts.push(text);},async()=>{saves++;}),/Post failed/);
 assert.equal(posts.length,1);assert(!record.state.renderedRequests.includes(1));
 await publishCurrent(record,99,async text=>posts.push(text),async()=>{saves++;});assert.equal(posts.length,3);assert(record.state.renderedRequests.includes(1));
 const {runGeminiWorkers}=require('./gemini-workers.js');
 // Three Gemini calls run concurrently; workflow applies and validates returns serially.
 const {executeWorkerCommands,registerPreparedWorker,registrationMessage}=require('./worker-registration.js');
 const registrationRun=structuredClone(record);
 const taskBefore=JSON.stringify({request:registrationRun.request,render:registrationRun.state.render,variables:registrationRun.state.variables,controls:registrationRun.state.controls,screens:registrationRun.state.renderedScreens});
 const delivered=registerPreparedWorker(registrationRun,'early-worker','chatgpt');
 assert(registrationMessage(delivered).includes('read_files'));assert(registrationMessage(delivered).includes('write_files'));
 assert.equal(delivered.assignment.id,'one');assert(registrationMessage(delivered).includes('Return the result'));
 assert.equal(registrationRun.state.workers.length,1);
 assert.equal(JSON.stringify({request:registrationRun.request,render:registrationRun.state.render,variables:registrationRun.state.variables,controls:registrationRun.state.controls,screens:registrationRun.state.renderedScreens}),taskBefore);
 assert.equal(registerPreparedWorker(registrationRun,'early-worker','chatgpt').assignment.id,'one');
 const {buildWorkerPackage,rememberWorkerPackage}=require('./worker-context.js');
 const baselinePackage=buildWorkerPackage(registrationRun,'early-worker');
 rememberWorkerPackage(registrationRun,baselinePackage);
 const changeRun=structuredClone(registrationRun);changeRun.state.variables.push({name:'changed',value:42});changeRun.state.standingInstructions='Updated rules';delete changeRun.state.noProgressTurns;
 const updatedPackage=buildWorkerPackage(changeRun,'early-worker');
 assert.equal(updatedPackage.reconstructionQueue.length,2);
 const replay=structuredClone(updatedPackage.reconstructionQueue[0].state);
 for(const change of updatedPackage.reconstructionQueue[1].changes){
  const keys=change.path.slice(1).split('/').map(k=>k.replaceAll('~1','/').replaceAll('~0','~'));let target=replay;
  for(const k of keys.slice(0,-1))target=target[k];const key=keys.at(-1);
  if(change.operation==='delete')delete target[key];else if(change.operation==='append')target[key].push(...change.values);else target[key]=change.value;
 }
 assert.deepEqual(replay,updatedPackage.state);assert.equal(updatedPackage.verbatimUserPrompt,record.state.verbatimUserPrompt);
 const taskSnapshot=JSON.stringify({request:registrationRun.request,render:registrationRun.state.render,variables:registrationRun.state.variables,controls:registrationRun.state.controls,screens:registrationRun.state.renderedScreens});
 const workerResults=await executeWorkerCommands(registrationRun,'early-worker',[{name:'write_files',files:[{path:'worker-file.txt',description:'Worker-owned output',content:'Updated via workflow'}]},{name:'read_files',paths:['worker-file.txt']}],storage,async()=>{},'worker-command-1');
 assert.equal(workerResults.at(-1).result.files[0].content,'Updated via workflow');
 assert.equal(workerResults[0].actor.nonce,'early-worker');
 assert.equal(JSON.stringify({request:registrationRun.request,render:registrationRun.state.render,variables:registrationRun.state.variables,controls:registrationRun.state.controls,screens:registrationRun.state.renderedScreens}),taskSnapshot);
 await assert.rejects(()=>executeWorkerCommands(registrationRun,'unregistered',[{name:'view_inventory'}],storage,async()=>{},'bad'),/Register/);

 const longWorker=structuredClone(record);
 longWorker.state.renderedScreens.at(-1).assignments=[assignment('long-worker','gemini','result')];
 let workerExchanges=0;
 await runGeminiWorkers(longWorker,storage,async()=>{}, {generate:async request=>{
   if(request.registration)return {nonce:'long-worker-nonce'};
   workerExchanges++;
   return workerExchanges<=13?{nonce:'long-worker-nonce',commands:[{name:'view_inventory'}]}:{nonce:'long-worker-nonce',values:{result:60},files:[]};
 }});
 assert.equal(workerExchanges,14);assert.equal(longWorker.state.assignmentReturns.length,1);
 const workerRun=structuredClone(record);workerRun.publishedParts={};
 let active=0,peak=0,thirdRegistered=false,startedBeforeAllRegistered=false;
 let releaseRegistration;const registrationGate=new Promise(resolve=>{releaseRegistration=resolve;});
 await runGeminiWorkers(workerRun,storage,async()=>{}, {generate:async request=>{
  if(request.registration){
    if(request.registration.assignmentId==='three'){await registrationGate;thirdRegistered=true;}
    return {nonce:'nonce-'+request.registration.assignmentId};
  }
  if(request.assignment.id==='two'){startedBeforeAllRegistered=!thirdRegistered;releaseRegistration();}
  assert(request.instructions.workerGuide.includes('JavaScript formatting'));assert(request.instructions.workerGuide.includes('Markdown formatting'));assert(request.instructions.workerGuide.includes('JSON formatting'));assert(Array.isArray(request.reconstructionQueue));
  assert.equal(request.workerIdentity.nonce,'nonce-'+request.assignment.id);
  active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,5));active--;
  assert(request.instructions.standingInstructions.includes('Verify your result'));
  assert(request.workspaceFiles.some(f=>f.path==='nested/rules.js'));
  const input=request.assignment.expectedInputs[0].name;
  return {nonce:'nonce-'+request.assignment.id,values:{[input]:2},files:[{path:request.assignment.id+'.txt',description:'Worker output',content:'Done'}]};
 }});
 assert(startedBeforeAllRegistered);assert.equal(peak,3);assert.equal(workerRun.state.assignmentReturns.length,3);assert(!workerRun.geminiPending);
 let repeats=0;await runGeminiWorkers(workerRun,storage,async()=>{}, {generate:async()=>{repeats++;}});assert.equal(repeats,0);
 acceptGeminiValues(workerRun,{nonce:'nonce-one',assignmentId:'one',values:{result:1}},root);assert(workerRun.geminiPending);
 const idleRun=structuredClone(record);
 const binding=registerWorker(idleRun,'my-nonce','chatgpt');assert.equal(binding.nonce,'my-nonce');
 assert.equal(registerWorker(idleRun,'my-nonce','chatgpt').nonce,'my-nonce');
 assert.throws(()=>registerWorker(idleRun,'my-nonce','gemini'),/different worker/);
 bindAssignmentWorker(idleRun,idleRun.state.renderedScreens.at(-1).assignments[0],'my-nonce');
 assert.throws(()=>requestWorkerInstruction(idleRun,'my-nonce'),/pending expected returns/);
 assert.throws(()=>requestWorkerInstruction(idleRun,'unknown'),/Unknown worker/);
 acceptGeminiValues(idleRun,{nonce:'my-nonce',assignmentId:'one',values:{result:1}},root);
 requestWorkerInstruction(idleRun,'my-nonce');assert(idleRun.geminiPending);
 assert.equal(idleRun.state.workerInstructionRequests.at(-1).nonce,'my-nonce');
 await generateGeminiScreen(idleRun,async()=>{}, {storage,generate:async request=>{
  assert.equal(request.state.workerInstructionRequests.at(-1).nonce,'my-nonce');
  const a=assignment('next-chatgpt','chatgpt','nextResult');a.nonce='my-nonce';
  return {control,assignments:[a]};
 }});
 assert.equal(idleRun.state.renderedScreens.at(-1).assignments.length,4);
 assert(idleRun.state.renderedScreens.at(-1).assignments.some(a=>a.id==='two'));
 assert.throws(()=>requestWorkerInstruction(idleRun,'my-nonce'),/pending expected returns/);
 const before=JSON.stringify(record);assert.throws(()=>acceptGeminiValues(record,{nonce:'nonce-one',assignmentId:'one',values:{result:'wrong'}},root));assert.equal(JSON.stringify(record),before);
 acceptGeminiValues(record,{nonce:'nonce-one',assignmentId:'one',values:{result:1}},root);assert.equal(record.request,1);assert(!record.geminiPending);
 assert.throws(()=>acceptGeminiValues(record,{nonce:'nonce-one',assignmentId:'one',values:{result:1}},root),/already accepted/);
 acceptGeminiValues(record,{nonce:'nonce-two',assignmentId:'two',values:{result:2}},root);acceptGeminiValues(record,{nonce:'nonce-three',assignmentId:'three',values:{third:3}},root);acceptGeminiValues(record,{nonce:'nonce-four',assignmentId:'four',values:{fourth:4}},root);
 assert(record.geminiPending);assert.equal(record.request,2);assert.deepEqual(record.state.variables.slice(0,2).map(v=>v.value),[1,2]);
 for(const p of ['../escape','/absolute','a/../../b','a\\b','manifest.json'])assert.throws(()=>relativePath(p));
 assert.throws(()=>validateGeminiResponse({control,commands:[]}));assert.throws(()=>validateGeminiResponse({control,instruction:'',expectedInputs:[]}));
 fs.symlinkSync(os.tmpdir(),path.join(root,'link'));await assert.rejects(()=>storage.read('link/file'),/Symlinks/);
 // Command-only API failure preserves the last screen and completed command results.
 record.geminiPending=true;let n=0;
 await assert.rejects(()=>generateGeminiScreen(record,async()=>{}, {storage,generate:async()=>{if(n++)throw Error('API unavailable');return {control,commands:[{name:'view_inventory'}]};}}),/API unavailable/);
 assert.equal(record.state.renderedScreens.length,2);assert.equal(record.state.commandResults.length,5);assert(record.geminiPending);
 // A failed screen save after saved commands retains the recovery intent.
 const recovery=structuredClone(record);
 recovery.geminiPending=true;
 recovery.pendingSupervisorResponse={control,commands:[{name:'view_inventory'}],screen:{instruction:'Return a result as {$recovered}.',expectedInputs:[{name:'recovered',schema:{type:'integer'}}]}};
 const oldScreenCount=recovery.state.renderedScreens.length;
 await assert.rejects(()=>generateGeminiScreen(recovery,async()=>{if(recovery.state.renderedScreens.length>oldScreenCount)throw Error('Screen save failed');},{storage}),/Screen save failed/);
 assert(recovery.pendingSupervisorResponse);assert(recovery.geminiPending);
 await generateGeminiScreen(recovery,async()=>{},{storage});
 assert(!recovery.pendingSupervisorResponse);assert.equal(recovery.state.renderedScreens.at(-1).expectedInputs[0].name,'recovered');
 fs.rmSync(root,{recursive:true,force:true});console.log('Supervisor command replay, workspace files/descriptions, path isolation, unchanged screens, independent returns, resumable comment publication, immediate registration delivery, workflow-owned file operations, and reconstructable worker history passed.');
}
test().catch(e=>{console.error(e);process.exitCode=1;});

