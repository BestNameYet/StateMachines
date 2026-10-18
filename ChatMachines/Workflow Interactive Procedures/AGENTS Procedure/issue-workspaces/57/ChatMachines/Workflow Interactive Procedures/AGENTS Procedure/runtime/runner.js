const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const images={node:'node:22-bookworm-slim',python:'python:3.12-slim'};
function inside(root,relative){
 if(typeof relative!=='string'||!relative||relative.includes('\\')||path.isAbsolute(relative)||relative.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Script path must be relative.');
 let cursor=path.resolve(root);for(const part of relative.split('/')){cursor=path.join(cursor,part);if(fs.existsSync(cursor)&&fs.lstatSync(cursor).isSymbolicLink())throw Error('Runtime symlinks are not allowed.');}return cursor;
}
function specification(packageRoot,taskName,args=[]){
 if(typeof taskName!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(taskName)||!Array.isArray(args)||args.length>64||args.some(x=>typeof x!=='string'||x.length>4096||x.includes('\0')))throw Error('Invalid task or arguments.');
 const runtime=path.join(packageRoot,'runtime'),tasks=JSON.parse(fs.readFileSync(inside(runtime,'tasks.json'),'utf8'));
 const task=Object.hasOwn(tasks,taskName)?tasks[taskName]:null;
 if(!task||!Object.hasOwn(images,task.engine)||typeof task.script!=='string'||!task.script.startsWith('scripts/'))throw Error('Task must name a registered Node or Python script.');
 if(Object.keys(task).some(k=>!['engine','script','timeoutSeconds'].includes(k)))throw Error('Unknown task setting.');
 if(!fs.statSync(inside(runtime,task.script)).isFile())throw Error('Script not found.');
 const timeout=task.timeoutSeconds??60;if(!Number.isInteger(timeout)||timeout<1||timeout>300)throw Error('Timeout must be 1–300 seconds.');
 const files=path.join(packageRoot,'files');fs.mkdirSync(files,{recursive:true});
 if(fs.lstatSync(files).isSymbolicLink()||fs.lstatSync(runtime).isSymbolicLink())throw Error('Package directories cannot be symlinks.');
 const name='wip-task-'+crypto.randomUUID();
 const docker=['run','--rm','--name',name,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','64','--memory','512m','--cpus','1','--user','65534:65534','--tmpfs','/tmp:rw,noexec,nosuid,size=64m','--mount','type=bind,src='+path.resolve(files)+',dst=/work/files','--mount','type=bind,src='+path.resolve(runtime)+',dst=/work/runtime,readonly','--workdir','/work/files',images[task.engine],task.engine==='node'?'node':'python','/work/runtime/'+task.script,...args];
 return {name,docker,timeoutMs:timeout*1000,engine:task.engine,script:task.script};
}
function launch(binary,args,options){return new Promise(resolve=>execFile(binary,args,options,(error,stdout,stderr)=>resolve({error,stdout,stderr})));}
async function runTask(packageRoot,task,args=[],execute=launch){
 const spec=specification(packageRoot,task,args);const started=new Date().toISOString();
 const environment={PATH:process.env.PATH||'/usr/bin:/bin',HOME:'/tmp'};
 let response;
 try{response=await execute('docker',spec.docker,{timeout:spec.timeoutMs,maxBuffer:1024*1024,env:environment});}
 finally{await execute('docker',['rm','-f',spec.name],{timeout:10000,maxBuffer:65536,env:environment});}
 const error=response.error;
 return {task,args,engine:spec.engine,script:spec.script,started,finished:new Date().toISOString(),exitCode:error?(Number.isInteger(error.code)?error.code:null):0,status:error?'failed':'succeeded',timedOut:Boolean(error?.killed),outputLimited:error?.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER',stdout:response.stdout||'',stderr:response.stderr||'',...(error?{error:error.message}:{}),isolation:{network:'none',credentials:false,recordsMounted:false}};
}
module.exports={inside,specification,runTask};
