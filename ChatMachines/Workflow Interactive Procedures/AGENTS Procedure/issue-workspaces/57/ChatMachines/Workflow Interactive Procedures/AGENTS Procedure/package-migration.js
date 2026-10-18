const {BASE,packagePath,statePath,scopedPath}=require('./run-package.js');
function migrationPlan(entries,bindings){
 for(const e of entries)if(e.mode==='120000'&&[BASE+'/issue-runs/',BASE+'/issue-workspaces/',BASE+'/issue-run-triggers/'].some(prefix=>e.path.startsWith(prefix)))throw Error('Legacy package contains a symlink: '+e.path);
 const sources=entries.filter(e=>e.type==='blob'&&e.mode!=='120000');const existing=new Map(sources.map(e=>[e.path,e]));const mapped=[];
 for(const e of sources){
  let destination=null;let m=e.path.match(new RegExp('^'+BASE+'/issue-runs/(\\d+)(-tool-invocations)?\\.json$'));
  if(m)destination=packagePath(Number(m[1]))+'/records/'+(m[2]?'tool-invocations.json':'state.json');
  m=e.path.match(new RegExp('^'+BASE+'/issue-workspaces/(\\d+)/(.*)$'));
  if(m)destination=packagePath(Number(m[1]))+'/files/'+m[2];
  const binding=bindings.find(b=>b.path===e.path);if(binding)destination=packagePath(binding.issueNumber)+'/trigger.json';
  if(!destination)continue;scopedPath(destination);
  if(mapped.some(p=>p.path===destination&&p.sha!==e.sha))throw Error('Conflicting package bindings: '+destination);
  const current=existing.get(destination);
  if(current&&current.sha!==e.sha){
   // Existing canonical state/report/trigger is newer; never replace it from legacy data.
   if(destination.includes('/records/')||destination.endsWith('/trigger.json')){mapped.push({source:e.path,path:destination,sha:current.sha,legacySha:e.sha,status:'canonical-preserved'});continue;}
   throw Error('Conflicting destination: '+destination);
  }
  mapped.push({source:e.path,path:destination,sha:e.sha,mode:e.mode,status:current?'unchanged':'copy'});
 }
 return mapped;
}
async function migratePackages(api,{onlyIssue=null}={}){
 const ref=await api('GET','/git/ref/heads/main');const head=await api('GET','/git/commits/'+ref.object.sha);
 const tree=await api('GET','/git/trees/'+head.tree.sha+'?recursive=1');if(tree.truncated)throw Error('Truncated tree; migration not performed.');
 const bindings=[];
 for(const e of tree.tree.filter(e=>e.type==='blob'&&e.mode!=='120000'&&e.path.startsWith(BASE+'/issue-run-triggers/')&&e.path.endsWith('.json')&&!e.path.endsWith('.schema.json'))){
  const blob=await api('GET','/git/blobs/'+e.sha);const trigger=JSON.parse(Buffer.from(blob.content,'base64').toString('utf8'));
  if(Number.isSafeInteger(trigger.procedureIssueNumber)&&trigger.procedureIssueNumber>0)bindings.push({path:e.path,issueNumber:trigger.procedureIssueNumber});
 }
 const plan=migrationPlan(tree.tree,bindings).filter(p=>onlyIssue===null||p.path.startsWith(packagePath(onlyIssue)+'/')),copies=plan.filter(p=>p.status==='copy');
 const existing=new Set(tree.tree.map(e=>e.path)),destinations=new Set(plan.map(p=>p.path)),initializers=[];
 for(const number of new Set(plan.map(p=>Number(p.path.match(/procedures\/(\d+)/)[1])))){
  const root=packagePath(number);
  for(const [target,content] of [
   [root+'/runtime/tasks.json','{}\n'],
   [root+'/trigger.json',JSON.stringify({startProcedure:false,source:'issue',procedureIssueNumber:number,procedureReceiptPath:statePath(number)},null,2)+'\n']
  ])if(!existing.has(target)&&!destinations.has(target))initializers.push({path:target,mode:'100644',type:'blob',content});
  if(![...existing,...destinations].some(p=>p.startsWith(root+'/files/')))initializers.push({path:root+'/files/.gitkeep',mode:'100644',type:'blob',content:''});
 }
 if(!copies.length&&!initializers.length)return {status:'unchanged',plan,initialized:[]};
 const created=await api('POST','/git/trees',{base_tree:head.tree.sha,tree:[...copies.map(p=>({path:p.path,mode:p.mode,type:'blob',sha:p.sha})),...initializers]});
 const commit=await api('POST','/git/commits',{message:'Colocate WIP procedure triggers, records and workspaces',tree:created.sha,parents:[ref.object.sha]});
 await api('PATCH','/git/refs/heads/main',{sha:commit.sha,force:false});
 return {status:'copied',commit:commit.sha,plan,initialized:initializers.map(e=>e.path)};
}
module.exports={migrationPlan,migratePackages};
