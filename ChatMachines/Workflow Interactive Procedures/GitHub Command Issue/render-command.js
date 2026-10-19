'use strict';
// Adapted from the AGENTS Procedure's renderIssue()/fence() presentation pattern.
// Rendering is pure: the caller controls publication and supplies the originating issue.
const CHUNK_SIZE=20000;
function fence(value,language='text'){
 const text=typeof value==='string'?value:JSON.stringify(value,null,2);
 const runs=text.match(/`+/g)||[];
 const delimiter='`'.repeat(Math.max(3,...runs.map(run=>run.length+1)));
 return delimiter+language+'\n'+text+'\n'+delimiter;
}
function displayResponse(command,responseText){
 let parsed;
 try{parsed=JSON.parse(responseText);}catch{return {label:'Response body',content:responseText,language:'text'};}
 if(command.command==='repos/get-content'&&parsed&&parsed.type==='file'&&parsed.encoding==='base64'&&typeof parsed.content==='string'){
  const decoded=Buffer.from(parsed.content.replace(/\s/g,''),'base64').toString('utf8');
  return {label:'File contents — '+String(parsed.path||command.parameters?.path||'requested file')+' ('+String(parsed.size??Buffer.byteLength(decoded,'utf8'))+' bytes)',content:decoded,language:'text'};
 }
 if(command.command==='local/read'&&parsed&&typeof parsed.content==='string'){
  return {label:'File contents — '+String(parsed.path||command.parameters?.path||'requested file'),content:parsed.content,language:'text'};
 }
 return {label:'API response',content:JSON.stringify(parsed,null,2),language:'json'};
}
function chunks(value,size=CHUNK_SIZE){
 const points=Array.from(value),out=[];
 for(let i=0;i<points.length;i+=size)out.push(points.slice(i,i+size).join(''));
 return out.length?out:[''];
}
function renderCommandResult({issueNumber,commentId,marker,command,result,responseText=''}){
 if(!Number.isSafeInteger(issueNumber)||issueNumber<1)throw Error('Valid originating issue number required');
 if(!command||typeof command.command!=='string')throw Error('Command identifier required');
 if(typeof marker!=='string'||!/^<!-- github-command-receipt:\d+:[a-f0-9]{64} -->$/.test(marker))throw Error('Valid receipt marker required');
 const status=result?.status===undefined?'unconfirmed':String(result.status);
 const outcome=result?.ok===true?'Succeeded':result?.ok===false?'Failed':'Unconfirmed';
 const body=displayResponse(command,String(responseText));
 const pieces=chunks(body.content);
 return pieces.map((part,index)=>{
  const heading=marker+'\n## Command result\n\n'+
   '- Source issue: #'+issueNumber+'\n'+
   '- Source comment: '+(Number.isSafeInteger(commentId)?commentId:'unknown')+'\n'+
   '- Command: `'+command.command+'`\n'+
   '- Outcome: **'+outcome+'**'+(result?.status===undefined?'':' (HTTP/status '+status+')')+'\n'+
   (pieces.length>1?'- Response part: '+(index+1)+' of '+pieces.length+'\n':'')+
   '\n### '+body.label+'\n\n';
  return heading+fence(part,body.language);
 });
}
module.exports={fence,displayResponse,renderCommandResult};
