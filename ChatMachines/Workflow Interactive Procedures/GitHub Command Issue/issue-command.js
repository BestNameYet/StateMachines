'use strict';
const fs=require('node:fs'),path=require('node:path');
const MARKER='<!-- github-command-surface:v1 -->';
function parse(body){
 const text=body.trim(),match=text.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
 const c=JSON.parse(match?match[1]:text);
 if(!c||typeof c!=='object'||Array.isArray(c)||c.version!==1||typeof c.command!=='string')throw Error('Expected {"version":1,"command":"operation/id","parameters":{},"body":{}}');
 if(Object.keys(c).some(k=>!['version','command','parameters','body','body_base64','headers'].includes(k)))throw Error('Unknown command field');
 if(c.parameters!==undefined&&(!c.parameters||typeof c.parameters!=='object'||Array.isArray(c.parameters)))throw Error('parameters must be an object');
 if(c.headers!==undefined&&(!c.headers||typeof c.headers!=='object'||Array.isArray(c.headers)))throw Error('headers must be an object');
 return c;
}
function requestFor(c,catalog,repository){
 if(c.command.startsWith('issues/')||c.command==='graphql')throw Error('Issue API operations are excluded');
 const op=catalog.commands[c.command];if(!op)throw Error('Unknown command; see command-catalog.json');
 if(/\/issues(?:\/|$)/.test(op.route))throw Error('Issue API operations are excluded');
 const [owner,repo]=repository.split('/'),parameters={...c.parameters};
 for(const p of op.parameters){if(p.in==='path'&&parameters[p.name]===undefined){if(p.name==='owner')parameters.owner=owner;if(p.name==='repo')parameters.repo=repo;}}
 const known=new Set(op.parameters.filter(p=>['path','query'].includes(p.in)).map(p=>p.name));
 for(const k of Object.keys(parameters))if(!known.has(k))throw Error('Unknown parameter: '+k);
 for(const p of op.parameters)if(p.required&&['path','query'].includes(p.in)&&parameters[p.name]===undefined)throw Error('Missing parameter: '+p.name);
 const route=op.route.replace(/\{([^}]+)\}/g,(_,name)=>{
  const v=parameters[name];if(typeof v!=='string'&&typeof v!=='number')throw Error('Invalid path parameter: '+name);
  // Preserve slash-separated API wildcards (contents paths and git refs), encode each component.
  const parts=String(v).split('/');if(parts.some(s=>!s||s==='.'||s==='..'||/[\\\x00-\x1f\x7f]/.test(s)))throw Error('Invalid path parameter: '+name);
  return parts.map(encodeURIComponent).join('/');
 });
 if(!['https://api.github.com','https://uploads.github.com'].includes(op.server))throw Error('Unsupported catalog API origin');
 const url=new URL(op.server+route);
 for(const p of op.parameters.filter(p=>p.in==='query'))if(parameters[p.name]!==undefined){const v=parameters[p.name];if(v!==null&&typeof v==='object'&&!Array.isArray(v))throw Error('Unsupported query object: '+p.name);url.searchParams.set(p.name,Array.isArray(v)?v.join(','):String(v));}
 if(op.bodyRequired&&c.body===undefined&&c.body_base64===undefined)throw Error('Missing request body');
 const headers={};for(const [k,v] of Object.entries(c.headers||{})){if((!/^[a-z0-9-]+$/i.test(k)||['authorization','host','cookie','connection','content-length','transfer-encoding','proxy-authorization'].includes(k.toLowerCase()))||typeof v!=='string'||/[\r\n]/.test(v))throw Error('Unsupported header: '+k);headers[k]=v;}
 if(c.body!==undefined&&c.body_base64!==undefined)throw Error('Choose body or body_base64');
 let body;if(c.body_base64!==undefined){if(typeof c.body_base64!=='string'||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(c.body_base64))throw Error('Invalid body_base64');if(['GET','HEAD'].includes(op.method))throw Error('This operation does not accept a request body');body=Buffer.from(c.body_base64,'base64');}if(c.body!==undefined){if(['GET','HEAD'].includes(op.method))throw Error('This operation does not accept a request body');if(typeof c.body==='string'){body=c.body;}else{body=JSON.stringify(c.body);if(!Object.keys(headers).some(k=>k.toLowerCase()==='content-type'))headers['Content-Type']='application/json';}}
 return {url:url.href,method:op.method,headers,body};
}
async function call(token,url,options={}){
 return fetch(url,{...options,redirect:'manual',signal:AbortSignal.timeout(90000),headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...options.headers,Authorization:'Bearer '+token,'User-Agent':'StateMachines-issue-command'}});
}
async function control(token,repo,route,method='GET',body){
 const r=await call(token,'https://api.github.com/repos/'+repo+route,{method,...(body===undefined?{}:{body:JSON.stringify(body),headers:{'Content-Type':'application/json'}})});
 if(!r.ok)throw Error('Control API failed: '+r.status+' '+method+' '+route);
 return r.status===204?null:r.json();
}
async function run(env=process.env){
 const event=JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH,'utf8')),repo=env.GITHUB_REPOSITORY,owner=repo.split('/')[0];
 if(event.action!=='created'||event.comment?.user?.type!=='User'||event.comment.user.login.toLowerCase()!==owner.toLowerCase()||event.issue?.pull_request)return {ignored:true};
 const controlToken=env.GITHUB_TOKEN,apiToken=env.COMMAND_API_TOKEN||controlToken;
 // Fetch current issue/comment so edited or deleted content never silently substitutes an event.
 const issue=await control(controlToken,repo,'/issues/'+event.issue.number);
 if(issue.user?.login?.toLowerCase()!==owner.toLowerCase()||!issue.body?.includes(MARKER))return {ignored:true};
 const comment=await control(controlToken,repo,'/issues/comments/'+event.comment.id);
 if(comment.body!==event.comment.body||comment.user?.type!=='User'||comment.user.login.toLowerCase()!==owner.toLowerCase())throw Error('Comment changed or owner authorization changed; submit a new comment');
 const receiptMarker='<!-- github-command-receipt:'+comment.id+' -->';
 for(let page=1;;page++){
  const comments=await control(controlToken,repo,'/issues/'+issue.number+'/comments?per_page=100&page='+page);
  if(comments.some(c=>c.user?.type==='Bot'&&c.body?.includes(receiptMarker)))return {duplicate:true};
  if(comments.length<100)break;
 }
 let command,request;
 try{command=parse(comment.body);if(command.command==='help'){if(Object.keys(command).some(k=>!['version','command'].includes(k)))throw Error('help takes no arguments');}else request=requestFor(command,JSON.parse(fs.readFileSync(path.join(__dirname,'command-catalog.json'),'utf8')),repo);}
 catch(error){await control(controlToken,repo,'/issues/'+issue.number+'/comments','POST',{body:receiptMarker+'\nRejected: '+error.message});return {rejected:true};}
 if(command.command==='help'){
  const docs='https://github.com/'+repo+'/blob/main/ChatMachines/Workflow%20Interactive%20Procedures/GitHub%20Command%20Issue/';
  await control(controlToken,repo,'/issues/'+issue.number+'/comments','POST',{body:receiptMarker+'\nCommand reference (no API request executed):\n\n- [Command catalog]('+docs+'command-catalog.json)\n- [Command JSON schema]('+docs+'user-issue-command.schema.json)\n- [README and usage]('+docs+'README.md)\n\nUse `{\"version\":1,\"command\":\"repos/get\",\"parameters\":{}}` as a normal command example.'});
  return {help:true};
 }
 const runURL='https://github.com/'+repo+'/actions/runs/'+env.GITHUB_RUN_ID;
 const receipt=await control(controlToken,repo,'/issues/'+issue.number+'/comments','POST',{body:receiptMarker+'\nAccepted `'+command.command+'`. Execution started. [Run]('+runURL+'). Do not resubmit until its result is known.'});
 const output=env.COMMAND_OUTPUT_DIR||path.join(env.RUNNER_TEMP||'/tmp','github-command-result');fs.mkdirSync(output,{recursive:true});
 let result;
 try{
  // Exactly one HTTP request: no automatic retries, pagination, or credential-bearing redirects.
  const r=await call(apiToken,request.url,request),bytes=Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(path.join(output,'response.bin'),bytes);
  result={command:command.command,comment_id:comment.id,status:r.status,ok:r.ok,request_id:r.headers.get('x-github-request-id'),headers:Object.fromEntries(r.headers),response_bytes:bytes.length,run:runURL};
  if(command.command==='graphql'&&r.ok){try{const data=JSON.parse(bytes.toString());if(data.errors?.length){result.ok=false;result.graphql_errors=data.errors;}}catch{result.ok=false;}}
 }catch(error){result={command:command.command,comment_id:comment.id,ok:false,outcome:'unknown',error:error.message,run:runURL};}
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2)+'\n');
 await control(controlToken,repo,'/issues/comments/'+receipt.id,'PATCH',{body:receiptMarker+'\n```json\n'+JSON.stringify(result,null,2).slice(0,50000)+'\n```\nFull response: `github-command-'+comment.id+'` artifact in [workflow run]('+runURL+'). An unknown outcome requires checking the target before issuing another command.'});
 if(!result.ok)process.exitCode=1;return result;
}
if(require.main===module)run().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={MARKER,parse,requestFor,run};
