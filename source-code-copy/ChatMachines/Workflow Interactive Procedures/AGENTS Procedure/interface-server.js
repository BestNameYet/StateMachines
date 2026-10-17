const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {compileTransitionMap,applyValidatedValues} = require('./transitions.js');
const renderer = require('./render-instructions.js');
const {inputsFor,validate} = require('./validator.js');
const {startRun,setExpectedInputs,applyReturn}=require('./issue-workflow.js');
const {registerWorker,requestWorkerInstruction,generateGeminiScreen}=require('./gemini-workflow.js');
const {lastGeminiScreen,renderGeminiScreen}=require('./render-gemini.js');
const config = JSON.parse(fs.readFileSync(path.join(__dirname,'config.json'),'utf8'));
const map = compileTransitionMap(JSON.parse(fs.readFileSync(path.join(__dirname,config.transitions),'utf8')));
const screens = renderer.loadScreens();
const inputs = screens.map(inputsFor);
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname,'fixture-manifest.json'),'utf8'));
const sessions = new Map();
function send(res,status,value) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}
function view(session) {
  setExpectedInputs(session);
  let screenInputs=inputs[session.state.render-1] || [];
  let entries=renderer.entriesForState(session.state,screens,session.toolInvocations || []);
  if(session.geminiStarted) {
    const screen=lastGeminiScreen(session.state);
    entries=[['instruction',renderGeminiScreen(screen)]];
    screenInputs=screen.assignments?[{name:'nonce',schema:{type:'string'}},{name:'assignmentId',schema:{type:'string'}},{name:'values',schema:{type:'object',properties:{},required:[],additionalProperties:true}}]:screen.expectedInputs;
  }
  if(!session.state.renderedRequests.includes(session.request)) {
    session.state.renderedRequests.push(session.request);
    if(session.state.procedureMode==='gemini'&&!session.geminiStarted&&session.state.render===1) {
      session.state.renderedScreens.push({instruction:Object.fromEntries(screens[0]).instruction,expectedInputs:inputs[0]});
    }
  }
  if(session.done){entries=[['completion',session.state.stopReason==='stalled'?'Procedure stopped: three consecutive turns without gap reduction. The objective is incomplete.':'Procedure complete.']];screenInputs=[];}
  if(session.view==='state')entries=[['state',session.state]];
  const properties=Object.fromEntries(screenInputs.map(x=>['$'+x.name,x.schema]));
  return {id:session.id,render:session.state.render,done:session.done,entries,inputs:screenInputs,returnSchema:{type:'object',properties,required:Object.keys(properties),additionalProperties:false},state:session.state,newFiles:session.newFiles,fixture,history:session.history};
}
async function body(req) {let text='';for await(const chunk of req){text+=chunk;if(text.length>2000000)throw Error('Submission too large.');}return JSON.parse(text || '{}');}
async function handleSubmit(session,data) {
  if(data.command?.startsWith('register ')){const a=data.command.trim().split(/\s+/);registerWorker(session,a[1],a[2]);return view(session);}
  if(data.command?.startsWith('next ')){requestWorkerInstruction(session,data.command.slice(5).trim());await generateGeminiScreen(session,async()=>{});return view(session);}
  if(data.command!==undefined) {
    if(!['state','back','retry'].includes(data.command))throw Error('Unknown menu command.');
    if(data.command==='retry'&&session.geminiPending)await generateGeminiScreen(session,async()=>{});
    else session.view=data.command==='state'?'state':'instruction';
    return view(session);
  }
  if(session.geminiStarted || (session.state.procedureMode==='gemini'&&session.state.render===1) || data.values?.$procedureMode==='gemini') {
    const values=data.values;
    if(!values || typeof values!=='object'||Array.isArray(values))throw Error('Values must be an object.');
    const normalized=Object.fromEntries(Object.entries(values).map(([k,v])=>{
      if(!k.startsWith('$'))throw Error('Input names must start with $.');
      return [k.slice(1),v];
    }));
    const keys=Object.keys(normalized);
    const payload=session.geminiStarted?{values:normalized}:keys.length===1?{variable:keys[0],value:normalized[keys[0]]}:{};
    applyReturn(session,payload,path.join(__dirname,fixture.root));
    if(session.geminiPending)await generateGeminiScreen(session,async()=>{});
    return view(session);
  }
  if (session.done) throw Error('This run has finished.');
  const values = data.values;
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw Error('Values must be an object.');
  const expected=inputs[session.state.render-1], keys=expected.map(x=>'$'+x.name);
  for(const key of Object.keys(values))if(!keys.includes(key))throw Error('Unexpected input: '+key);
  let newFiles=data.newFiles ?? session.newFiles;
  if(!Array.isArray(newFiles)||newFiles.some(x=>typeof x!=='string'))throw Error('New files must be an array of filenames.');
  const context={root:path.join(__dirname,fixture.root),newFiles};
  newFiles.forEach(x=>validate(x,{type:'string',format:'file-reference'},'newFiles',{...context,newFile:true}));
  for(const input of expected){const key='$'+input.name;if(!Object.hasOwn(values,key))throw Error('Missing input: '+key);validate(values[key],input.schema,key,input.name==='targetFiles'?{...context,newFiles:[]}:context);}
  if(Object.hasOwn(values,'$targetFiles'))newFiles=values.$targetFiles.filter(file=>file.newFile).map(file=>file.filename);
  const before=structuredClone(session.state), draft=structuredClone(session.state);
  const appliedValues={...values};
  delete appliedValues.$toolInvocations;
  applyValidatedValues(draft,JSON.stringify(appliedValues));
  const result=map(draft);
  if(Object.hasOwn(values,'$toolInvocations'))session.toolInvocations=[...(session.toolInvocations || []),...structuredClone(values.$toolInvocations)];
  session.history.push({render:before.render,loopNumber:before.loopNumber,values:structuredClone(values),state:structuredClone(draft)});
  session.state=result==='halt'?draft:result;session.newFiles=newFiles;session.done=result==='halt';session.request++;session.view='instruction';
  return view(session);
}
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(fs.readFileSync(path.join(__dirname,'interface.html')));}
    if(req.method==='POST'&&url.pathname==='/api/start'){
      const session={...startRun({}),id:crypto.randomUUID(),newFiles:[...fixture.newFiles]};
      sessions.set(session.id,session);return send(res,200,view(session));
    }
    if(req.method==='POST'&&url.pathname==='/api/submit'){
      const data=await body(req),session=sessions.get(data.id);if(!session)return send(res,404,{error:'Run not found.'});
      return send(res,200,await handleSubmit(session,data));
    }
    send(res,404,{error:'Not found.'});
  }catch(error){send(res,400,{error:error.message});}
});
if(require.main===module){const port=Number(process.env.PORT||3000);server.listen(port,'127.0.0.1',()=>console.log('AGENTS interface: http://127.0.0.1:'+server.address().port));}
module.exports={server,handleSubmit,inputs};

