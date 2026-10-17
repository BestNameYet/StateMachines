const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {main}=require('./issue-workflow.js');
const {validateGeminiResponse,buildGeminiRequest,validateGeminiScreen,generateGeminiScreen,acceptGeminiValues}=require('./gemini-workflow.js');
const {lastGeminiScreen}=require('./render-gemini.js');

async function test() {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gemini-issue-'));
  const oldFetch=global.fetch, oldEnv={...process.env};
  const issue={number:700,title:'AGENTS Procedure',created_at:'2026-10-17T00:00:00Z',state:'open',body:'### Procedure acknowledgement\n- [x] I agree'};
  const comments=[], requests=[], documents=new Map();
  let nextId=1, geminiCalls=0, failGemini=false, badFirst=true, completeNext=false;
  const reply=body=>{comments.push({id:nextId++,user:{type:'User'},body});};
  const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
  global.fetch=async(url,options={})=>{
    const body=options.body?JSON.parse(options.body):null;
    if(url.startsWith('https://generativelanguage.googleapis.com/')) {
      geminiCalls++;
      assert.equal(options.headers['x-goog-api-key'],'test-key');
      const request=JSON.parse(body.contents[0].parts[0].text);requests.push(request);
      assert.equal(body.contents[0].role,'user');
      assert(Array.isArray(request.state.variables));
      assert(request.instructions.screenWritingGuidelines.includes('{$variableName}'));
      if(failGemini)return response({},503);
      const control={target:{outcome:'Product returned',process:'Calculate and submit'},current:{outcome:'Recorded values assessed',process:'Recorded actions assessed'},gap:completeNext?{outcome:[],process:[]}:{outcome:['Confirm the requested product'],process:[]},mode:completeNext?'completion':'continue'};
      const screen=completeNext?{control}:badFirst?(badFirst=false,{instruction:'Bad format'}):{
        control,
        instruction:'Calculate twelve times five. Return the product as {$total}.',
        expectedInputs:[{name:'total',schema:{type:'integer'}}]
      };
      return response({candidates:[{content:{parts:[{text:JSON.stringify(screen)}]}}]});
    }
    const route=url.split('/repos/test/repo')[1];
    if(route.startsWith('/contents/')) {
      if(options.method==='PUT') {documents.set(route,{content:body.content,sha:'sha-'+nextId});return response({content:{sha:'sha-'+nextId}});}
      return documents.has(route)?response(documents.get(route)):response({},404);
    }
    if(route.startsWith('/issues/700/comments')) {
      if(options.method==='POST'){const c={id:nextId++,user:{type:'Bot'},body:body.body};comments.push(c);return response(c);}
      return response(comments);
    }
    if(route==='/issues/700') {if(options.method==='PATCH')Object.assign(issue,body);return response(issue);}
    throw Error('Unexpected mock route '+url);
  };
  process.env.GITHUB_WORKSPACE=__dirname;
  process.env.GITHUB_REPOSITORY='test/repo';
  process.env.GITHUB_TOKEN='test';
  process.env.GEMINI_API_KEY='test-key';
  process.env.GITHUB_EVENT_NAME='issue_comment';
  process.env.GITHUB_EVENT_PATH=path.join(dir,'event.json');
  const run=async()=>{fs.writeFileSync(process.env.GITHUB_EVENT_PATH,JSON.stringify({action:'created',issue}));await main();};
  const saved=()=>JSON.parse(Buffer.from([...documents.values()][0].content,'base64').toString());
  try {
    await run();
    assert(comments.at(-1).body.includes('procedureMode'));
    assert(!comments.at(-1).body.includes('Captured values'));
    reply('state');await run();
    assert.equal(saved().state.render,24);assert.equal(saved().request,1);
    reply('back');await run();
    assert.equal(saved().request,1);assert.equal(geminiCalls,0);
    reply('{$procedureMode}: "gemini"');await run();
    reply('{$verbatimUserPrompt}: "Calculate twelve times five."');await run();
    let record=saved();
    assert.equal(geminiCalls,2);
    assert(requests[1].correction.validationError.includes('control'));
    assert.equal(record.state.renderedScreens.length,3);
    assert.equal(record.state.controls.length,1);
    assert.equal(record.state.render,2);
    assert(comments.at(-1).body.includes('Return the product as {$total}.'));
    assert(!comments.at(-1).body.includes('"schema"'));
    assert(!comments.at(-1).body.includes('"control"'));
    const contract=structuredClone(lastGeminiScreen(record.state).expectedInputs);
    reply('state');await run();
    assert(comments.at(-1).body.includes('## State'));
    assert.equal(geminiCalls,2);
    const before=saved().state.variables;
    reply('{"total":"60"}');await run();
    assert.deepEqual(saved().state.variables,before);
    assert.equal(geminiCalls,2);
    assert(comments.at(-1).body.includes('Return rejected'));
    failGemini=true;
    reply('{"total":60}');await run();
    record=saved();
    assert.equal(record.geminiPending,true);
    assert.equal(record.state.variables.at(-1).value,60);
    assert.equal(record.state.renderedScreens.length,3);
    assert(comments.at(-1).body.includes('accepted values remain saved'));
    reply('back');await run();
    assert.equal(geminiCalls,3);
    assert(comments.at(-1).body.includes('Return the product as {$total}.'));
    assert.deepEqual(lastGeminiScreen(saved().state).expectedInputs,contract);
    failGemini=false;
    reply('retry');await run();
    assert.equal(geminiCalls,4);
    record=saved();
    assert.equal(record.state.renderedScreens.length,4);
    assert.equal(record.geminiPending,false);
    assert.equal(requests.at(-1).state.variables.at(-1).value,60);
    assert.equal(requests.at(-1).state.renderedScreens[2].instruction,'Calculate twelve times five. Return the product as {$total}.');
    reply('{$total}: 60');await run();
    assert.equal(saved().state.variables.filter(v=>v.name==='total').length,2);
    for(const schema of [{type:'number'},{type:'string',pattern:'x'},{type:'array'},{type:'object',properties:{},required:['unknown']}]) {
      assert.throws(()=>validateGeminiScreen({instruction:'Return {$x}.',expectedInputs:[{name:'x',schema}]}));
    }
    assert.throws(()=>validateGeminiScreen({instruction:'No requested input',expectedInputs:[]}));
    assert.equal(typeof buildGeminiRequest(record.state).instructions,'object');
    const exhausted={...structuredClone(record),geminiPending:true};
    const exhaustedBefore=structuredClone(exhausted);
    let attempts=0;
    await assert.rejects(()=>generateGeminiScreen(exhausted,async()=>{throw Error('must not save');},{generate:async()=>{attempts++;return '{}';}}),/format rejected/);
    assert.equal(attempts,3);assert.deepEqual(exhausted,exhaustedBefore);
    const multi={state:{variables:[],renderedScreens:[{instruction:'Return {$items} and {$confirmed}.',expectedInputs:[
      {name:'items',schema:{type:'array',items:{type:'object',properties:{count:{type:'integer'}},required:['count'],additionalProperties:false}}},
      {name:'confirmed',schema:{type:'boolean'}}
    ]}],render:0},request:1,history:[],newFiles:[]};
    const multiBefore=structuredClone(multi);
    assert.throws(()=>acceptGeminiValues(multi,{items:[{count:1,extra:true}],confirmed:true},__dirname));
    assert.deepEqual(multi,multiBefore);
    acceptGeminiValues(multi,{items:[{count:1}],confirmed:true},__dirname);
    assert.deepEqual(multi.state.variables,[{name:'items',value:[{count:1}]},{name:'confirmed',value:true}]);
    const validControl={target:{outcome:'Return product',process:'Calculate and submit'},current:{outcome:'60 returned',process:'Calculation submitted'},gap:{outcome:[],process:[]},mode:'completion'};
    assert.equal(validateGeminiResponse({control:validControl}).screen,null);
    for(const control of [
      {...validControl,mode:'continue'},
      {...validControl,gap:{outcome:[],process:['Wrong operator used']}},
      {...validControl,current:{outcome:'',process:'Submitted'}},
      {...validControl,mode:'unknown'}
    ])assert.throws(()=>validateGeminiResponse({control}));
    assert.throws(()=>validateGeminiResponse({control:validControl,instruction:'Unwanted screen',expectedInputs:[]}));
    const failedSave={...structuredClone(record),geminiPending:true};
    const beforeFailedSave=structuredClone(failedSave);
    await assert.rejects(()=>generateGeminiScreen(failedSave,async()=>{throw Error('save failed');},{generate:async()=>({control:validControl})}),/save failed/);
    assert.deepEqual(failedSave,beforeFailedSave);
    const beforeCompletion=saved();
    completeNext=true;
    reply('{$total}: 60');await run();
    const completed=saved();
    assert.equal(completed.done,true);
    assert.equal(completed.geminiPending,false);
    assert.equal(completed.state.renderedScreens.length,beforeCompletion.state.renderedScreens.length);
    assert.equal(completed.state.controls.length,beforeCompletion.state.controls.length+1);
    assert.equal(completed.state.controls.at(-1).mode,'completion');
    assert.equal(requests.at(-1).state.controls.length,beforeCompletion.state.controls.length);
    assert.equal(issue.state,'closed');
    assert(comments.at(-1).body.includes('Procedure complete'));
    assert(!comments.at(-1).body.includes('### Menu'));
    const callsAtCompletion=geminiCalls;
    reply('retry');await run();
    assert.equal(geminiCalls,callsAtCompletion);
    console.log('End-to-end mocked GitHub/Gemini: mode selection, format correction, direct comments, schema rejection, saved values, navigation, API recovery, full-state replay, append-only variables, control history, completion consistency, rollback, and issue closure passed.');
  } finally {
    global.fetch=oldFetch;
    for(const key of Object.keys(process.env))if(!Object.hasOwn(oldEnv,key))delete process.env[key];
    Object.assign(process.env,oldEnv);
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
test().catch(e=>{console.error(e);process.exitCode=1;});
