const {commandMenu}=require('./supervisor-tools.js');
function changesBetween(before,after,path=''){
 if(JSON.stringify(before)===JSON.stringify(after))return [];
 const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
 if(Array.isArray(before)&&Array.isArray(after)&&before.length<=after.length&&before.every((v,i)=>JSON.stringify(v)===JSON.stringify(after[i])))return [{operation:'append',path,values:structuredClone(after.slice(before.length))}];
 if(object(before)&&object(after)){
  const changes=[];
  for(const key of new Set([...Object.keys(before),...Object.keys(after)])){
   const child=path+'/'+key.replaceAll('~','~0').replaceAll('/','~1');
   if(!Object.hasOwn(after,key))changes.push({operation:'delete',path:child});
   else if(!Object.hasOwn(before,key))changes.push({operation:'set',path:child,value:structuredClone(after[key])});
   else changes.push(...changesBetween(before[key],after[key],child));
  }
  return changes;
 }
 return [{operation:'set',path,value:structuredClone(after)}];
}
function buildWorkerPackage(record,nonce,assignment){
 const worker=(record.state.workers||[]).find(w=>w.nonce===nonce);
 if(!worker)throw Error('Unknown worker nonce.');
 const owner=a=>a.nonce||(record.state.assignmentWorkers||[]).find(b=>b.assignmentId===a.id)?.nonce;
 const instructions=(record.state.renderedScreens||[]).flatMap((screen,render)=>(screen.assignments||[]).filter(a=>owner(a)===nonce).map(a=>({render,assignment:structuredClone(a),standingInstructions:screen.standingInstructions||''})));
 const current=(record.state.renderedScreens||[]).at(-1);
 assignment??=(current?.assignments||[]).find(a=>owner(a)===nonce&&!(record.state.assignmentReturns||[]).some(r=>r.assignmentId===a.id))||null;
 const prior=record.workerContextLedger?.[nonce];
 const reconstructionQueue=prior?[...structuredClone(prior.events),{sequence:prior.events.length,operation:'state_changes',changes:changesBetween(prior.latestState,record.state)}]:[{sequence:0,operation:'baseline',state:structuredClone(record.state)}];
 return {reconstructionQueue,reconstructionInstructions:'Start from the baseline and apply later events in sequence. set replaces the JSON-pointer path; delete removes it; append adds values to the array. Changes are observed between worker messages, not Git commit history. Then read workerHistory for the original instructions, returns and operation results.',instructions:{role:'Carry out your assigned work. Compare current state with prior instructions, accepted returns, command results and history. Preserve original evidence; do not assume model memory. Request workspace operations through the workflow using your nonce. The workflow holds GitHub credentials; workers receive none.',standingInstructions:current?.standingInstructions||record.state.standingInstructions||''},verbatimUserPrompt:record.state.verbatimUserPrompt,workerIdentity:structuredClone(worker),assignment:structuredClone(assignment),commandMenu:structuredClone(commandMenu),state:structuredClone(record.state),history:structuredClone(record.history||[]),workerHistory:{instructions,returns:structuredClone((record.state.assignmentReturns||[]).filter(r=>r.nonce===nonce)),commandResults:structuredClone((record.state.commandResults||[]).filter(r=>r.actor?.nonce===nonce))}};
}
function rememberWorkerPackage(record,packet){
 record.workerContextLedger??={};record.workerContextLedger[packet.workerIdentity.nonce]={latestState:structuredClone(packet.state),events:structuredClone(packet.reconstructionQueue)};
}
module.exports={changesBetween,rememberWorkerPackage,buildWorkerPackage};
