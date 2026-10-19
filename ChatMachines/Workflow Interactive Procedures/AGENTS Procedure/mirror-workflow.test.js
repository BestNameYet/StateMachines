const assert=require('node:assert/strict');
const {startRun,applyReturn,renderIssue}=require('./issue-workflow.js');
const {handleSubmit}=require('./interface-server.js');
const root=__dirname+'/fixtures';
const control=mode=>({target:{outcome:'Answer saved',process:'Mirror instructions'},current:{outcome:mode==='completion'?'Answer saved':'Await answer',process:'Workflow validates'},gap:mode==='completion'?{outcome:[],process:[]}:{outcome:['Answer'],process:[]},progress:{reduced:true,description:'Required step completed'},mode});
const message={control:control('continue'),instruction:'Return the count as {$count}.',expectedInputs:[{name:'count',schema:{type:'integer'}}]};
function create(){const r=startRun({});renderIssue(r,1);applyReturn(r,{variable:'procedureMode',value:'mirror'},root);renderIssue(r,1);applyReturn(r,{variable:'verbatimUserPrompt',value:'Mirror test'},root);return r;}
async function test(){
 const oldFetch=global.fetch;global.fetch=()=>{throw Error('Mirror must never call an external API');};
 try{
 const r=create();assert(r.mirrorStarted);assert(!r.geminiStarted);assert(r.mirrorWaiting);
 assert(renderIssue(r,1).includes('Mirror Mode'));
 const before=structuredClone(r);
 assert.throws(()=>applyReturn(r,{values:{mirror:{...message,expectedInputs:[{name:'count',schema:{type:'integer',minimum:0}}]}}},root));assert.deepEqual(r,before);
 applyReturn(r,{values:{mirror:message}},root);
 assert.equal(r.state.renderedScreens.length,1);assert.equal(r.state.render,0);assert.equal(r.state.expectedInputs.inputs[0].name,'count');
 assert.throws(()=>applyReturn(r,{values:{count:5}},root),/published/);
 const text=renderIssue(r,1);assert(text.includes(message.instruction));r.state.renderedRequests.push(r.request);
 const current=structuredClone(r);
 for(const values of [{count:'5'},{wrong:5},{count:5,extra:true},{mirror:{control:control('completion')}}]){assert.throws(()=>applyReturn(r,{values},root));assert.deepEqual(r,current);}
 const restored=JSON.parse(JSON.stringify(r));applyReturn(restored,{values:{count:5}},root);assert(restored.mirrorWaiting);assert.equal(restored.state.variables.at(-1).value,5);
 applyReturn(restored,{values:{mirror:message}},root);assert.equal(restored.state.renderedScreens.length,2);assert.equal(restored.state.render,1);
 restored.state.renderedRequests.push(restored.request);applyReturn(restored,{variable:'count',value:8},root);assert.deepEqual(restored.state.variables.filter(x=>x.name==='count').map(x=>x.value),[5,8]);
 applyReturn(restored,{values:{mirror:{control:control('completion')}}},root);assert(restored.done);assert(renderIssue(restored,1).includes('Procedure complete'));
 const local={...startRun({}),id:'test',newFiles:[]};
 renderIssue(local,1);await handleSubmit(local,{values:{$procedureMode:'mirror'}});await handleSubmit(local,{values:{$verbatimUserPrompt:'Local mirror'}});
 let view=await handleSubmit(local,{mirror:message});assert.equal(view.inputs[0].name,'count');
 const request=local.request;await handleSubmit(local,{command:'state'});await handleSubmit(local,{command:'back'});assert.equal(local.request,request);
 view=await handleSubmit(local,{values:{$count:4}});assert(local.mirrorWaiting);
 view=await handleSubmit(local,{mirror:{control:control('completion')}});assert(view.done);
 }finally{global.fetch=oldFetch;}
 console.log('Mirror lifecycle, schema/type rejection, pending-return protection, persistence, append-only history, completion, navigation, HTTP adapter and no-API behavior passed.');
}
async function runAll(){await test();await issueTest();}
runAll().catch(e=>{console.error(e);process.exitCode=1;});

async function issueTest(){
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {main}=require('./issue-workflow.js');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mirror-issue-'));
 const oldFetch=global.fetch,oldEnv={...process.env};
 const issue={number:701,title:'AGENTS Procedure',created_at:'2026-10-18T00:00:00Z',state:'open',body:'### Procedure acknowledgement\n- [x] I agree'};
 const comments=[],files=new Map();let id=1;
 const result=(data,status=200)=>({ok:status<400,status,json:async()=>data});
 const add=(body,login='owner')=>comments.push({id:id++,body,user:{type:'User',login}});
 let eventComment;
 global.fetch=async(url,options={})=>{
  assert(url.startsWith('https://api.github.com/repos/owner/repo'),'No model call in Mirror Mode');
  const route=url.split('/repos/owner/repo')[1],body=options.body?JSON.parse(options.body):null;
  if(route.startsWith('/contents/')){
   if(options.method==='PUT'){const stored={encoding:'base64',type:'file',content:body.content,sha:'sha-'+id++};files.set(route,stored);return result({content:stored,commit:{sha:'commit-'+id}});}
   return files.has(route)?result(files.get(route)):result({},404);
  }
  if(route.startsWith('/issues/701/comments')){if(options.method==='POST'){const c={id:id++,body:body.body,user:{type:'Bot',login:'github-actions[bot]'}};comments.push(c);return result(c);}return result(comments);}
  if(route==='/issues/701'){if(options.method==='PATCH')Object.assign(issue,body);return result(issue);}
  throw Error('Unexpected route '+route);
 };
 Object.assign(process.env,{GITHUB_WORKSPACE:__dirname,GITHUB_REPOSITORY:'owner/repo',GITHUB_TOKEN:'mock',GITHUB_EVENT_NAME:'issue_comment',GITHUB_EVENT_PATH:path.join(dir,'event.json')});
 const run=async()=>{fs.writeFileSync(process.env.GITHUB_EVENT_PATH,JSON.stringify({action:'created',issue,comment:eventComment}));await main();};
 const saved=()=>JSON.parse(Buffer.from([...files.entries()].find(([key])=>key.endsWith('/issue-runs/701.json'))[1].content,'base64').toString());
 try{
  await run();add('${procedureMode}: "mirror"');await run();add('${verbatimUserPrompt}: "Mirror issue test"');await run();
  assert(saved().mirrorStarted);
  add(JSON.stringify({mirror:message}),'outsider');eventComment=comments.at(-1);const baseline=JSON.stringify([...files]);await run();assert.equal(JSON.stringify([...files]),baseline);eventComment=undefined;
  add(JSON.stringify({mirror:message}));await run();assert.equal(saved().state.renderedScreens.length,1);assert(comments.at(-1).body.includes(message.instruction));
  add('{"count":"bad"}');await run();assert.equal(saved().mirrorWaiting,false);assert(comments.at(-1).body.includes('Return rejected'));
  add('{"count":7}');await run();assert.equal(saved().state.variables.at(-1).value,7);assert(saved().mirrorWaiting);
  add(JSON.stringify({mirror:{control:control('completion')}}));await run();assert(saved().done);assert.equal(issue.state,'closed');
  console.log('Mock issue Mirror Mode: owner-only messages, persisted rendered screens, rejected returns, accepted values and closure passed.');
 }finally{global.fetch=oldFetch;process.env=oldEnv;fs.rmSync(dir,{recursive:true,force:true});}
}
