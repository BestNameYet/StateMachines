const crypto=require('node:crypto');
const {relativePath}=require('./supervisor-tools.js');
function isOwnerComment(comment,repository){
 const owner=typeof repository==='string'&&/^[^/]+\/[^/]+$/.test(repository)?repository.split('/')[0]:null;
 return Boolean(owner&&comment?.user?.type==='User'&&typeof comment.user.login==='string'&&comment.user.login.toLowerCase()===owner.toLowerCase());
}
function validateFileOperation(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||!['create','mutate','delete'].includes(value.operation))throw Error('Use create, mutate, or delete.');
 const keys=value.operation==='delete'?['operation','path']:['operation','path','value'];
 if(Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))throw Error('Invalid file-operation fields.');
 relativePath(value.path);
 if(value.operation!=='delete'&&typeof value.value!=='string')throw Error('value must contain the complete UTF-8 file contents as a string.');
 return structuredClone(value);
}
function parseFileOperation(body){
 const text=body.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/,'$1');
 let value;try{value=JSON.parse(text);}catch{return null;}
 if(!value||typeof value!=='object'||!Object.hasOwn(value,'operation'))return null;
 return validateFileOperation(value);
}
function githubFileOperations(api,route){
 return {
  inspect:async path=>{const f=await api('GET',route(path),undefined,true);if(f&&f.type!=='file')throw Error('Target must be a regular file.');return f?{sha:f.sha}:null;},
  apply:async(command,before,id)=>{
   const target=route(command.path),message='Procedure operation '+id+': '+command.operation+' '+command.path;
   const result=command.operation==='delete'
    ?await api('DELETE',target,{message,sha:before.sha})
    :await api('PUT',target,{message,content:Buffer.from(command.value,'utf8').toString('base64'),...(before?{sha:before.sha}:{})});
   if(!result.commit?.sha)throw Error('GitHub did not return a commit receipt.');
   return {commit:result.commit.sha,afterSha:command.operation==='delete'?null:result.content.sha};
  }
 };
}
async function executeFileOperation(record,item,storage,save){
 record.state.fileOperations??=[];
 let receipt=record.state.fileOperations.find(r=>r.id===item.id);
 if(receipt&&receipt.status!=='pending')return receipt;
 if(!receipt){
  const command=validateFileOperation(item.command);
  receipt={id:item.id,actor:item.actor,request:command,status:'pending'};
  record.state.fileOperations.push(receipt);
  try{
   receipt.before=await storage.inspect(command.path);
   if(command.operation==='create'&&receipt.before)throw Error('create requires a nonexistent file.');
   if(command.operation!=='create'&&!receipt.before)throw Error(command.operation+' requires an existing file.');
   receipt.prepared=true;
  }catch(error){receipt.status='failed';receipt.error=error.message;}
  await save();
 }
 if(receipt.status!=='pending')return receipt;
 const command=receipt.request;
 try{
  const current=await storage.inspect(command.path);
  const desired=command.operation==='delete'?null:crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+Buffer.byteLength(command.value)+'\0'),Buffer.from(command.value)])).digest('hex');
  if((current?.sha??null)===desired){
   receipt.result={beforeSha:receipt.before?.sha??null,afterSha:desired,status:receipt.before?.sha===desired?'unchanged':'recovered',commit:null};
  }else{
   if((current?.sha??null)!==(receipt.before?.sha??null))throw Error('Target changed since this operation was prepared; submit a new request after inspecting it.');
   const result=await storage.apply(command,receipt.before,item.id);
   receipt.result={beforeSha:receipt.before?.sha??null,...result,status:'changed'};
  }
  receipt.status='succeeded';
 }catch(error){receipt.status='failed';receipt.error=error.message;}
 // If saving fails, the persisted pending receipt is replayed against current blob state.
 await save();return receipt;
}
module.exports={isOwnerComment,validateFileOperation,parseFileOperation,githubFileOperations,executeFileOperation};
