const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {specification,runTask}=require('./runner.js');
async function test(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'runtime-check-'));fs.mkdirSync(path.join(root,'runtime/scripts'),{recursive:true});
 fs.writeFileSync(path.join(root,'runtime/scripts/test.js'),'console.log(42)');
 const save=task=>fs.writeFileSync(path.join(root,'runtime/tasks.json'),JSON.stringify({test:task}));
 const task={engine:'node',script:'scripts/test.js',timeoutSeconds:2};save(task);
 try{
  const spec=specification(root,'test',['a;echo unsafe']);assert(spec.docker.includes('none'));assert(spec.docker.includes('65534:65534'));assert(spec.docker.includes('--read-only'));assert(spec.docker.includes('ALL'));assert(!spec.docker.some(x=>x.includes('/records')));assert.equal(spec.docker.at(-1),'a;echo unsafe');
  for(const bad of [{...task,script:'../secret'},{...task,timeoutSeconds:301},{...task,engine:'shell'},{...task,image:'untrusted'},{...task,script:'scripts/missing.js'}]){save(bad);assert.throws(()=>specification(root,'test'));}save(task);
  assert.throws(()=>specification(root,'missing'));assert.throws(()=>specification(root,'test',['bad\0arg']));
  fs.symlinkSync('/etc/passwd',path.join(root,'runtime/scripts/link.js'));save({...task,script:'scripts/link.js'});assert.throws(()=>specification(root,'test'));save(task);
  const calls=[];process.env.RUNTIME_TEST_SECRET='must-not-pass';
  let r=await runTask(root,'test',[],async(binary,args,options)=>{calls.push({binary,args,options});assert.equal(options.env.RUNTIME_TEST_SECRET,undefined);assert.equal(options.env.GITHUB_TOKEN,undefined);return {error:null,stdout:'42\n',stderr:''};});
  assert.equal(r.status,'succeeded');assert.equal(r.exitCode,0);assert.equal(calls.length,2);assert.equal(calls[1].args[0],'rm');
  r=await runTask(root,'test',[],async(binary,args)=>args[0]==='run'?{error:{code:2,message:'test failed'},stdout:'',stderr:'failure'}:{error:null,stdout:'',stderr:''});assert.equal(r.status,'failed');assert.equal(r.exitCode,2);
  r=await runTask(root,'test',[],async(binary,args)=>args[0]==='run'?{error:{killed:true,message:'timeout'},stdout:'',stderr:''}:{error:null,stdout:'',stderr:''});assert(r.timedOut);assert.equal(r.exitCode,null);
 }finally{delete process.env.RUNTIME_TEST_SECRET;fs.rmSync(root,{recursive:true,force:true});}
 console.log('Runtime registration, traversal/symlink rejection, fixed images, argument boundaries, no credentials/records/network, cleanup, exit codes and timeouts passed (mock Docker).');
}
test().catch(e=>{console.error(e);process.exitCode=1;});
