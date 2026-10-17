const fs = require('node:fs');
const path = require('node:path');
const {compileTransitionMap,applyValidatedValues} = require('./transitions.js');
const {loadScreens,entriesForState} = require('./render-instructions.js');
const {inputsFor, validate} = require('./validator.js');
const {lastGeminiScreen,renderGeminiScreen,broadcastParts} = require('./render-gemini.js');
const {bindAssignmentWorker,registerWorker,requestWorkerInstruction,generateGeminiScreen,acceptGeminiValues} = require('./gemini-workflow.js');
const {rootWorkspaceRequested,rootStorage}=require('./root-workspace.js');
const {initializeWorkspace,workspaceBase}=require('./supervisor-tools.js');
const {runGeminiWorkers}=require('./gemini-workers.js');
const {executeWorkerCommands,registerPreparedWorker,registrationMessage}=require('./worker-registration.js');
const {appendProcedureReceipt} = require('./issue-run-trigger.js');
const config = JSON.parse(fs.readFileSync(path.join(__dirname,'config.json'),'utf8'));
const map = compileTransitionMap(JSON.parse(fs.readFileSync(path.join(__dirname,config.transitions),'utf8')));
const screens = loadScreens();
const fence = value => {
  const text = typeof value === 'string' ? value : JSON.stringify(value,null,2);
  const width = Math.max(3,...(text.match(/`+/g)||[]).map(x=>x.length+1));
  const mark = '`'.repeat(width);
  return mark + 'json\n' + text + '\n' + mark;
};
function triggerIdentifier(issue) {
  return (issue.body || '').match(/<!-- agents-procedure-trigger:([A-Za-z][A-Za-z0-9_-]*) -->/)?.[1] || null;
}
function triggerPathForRecord(record) {
  const identifier = record?.triggerIdentifier;
  if (typeof identifier !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]*[0-9]+$/.test(identifier)) {
    throw new Error('Run record has an invalid procedure trigger identifier.');
  }
  return path.join(__dirname, 'issue-run-triggers', identifier + '.json');
}
function toolInvocationArtifactPath(issueNumber) {
  if(!Number.isSafeInteger(issueNumber)||issueNumber<1)throw new Error('A valid procedure issue number is required.');
  return path.join(__dirname,'issue-runs',issueNumber+'-tool-invocations.json');
}
function toolInvocationArtifactUrl(repository,issueNumber) {
  const relative='ChatMachines/Workflow Interactive Procedures/AGENTS Procedure/issue-runs/'+issueNumber+'-tool-invocations.json';
  return 'https://github.com/'+repository+'/blob/main/'+relative.split('/').map(encodeURIComponent).join('/');
}
function toolInvocationArtifact(record,issueNumber) {
  return {procedureIssueNumber:issueNumber,toolInvocations:structuredClone(record.toolInvocations||[]),submissionAccepted:true};
}
function toolInvocationInputArtifact(issueNumber) {
  return {procedureIssueNumber:issueNumber,toolInvocations:null};
}
function countBy(records,selector) {
  const counts=new Map();
  for(const record of records) {
    const label=selector(record)||'not specified';
    counts.set(label,(counts.get(label)||0)+1);
  }
  return Object.fromEntries([...counts.entries()].sort((a,b)=>a[0].localeCompare(b[0])));
}
function toolInvocationSummary(batch,totalCount=batch.length) {
  return {
    submittedRecords:batch.length,
    totalRecords:totalCount,
    byTool:countBy(batch,record=>record.tool),
    byRuntime:countBy(batch,record=>record.runtime||record.cwd),
    commandLineRecords:batch.filter(record=>typeof record.command_line_verbatim==='string'&&record.command_line_verbatim.length>0).length
  };
}
function issueNumberForEvent(event,overrideNumber) {
  const raw=overrideNumber ?? event.issue?.number;
  const number=typeof raw==='string'&&/^\d+$/.test(raw)?Number(raw):raw;
  return Number.isSafeInteger(number)&&number>0?number:null;
}
function startRun(issue) {
  const state={};
  const result=map(state);
  const identifier=triggerIdentifier(issue);
  const record={state:result==='halt'?state:result,done:result==='halt',request:1,lastCommentId:0,newFiles:[],history:[],toolInvocations:[],...(identifier?{triggerIdentifier:identifier}:{})};
  record.state.workers=[];
  record.state.renderedRequests=[];
  record.state.expectedInputs=null;
  return record;
}
function setExpectedInputs(record) {
  if(record.geminiStarted)return;
  record.state.expectedInputs={request:record.request,render:record.state.render,inputs:record.done?[]:inputsFor(screens[record.state.render-1])};
}
function restoreCommunicationState(record,comments,issueNumber) {
  if(!Array.isArray(record.state.renderedRequests)) {
    const pattern=new RegExp('^<!-- agents-procedure:'+issueNumber+':request:(\\d+):named-return -->');
    record.state.renderedRequests=[...new Set(comments.filter(c=>c.user?.type==='Bot').map(c=>Number(c.body.match(pattern)?.[1])).filter(Number.isSafeInteger))];
  }
  // One-time migration for an already-published legacy screen.
  if(!record.state.expectedInputs && record.state.renderedRequests.includes(record.request))setExpectedInputs(record);
  const expected=record.state.expectedInputs;
  if(expected && expected.request===undefined && expected.render===record.state.render)expected.request=record.request;
}
async function publishCurrent(record,issueNumber,post,save,body) {
  if(record.state.renderedRequests.includes(record.request))return false;
  const screen=record.geminiStarted&&!record.done&&record.view!=='state'?lastGeminiScreen(record.state):null;
  const parts=(screen?.assignments||screen?.standingInstructions)?broadcastParts(screen).map((instruction,index)=>renderIssue(record,issueNumber,{instruction,part:index})): [body ?? renderIssue(record,issueNumber)];
  if(parts.some(p=>p.length>65000))throw Error('A complete screen exceeds 65,000 characters. Shorten the assignment or shared rules.');
  record.publishedParts??={};
  for(let i=0;i<parts.length;i++){
    const key=record.request+':'+i;
    if(record.publishedParts[key])continue;
    await post(parts[i]);record.publishedParts[key]=true;if(screen?.assignments||screen?.standingInstructions)await save();
  }
  record.state.renderedRequests.push(record.request);
  if(record.state.procedureMode==='gemini'&&!record.geminiStarted&&record.state.render===1) {
    record.state.renderedScreens.push({instruction:Object.fromEntries(screens[0]).instruction,expectedInputs:inputsFor(screens[0])});
  }
  await save();
  return true;
}
function applyReturn(record,payload,fileRoot) {
  if(record.done)throw Error('This run has finished.');
  if(record.geminiStarted){
    if(!record.geminiPending&&!record.state.renderedRequests.includes(record.request))throw Error('Current Gemini screen has not been published.');
    const values=payload.values || (payload.variable?{[payload.variable]:payload.value}:payload);
    return acceptGeminiValues(record,values,fileRoot);
  }
  if([13,17].includes(record.state.render))throw Error('Tool invocations must be submitted in the run-specific JSON file and committed; a comment return cannot advance this render.');
  const expected=record.state.expectedInputs;
  if(expected?.render!==record.state.render || expected?.request!==record.request)throw Error('Current screen has not been rendered; expected inputs are unavailable.');
  const fields=expected.inputs;
  const values={};
  if(fields.length===0){
    if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).length)throw Error('This step accepts only {} to continue.');
  }else{
    if(fields.length!==1)throw Error('Instruction must declare its own combined return type.');
    const field=fields[0];
    if(payload.variable!==field.name)throw Error('Expected ${'+field.name+'}: value.');
    validate(payload.value,field.schema,field.name,{root:fileRoot,newFiles:field.name==='targetFiles'?[]:record.newFiles});
    values['$'+field.name]=payload.value;
  }
  const draft=structuredClone(record.state);
  const appliedValues={...values};
  delete appliedValues.$toolInvocations;
  applyValidatedValues(draft,JSON.stringify(appliedValues));
  const startingGemini=record.state.procedureMode==='gemini'&&record.state.render===1;
  const result=startingGemini?draft:map(draft);
  if(Object.hasOwn(values,'$toolInvocations'))record.toolInvocations=[...(record.toolInvocations || []),...structuredClone(values.$toolInvocations)];
  record.history.push({request:record.request,render:record.state.render,loopNumber:record.state.loopNumber,values:structuredClone(values),state:structuredClone(draft)});
  record.state=result==='halt'?draft:result;
  if(payload.variable==='targetFiles')record.newFiles=payload.value.filter(file=>file.newFile).map(file=>file.filename);
  record.done=result==='halt';record.request++;
  record.view='instruction';
  if(payload.variable==='procedureMode'&&payload.value==='gemini') {
    record.state.variables=[{name:'procedureMode',value:'gemini'}];
    record.state.controls=[];
    record.state.noProgressTurns=0;
    record.state.renderedScreens=[{instruction:Object.fromEntries(screens[23]).instruction,expectedInputs:inputsFor(screens[23])}];
  }
  if(startingGemini){
    record.state.variables.push({name:'verbatimUserPrompt',value:payload.value});
    record.geminiStarted=true;
    record.geminiPending=true;
    delete record.state.expectedInputs;
  }
}
function acceptToolInvocationSubmission(record,records,fileRoot) {
  if(record.done)throw Error('This run has finished.');
  const render=record.state.render;
  if(![13,17].includes(render))throw Error('This issue is not waiting for a tool-invocation JSON submission.');
  if(record.state.expectedInputs?.render!==render||record.state.expectedInputs?.request!==record.request)throw Error('The current tool-invocation render has not been published.');
  const expected=inputsFor(screens[render-1]);
  if(expected.length!==1||expected[0].name!=='toolInvocations')throw Error('The current render does not declare toolInvocations.');
  validate(records,expected[0].schema,'toolInvocations',{root:fileRoot,newFiles:record.newFiles});
  const draft=structuredClone(record.state);
  const result=map(draft);
  record.toolInvocations=[...(record.toolInvocations||[]),...structuredClone(records)];
  record.history.push({request:record.request,render,loopNumber:record.state.loopNumber,values:{$toolInvocations:structuredClone(records)},state:structuredClone(draft)});
  record.state=result==='halt'?draft:result;
  record.done=result==='halt';
  record.request++;
  record.lastToolInvocationSummary=toolInvocationSummary(records,record.toolInvocations.length);
  if(!record.done)setExpectedInputs(record);
  return record;
}
function parseReturn(body,allowObject=false) {
  const text=body.trim();
  const fenced=text.match(/^\x60{3,}(?:json|text|javascript)?\s*\n([\s\S]*?)\n\x60{3,}$/i);
  const source=(fenced?fenced[1]:text).trim();
  if(source==='{}')return {};
  if(allowObject&&source.startsWith('{')&&!source.startsWith('{$')){const values=JSON.parse(source);return {values};}
  const match=source.match(/^(?:\$\{([A-Za-z_][\w$]*)\}|\{\$([A-Za-z_][\w$]*)\})\s*:\s*([\s\S]+)$/);
  if(!match)throw Error('Return must use ${variableName}: JSON value.');
  return {variable:match[1]||match[2],value:JSON.parse(match[3])};
}
function renderIssue(record,issueNumber,options={}) {
  setExpectedInputs(record);
  const marker='<!-- agents-procedure:'+issueNumber+':request:'+record.request+':named-return -->';
  if(record.done)return record.state.stopReason==='stalled'
    ? marker+'\n## Procedure stopped — stalled\n\nThree consecutive turns did not reduce the remaining gap. The objective is incomplete. All submitted values, remaining gaps, and control assessments are preserved in the run record.'
    : marker+'\n## Procedure complete\n\nAll submitted values and state snapshots are preserved in the run record.';
  const entries=record.geminiStarted?[]:entriesForState(record.state,screens,record.toolInvocations || []);
  for(const entry of entries)if(entry[0]==='toolInvocationFile')entry[1]={
    procedureIssueNumber:issueNumber,
    path:'ChatMachines/Workflow Interactive Procedures/AGENTS Procedure/issue-runs/'+issueNumber+'-tool-invocations.json',
    format:{procedureIssueNumber:issueNumber,toolInvocations:[{
      cwd:null,command_line_verbatim:null,tool:'<tool name>',invocation_verbatim:'<invocation JSON>',
      final_output_after_completion_of_tool_call:'<final output>',unavailable_reason:null,new:false,
      filename:null,frombyte:null,tobyte:null,description:'<what changed>',intent:'<why>',operator:'<operator>',
      specifiedOperatorByUser:null,chosenOperator:'<operator>',outcome:'succeeded'
    }]},
    webToolFields:{http_method:'<HTTP method>',url:'<URL>'}
  };
  const reportEntry=entries.some(([key])=>key==='toolInvocationReport');
  const reportUrl=options.toolInvocationReportUrl;
  const instruction=Object.fromEntries(entries.map(([key,value])=>key==='toolInvocationReport'&&reportUrl
    ? [key,{procedureIssueNumber:issueNumber,recordCount:(record.toolInvocations||[]).length,file:reportUrl}]
    : [key,value]));
  const workerMenu=record.geminiStarted?'\nRegistered worker nonces: '+(record.state.workers||[]).map(w=>w.nonce+' ('+w.type+')').join(', ')+'. First use `register <nonce> <chatgpt|gemini>`. Include `nonce` in assignment return JSON. For workspace commands submit `{"nonce":"your-nonce","commands":[{"name":"view_inventory"}]}`; use view_inventory, read_files, write_files, or set_standing_instructions. Type `next <nonce>` to request another instruction only when that worker has no pending expected returns.':'';
  const menu='\n\n### Menu\nType `state` to view the saved state, or `back` to return to this instruction. You may submit the current expected inputs from either view.'+workerMenu;
  const communication=[
    '### Communication instructions',
    'Submit the current instruction\'s return as {$variableName}: JSON value. For multiple Gemini inputs, submit one JSON object with their names as keys. Normal steps with no captured return accept {}.',
    'After GitHub confirms your submission, check for a newer request, procedure completion, or a validation error after 10 seconds, then 20 more seconds, then 30 more seconds (60 seconds total). Do not poll continuously.',
    'If a newer request or completion appears, stop waiting for this request and follow that result. If a validation error appears, read it and the current instruction before correcting your return; do not blindly repeat a rejected return.',
    'If no response appears after 60 seconds, resubmit the exact same return once to this issue to retrigger processing. Do not redo the substantive work or change the submitted values. The runner validates against stored expected inputs and skips publishing request numbers already recorded as rendered.',
    'After that single resubmission, use the same 10, 20, and 30 second checks. If no response appears, stop and report the issue URL, submission comment IDs, and last observed request number as pending. Do not create another procedure run or keep retrying.',
    'If submission or reading returns a rate-limit error, honor any Retry-After instruction and stop automatic retries for this turn. If submission success is uncertain, check once whether your comment exists before resubmitting.',
    'Procedure submission, polling, and recovery calls are communication operations; exclude them from the task-execution tool-invocation report so that submitting the report does not require reporting itself.'
  ].join('\n\n');
  const reportLink=reportEntry&&reportUrl
    ? '\n\n### Tool invocation report\n[Open the complete tool-invocation JSON](<'+reportUrl+'>)\n\nRecords: '+(record.toolInvocations||[]).length+'.'
    : '';
  const summary=([14,18].includes(record.state.render)&&record.lastToolInvocationSummary)
    ? '\n\n### Tool invocation JSON accepted\n'+renderToolInvocationSummary(record.lastToolInvocationSummary)
    : '';
  const content=record.view==='state'
    ? '## State\n\n'+fence(record.state)
    : record.geminiStarted
      ? (options.instruction??renderGeminiScreen(lastGeminiScreen(record.state)))
      : fence(instruction);
  return marker+(options.part===undefined?'':'\n<!-- broadcast-part:'+options.part+' -->')+'\n## Render '+record.state.render+'\n\n'+communication+summary+'\n\n'+content+reportLink+menu;
}
function renderToolInvocationSummary(summary) {
  const format=object=>Object.entries(object||{}).map(([name,count])=>'`'+name+'`: '+count).join(', ')||'none';
  return 'Accepted '+summary.submittedRecords+' records in this file; '+summary.totalRecords+' records total in this run.\n\n'+
    'By tool: '+format(summary.byTool)+'.\n\n'+
    'By runtime or working directory: '+format(summary.byRuntime)+'.\n\n'+
    'Records with a command line: '+summary.commandLineRecords+'.';
}
function canonicalTitle(issue) {
  return 'AGENTS Procedure — '+new Date(issue.created_at).toISOString();
}
function recordGeminiError(record,issueNumber,error,comments=[]) {
  record.geminiErrors??=[];
  let sequence=Math.max(0,...record.geminiErrors.map(e=>e.sequence||0))+1;
  const markerFor=n=>'<!-- agents-procedure:'+issueNumber+':gemini-error:'+record.request+':'+n+' -->';
  while(record.geminiErrors.some(e=>e.marker===markerFor(sequence))||comments.some(c=>c.body.includes(markerFor(sequence))))sequence++;
  const marker=markerFor(sequence);
  const failure={sequence,marker,request:record.request,submissionCommentId:record.lastCommentId,message:error.message,name:error.name,at:new Date().toISOString(),published:false};
  failure.body=marker+'\n'+error.message+'\n\nYour accepted values remain saved. Type `retry` to request the next screen. Type `state` or `back` to view the saved state or last saved instruction.';
  record.geminiErrors.push(failure);
  console.error('Gemini supervisor failed: '+JSON.stringify({sequence,request:failure.request,name:failure.name,message:failure.message}));
  return failure;
}
async function publishGeminiErrors(record,comments,post,save) {
  for(const failure of record.geminiErrors||[]) {
    if(failure.published||!failure.marker||!failure.body)continue;
    if(!comments.some(c=>c.body.includes(failure.marker)))await post(failure.body);
    failure.published=true;
    try {await save();} catch(error) {failure.published=false;throw error;}
  }
}

