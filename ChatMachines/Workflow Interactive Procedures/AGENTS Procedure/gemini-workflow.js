const fs = require('node:fs');
const path = require('node:path');
const {screenFromGeminiResponse, saveGeminiScreen} = require('./gemini-screen.js');
const {lastGeminiScreen} = require('./render-gemini.js');
const {validate} = require('./validator.js');
const {commandMenu,validateCommands,executeCommands,initializeWorkspace,localStorage}=require('./supervisor-tools.js');

// Deliberately accept only the schema vocabulary enforced by the workflow.
function validateInputSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw Error('Input schema must be an object.');
  const allowed = ['type','const','anyOf','items','properties','required','additionalProperties'];
  for (const key of Object.keys(schema)) if (!allowed.includes(key)) throw Error('Unsupported schema keyword: '+key);
  if (schema.anyOf !== undefined) {
    if (Object.keys(schema).length !== 1 || !Array.isArray(schema.anyOf) || !schema.anyOf.length) throw Error('anyOf requires a nonempty array and no sibling keywords.');
    schema.anyOf.forEach(validateInputSchema);
    return;
  }
  if (Object.hasOwn(schema,'const')) {
    if (Object.keys(schema).length !== 1) throw Error('const must stand alone.');
    return;
  }
  if (!['string','integer','boolean','null','array','object'].includes(schema.type)) throw Error('Unsupported or missing schema type.');
  if (schema.type === 'array') validateInputSchema(schema.items);
  if (schema.type === 'object') {
    if (!schema.properties || typeof schema.properties !== 'object' || Array.isArray(schema.properties)) throw Error('Object schema needs properties.');
    Object.values(schema.properties).forEach(validateInputSchema);
    if (!Array.isArray(schema.required) || schema.required.some(k=>typeof k!=='string'||!Object.hasOwn(schema.properties,k))) throw Error('Object schema needs valid required keys.');
    if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== 'boolean') throw Error('additionalProperties must be Boolean.');
  }
  for (const key of Object.keys(schema)) {
    if (['items'].includes(key) && schema.type !== 'array') throw Error('items requires array type.');
    if (['properties','required','additionalProperties'].includes(key) && schema.type !== 'object') throw Error(key+' requires object type.');
  }
}

function validateGeminiScreen(response) {
  const screen = screenFromGeminiResponse(response);
  if (!screen.expectedInputs.length) throw Error('Every Gemini screen must request at least one return value.');
  for (const input of screen.expectedInputs) {
    validateInputSchema(input.schema);
    if (!screen.instruction.includes('{$'+input.name+'}')) throw Error('Instruction must describe and request return {$'+input.name+'}.');
  }
  return screen;
}

function validateControl(control) {
  const object=(value,keys,label)=>{
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))throw Error(label+' must contain exactly '+keys.join(', ')+'.');
  };
  object(control,['target','current','gap','progress','mode'],'control');
  object(control.progress,['reduced','description'],'control.progress');
  if(typeof control.progress.reduced!=='boolean'||typeof control.progress.description!=='string'||!control.progress.description.trim())throw Error('control.progress requires Boolean reduced and a nonempty description of the observed state change.');
  for(const key of ['target','current']) {
    object(control[key],['outcome','process'],'control.'+key);
    for(const field of ['outcome','process'])if(typeof control[key][field]!=='string'||!control[key][field].trim())throw Error('control.'+key+'.'+field+' needs a nonempty description.');
  }
  object(control.gap,['outcome','process'],'control.gap');
  for(const field of ['outcome','process'])if(!Array.isArray(control.gap[field])||control.gap[field].some(v=>typeof v!=='string'||!v.trim()))throw Error('control.gap.'+field+' must be an array of nonempty descriptions.');
  if(!['continue','completion'].includes(control.mode))throw Error('control.mode must be continue or completion.');
  const gaps=control.gap.outcome.length+control.gap.process.length;
  if(control.mode==='completion'&&gaps)throw Error('Completion requires both outcome and process gaps to be empty.');
  if(control.mode==='continue'&&!gaps)throw Error('Continue requires an identified outcome or process gap.');
  return structuredClone(control);
}

