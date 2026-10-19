const {validateGeminiResponse}=require('./gemini-workflow.js');
const {validate}=require('./validator.js');

const waitingInstruction='Mirror Mode: submit {"mirror":{instruction,expectedInputs,control}} to publish the next instruction, or {"mirror":{control}} to complete. Use the existing control schema. The workflow validates and stores your screen; no Gemini request is made.';
function beginMirror(record){
 record.mirrorStarted=true;
 record.state.renderedScreens=[];
 record.state.variables=[{name:'procedureMode',value:'mirror'},{name:'verbatimUserPrompt',value:record.state.verbatimUserPrompt}];
 record.state.controls=[];
 record.mirrorWaiting=true;
 record.state.expectedInputs={request:record.request,render:record.state.render,inputs:[]};
}
function mirrorInstruction(record){
 return record.mirrorWaiting?waitingInstruction:record.state.renderedScreens.at(-1).instruction;
}
function applyMirrorReturn(record,payload,fileRoot){
 if(record.done)throw Error('This run has finished.');
 const values=payload.values||(payload.variable?{[payload.variable]:payload.value}:payload);
 if(!values||typeof values!=='object'||Array.isArray(values))throw Error('Mirror return must be an object.');
 if(Object.hasOwn(values,'mirror')){
  if(Object.keys(values).length!==1)throw Error('A mirror message must contain only mirror.');
  if(!record.mirrorWaiting)throw Error('Submit the current instruction returns before another mirror message.');
  const message=values.mirror;
  if(!message||typeof message!=='object'||Array.isArray(message)||Object.keys(message).some(k=>!['control','instruction','expectedInputs'].includes(k)))throw Error('Mirror messages accept only control, instruction and expectedInputs.');
  const assessed=validateGeminiResponse(message);
  // Reserve the envelope key to avoid confusing a task return with a producer message.
  if(assessed.screen?.expectedInputs.some(input=>input.name==='mirror'))throw Error('mirror is reserved for instruction messages.');
  record.state.controls.push(assessed.control);
  record.history.push({request:record.request,mirrorMessage:structuredClone(message)});
  record.request++;
  if(assessed.control.mode==='completion'){
   record.done=true;record.state.expectedInputs={request:record.request,render:record.state.render,inputs:[]};
  }else{
   record.state.renderedScreens.push(assessed.screen);
   record.state.render=record.state.renderedScreens.length-1;
   record.state.expectedInputs={request:record.request,render:record.state.render,inputs:structuredClone(assessed.screen.expectedInputs)};
   record.mirrorWaiting=false;
  }
 }else{
  if(record.mirrorWaiting)throw Error('Submit the next mirror instruction first.');
  if(!record.state.renderedRequests.includes(record.request))throw Error('Current mirror instruction has not been published.');
  const expected=record.state.expectedInputs;
  if(expected?.request!==record.request||expected.render!==record.state.render)throw Error('Current mirror expected inputs are unavailable.');
  const names=expected.inputs.map(input=>input.name);
  if(Object.keys(values).length!==names.length||names.some(name=>!Object.hasOwn(values,name)))throw Error('Return exactly the requested mirror input names.');
  for(const input of expected.inputs)validate(values[input.name],input.schema,input.name,{root:fileRoot,newFiles:record.newFiles||[]});
  for(const name of names)record.state.variables.push({name,value:structuredClone(values[name])});
  record.history.push({request:record.request,render:record.state.render,values:structuredClone(values)});
  record.request++;record.mirrorWaiting=true;
  record.state.expectedInputs={request:record.request,render:record.state.render,inputs:[]};
 }
 record.view='instruction';
}
module.exports={beginMirror,mirrorInstruction,applyMirrorReturn};
