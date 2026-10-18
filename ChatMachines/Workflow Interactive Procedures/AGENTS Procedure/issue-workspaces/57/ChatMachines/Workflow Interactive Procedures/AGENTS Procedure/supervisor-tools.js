const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const workspaceBase='ChatMachines/Workflow Interactive Procedures/AGENTS Procedure/issue-workspaces/';
const commandMenu=[
 {name:'copy_files',description:'Copy existing source files byte-for-byte inside the configured workspace, preserving their Git blobs when repository-root access is enabled.',arguments:{files:[{source:'src/example.js',path:'source-code-copy/src/example.js',description:'Preserved source copy'}]},returns:'Source/destination paths and copied Git blob identities, or an error'},
 {name:'view_inventory',description:'Recursively list workspace file paths and descriptions.',arguments:{},returns:'{files:[{path,description}]} for every workspace file recursively'},
 {name:'read_files',description:'Read UTF-8 files inside this issue workspace.',arguments:{paths:['relative/path']},returns:'{files:[{path,content} or {path,error}]}'},
 {name:'write_files',description:'Create or replace workspace files, including JavaScript source and worker rules. Saves source without executing it.',arguments:{files:[{path:'relative/path',description:'Purpose of this file',content:'Full UTF-8 contents'}]},returns:'Saved file paths and descriptions, or an error'},
 {name:'set_standing_instructions',description:'Replace shared worker rules broadcast on screen A with every assignment render.',arguments:{instruction:'Full standing instructions'},returns:'{updated:true}, or an error'}
];
function relativePath(value){
 if(typeof value!=='string'||!value||value.includes('\\')||value.split('/').some(p=>!p||p==='.'||p==='..'||p==='.git')||path.posix.isAbsolute(value))throw Error('Use a file path inside the issue workspace.');
 if(value==='manifest.json')throw Error('manifest.json is maintained by the workflow.');
 return value;
}
function validateCommands(commands){
 if(!Array.isArray(commands)||!commands.length)throw Error('commands must be a nonempty array.');
 for(const c of commands){
  if(!c||!commandMenu.some(m=>m.name===c.name))throw Error('Unknown supervisor command.');
  const allowed={view_inventory:['name'],read_files:['name','paths'],write_files:['name','files'],copy_files:['name','files'],set_standing_instructions:['name','instruction']}[c.name];
  if(Object.keys(c).length!==allowed.length||allowed.some(k=>!Object.hasOwn(c,k)))throw Error('Invalid arguments for '+c.name);
  if(c.name==='copy_files'){if(!Array.isArray(c.files)||!c.files.length)throw Error('files must be nonempty.');const destinations=new Set();for(const f of c.files){relativePath(f.source);relativePath(f.path);if(f.source===f.path||destinations.has(f.path)||typeof f.description!=='string'||!f.description.trim()||Object.keys(f).sort().join(',')!=='description,path,source')throw Error('Each copy needs a distinct source, destination and description.');destinations.add(f.path);}}
  if(c.name==='read_files'){if(!Array.isArray(c.paths)||!c.paths.length)throw Error('paths must be nonempty.');c.paths.forEach(relativePath);}
  if(c.name==='write_files'){
   if(!Array.isArray(c.files)||!c.files.length)throw Error('files must be nonempty.');
   const names=new Set();
   for(const f of c.files){relativePath(f.path);if(names.has(f.path))throw Error('Duplicate file path.');names.add(f.path);if(Object.keys(f).sort().join(',')!=='content,description,path'||typeof f.content!=='string'||typeof f.description!=='string'||!f.description.trim())throw Error('Each file needs path, content and description.');}
  }
  if(c.name==='set_standing_instructions'&&(typeof c.instruction!=='string'||!c.instruction.trim()))throw Error('Standing instructions must be nonempty.');
 }
 return structuredClone(commands);
}
// Production supplies GitHub-backed storage; local adapter rejects symlinks.
function localStorage(root){
 const resolve=p=>{const full=path.resolve(root,p);if(!full.startsWith(path.resolve(root)+path.sep))throw Error('Outside workspace.');let cursor=path.resolve(root);for(const part of p.split('/')){cursor=path.join(cursor,part);if(fs.existsSync(cursor)&&fs.lstatSync(cursor).isSymbolicLink())throw Error('Symlinks are not supported.');}return full;};
 return {read:async p=>fs.existsSync(resolve(p))?fs.readFileSync(resolve(p),'utf8'):null,write:async(p,text)=>{const f=resolve(p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,text);},list:async()=>{const result=[];function walk(dir,prefix=''){if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.isSymbolicLink())continue;const p=prefix+e.name;if(e.isDirectory())walk(path.join(dir,e.name),p+'/');else result.push(p);}}walk(root);return result;}};
}
async function initializeWorkspace(record,storage){
 record.state.workers??=[];
 if(!record.state.workspace)record.state.workspace={path:require('./run-package.js').unified()&&Number.isSafeInteger(record.issueNumber)?require('./run-package.js').filesPath(record.issueNumber):workspaceBase+record.issueNumber,manifest:'manifest.json'};
 if(await storage.read(storage.manifestPath||'manifest.json')===null)await storage.write(storage.manifestPath||'manifest.json',JSON.stringify({files:[]},null,2)+'\n');
}
async function executeCommands(record,commands,storage,save,{actor={type:'supervisor'},requestId=null}={}){
 validateCommands(commands);
 for(const command of commands){
  const id=crypto.createHash('sha256').update(JSON.stringify([record.request,record.state.controls.length,actor,requestId,command])).digest('hex');
  if(record.state.commandResults?.some(r=>r.id===id))continue;
  let result;
  try{
   const manifest=JSON.parse(await storage.read(storage.manifestPath||'manifest.json')||'{"files":[]}');
   if(command.name==='view_inventory'){
    const files=(await storage.list()).filter(p=>p!==(storage.manifestPath||'manifest.json'));
    result={files:files.map(p=>({path:p,description:manifest.files.find(f=>f.path===p)?.description||''}))};
   }
   if(command.name==='copy_files'){if(!storage.copyFiles)throw Error('copy_files is supported by repository-root storage.');result={files:await storage.copyFiles(command.files)};for(const f of command.files){const entry={path:f.path,description:f.description};const i=manifest.files.findIndex(e=>e.path===f.path);if(i<0)manifest.files.push(entry);else manifest.files[i]=entry;}await storage.write(storage.manifestPath||'manifest.json',JSON.stringify(manifest,null,2)+'\n');}
   if(command.name==='read_files')result={files:await Promise.all(command.paths.map(async p=>{const content=await storage.read(p);return content===null?{path:p,error:'File not found'}:{path:p,content};}))};
   if(command.name==='write_files'){
    for(const f of command.files){await storage.write(f.path,f.content);const entry={path:f.path,description:f.description};const i=manifest.files.findIndex(x=>x.path===f.path);if(i<0)manifest.files.push(entry);else manifest.files[i]=entry;}
    await storage.write(storage.manifestPath||'manifest.json',JSON.stringify(manifest,null,2)+'\n');result={files:command.files.map(f=>({path:f.path,description:f.description}))};
   }
   if(command.name==='set_standing_instructions'){record.state.standingInstructions=command.instruction;result={updated:true};}
  }catch(error){result={error:error.message};}
  record.state.commandResults??=[];record.state.commandResults.push({id,actor:structuredClone(actor),requestId,command:structuredClone(command),result});await save();
 }
}
module.exports={commandMenu,relativePath,validateCommands,localStorage,initializeWorkspace,executeCommands,workspaceBase};