function validateGeminiResponse(response) {
  const message=typeof response==='string'?JSON.parse(response):response;
  if(!message||typeof message!=='object'||Array.isArray(message))throw Error('Gemini response must be an object.');
  const control=validateControl(message.control);
  if(control.mode==='completion') {
    if(Object.keys(message).length!==1)throw Error('completion response must contain exactly control.');
    return {control,screen:null,commands:[]};
  }
  const allowed=['control','commands','instruction','expectedInputs','assignments'];
  if(Object.keys(message).some(k=>!allowed.includes(k)))throw Error('Unexpected response field.');
  const commands=message.commands===undefined?[]:validateCommands(message.commands);
  let screen=null;
  if(message.assignments!==undefined){
    if(message.instruction!==undefined||message.expectedInputs!==undefined)throw Error('Use assignments or a single screen, not both.');
    if(!Array.isArray(message.assignments)||!message.assignments.length||message.assignments.length>4)throw Error('Provide one to four assignments.');
    const ids=new Set();let chatgpt=0,gemini=0;
    const assignments=message.assignments.map(a=>{
      if(!a||Object.keys(a).filter(k=>k!=='nonce').sort().join(',')!=='expectedInputs,id,instruction,worker'||typeof a.id!=='string'||!/^[A-Za-z0-9_-]+$/.test(a.id)||ids.has(a.id))throw Error('Assignment needs a unique id, worker, instruction, expectedInputs.');
      ids.add(a.id);if(a.worker==='chatgpt')chatgpt++;else if(a.worker==='gemini')gemini++;else throw Error('worker must be chatgpt or gemini.');
      if(a.nonce!==undefined&&(typeof a.nonce!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(a.nonce)))throw Error('Invalid worker nonce.');
      return {id:a.id,worker:a.worker,...(a.nonce?{nonce:a.nonce}:{}),...validateGeminiScreen({instruction:a.instruction,expectedInputs:a.expectedInputs})};
    });
    if(new Set(assignments.filter(a=>a.nonce).map(a=>a.nonce)).size!==assignments.filter(a=>a.nonce).length)throw Error('A worker can have only one assignment per broadcast.');
    if(chatgpt>1||gemini>3)throw Error('At most one ChatGPT and three Gemini workers.');
    screen={instruction:'Worker assignments',expectedInputs:[],assignments};
  }else if(message.instruction!==undefined||message.expectedInputs!==undefined)screen=validateGeminiScreen({instruction:message.instruction,expectedInputs:message.expectedInputs});
  if(!screen&&!commands.length)throw Error('Continue requires commands or a screen.');
  return {control,screen,commands};
}

function buildGeminiRequest(state) {
  if (typeof state.verbatimUserPrompt !== 'string') throw Error('Verbatim user prompt is missing.');
  if (!Array.isArray(state.renderedScreens) || !Array.isArray(state.variables)) throw Error('Screen and variable arrays are required.');
  const request = JSON.parse(fs.readFileSync(path.join(__dirname,'gemini-request-template.json'),'utf8'));
  // Send the complete workflow-owned state, without substituting into old screens.
  request.state = structuredClone(state);
  for(const operation of request.state.fileOperations||[])if(operation.request&&Object.hasOwn(operation.request,'value')){delete operation.request.value;operation.request.contentOmitted=true;}

  // File bodies reach the supervisor only through its own explicit reads.
  const omitContents = files => {
    for (const file of files || []) if (Object.hasOwn(file, 'content')) {
      delete file.content;
      file.contentOmitted = true;
    }
  };
  for (const entry of request.state.commandResults || []) {
    omitContents(entry.command?.files);
    if (!(entry.actor?.type === 'supervisor' && entry.command?.name === 'read_files')) omitContents(entry.result?.files);
  }
  for (const response of Object.values(request.state.workerResponses || {})) omitContents(response.files);
  request.commandMenu=structuredClone(commandMenu);
  request.state.controls ??= [];
  if(!Array.isArray(request.state.controls))throw Error('Control history must be an array.');
  return request;
}

