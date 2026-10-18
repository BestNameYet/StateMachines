const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {isOwnerComment,validateFileOperation,parseFileOperation,githubFileOperations,executeFileOperation}=require('./file-commands.js');
const hash=text=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(text)+'\0'+text).digest('hex');
async function test(){
 const comment=(login,type='User')=>({user:{login,type}});
 assert.equal(isOwnerComment(comment('BestNameYet'),'BestNameYet/StateMachines'),true);
 assert.equal(isOwnerComment(comment('bestnameyet'),'BestNameYet/StateMachines'),true);
 for(const candidate of [comment('outsider'),comment('BestNameYet','Bot'),comment('BestNameYet','Organization'),{},null])assert.equal(isOwnerComment(candidate,'BestNameYet/StateMachines'),false);
 for(const repository of [undefined,'','BestNameYet','/StateMachines','BestNameYet/StateMachines/extra'])assert.equal(isOwnerComment(comment('BestNameYet'),repository),false);
 console.log('Owner-only comment authorization: owner accepted; other users, bots, missing identity and invalid repository rejected.');
 const files=new Map();let calls=0,commits=0;
 const api=async(method,route,body)=>{
  calls++;const current=files.get(route);
  if(method==='GET')return current?{type:'file',sha:hash(current)}:null;
  if(method==='PUT'){
   assert.equal(body.sha,current===undefined?undefined:hash(current));
   const text=Buffer.from(body.content,'base64').toString('utf8');files.set(route,text);
   return {content:{sha:hash(text)},commit:{sha:'commit-'+ ++commits}};
  }
  assert.equal(method,'DELETE');assert.equal(body.sha,hash(current));files.delete(route);return {commit:{sha:'commit-'+ ++commits}};
 };
 const storage=githubFileOperations(api,p=>'/contents/'+p);
 const record={state:{},request:1};let persisted;
 const save=async()=>{persisted=JSON.parse(JSON.stringify(record));};
 const item=(id,operation,value)=>({id,actor:{login:'operator'},command:{operation,path:'src/a.js',...(operation==='delete'?{}:{value})}});
 assert.equal(parseFileOperation('ordinary conversation'),null);
 assert.equal(parseFileOperation('```json\n{"operation":"delete","path":"src/a.js"}\n```').operation,'delete');
 for(const p of ['../outside','/absolute','a/.git/config','manifest.json'])assert.throws(()=>validateFileOperation({operation:'delete',path:p}));
 assert.throws(()=>validateFileOperation({operation:'mutate',path:'a.js',value:{a:1}}));
 let r=await executeFileOperation(record,item('1','create','const x = 1;\n'),storage,save);
 assert.equal(r.status,'succeeded');assert.equal(r.result.commit,'commit-1');assert.equal(r.result.beforeSha,null);assert.equal(r.result.afterSha,hash('const x = 1;\n'));
 const beforeCalls=calls;await executeFileOperation(record,item('1','create','ignored'),storage,save);assert.equal(calls,beforeCalls);
 r=await executeFileOperation(record,item('2','create','different'),storage,save);assert.equal(r.status,'failed');assert.equal(commits,1);
 r=await executeFileOperation(record,item('3','mutate','const x = 2;\n'),storage,save);assert.equal(r.status,'succeeded');assert.equal(files.get('/contents/src/a.js'),'const x = 2;\n');
 r=await executeFileOperation(record,item('4','delete'),storage,save);assert.equal(r.result.afterSha,null);assert(!files.has('/contents/src/a.js'));
 r=await executeFileOperation(record,item('5','mutate','missing'),storage,save);assert.equal(r.status,'failed');
 // A successful GitHub mutation followed by a failed state save recovers without reapplying it.
 let saveCount=0;const recovery={state:{},request:1};let checkpoint;
 await assert.rejects(()=>executeFileOperation(recovery,item('6','create','recovered'),storage,async()=>{saveCount++;if(saveCount===2)throw Error('save failed');checkpoint=JSON.parse(JSON.stringify(recovery));}),/save failed/);
 const commitsBefore=commits;
 r=await executeFileOperation(checkpoint,item('6','create','recovered'),storage,async()=>{});
 assert.equal(r.result.status,'recovered');assert.equal(r.result.commit,null);assert.equal(commits,commitsBefore);
 // A different intervening write must not be overwritten on recovery.
 const conflict={state:{},request:1};let prepared;
 await assert.rejects(()=>executeFileOperation(conflict,item('7','mutate','desired'),storage,async()=>{prepared=JSON.parse(JSON.stringify(conflict));throw Error('interrupted');}),/interrupted/);
 files.set('/contents/src/a.js','someone else');
 r=await executeFileOperation(prepared,item('7','mutate','desired'),storage,async()=>{});
 assert.equal(r.status,'failed');assert.equal(files.get('/contents/src/a.js'),'someone else');
 console.log('File operations: validation, create/mutate/delete, real receipts, idempotent replay, interrupted-save recovery, and conflict preservation passed.');
}
test().catch(e=>{console.error(e);process.exitCode=1;});
