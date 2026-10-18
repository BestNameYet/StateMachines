const path=require('node:path');
const WIP='ChatMachines/Workflow Interactive Procedures';
const BASE=WIP+'/AGENTS Procedure';
const unified=()=>process.env.AGENTS_PACKAGE_LAYOUT!=='legacy';
function issueNumber(n){if(!Number.isSafeInteger(n)||n<1)throw Error('Invalid issue number.');return n;}
function packagePath(n){return BASE+'/procedures/'+issueNumber(n);}
function statePath(n){return unified()?packagePath(n)+'/records/state.json':BASE+'/issue-runs/'+issueNumber(n)+'.json';}
function reportPath(n){return unified()?packagePath(n)+'/records/tool-invocations.json':BASE+'/issue-runs/'+issueNumber(n)+'-tool-invocations.json';}
function filesPath(n){return unified()?packagePath(n)+'/files':BASE+'/issue-workspaces/'+issueNumber(n);}
function triggerPath(n,identifier){return unified()?packagePath(n)+'/trigger.json':BASE+'/issue-run-triggers/'+identifier+'.json';}
function scopedPath(value){
 if(typeof value!=='string'||value.includes('\\')||value.split('/').some(v=>!v||v==='.'||v==='..'||v==='.git')||!value.startsWith(WIP+'/'))throw Error('Path must stay inside WIP.');return value;
}
function workspaceFilePath(n,value,write=false){
 if(typeof value!=='string'||!value||value.includes('\\')||path.posix.isAbsolute(value)||value.split('/').some(v=>!v||v==='.'||v==='..'||v==='.git'))throw Error('Invalid package file path.');
 if(unified()&&(value==='records'||value.startsWith('records/'))){if(write)throw Error('Records are workflow-managed; use submit_report for reports.');return packagePath(n)+'/'+value;}
 if(unified()&&value.startsWith('runtime/results/')&&write)throw Error('Runtime results are workflow-managed.');
 if(unified()&&(value==='runtime'||value.startsWith('runtime/')))return packagePath(n)+'/'+value;
 return filesPath(n)+'/'+value;
}
const route=p=>'/contents/'+scopedPath(p).split('/').map(encodeURIComponent).join('/');
async function readJson(api,p){const f=await api('GET',route(p),undefined,true);if(!f)return null;let blob=f;if(!f.content||f.encoding==='none')blob=await api('GET','/git/blobs/'+f.sha);return {file:f,value:JSON.parse(Buffer.from(blob.content,'base64').toString('utf8'))};}
module.exports={WIP,BASE,unified,issueNumber,packagePath,statePath,reportPath,filesPath,triggerPath,workspaceFilePath,scopedPath,route,readJson};
