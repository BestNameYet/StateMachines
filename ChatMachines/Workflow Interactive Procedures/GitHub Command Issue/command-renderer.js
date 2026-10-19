'use strict';

// AGENTS-style separation: construct an issue screen here; the runner publishes it.
const BACKTICK=String.fromCharCode(96);
const CHUNK_SIZE=24000;
function fenced(value,language='text'){
 const contents=String(value);
 const matches=contents.match(new RegExp(BACKTICK+'+','g'))||[];
 const fence=BACKTICK.repeat(Math.max(3,...matches.map(item=>item.length+1)));
 return fence+language+'\n'+contents+'\n'+fence;
}
function safelyParsed(text){
 try{return JSON.parse(text);}catch{return null;}
}
function scrub(key,value){
 // GitHub Contents can return temporary credential-bearing download URLs.
 return key==='download_url'?'[omitted]':value;
}
function codeLanguage(filename){
 const ext=String(filename||'').split('.').pop().toLowerCase();
 const languages={js:'javascript',mjs:'javascript',cjs:'javascript',ts:'typescript',tsx:'tsx',jsx:'jsx',py:'python',json:'json',md:'markdown',yml:'yaml',yaml:'yaml',sh:'bash',css:'css',html:'html',xml:'xml',sql:'sql',txt:'text'};
 return languages[ext]||'text';
}
function displayResponse(command,responseText){
 const parsed=safelyParsed(responseText);
 const name=command?.command;
 if(parsed && !Array.isArray(parsed) && typeof parsed==='object'){
  const fileLike=name==='repos/get-content'&&parsed.type==='file'&&parsed.encoding==='base64'&&typeof parsed.content==='string';
  const localFile=name==='local/read'&&typeof parsed.content==='string'&&typeof parsed.path==='string';
  if(fileLike||localFile){
   let content=parsed.content;
   if(fileLike){
    try{
     const base64=content.replace(/\s/g,'');
     if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))throw Error('Invalid base64');
     content=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(base64,'base64'));
    }catch{
     return {language:'json',content:JSON.stringify({path:parsed.path,sha:parsed.sha,size:parsed.size,notice:'Non-UTF-8 or invalid encoded content; content omitted.'},null,2)};
    }
   }
   const metadata=['**File:** '+parsed.path];
   if(parsed.sha)metadata.push('**Blob SHA:** '+parsed.sha);
   if(Number.isSafeInteger(parsed.size))metadata.push('**Size:** '+parsed.size+' bytes');
   return {language:codeLanguage(parsed.path),content,metadata};
  }
  return {language:'json',content:JSON.stringify(parsed,scrub,2)};
 }
 if(parsed!==null)return {language:'json',content:JSON.stringify(parsed,scrub,2)};
 return {language:'text',content:String(responseText||'No response body.')};
}
function renderCommandResult({issueNumber,command,result,responseText='',receiptMarker=''}){
 if(!Number.isSafeInteger(issueNumber)||issueNumber<1)throw Error('Valid originating issue number required');
 if(typeof command?.command!=='string'||!command.command)throw Error('Command name required');
 const displayed=displayResponse(command,responseText);
 const content=displayed.content||'No response body.';
 const parts=[];
 for(let offset=0;offset<content.length;offset+=CHUNK_SIZE)parts.push(content.slice(offset,offset+CHUNK_SIZE));
 if(!parts.length)parts.push('No response body.');
 const status=result?.status===undefined?'':', HTTP '+result.status;
 const outcome=result?.ok?'Succeeded':'Failed';
 return parts.map((part,index)=>{
  const heading=receiptMarker+'\n## Command result\n\n'+
   '**Issue:** #'+issueNumber+'\n\n'+
   '**Command:** '+BACKTICK+command.command.replace(new RegExp(BACKTICK,'g'),'')+BACKTICK+'\n\n'+
   '**Outcome:** '+outcome+status+'\n\n'+
   (displayed.metadata?displayed.metadata.join('\n\n')+'\n\n':'')+
   (parts.length>1?'**Part:** '+(index+1)+' of '+parts.length+'\n\n':'');
  const message=heading+fenced(part,displayed.language);
  if(message.length>65000)throw Error('Rendered response exceeds comment size limit');
  return message;
 });
}
module.exports={renderCommandResult,displayResponse,fenced};
