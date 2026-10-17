'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {validateRequest,loadRequest,executeSteps}=require('./run.cjs');
const base={url:'https://example.com',steps:[]};
test('validates HTTP requests and supplies the default timeout',()=>{
  assert.equal(validateRequest(base).timeout_ms,10000);
  assert.throws(()=>validateRequest({...base,url:'file:///etc/passwd'}),/HTTP/);
  assert.throws(()=>validateRequest({...base,timeout_ms:0}),/timeout_ms/);
  assert.throws(()=>validateRequest({...base,steps:[{action:'execute_arbitrary_code'}]}),/Unknown action/);
  assert.throws(()=>validateRequest({...base,steps:Array(101).fill({action:'screenshot'})}),/at most 100/);
});
test('rejects invalid selectors, field values, and screenshot paths',()=>{
  for(const step of [{action:'click'},{action:'type',selector:'#x'},{action:'screenshot',name:'../../outside'},{action:'read_attribute',selector:'#x'},{action:'press_key',selector:'#x',key:'invalid key'}]){
    assert.throws(()=>validateRequest({...base,steps:[step]}));
  }
});
test('loads dispatch objects without evaluating them as code',()=>{
  const request={...base,steps:[{action:'type',selector:'#x',text:'$(echo no)'}]};
  const read=()=>JSON.stringify({client_payload:{request}});
  assert.equal(loadRequest({GITHUB_EVENT_PATH:'event.json',GITHUB_EVENT_NAME:'repository_dispatch'},read).steps[0].text,'$(echo no)');
  assert.throws(()=>loadRequest({GITHUB_EVENT_PATH:'event.json',GITHUB_EVENT_NAME:'repository_dispatch'},()=>JSON.stringify({})),/client_payload.request/);
});
test('supports manual dispatch and direct input, with default request fallback',()=>{
  const event=JSON.stringify({inputs:{request_json:JSON.stringify(base)}});
  assert.equal(loadRequest({GITHUB_EVENT_PATH:'event',GITHUB_EVENT_NAME:'workflow_dispatch'},()=>event).url,base.url);
  assert.equal(loadRequest({REQUEST_JSON:JSON.stringify(base)},()=>{throw new Error('must not read files');}).url,base.url);
  assert.equal(loadRequest({},()=>JSON.stringify(base)).url,base.url);
});
function fakeBrowser(){
  const calls=[];let text='';
  const control={click:async()=>{calls.push('native-click');text='Hello, Kit!';},clear:async()=>{calls.push('clear');text='';},sendKeys:async value=>{calls.push(['keys',value]);text+=value;},getText:async()=>text,getAttribute:async name=>'attribute:'+name};
  const api={By:{css:value=>value},Key:{ENTER:'ENTER_VALUE'},until:{elementLocated:()=>control,elementIsVisible:()=>true,elementIsEnabled:()=>true}};
  const driver={get:async url=>calls.push(['navigate',url]),wait:async condition=>{if(typeof condition==='function'){if(!await condition())throw new Error('assertion timeout');return true;}return condition;},takeScreenshot:async()=>Buffer.from('test image').toString('base64')};
  return {calls,control,api,driver};
}
test('runs native element actions, reads text, and writes named screenshots',async()=>{
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'selenium-test-'));
  try{
    const {calls,api,driver}=fakeBrowser();const report={steps:[]};
    const request=validateRequest({...base,steps:[{action:'type',selector:'#name',text:'Kit'},{action:'click',selector:'#greet'},{action:'assert_text',selector:'#greeting',text:'Hello, Kit!'},{action:'read_text',selector:'#greeting'},{action:'read_attribute',selector:'#greeting',attribute:'id'},{action:'press_key',selector:'#name',key:'ENTER'},{action:'screenshot',name:'proof'}]});
    await executeSteps(driver,request,api,out,report);
    assert(calls.includes('native-click'));assert.deepEqual(calls[2],['keys','Kit']);
    assert.equal(report.steps[3].result,'Hello, Kit!');assert.equal(report.steps[4].result,'attribute:id');
    assert.equal(fs.readFileSync(path.join(out,'007-proof.png'),'utf8'),'test image');
    assert(report.steps.every(s=>s.status==='PASS'));
    assert.equal(JSON.stringify(report).includes('"text":"Kit"'),false);
  }finally{fs.rmSync(out,{recursive:true,force:true});}
});
test('failed assertions stop subsequent actions and record the failure',async()=>{
  const {calls,api,driver}=fakeBrowser();const report={steps:[]};
  const request=validateRequest({...base,steps:[{action:'assert_text',selector:'#greeting',text:'never matches'},{action:'click',selector:'#greet'}]});
  await assert.rejects(executeSteps(driver,request,api,os.tmpdir(),report),/assertion timeout/);
  assert.equal(report.steps.length,1);assert.equal(report.steps[0].status,'FAIL');assert(!calls.includes('native-click'));
});
test('invalid requests fail the CLI and still produce a result artifact',()=>{
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'selenium-cli-'));
  try{
    const proc=spawnSync(process.execPath,[path.join(__dirname,'run.cjs')],{env:{...process.env,REQUEST_JSON:'{invalid',SELENIUM_OUTPUT_DIR:out},encoding:'utf8'});
    assert.equal(proc.status,1);
    const report=JSON.parse(fs.readFileSync(path.join(out,'result.json'),'utf8'));
    assert.equal(report.status,'FAIL');assert.equal(report.steps.length,0);assert(report.error.message);
  }finally{fs.rmSync(out,{recursive:true,force:true});}
});
