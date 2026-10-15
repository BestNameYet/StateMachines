const fs = require('node:fs');
const path = require('node:path');
const {transition} = require('./transitions.js');
const {loadScreens} = require('./render-instructions.js');
const {inputsFor, validate} = require('./validator.js');
const config = JSON.parse(fs.readFileSync(path.join(__dirname,'config.json'),'utf8'));
const transitionMap = JSON.parse(fs.readFileSync(path.join(__dirname,config.transitions),'utf8'));
const screens = loadScreens();
const stateTemplate = () => JSON.parse(fs.readFileSync(path.join(__dirname,config.state),'utf8'));
const fence = value => {
  const text = typeof value === 'string' ? value : JSON.stringify(value,null,2);
  const width = Math.max(3,...(text.match(/`+/g)||[]).map(x=>x.length+1));
  const mark = '`'.repeat(width);
  return mark + 'json\n' + text + '\n' + mark;
};
function startRun(issue) {
  const state=stateTemplate();
  const result=transition(state,transitionMap);
  return {state:result==='halt'?state:result,done:result==='halt',request:1,lastCommentId:0,newFiles:[],history:[],originalRequest:issue.body||''};
}
function requestSchema(record) {
  const fields=inputsFor(screens[record.state.render-1]);
  if(fields.length===0)return {type:'object',maxProperties:0};
  if(fields.length!==1)throw Error('Instruction must declare its own combined return type.');
  return fields[0].schema;
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
    validate(payload,field.schema,field.name,{root:fileRoot,newFiles:record.newFiles});
    values['$'+field.name]=payload;
  }
  const draft=structuredClone(record.state);
  const result=transition(draft,transitionMap,JSON.stringify(values));
  record.history.push({request:record.request,render:record.state.render,loopNumber:record.state.loopNumber,values:structuredClone(values),state:structuredClone(draft)});
  record.state=result==='halt'?draft:result;record.done=result==='halt';record.request++;
}
function parseReturn(body) {
  const text=body.trim();
  const fenced=text.match(/^`{3,}(?:json)?\s*\n([\s\S]*?)\n`{3,}$/i);
  return JSON.parse(fenced?fenced[1]:text);
}
function renderIssue(record,issueNumber) {
  const marker='<!-- agents-procedure:'+issueNumber+':request:'+record.request+':direct-return -->';
  if(record.done)return marker+'\n## Procedure complete\\n\\nAll submitted values and state snapshots are preserved in the run record.';
  const instruction=Object.fromEntries(screens[record.state.render-1]);
  const schema=requestSchema(record);
  return marker+'\n## Render '+record.state.render+'\n\\n'+
    fence(instruction)+'\n\\n### Return schema\\n\\n'+fence(schema)+
    '\n\\nReply with only the declared JSON return. No request number or values wrapper. For a step with no captured return, submit {} after completing the instruction.'+
    '\n\\n<details><summary>Original request and captured values</summary>\\n\\n'+fence({originalRequest:record.originalRequest,state:record.state})+'\n\\n</details>';
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
    if(!/^\s*(?:[\[{"\d-]|true\b|false\b|null\b|\x60{3,})/.test(comment.body)) {record.lastCommentId=comment.id;continue;}
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
module.exports={startRun,applyReturn,requestSchema,parseReturn,renderIssue,canonicalTitle};
