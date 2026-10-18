const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const packages=require('./run-package.js');
const {migrationPlan,migratePackages}=require('./package-migration.js');
const {parsePackageCommand,materialize,executePackageCommand}=require('./package-commands.js');
async function test(){
 process.env.AGENTS_PACKAGE_LAYOUT='unified';
 const {BASE}=packages;assert.equal(packages.statePath(57),BASE+'/procedures/57/records/state.json');assert.equal(packages.reportPath(57),BASE+'/procedures/57/records/tool-invocations.json');
 for(const p of ['../outside','/tmp/a','records/../state','.git/config','a\\b'])assert.throws(()=>packages.workspaceFilePath(57,p));
 assert.throws(()=>packages.workspaceFilePath(57,'records/state.json',true));assert.throws(()=>packages.workspaceFilePath(57,'runtime/results/fake.json',true));assert.equal(packages.workspaceFilePath(57,'runtime/scripts/a.js',true),BASE+'/procedures/57/runtime/scripts/a.js');assert.throws(()=>packages.scopedPath('.github/workflows/a.yml'));
 const entries=[{path:BASE+'/issue-runs/57.json',sha:'state',mode:'100644',type:'blob'},{path:BASE+'/issue-runs/57-tool-invocations.json',sha:'report',mode:'100644',type:'blob'},{path:BASE+'/issue-workspaces/57/a.bin',sha:'binary',mode:'100755',type:'blob'},{path:BASE+'/issue-run-triggers/task1.json',sha:'trigger',mode:'100644',type:'blob'},{path:'outside/secret',sha:'other',mode:'100644',type:'blob'}];
 const bindings=[{path:entries[3].path,issueNumber:57}];const plan=migrationPlan(entries,bindings);assert.equal(plan.length,4);assert(plan.every(p=>p.status==='copy'));assert.equal(plan.find(p=>p.sha==='binary').mode,'100755');
 const existing=plan.map(p=>({path:p.path,sha:p.sha,mode:p.mode,type:'blob'}));assert(migrationPlan([...entries,...existing],bindings).every(p=>p.status==='unchanged'));
 assert.throws(()=>migrationPlan([...entries,{...existing[2],sha:'conflict'}],bindings));assert.throws(()=>migrationPlan([{...entries[2],mode:'120000'}],bindings));
 const preserved=migrationPlan([...entries,{...existing[0],sha:'newer'}],bindings);assert.equal(preserved[0].status,'canonical-preserved');
 const writes=[];await migratePackages(async(method,route,body)=>{
  if(route==='/git/ref/heads/main')return {object:{sha:'head'}};if(route==='/git/commits/head')return {tree:{sha:'tree'}};if(route==='/git/trees/tree?recursive=1')return {tree:entries,truncated:false};if(route==='/git/blobs/trigger')return {content:Buffer.from(JSON.stringify({procedureIssueNumber:57})).toString('base64')};
  writes.push({method,route,body});return {sha:route==='/git/trees'?'newtree':'commit'};
 });assert.equal(writes.length,3);assert.equal(writes.at(-1).body.force,false);assert(writes[0].body.tree.every(e=>e.path.startsWith(packages.WIP+'/')));
 await assert.rejects(()=>migratePackages(async(method,route)=>route.includes('?recursive')?{truncated:true}:route.includes('ref/')?{object:{sha:'head'}}:{tree:{sha:'tree'}}),/Truncated/);
 assert.equal(parsePackageCommand('{"operation":"run_script","task":"test","args":[]}').task,'test');assert.throws(()=>parsePackageCommand('{"operation":"migrate_packages","extra":1}'));assert.equal(parsePackageCommand('ordinary chat'),null);
 let ran=false,snapshot;
 const blobs={task:JSON.stringify({test:{engine:'node',script:'scripts/test.js'}}),script:'console.log(42)',input:'source'};
 const runtimeApi=async(method,route)=>{
  assert(!route.includes('/records/'));
  if(route.startsWith('/git/blobs/'))return {content:Buffer.from(blobs[route.split('/').at(-1)]).toString('base64')};
  if(route.endsWith('/files'))return [{name:'input.txt',type:'file',sha:'input'}];
  if(route.endsWith('/runtime'))return [{name:'tasks.json',type:'file',sha:'task'},{name:'scripts',type:'dir'},{name:'results',type:'dir'}];
  if(route.endsWith('/runtime/scripts'))return [{name:'test.js',type:'file',sha:'script'}];
  throw Error('Unexpected runtime snapshot route '+route);
 };
 const result=await executePackageCommand({operation:'run_script',task:'test',args:[]},{issueNumber:57},runtimeApi,{executeTask:async(dir,task,args)=>{snapshot=dir;assert(fs.readFileSync(path.join(dir,'files/input.txt'),'utf8')==='source');assert(!fs.existsSync(path.join(dir,'runtime/results')));ran=true;return {status:'succeeded',exitCode:0,stdout:'42',stderr:''};}});
 assert(ran);assert.equal(result.exitCode,0);assert(!fs.existsSync(snapshot));
 await mockedIssue();
 console.log('Unified packages: scoped paths, byte-preserving migration, idempotency, conflicts, canonical preference, append-only command report, owner-only runtime, legacy loading and issue completion passed.');
}
async function mockedIssue(){
 const {main,renderIssue}=require('./issue-workflow.js');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'package-issue-')),oldEnv={...process.env},oldFetch=global.fetch;
 const issue={number:801,title:'AGENTS Procedure',created_at:'2026-10-18T00:00:00Z',state:'open',body:'### Procedure acknowledgement\n- [x] I agree'};
 const comments=[],files=new Map();let id=1,eventComment,pendingTree=[];
 const response=(data,status=200)=>({ok:status<400,status,json:async()=>data});
 const reply=(body,login='owner')=>{const c={id:id++,body,user:{type:'User',login}};comments.push(c);return c;};
 const stateRoute=packages.route(packages.statePath(801));
 const stored=()=>JSON.parse(Buffer.from(files.get(stateRoute).content,'base64').toString('utf8'));
 global.fetch=async(url,options={})=>{
  assert(url.startsWith('https://api.github.com/repos/owner/repo'));const route=url.split('/repos/owner/repo')[1],body=options.body?JSON.parse(options.body):null;
  if(route==='/git/ref/heads/main')return response({object:{sha:'head'}});
  if(route==='/git/commits/head')return response({tree:{sha:'tree'}});
  if(route==='/git/trees/tree?recursive=1')return response({truncated:false,tree:[...files.entries()].map(([key,f])=>({path:decodeURIComponent(key.slice('/contents/'.length)),sha:f.sha,type:'blob',mode:'100644'}))});
  if(route.startsWith('/git/blobs/')){const sha=route.slice('/git/blobs/'.length);const f=[...files.values()].find(f=>f.sha===sha);return response(f||{},f?200:404);}
  if(route==='/git/trees'&&options.method==='POST'){pendingTree=body.tree;return response({sha:'newtree'});}
  if(route==='/git/commits'&&options.method==='POST')return response({sha:'migration'});
  if(route==='/git/refs/heads/main'&&options.method==='PATCH'){for(const e of pendingTree){const source=e.sha?[...files.values()].find(f=>f.sha===e.sha):null;files.set(packages.route(e.path),source?{...source}:{type:'file',encoding:'base64',sha:'generated-'+id++,content:Buffer.from(e.content).toString('base64')});}return response({});}
  if(route.startsWith('/contents/')){if(options.method==='PUT'){const f={type:'file',encoding:'base64',content:body.content,sha:'sha-'+id++};files.set(route,f);return response({content:f,commit:{sha:'commit-'+id}});}return files.has(route)?response(files.get(route)):response({},404);}
  if(route.startsWith('/issues/801/comments')){if(options.method==='POST'){const c={id:id++,body:body.body,user:{type:'Bot',login:'github-actions[bot]'}};comments.push(c);return response(c);}return response(comments);}
  if(route==='/issues/801'){if(options.method==='PATCH')Object.assign(issue,body);return response(issue);}throw Error('Unexpected route '+route);
 };
 Object.assign(process.env,{AGENTS_PACKAGE_LAYOUT:'unified',GITHUB_WORKSPACE:__dirname,GITHUB_REPOSITORY:'owner/repo',GITHUB_TOKEN:'mock',GITHUB_EVENT_NAME:'issue_comment',GITHUB_EVENT_PATH:path.join(temp,'event.json')});
 const run=async()=>{fs.writeFileSync(process.env.GITHUB_EVENT_PATH,JSON.stringify({action:'created',issue,comment:eventComment}));await main();};
 try{
  await run();assert(files.has(stateRoute));assert(files.has(packages.route(packages.packagePath(801)+'/trigger.json')));assert(files.has(packages.route(packages.packagePath(801)+'/runtime/tasks.json')));
  assert(![...files.keys()].some(p=>p.includes('issue-runs')||p.includes('issue-workspaces')));
  reply('{"operation":"create","path":"runtime/scripts/test.js","value":"console.log(42)"}');await run();assert(files.has(packages.route(packages.packagePath(801)+'/runtime/scripts/test.js')));
  reply('{"operation":"create","path":"records/state.json","value":"bad"}');await run();assert(comments.at(-1).body.includes('workflow-managed'));assert.equal(stored().request,1);
  eventComment=reply('{"operation":"run_script","task":"test","args":[]}','outsider');const count=files.size;await run();assert.equal(files.size,count);eventComment=undefined;
  // Enter the existing report step with its published expected inputs.
  const r=stored();r.state.render=13;r.request=2;renderIssue(r,801);r.state.renderedRequests.push(2);files.get(stateRoute).content=Buffer.from(JSON.stringify(r)).toString('base64');
  const invocation={cwd:null,command_line_verbatim:null,tool:'test',invocation_verbatim:'{}',final_output_after_completion_of_tool_call:'mock result',unavailable_reason:null,new:false,filename:null,frombyte:null,tobyte:null,description:'Test run',intent:'Verify report command',operator:'test',specifiedOperatorByUser:null,chosenOperator:'test',outcome:'succeeded'};
  reply(JSON.stringify({operation:'submit_report',records:[null]}));await run();assert.equal(stored().state.render,13);assert.equal(stored().toolInvocations.length,0);
  reply(JSON.stringify({operation:'submit_report',records:[invocation]}));await run();assert.equal(stored().state.render,14);assert.equal(stored().toolInvocations.length,1);assert(files.has(packages.route(packages.reportPath(801))));
  assert(comments.some(c=>c.body.includes('Package operation result')));
  // Loading a legacy record initializes canonical state without deleting the legacy source.
  const legacy=packages.route(packages.BASE+'/issue-runs/801.json');files.set(legacy,{...files.get(stateRoute)});files.delete(stateRoute);await run();assert(files.has(stateRoute));assert(files.has(legacy));
  reply('${changeList}: []');await run();assert(stored().done);assert.equal(issue.state,'closed');
 }finally{global.fetch=oldFetch;process.env=oldEnv;fs.rmSync(temp,{recursive:true,force:true});}
}
test().catch(e=>{console.error(e);process.exitCode=1;});
