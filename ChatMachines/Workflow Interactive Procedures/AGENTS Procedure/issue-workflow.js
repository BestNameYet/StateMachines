const fs = require('node:fs');
const path = require('node:path');
const {compileTransitionMap,applyValidatedValues} = require('./transitions.js');
const {loadScreens} = require('./render-instructions.js');
const {inputsFor, validate} = require('./validator.js');
const config = JSON.parse(fs.readFileSync(path.join(__dirname,'config.json'),'utf8'));
const map = compileTransitionMap(JSON.parse(fs.readFileSync(path.join(__dirname,config.transitions),'utf8')));
const screens = loadScreens();
const fence = value => {
  const text = typeof value === 'string' ? value : JSON.stringify(value,null,2);
  const width = Math.max(3,...(text.match(/`+/g)||[]).map(x=>x.length+1));
  const mark = '`'.repeat(width);
  return mark + 'json\n' + text + '\n' + mark;
};
function startRun(issue) {
  const state={};
  const result=map(state);
  return {state:result==='halt'?state:result,done:result==='halt',request:1,lastCommentId:0,newFiles:[],history:[]};
}
function applyReturn(record,payload,fileRoot) {
  if(record.done)throw Error('This run has finished.');
  const fields=inputsFor(screens[record.state.render-1]);
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
  applyValidatedValues(draft,JSON.stringify(values));
  const result=map(draft);
  record.history.push({request:record.request,render:record.state.render,loopNumber:record.state.loopNumber,values:structuredClone(values),state:structuredClone(draft)});
  record.state=result==='halt'?draft:result;
  if(payload.variable==='targetFiles')record.newFiles=payload.value.filter(file=>file.newFile).map(file=>file.filename);
  record.done=result==='halt';record.request++;
}
function parseReturn(body) {
  const text=body.trim();
  const fenced=text.match(/^\x60{3,}(?:json|text|javascript)?\s*\n([\s\S]*?)\n\x60{3,}$/i);
  const source=(fenced?fenced[1]:text).trim();
  if(source==='{}')return {};
  const match=source.match(/^\$\{([A-Za-z_][\w$]*)\}\s*:\s*([\s\S]+)$/);
  if(!match)throw Error('Return must use ${variableName}: JSON value.');
  return {variable:match[1],value:JSON.parse(match[2])};
}
function renderIssue(record,issueNumber) {
  const marker='<!-- agents-procedure:'+issueNumber+':request:'+record.request+':named-return -->';
  if(record.done)return marker+'\n## Procedure complete\n\nAll submitted values and state snapshots are preserved in the run record.';
  const instruction=Object.fromEntries(screens[record.state.render-1]);
  return marker+'\n## Render '+record.state.render+'\n\n'+fence(instruction)+
    '\n\n<details><summary>Captured values</summary>\n\n'+fence({state:record.state})+'\n\n</details>';
}
function canonicalTitle(issue) {
  return 'AGENTS Procedure — '+new Date(issue.created_at).toISOString();
}
async function main() {
  const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  const repository=process.env.GITHUB_REPOSITORY;
  const number=event.issue?.number;
  if(!number||event.issue.pull_request)return;
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
  const outbox=[];
  let comments=[],page=1;
  while(true){const batch=await api('GET','/issues/'+number+'/comments?per_page=100&page='+page++);comments.push(...batch);if(batch.length<100)break;}
  for(const comment of comments){
    if(comment.id<=record.lastCommentId||comment.user.type==='Bot')continue;
    if(record.done){record.lastCommentId=comment.id;continue;}
    if(!/^\s*(?:\$\{|[\[{"\d-]|true\b|false\b|null\b|\x60{3,})/.test(comment.body)) {record.lastCommentId=comment.id;continue;}
    const errorMarker='<!-- agents-procedure:'+number+':error:'+comment.id+' -->';
    try{applyReturn(record,parseReturn(comment.body),process.env.GITHUB_WORKSPACE);}
    catch(error){outbox.push({marker:errorMarker,body:errorMarker+'\nReturn rejected: '+error.message+'\n\nState and current request are unchanged.'});}
    record.lastCommentId=comment.id;
  }
  const rendered=renderIssue(record,number);
  const marker=rendered.split('\n')[0];
  outbox.push({marker,body:rendered});
  for(const item of outbox)if(item.body.length>65000)throw Error('Instruction exceeds the GitHub comment size; content was not truncated.');
  // Persist the state before publishing. Markers prevent duplicate prompts on retries.
  await api('PUT',route,{message:'Save AGENTS Procedure issue '+number+' state',content:Buffer.from(JSON.stringify(record,null,2)+'\n').toString('base64'),...(stored?{sha:stored.sha}:{})});
  for(const item of outbox)if(!comments.some(c=>c.body.includes(item.marker)))await api('POST','/issues/'+number+'/comments',{body:item.body});
  if(record.done&&event.issue.state==='open')await api('PATCH','/issues/'+number,{state:'closed'});
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={startRun,applyReturn,parseReturn,renderIssue,canonicalTitle};