async function callGemini(request, {fetchImpl=fetch, apiKey=process.env.GEMINI_API_KEY, model=process.env.GEMINI_MODEL || 'gemini-3.8-flash'}={}) {
  if (!apiKey) throw Error('GEMINI_API_KEY is missing.');
  const response = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent', {
    method:'POST',
    headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},
    body:JSON.stringify({contents:[{role:'user',parts:[{text:JSON.stringify(request)}]}],generationConfig:{responseMimeType:'application/json'}})

  });
  if (!response.ok) throw Error('Gemini API returned HTTP '+response.status+'.');
  const result = await response.json();
  const parts = result.candidates?.[0]?.content?.parts || [];
  const text = parts.filter(part=>typeof part.text==='string'&&!part.thought).map(part=>part.text).join('');
  if (!text) throw Error('Gemini API returned no response text.');
  return text;
}

async function generateGeminiScreen(record, saveRecord, {generate=callGemini,maxAttempts=3,storage}={}) {
  if(record.done)return null;
  if (!record.geminiPending) return lastGeminiScreen(record.state);
  storage??=localStorage(path.join(__dirname,'issue-workspaces',String(record.issueNumber||record.id||'local')));
  await initializeWorkspace(record,storage);
  if(record.pendingSupervisorResponse){
    const pending=record.pendingSupervisorResponse;
    await executeCommands(record,pending.commands,storage,saveRecord);
    const recoveredState=structuredClone(record.state);
    delete record.pendingSupervisorResponse;
    try {
    if(pending.screen){
      record.geminiPending=false;record.view='instruction';
      if(pending.screen.assignments){const screen={...pending.screen,standingInstructions:record.state.standingInstructions||'Follow the shared objective and your assignment.'};record.state={...record.state,renderedScreens:[...record.state.renderedScreens,screen],render:record.state.renderedScreens.length};await saveRecord();return screen;}
      return await saveGeminiScreen(record,pending.screen,saveRecord);
    }
    await saveRecord();
    }catch(error){record.state=recoveredState;record.pendingSupervisorResponse=pending;record.geminiPending=true;throw error;}
  }
  // A saved command-only response can resume without reissuing its commands.
  while(true) {
  const request = buildGeminiRequest(record.state);
  for (let attempt=1; attempt<=maxAttempts; attempt++) {
    const response = await generate(structuredClone(request));
    let assessment;
    try {assessment = validateGeminiResponse(response);
      if(record.state.workerInstructionRequests?.some(r=>r.request===record.request)){
        const old=lastGeminiScreen(record.state);
        const pending=(old.assignments||[]).filter(a=>!(record.state.assignmentReturns||[]).some(r=>r.assignmentId===a.id)).map(a=>{const nonce=a.nonce||(record.state.assignmentWorkers||[]).find(b=>b.assignmentId===a.id)?.nonce;return nonce?{...a,nonce}:a;});
        if(pending.length){
          if(assessment.control.mode==='completion')throw Error('Workers still have pending expected returns.');
          if(assessment.screen&&!assessment.screen.assignments)throw Error('Keep outstanding worker assignments; use assignments for new work.');
          if(assessment.screen){
            const fresh=assessment.screen.assignments;
            if(fresh.some(a=>a.nonce&&pending.some(p=>(p.nonce||(record.state.assignmentWorkers||[]).find(b=>b.assignmentId===p.id)?.nonce)===a.nonce)))throw Error('Cannot replace a worker with pending expected returns.');
            assessment.screen.assignments=[...pending,...fresh];
            if(new Set(assessment.screen.assignments.map(a=>a.id)).size!==assessment.screen.assignments.length)throw Error('Assignment ids must be unique.');
            if(assessment.screen.assignments.length>4)throw Error('Too many worker assignments.');
          }
        }
      }
      if(assessment.screen?.assignments){
        for(const a of assessment.screen.assignments)if(a.nonce&&!(record.state.workers||[]).some(w=>w.nonce===a.nonce&&w.type===a.worker))throw Error('Target a registered worker nonce of the matching type.');
        const oldIds=new Set((record.state.assignmentReturns||[]).map(r=>r.assignmentId));
        if(assessment.screen.assignments.some(a=>oldIds.has(a.id)))throw Error('Assignment ids must be unique across the run.');
      }
    }
    catch (error) {
      if (attempt===maxAttempts) throw Error('Gemini response format rejected: '+error.message);
      request.correction = {previousResponse:response,validationError:error.message,instruction:'Return a corrected response with a fresh control assessment. Continue mode requires commands, assignments, or instruction and expectedInputs; completion mode contains only control. Preserve the task and supplied state.'};
      continue;
    }
    let durableState;
    const previousState=record.state,previousDone=record.done,previousPending=record.geminiPending;
    const noProgressTurns=(previousState.controls||[]).length===0?0:assessment.control.progress.reduced?0:record.geminiAssessmentRequest===record.request?(previousState.noProgressTurns||0):(previousState.noProgressTurns||0)+1;
    record.state={...previousState,noProgressTurns,controls:[...(previousState.controls||[]),assessment.control]};
    record.geminiPending=false;
    const previousAssessmentRequest=record.geminiAssessmentRequest;
    record.geminiAssessmentRequest=record.request;
    try {
      if(assessment.control.mode==='completion'||noProgressTurns>=3) {
        record.state.stopReason=assessment.control.mode==='completion'?'completed':'stalled';
        record.done=true;
        await saveRecord();
        return null;
      }
      // Save the command intent before executing side effects.
      if(assessment.commands.length){
        record.geminiPending=true;
        record.pendingSupervisorResponse=assessment;
        await saveRecord();
        await executeCommands(record,assessment.commands,storage,saveRecord);
        durableState=structuredClone(record.state);
        delete record.pendingSupervisorResponse;
      }
      if(!assessment.screen){record.geminiPending=true;await saveRecord();break;}
      record.geminiPending=false;record.view='instruction';
      if(assessment.screen.assignments){
        const screen={...assessment.screen,standingInstructions:record.state.standingInstructions||'Follow the shared objective and your assignment.'};
        record.state={...record.state,renderedScreens:[...record.state.renderedScreens,screen],render:record.state.renderedScreens.length};
        await saveRecord();return screen;
      }
      return await saveGeminiScreen(record,assessment.screen,saveRecord);
    } catch(error) {
      if(assessment.commands.length){if(durableState)record.state=durableState;record.pendingSupervisorResponse=assessment;record.geminiPending=true;throw error;}
      record.state=previousState;record.geminiPending=previousPending;
      record.geminiAssessmentRequest=previousAssessmentRequest;
      if(previousDone===undefined)delete record.done;else record.done=previousDone;
      throw error;
    }
  }
  }
}

