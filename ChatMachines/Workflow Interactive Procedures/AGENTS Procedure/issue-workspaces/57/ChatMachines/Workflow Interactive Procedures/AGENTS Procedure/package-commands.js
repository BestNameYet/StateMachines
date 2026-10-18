const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {packagePath,route}=require('./run-package.js');
const {runTask}=require('./runtime/runner.js');
const {migratePackages}=require('./package-migration.js');
function parsePackageCommand(body){
 let value;try{value=JSON.parse(body.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/,'$1'));}catch{return null;}
 if(!['run_script','migrate_packages','submit_report'].includes(value?.operation))return null;
 const keys={run_script:['operation','task','args'],migrate_packages:['operation'],submit_report:['operation','records']}[value.operation];
 if(!value||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))throw Error('Invalid '+value.operation+' fields.');
 if(value.operation==='submit_report'&&!Array.isArray(value.records))throw Error('records must be an array.');
 if(value.operation==='run_script'&&(typeof value.task!=='string'||!Array.isArray(value.args)||value.args.some(v=>typeof v!=='string')))throw Error('run_script needs task and string args.');
 return value;
}
async function materialize(api,n,directory){
 let bytes=0,count=0;
 async function walk(relative){
  const entries=await api('GET',route(packagePath(n)+'/'+relative),undefined,true);
  if(entries===null)return;if(!Array.isArray(entries))throw Error('Expected a package directory.');
  for(const e of entries){
   if(relative==='runtime'&&e.name==='results')continue;
   if(typeof e.name!=='string'||!e.name||e.name.includes('/')||e.name==='.'||e.name==='..'||e.name.includes('\\'))throw Error('Invalid runtime file name.');
   const next=relative+'/'+e.name;
   if(e.type==='dir'){await walk(next);continue;}if(e.type!=='file')throw Error('Only regular runtime files are allowed.');
   if(++count>2000)throw Error('Runtime snapshot exceeds 2000 files.');
   const blob=await api('GET','/git/blobs/'+e.sha);const content=Buffer.from(blob.content,'base64');bytes+=content.length;if(bytes>64*1024*1024)throw Error('Runtime snapshot exceeds 64 MiB.');
   const target=path.join(directory,next);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o755});fs.writeFileSync(target,content,{mode:relative.startsWith('files')?0o666:0o644});
   if(relative.startsWith('files')){fs.chmodSync(target,0o666);let dir=path.dirname(target);while(dir.startsWith(path.join(directory,'files'))){fs.chmodSync(dir,0o777);if(dir===path.join(directory,'files'))break;dir=path.dirname(dir);}}
  }
 }
 for(const relative of ['files','runtime']){fs.mkdirSync(path.join(directory,relative),{recursive:true});await walk(relative);}
 // The container user may create work products only in the disposable files snapshot.
 fs.chmodSync(path.join(directory,'files'),0o777);
}
async function executePackageCommand(command,record,api,{executeTask=runTask}={}){
 if(command.operation==='migrate_packages')return migratePackages(api);
 if(command.operation==='run_script'){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'wip-runtime-'));
  try{await materialize(api,record.issueNumber,directory);return await executeTask(directory,command.task,command.args);}
  finally{fs.rmSync(directory,{recursive:true,force:true});}
 }
 throw Error('submit_report is handled by the existing procedure validator.');
}
module.exports={parsePackageCommand,materialize,executePackageCommand};
