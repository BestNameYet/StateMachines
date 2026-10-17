const fs=require('node:fs');
const path=require('node:path');
const {isDeepStrictEqual}=require('node:util');
const {
  acceptToolInvocationSubmission,
  appendProcedureReceipt,
  issueNumberForEvent,
  publishCurrent,
  renderIssue,
  restoreCommunicationState,
  setExpectedInputs,
  toolInvocationArtifact,
  toolInvocationArtifactPath,
  toolInvocationArtifactUrl
}=require('./issue-workflow.js');

const procedureDirectory='ChatMachines/Workflow Interactive Procedures/AGENTS Procedure';
function issueNumberFromChangedPath(filePath) {
  const match=filePath.match(/^ChatMachines\/Workflow Interactive Procedures\/AGENTS Procedure\/issue-runs\/(\d+)-tool-invocations\.json$/);
  const number=match?Number(match[1]):null;
  return Number.isSafeInteger(number)&&number>0?number:null;
}
function parseToolInvocationSubmission(source,issueNumber) {
  const document=JSON.parse(source);
  if(!document||typeof document!=='object'||Array.isArray(document))throw Error('The JSON file must contain an object.');
  const unexpected=Object.keys(document).filter(key=>!['procedureIssueNumber','toolInvocations','submissionAccepted'].includes(key));
  if(unexpected.length)throw Error('The JSON file has unexpected top-level field(s): '+unexpected.join(', ')+'.');
  if(document.procedureIssueNumber!==issueNumber)throw Error('procedureIssueNumber must equal '+issueNumber+'.');
  if(document.submissionAccepted!==undefined&&typeof document.submissionAccepted!=='boolean')throw Error('submissionAccepted must be a boolean when present.');
  if(document.toolInvocations!==null&&!Array.isArray(document.toolInvocations))throw Error('toolInvocations must be an array or null.');
  return document.toolInvocations;
}
function appendedToolInvocationRecords(submitted,previous=[]) {
  if(!Array.isArray(submitted))throw Error('toolInvocations must be an array before it can be submitted.');
  if(!Array.isArray(previous))throw Error('Previously accepted toolInvocations must be an array.');
  if(submitted.length<previous.length||!previous.every((record,index)=>isDeepStrictEqual(record,submitted[index]))) {
    throw Error('toolInvocations must retain all previously accepted records in order and append new records.');
  }
  return submitted.slice(previous.length);
}
function isAcceptedReport(source) {
  try { return JSON.parse(source)?.submissionAccepted===true; }
  catch { return false; }
}
function encodedPath(filePath) {
  return filePath.split('/').map(encodeURIComponent).join('/');
}
function changedPathsFromEvent(event, comparedFiles=[]) {
  const paths=(event.commits||[]).flatMap(commit=>[...(commit.added||[]),...(commit.modified||[])]);
  for(const file of comparedFiles) {
    const filePath=typeof file==='string'?file:file?.filename;
    if(typeof filePath==='string')paths.push(filePath);
  }
  return [...new Set(paths)];
}
async function main() {
  if(process.env.GITHUB_EVENT_NAME!=='push')return;
  const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  const repository=process.env.GITHUB_REPOSITORY;
  const apiBase='https://api.github.com/repos/'+repository;
  async function api(method,route,body,allowMissing=false) {
    const response=await fetch(apiBase+route,{method,headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    if(allowMissing&&response.status===404)return null;
    if(!response.ok)throw Error('GitHub '+method+' '+route+' returned '+response.status);
    return response.status===204?null:response.json();
  }
  const payloadPaths=changedPathsFromEvent(event);
  let changedPaths=payloadPaths;
  let submissionPaths=changedPaths.filter(filePath=>issueNumberFromChangedPath(filePath));
  let compareFallbackUsed=false;
  if(!submissionPaths.length && /^[0-9a-f]{40}$/i.test(event.before||'') && /^[0-9a-f]{40}$/i.test(event.after||'') && !/^0+$/.test(event.before)) {
    const comparison=await api('GET','/compare/'+event.before+'...'+event.after);
    changedPaths=changedPathsFromEvent(event,comparison.files||[]);
    submissionPaths=changedPaths.filter(filePath=>issueNumberFromChangedPath(filePath));
    compareFallbackUsed=true;
  }
  console.log(JSON.stringify({event:'push',before:event.before||null,after:event.after||null,payloadPathCount:payloadPaths.length,compareFallbackUsed,submissionPaths}));
  for(const filePath of submissionPaths) {
    const number=issueNumberFromChangedPath(filePath);
    const issue=await api('GET','/issues/'+number);
    const runPath=procedureDirectory+'/issue-runs/'+number+'.json';
    const runRoute='/contents/'+encodedPath(runPath);
    const stored=await api('GET',runRoute,undefined,true);
    if(!stored) {
      await api('POST','/issues/'+number+'/comments',{body:'Tool-invocation JSON rejected: no saved procedure run record exists for this issue. The run state was not changed.'});
      continue;
    }
    const record=JSON.parse(Buffer.from(stored.content,'base64').toString('utf8'));
    const comments=await api('GET','/issues/'+number+'/comments?per_page=100');
    restoreCommunicationState(record,comments,number);
    const inputPath=procedureDirectory+'/issue-runs/'+number+'-tool-invocations.json';
    const inputRoute='/contents/'+encodedPath(inputPath)+'?ref='+encodeURIComponent(event.after||'main');
    const input=await api('GET',inputRoute,undefined,true);
    if(!input)throw Error('Changed tool-invocation file was not found at commit '+(event.after||'main')+': '+inputPath);
    const inputText=Buffer.from(input.content,'base64').toString('utf8');

    const marker='<!-- agents-procedure:'+number+':tool-invocation-file:'+input.sha+' -->';
    const rejected=error=>api('POST','/issues/'+number+'/comments',{body:marker+'\nTool-invocation JSON rejected: '+error.message+'\n\nThe current render and run state are unchanged. Correct '+inputPath+' and commit it again.'});
    let submitted;
    try {
      submitted=parseToolInvocationSubmission(inputText,number);
      if(submitted===null) {
        if(record.state.render===13||record.state.render===17)throw Error('toolInvocations is null; replace it with an array of tool-invocation records.');
        console.log('Ignoring null toolInvocations for issue #'+number+' because render '+record.state.render+' is not waiting for them.');
        continue;
      }
      if(isAcceptedReport(inputText)&&isDeepStrictEqual(submitted,record.toolInvocations||[])) { console.log('Ignoring already accepted tool-invocation report for issue #'+number+'.'); continue; }
      const newRecords=appendedToolInvocationRecords(submitted,record.toolInvocations||[]);
      acceptToolInvocationSubmission(record,newRecords,process.env.GITHUB_WORKSPACE);
    } catch(error) {
      if(!comments.some(comment=>(comment.body||'').includes(marker)))await rejected(error);
      continue;
    }
    const saveRecord=async()=>{
      const saved=await api('PUT',runRoute,{message:'Save AGENTS Procedure issue '+number+' tool-invocation return',content:Buffer.from(JSON.stringify(record,null,2)+'\n').toString('base64'),sha:stored.sha});
      stored.sha=saved.content.sha;
    };
    await saveRecord();
    const artifactText=JSON.stringify(toolInvocationArtifact(record,number),null,2)+'\n';
    const currentInput=await api('GET','/contents/'+encodedPath(inputPath),undefined,true);
    if(currentInput&&Buffer.from(currentInput.content,'base64').toString('utf8')!==artifactText) {
      await api('PUT','/contents/'+encodedPath(inputPath),{message:'Save complete tool-invocation report for issue '+number,content:Buffer.from(artifactText).toString('base64'),sha:currentInput.sha});
    }
    const reportUrl=toolInvocationArtifactUrl(repository,number);
    const rendered=record.state.renderedRequests.includes(record.request)?null:renderIssue(record,number,{toolInvocationReportUrl:reportUrl});
    if(rendered&&rendered.length>65000)throw Error('Instruction exceeds the GitHub comment size; content was not truncated.');
    await saveRecord();
    await publishCurrent(record,number,body=>api('POST','/issues/'+number+'/comments',{body}),saveRecord,rendered);
    if(record.triggerIdentifier) {
      const triggerPath=path.relative(process.env.GITHUB_WORKSPACE,require('./issue-workflow.js').triggerPathForRecord(record)).split(path.sep).join('/');
      const triggerRoute='/contents/'+encodedPath(triggerPath);
      const triggerStored=await api('GET',triggerRoute,undefined,true);
      if(!triggerStored)throw Error('Bound procedure trigger file was not found: '+triggerPath);
      const trigger=JSON.parse(Buffer.from(triggerStored.content,'base64').toString('utf8'));
      const updated=appendProcedureReceipt(trigger,record,number);
      if(updated)await api('PUT',triggerRoute,{message:'Append AGENTS Procedure issue '+number+' receipt to '+record.triggerIdentifier,content:Buffer.from(JSON.stringify(updated,null,2)+'\n').toString('base64'),sha:triggerStored.sha});
    }
    console.log('Validated tool-invocation JSON and advanced issue #'+number+' to render '+record.state.render);
  }
}

if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={issueNumberFromChangedPath,changedPathsFromEvent,parseToolInvocationSubmission,appendedToolInvocationRecords,isAcceptedReport};