function acceptGeminiValues(record, values, fileRoot) {
  if(record.done)throw Error('This run has finished.');
  if (record.geminiPending) throw Error('The previous return is saved. Type retry to request the next Gemini screen; do not repeat the work.');
  if (!values || typeof values!=='object' || Array.isArray(values)) throw Error('Return a JSON object of variable names and values.');
  const screen = lastGeminiScreen(record.state);
  if(screen.assignments){
    if(Object.keys(values).filter(k=>k!=='nonce').sort().join(',')!=='assignmentId,values')throw Error('Return {"assignmentId":"id","values":{...}}.');
    const assignment=screen.assignments.find(a=>a.id===values.assignmentId);
    if(!assignment)throw Error('Unknown assignment.');
    const identityDraft=structuredClone(record);
    bindAssignmentWorker(identityDraft,assignment,values.nonce);
    if((record.state.assignmentReturns||[]).some(r=>r.assignmentId===assignment.id))throw Error('Assignment return already accepted.');
    const returned=values.values;
    if(!returned||typeof returned!=='object'||Array.isArray(returned)||Object.keys(returned).length!==assignment.expectedInputs.length||assignment.expectedInputs.some(i=>!Object.hasOwn(returned,i.name)))throw Error('Returned keys must match this assignment.');
    for(const i of assignment.expectedInputs)validate(returned[i.name],i.schema,i.name,{root:fileRoot,newFiles:record.newFiles});
    bindAssignmentWorker(record,assignment,values.nonce);
    record.state.assignmentReturns??=[];
    record.state.assignmentReturns.push({render:record.state.render,assignmentId:assignment.id,nonce:values.nonce,worker:assignment.worker,values:structuredClone(returned)});
    for(const i of assignment.expectedInputs)record.state.variables.push({name:i.name,value:structuredClone(returned[i.name]),assignmentId:assignment.id});
    record.history.push({request:record.request,render:record.state.render,assignmentId:assignment.id,values:structuredClone(returned)});
    const all=screen.assignments.every(a=>record.state.assignmentReturns.some(r=>r.assignmentId===a.id));
    if(all){record.request++;record.geminiPending=true;}
    record.view='instruction';return;
  }
  const names = screen.expectedInputs.map(input=>input.name);
  if (Object.keys(values).length!==names.length || Object.keys(values).some(name=>!names.includes(name))) throw Error('Returned keys must exactly match: '+names.join(', '));
  for (const input of screen.expectedInputs) {
    if (!Object.hasOwn(values,input.name)) throw Error('Missing input: '+input.name);
    validate(values[input.name],input.schema,input.name,{root:fileRoot,newFiles:record.newFiles});
  }
  const before = structuredClone(record.state);
  for (const input of screen.expectedInputs) record.state.variables.push({name:input.name,value:structuredClone(values[input.name])});
  record.history.push({request:record.request,render:record.state.render,values:structuredClone(values),state:before});
  record.request++;
  record.geminiPending = true;
  record.view = 'instruction';
}