async function main() {
  const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  const repository=process.env.GITHUB_REPOSITORY;
  const number=issueNumberForEvent(event,process.env.AGENTS_PROCEDURE_ISSUE_NUMBER);
  if(!number||event.issue?.pull_request)return;
  if(event.comment?.user?.type==='Bot')return;
  const apiBase='https://api.github.com/repos/'+repository;
  async function api(method,route,body,allowMissing=false) {
    const response=await fetch(apiBase+route,{method,headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    if(allowMissing&&response.status===404)return null;
    if(!response.ok)throw Error('GitHub '+method+' '+route+' returned '+response.status);
    return response.status===204?null:response.json();
  }
  const relative=path.relative(process.env.GITHUB_WORKSPACE,__dirname).split(path.sep).join('/')+'/issue-runs/'+number+'.json';
  const route='/contents/'+relative.split('/').map(encodeURIComponent).join('/');
  const stored=await api('GET',route,undefined,true);
  const issue=await api('GET','/issues/'+number);
  const acknowledged=/### Procedure acknowledgement\s+[-*] \[[xX]\] \S/.test(issue.body||'');
  const identified=stored || /^AGENTS Procedure(?:\s|$)/.test(issue.title) || acknowledged;
  if(!identified)return;
  if(!stored && !acknowledged)throw Error('Acknowledge the AGENTS Procedure behavioral requirements before starting.');
  const title=canonicalTitle(issue);
  if(issue.title!==title)await api('PATCH','/issues/'+number,{title});
  // Title edits enforce naming only; they do not advance or initialize a run.
  if(event.action==='edited')return;
  const record=stored?JSON.parse(Buffer.from(stored.content,'base64').toString('utf8')):startRun(issue);
  record.issueNumber=number;
  const workspacePath=workspaceBase+number;
  const fileRoute=p=>'/contents/'+(workspacePath+'/'+p).split('/').map(encodeURIComponent).join('/');
  let workspaceStorage={
    read:async p=>{const f=await api('GET',fileRoute(p),undefined,true);if(!f)return null;if(f.type&&f.type!=='file')throw Error('Not a regular file.');return Buffer.from(f.content,'base64').toString('utf8');},
    write:async(p,text)=>{const f=await api('GET',fileRoute(p),undefined,true);await api('PUT',fileRoute(p),{message:'Update issue '+number+' workspace: '+p,content:Buffer.from(text).toString('base64'),...(f?{sha:f.sha}:{})});},
    list:async()=>{const files=[];async function walk(p=''){const entries=await api('GET',fileRoute(p).replace(/\/$/,''),undefined,true);for(const e of entries||[]){const name=p?p+'/'+e.name:e.name;if(e.type==='dir')await walk(name);else if(e.type==='file')files.push(name);}}await walk();return files;}
  };
  if(rootWorkspaceRequested(issue)){workspaceStorage=rootStorage(api,number);record.state.workspace={path:'.',access:'repository-root',manifest:workspaceStorage.manifestPath};}
  const outbox=[];
  const workerCommands=[];
  const workerDeliveries=[];
  let navigationOnly=false;
  let initializeToolInvocationFile=false;
  let comments=[],page=1;
  while(true){const batch=await api('GET','/issues/'+number+'/comments?per_page=100&page='+page++);comments.push(...batch);if(batch.length<100)break;}
  restoreCommunicationState(record,comments,number);
  for(const comment of comments){
    if(comment.id<=record.lastCommentId||comment.user.type==='Bot')continue;
    if(record.done){record.lastCommentId=comment.id;continue;}
    const command=comment.body.trim().toLowerCase();
    if(command.startsWith('register ')){
      const marker='<!-- agents-procedure:'+number+':worker-register:'+comment.id+' -->';
      try{const args=comment.body.trim().split(/\s+/);if(args.length!==3)throw Error('Use register <nonce> <chatgpt|gemini>.');if(!record.geminiStarted)throw Error('Worker registration requires Gemini mode.');const delivery=registerPreparedWorker(record,args[1],args[2]);workerDeliveries.push({marker,delivery,commentId:comment.id});}catch(error){outbox.push({marker,body:marker+'\n'+error.message});}
      navigationOnly=true;record.lastCommentId=comment.id;continue;
    }
    if(command.startsWith('next ')){
      const nonce=comment.body.trim().slice(5).trim();
      const marker='<!-- agents-procedure:'+number+':worker-next:'+comment.id+' -->';
      try{requestWorkerInstruction(record,nonce);navigationOnly=false;}catch(error){outbox.push({marker,body:marker+'\n'+error.message});}
      record.lastCommentId=comment.id;continue;
    }
    if(['state','back','retry'].includes(command)) {
      navigationOnly=command!=='retry';
      if(command!=='retry') {
        record.view=command==='state'?'state':'instruction';
        const marker='<!-- agents-procedure:'+number+':navigation:'+comment.id+' -->';
        const current=record.geminiStarted&&!record.done?lastGeminiScreen(record.state):null;
        if(command==='back'&&(current?.assignments||current?.standingInstructions)){
          broadcastParts(current).forEach((instruction,index)=>{const partMarker=marker+':'+index;outbox.push({marker:partMarker,body:partMarker+'\n'+renderIssue(record,number,{instruction,part:index})});});
        }else {
          const body=renderIssue(record,number);
          if(command==='state'&&body.length>65000){const json=JSON.stringify(record.state,null,2);for(let offset=0;offset<json.length;offset+=48000){const part=offset/48000;outbox.push({marker:marker+':'+part,body:marker+':'+part+'\n## State — part '+(part+1)+'\n\n'+fence(json.slice(offset,offset+48000))+'\n\nType `back` to return to the assignment. Current expected inputs remain valid.'});}}
          else outbox.push({marker,body:marker+'\n'+body});
        }
      }
      record.lastCommentId=comment.id;
      continue;
    }
    if(!/^\s*(?:\$\{|[\[{"\d-]|true\b|false\b|null\b|\x60{3,})/.test(comment.body)) {record.lastCommentId=comment.id;continue;}
    const errorMarker='<!-- agents-procedure:'+number+':error:'+comment.id+' -->';
    try {
      const payload=parseReturn(comment.body,record.geminiStarted===true);
      if(record.geminiStarted&&payload.values?.commands!==undefined){
        const envelope=payload.values;
        if(Object.keys(envelope).sort().join(',')!=='commands,nonce')throw Error('Worker commands require exactly nonce and commands.');
        if(!(record.state.workers||[]).some(w=>w.nonce===envelope.nonce))throw Error('Register your worker nonce first.');
        require('./supervisor-tools.js').validateCommands(envelope.commands);
        workerCommands.push({nonce:envelope.nonce,commands:envelope.commands,commentId:comment.id});
        navigationOnly=true;record.lastCommentId=comment.id;continue;
      }
      const priorRender=record.state.render;
      applyReturn(record,payload,process.env.GITHUB_WORKSPACE);
      if(!record.geminiStarted&&priorRender===3&&payload.variable==='exampleMatch'&&payload.value===false)initializeToolInvocationFile=true;
    } catch(error){outbox.push({marker:errorMarker,body:errorMarker+'\nReturn rejected: '+error.message+'\n\nState and current request are unchanged.'});}
    record.lastCommentId=comment.id;
  }
  let stateSha=stored?.sha;
  async function saveRecord() {
    const saved=await api('PUT',route,{message:'Save AGENTS Procedure issue '+number+' state',content:Buffer.from(JSON.stringify(record,null,2)+'\n').toString('base64'),...(stateSha?{sha:stateSha}:{})});
    stateSha=saved.content.sha;
  }
  // Persist the accepted return and buffered tool calls before publishing or linking the report.
  if(!record.done)setExpectedInputs(record);
  await saveRecord();
  await initializeWorkspace(record,workspaceStorage);
  for(const item of workerDeliveries){
    const message=item.delivery.worker.type==='chatgpt'?registrationMessage(item.delivery):'Worker registered. Prepared Gemini instructions are delivered through the API.';
    outbox.push({marker:item.marker,body:item.marker+'\n'+message});
  }
  for(const item of workerCommands){
    const marker='<!-- agents-procedure:'+number+':worker-command:'+item.commentId+' -->';
    try{const results=await executeWorkerCommands(record,item.nonce,item.commands,workspaceStorage,saveRecord,String(item.commentId));const rendered=fence(results);const bodies=[];for(let i=0;i<rendered.length;i+=50000)bodies.push(rendered.slice(i,i+50000));bodies.forEach((part,index)=>outbox.push({marker:marker+':'+index,body:marker+':'+index+'\n## Results for '+item.nonce+' (part '+(index+1)+'/'+bodies.length+')\n\n'+part}));}
    catch(error){outbox.push({marker,body:marker+'\nWorker command failed: '+error.message});}
  }
  await saveRecord();
  if(initializeToolInvocationFile) {
    const inputPath=toolInvocationArtifactPath(number);
    const relative=path.relative(process.env.GITHUB_WORKSPACE,inputPath).split(path.sep).join('/');
    const inputRoute='/contents/'+relative.split('/').map(encodeURIComponent).join('/');
    const existing=await api('GET',inputRoute,undefined,true);
    if(existing) {
      const document=JSON.parse(Buffer.from(existing.content,'base64').toString('utf8'));
      if(document.procedureIssueNumber!==number||!(document.toolInvocations===null||Array.isArray(document.toolInvocations))) {
        throw Error('The existing tool-invocation file is not bound to this issue.');
      }
    } else {
      const artifact=toolInvocationInputArtifact(number);
      await api('PUT',inputRoute,{message:'Initialize AGENTS Procedure issue '+number+' tool-invocation file',content:Buffer.from(JSON.stringify(artifact,null,2)+'\n').toString('base64')});
    }
  }
  await publishGeminiErrors(record,comments,body=>api('POST','/issues/'+number+'/comments',{body}),saveRecord);
  let geminiFailed=record.geminiPending&&navigationOnly;
  if(record.geminiPending&&!navigationOnly){
    try {await generateGeminiScreen(record,saveRecord,{storage:workspaceStorage});}
    catch(error){
      geminiFailed=true;
      recordGeminiError(record,number,error,comments);
    }
  }
  const reportRequested=!record.geminiStarted&&(screens[record.state.render-1]||[]).some(([key])=>key==='toolInvocationReport');
  let reportUrl=null;
  if(reportRequested) {
    const artifactText=JSON.stringify(toolInvocationArtifact(record,number),null,2)+'\n';
    const relative=path.relative(process.env.GITHUB_WORKSPACE,toolInvocationArtifactPath(number)).split(path.sep).join('/');
    const artifactRoute='/contents/'+relative.split('/').map(encodeURIComponent).join('/');
    const artifactStored=await api('GET',artifactRoute,undefined,true);
    const existingText=artifactStored?Buffer.from(artifactStored.content,'base64').toString('utf8'):null;
    if(existingText!==artifactText)await api('PUT',artifactRoute,{message:'Save AGENTS Procedure issue '+number+' tool-invocation report',content:Buffer.from(artifactText).toString('base64'),...(artifactStored?.sha?{sha:artifactStored.sha}:{})});
    reportUrl=toolInvocationArtifactUrl(repository,number);
  }
  const rendered=geminiFailed||record.state.renderedRequests.includes(record.request)?null:renderIssue(record,number,{toolInvocationReportUrl:reportUrl});
  for(const body of [(record.geminiStarted&&!record.done&&(lastGeminiScreen(record.state).assignments||lastGeminiScreen(record.state).standingInstructions))?null:rendered,...outbox.map(item=>item.body)])if(body && body.length>65000)throw Error('Instruction exceeds the GitHub comment size; content was not truncated.');
  await saveRecord();
  for(const item of outbox)if(!comments.some(c=>c.body.includes(item.marker)))await api('POST','/issues/'+number+'/comments',{body:item.body});
  await publishGeminiErrors(record,comments,body=>api('POST','/issues/'+number+'/comments',{body}),saveRecord);
  if(!geminiFailed)await publishCurrent(record,number,body=>api('POST','/issues/'+number+'/comments',{body}),saveRecord,rendered);
  if(!geminiFailed&&!navigationOnly&&record.geminiStarted&&!record.done){
    try {
      for(let group=0;group<4;group++){
        await runGeminiWorkers(record,workspaceStorage,saveRecord);
        if(!record.geminiPending)break;
        await generateGeminiScreen(record,saveRecord,{storage:workspaceStorage});
        await publishCurrent(record,number,body=>api('POST','/issues/'+number+'/comments',{body}),saveRecord);
        if(record.done)break;
        if(group===3)await api('POST','/issues/'+number+'/comments',{body:'The current broadcast is saved. Type `retry` to continue worker execution.'});
      }
    } catch(error){await saveRecord();await api('POST','/issues/'+number+'/comments',{body:error.message+'\n\nSaved results are preserved. Type `retry` to continue.'});}
  }
  if(process.env.GITHUB_EVENT_NAME!=='push' && record.triggerIdentifier) {
    const triggerRelative=path.relative(process.env.GITHUB_WORKSPACE,triggerPathForRecord(record)).split(path.sep).join('/');
    const triggerRoute='/contents/'+triggerRelative.split('/').map(encodeURIComponent).join('/');
    const triggerStored=await api('GET',triggerRoute,undefined,true);
    if(!triggerStored)throw Error('Bound procedure trigger file was not found: '+triggerRelative);
    const trigger=JSON.parse(Buffer.from(triggerStored.content,'base64').toString('utf8'));
    const updatedTrigger=appendProcedureReceipt(trigger,record,number);
    if(updatedTrigger)await api('PUT',triggerRoute,{message:'Append AGENTS Procedure issue '+number+' receipt to '+record.triggerIdentifier,content:Buffer.from(JSON.stringify(updatedTrigger,null,2)+'\n').toString('base64'),sha:triggerStored.sha});
  }
  if(record.done&&event.issue.state==='open')await api('PATCH','/issues/'+number,{state:'closed'});
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={recordGeminiError,publishGeminiErrors,main,startRun,applyReturn,acceptToolInvocationSubmission,parseReturn,renderIssue,renderToolInvocationSummary,toolInvocationSummary,canonicalTitle,triggerIdentifier,triggerPathForRecord,toolInvocationArtifactPath,toolInvocationArtifactUrl,toolInvocationArtifact,toolInvocationInputArtifact,issueNumberForEvent,setExpectedInputs,restoreCommunicationState,publishCurrent};



