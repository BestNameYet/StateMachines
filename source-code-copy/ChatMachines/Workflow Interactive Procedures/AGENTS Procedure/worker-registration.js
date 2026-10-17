const {registerWorker,bindAssignmentWorker}=require('./gemini-workflow.js');
const {lastGeminiScreen}=require('./render-gemini.js');
function registerPreparedWorker(record,nonce,type,assignmentId){
 if(record.done)throw Error('This run has finished.');
 const draft=structuredClone(record);
 const worker=registerWorker(draft,nonce,type);
 const screen=lastGeminiScreen(draft.state);
 const assignments=screen.assignments||[];
 const returned=a=>(draft.state.assignmentReturns||[]).some(r=>r.assignmentId===a.id);
 const boundNonce=a=>a.nonce||(draft.state.assignmentWorkers||[]).find(b=>b.assignmentId===a.id)?.nonce;
 let assignment=assignments.find(a=>a.worker===type&&!returned(a)&&boundNonce(a)===nonce);
 if(assignmentId){
  const requested=assignments.find(a=>a.id===assignmentId&&a.worker===type&&!returned(a));
  if(!requested)throw Error('Prepared assignment is unavailable.');
  if(assignment&&assignment.id!==assignmentId)throw Error('Worker already has another pending assignment.');
  assignment=requested;
 }else assignment??=assignments.find(a=>a.worker===type&&!returned(a)&&!boundNonce(a));
 if(assignment)bindAssignmentWorker(draft,assignment,nonce);
 // Only worker identity/binding is recorded. No render, request, variables or control changes.
 record.state.workers=draft.state.workers;
 if(draft.state.assignmentWorkers)record.state.assignmentWorkers=draft.state.assignmentWorkers;
 return {worker:structuredClone(worker),assignment:assignment?structuredClone(assignment):null,standingInstructions:screen.standingInstructions||record.state.standingInstructions||''};
}
function registrationMessage(delivery){
 const {worker,assignment,standingInstructions}=delivery;
 const menu='\n\n## Workspace operation instructions\n\n'+JSON.stringify(require('./supervisor-tools.js').commandMenu,null,2)+'\n\nSubmit a command message as {"nonce":"'+worker.nonce+'","commands":[{"name":"view_inventory"}]}. Commands use this issue workspace; the workflow performs GitHub operations and returns results. You do not receive GitHub credentials.';
 const header='Worker registered: `'+worker.nonce+'`.';
 if(!assignment)return header+'\n\nNo prepared assignment is currently available for this worker. Use `next '+worker.nonce+'` when the supervisor is ready to receive a request.'+menu;
 return header+'\n\n## Standing instructions\n\n'+standingInstructions+'\n\n## Assignment '+assignment.id+'\n\n'+assignment.instruction+'\n\nReturn JSON containing your nonce, assignmentId and values: `{"nonce":"'+worker.nonce+'","assignmentId":"'+assignment.id+'","values":{...}}`.\n\nSubmit this assignment’s expected inputs; other workers’ registration is not required. Use `state` to inspect the saved state through the comment screen and `back` to return to the assignment.'+menu;
}
module.exports={registerPreparedWorker,registrationMessage};

async function executeWorkerCommands(record,nonce,commands,storage,save,requestId){
 if(!(record.state.workers||[]).some(w=>w.nonce===nonce))throw Error('Register your worker nonce before using commands.');
 const {executeCommands}=require('./supervisor-tools.js');
 await executeCommands(record,commands,storage,save,{actor:{type:'worker',nonce},requestId});
 return (record.state.commandResults||[]).filter(r=>r.actor?.type==='worker'&&r.actor.nonce===nonce&&r.requestId===requestId);
}
module.exports.executeWorkerCommands=executeWorkerCommands;
