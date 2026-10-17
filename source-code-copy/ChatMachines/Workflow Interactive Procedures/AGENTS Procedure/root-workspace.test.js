const assert=require('node:assert/strict');
const {rootStorage,rootWorkspaceRequested}=require('./root-workspace.js');
const {initializeWorkspace,executeCommands,validateCommands}=require('./supervisor-tools.js');
async function test(){
 assert(rootWorkspaceRequested({body:'### Workspace access\nrepository-root\n'}));assert(!rootWorkspaceRequested({body:'default'}));
 const entries=[{path:'src/main.js',type:'blob',mode:'100755',sha:'source-blob'},{path:'workflow.yaml',type:'blob',mode:'100644',sha:'yaml-blob'}];
 const writes=[],docs=new Map();let copyTree;
 const api=async(method,route,body)=>{
  if(route.startsWith('/contents/')){if(method==='PUT'){docs.set(route,body.content);return {content:{sha:'metadata'}};}return docs.has(route)?{type:'file',content:docs.get(route),sha:'metadata',encoding:'base64'}:null;}
  if(route==='/git/ref/heads/main')return {object:{sha:'head'}};
  if(route==='/git/commits/head')return {tree:{sha:'tree'}};
  if(route.startsWith('/git/trees/')&&method==='GET')return {tree:entries,truncated:false};
  if(route==='/git/trees'&&method==='POST'){copyTree=body;return {sha:'copied-tree'};}
  if(route==='/git/commits'&&method==='POST')return {sha:'copied-commit'};
  if(route==='/git/refs/heads/main'&&method==='PATCH'){writes.push(body);return {};}
  throw Error('Unexpected route '+method+' '+route);
 };
 const storage=rootStorage(api,55);const record={issueNumber:55,request:1,state:{workspace:{path:'.'},controls:[]}};
 await initializeWorkspace(record,storage);
 assert(storage.manifestPath.includes('issue-workspaces/55/manifest.json'));assert(!docs.has('/contents/manifest.json'));
 const command={name:'copy_files',files:[{source:'src/main.js',path:'source-code-copy/src/main.js',description:'Preserved JavaScript source'},{source:'workflow.yaml',path:'source-code-copy/workflow.yaml',description:'Preserved workflow'}]};
 validateCommands([command]);await executeCommands(record,[command],storage,async()=>{});
 assert.equal(copyTree.base_tree,'tree');assert.equal(copyTree.tree[0].sha,'source-blob');assert.equal(copyTree.tree[0].mode,'100755');assert.equal(writes[0].force,false);
 assert.equal(record.state.commandResults[0].result.files[0].commit,'copied-commit');
 entries.push(...copyTree.tree);await storage.copyFiles(command.files);assert.equal(writes.length,1);
 await assert.rejects(()=>storage.copyFiles([{source:'missing',path:'copy/missing'}]),/regular repository file/);
 assert.throws(()=>validateCommands([{name:'copy_files',files:[{source:'a.js',path:'../escape',description:'bad'}]}]));
 console.log('Explicit root access, isolated metadata, preserved blobs/modes, idempotent copies and missing-source rejection passed.');
}
test().catch(e=>{console.error(e);process.exitCode=1;});