function registerWorker(record,nonce,type){
 if(typeof nonce!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(nonce))throw Error('Worker nonce must be 1–128 letters, digits, underscores or hyphens.');
 if(!['chatgpt','gemini'].includes(type))throw Error('Worker type must be chatgpt or gemini.');
 const roster=record.state.workers||[];
 const prior=roster.find(w=>w.nonce===nonce);
 if(prior){if(prior.type!==type)throw Error('Nonce is already bound to a different worker type.');return prior;}
 if(roster.filter(w=>w.type===type).length>=(type==='chatgpt'?1:3))throw Error('Worker limit reached for this type. Reuse the registered worker nonce.');
 const worker={nonce,type};record.state.workers??=[];record.state.workers.push(worker);return worker;
}
function bindAssignmentWorker(record,assignment,nonce){
 const expected=assignment.nonce||(record.state.assignmentWorkers||[]).find(b=>b.assignmentId===assignment.id)?.nonce;
 if(expected&&nonce!==expected)throw Error('Worker nonce does not match this assignment.');
 registerWorker(record,nonce,assignment.worker);
 const active=lastGeminiScreen(record.state).assignments||[];
 if(active.some(a=>a.id!==assignment.id&&(a.nonce||(record.state.assignmentWorkers||[]).find(b=>b.assignmentId===a.id)?.nonce)===nonce&&!(record.state.assignmentReturns||[]).some(r=>r.assignmentId===a.id)))throw Error('This nonce already has another pending assignment.');
 if(!(record.state.assignmentWorkers||[]).some(b=>b.assignmentId===assignment.id)){
  record.state.assignmentWorkers??=[];record.state.assignmentWorkers.push({assignmentId:assignment.id,nonce});
 }
}
function requestWorkerInstruction(record,nonce){
 if(record.done)throw Error('This run has finished.');
 if(!record.geminiStarted)throw Error('Worker commands require Gemini mode.');
 const worker=(record.state.workers||[]).find(w=>w.nonce===nonce);
 if(!worker)throw Error('Unknown worker nonce.');
 if(record.geminiPending)throw Error('A supervisor request is already pending. Type retry.');
 const screen=lastGeminiScreen(record.state);
 const pending=(screen.assignments||[]).some(a=>(a.nonce||(record.state.assignmentWorkers||[]).find(b=>b.assignmentId===a.id)?.nonce)===nonce&&!(record.state.assignmentReturns||[]).some(r=>r.assignmentId===a.id));
 if(pending)throw Error('Submit this worker’s pending expected returns before requesting another instruction.');
 if(!screen.assignments&&screen.expectedInputs.length)throw Error('Current screen still has pending expected returns.');
 record.request++;
 record.state.workerInstructionRequests??=[];
 record.state.workerInstructionRequests.push({nonce,request:record.request,message:'This worker has no pending expected returns and requests its next instruction.'});
 record.geminiPending=true;record.view='instruction';
}

module.exports = {bindAssignmentWorker,registerWorker,requestWorkerInstruction,validateControl,validateGeminiResponse,validateInputSchema,validateGeminiScreen,buildGeminiRequest,callGemini,generateGeminiScreen,acceptGeminiValues};

