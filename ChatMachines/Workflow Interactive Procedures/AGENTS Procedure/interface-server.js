const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {transition} = require('./transitions.js');
const renderer = require('./render-instructions.js');
const {inputsFor,validate} = require('./validator.js');
const config = JSON.parse(fs.readFileSync(path.join(__dirname,'config.json'),'utf8'));
const transitionMap = JSON.parse(fs.readFileSync(path.join(__dirname,config.transitions),'utf8'));
const screens = renderer.loadScreens();
const inputs = screens.map(inputsFor);
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname,'fixture-manifest.json'),'utf8'));
const sessions = new Map();
function readState() {return JSON.parse(fs.readFileSync(path.join(__dirname,config.state),'utf8'));}
function send(res,status,value) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}
function view(session) {
  const entries = screens[session.state.render-1] || [];
  const properties = Object.fromEntries((inputs[session.state.render-1] || []).map(x=>['$'+x.name,x.schema]));
  return {id:session.id,render:session.state.render,done:session.done,entries,inputs:inputs[session.state.render-1] || [],returnSchema:{type:'object',properties,required:Object.keys(properties),additionalProperties:false},state:session.state,newFiles:session.newFiles,fixture,history:session.history};
}
async function body(req) {let text='';for await(const chunk of req){text+=chunk;if(text.length>2000000)throw Error('Submission too large.');}return JSON.parse(text || '{}');}
function handleSubmit(session,data) {
  if (session.done) throw Error('This run has finished.');
  const values = data.values;
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw Error('Values must be an object.');
  const expected=inputs[session.state.render-1], keys=expected.map(x=>'$'+x.name);
  for(const key of Object.keys(values))if(!keys.includes(key))throw Error('Unexpected input: '+key);
  const newFiles=data.newFiles ?? session.newFiles;
  if(!Array.isArray(newFiles)||newFiles.some(x=>typeof x!=='string'))throw Error('New files must be an array of filenames.');
  const context={root:path.join(__dirname,fixture.root),newFiles};
  newFiles.forEach(x=>validate(x,{type:'string',format:'file-reference'},'newFiles',{...context,newFile:true}));
  for(const input of expected){const key='$'+input.name;if(!Object.hasOwn(values,key))throw Error('Missing input: '+key);validate(values[key],input.schema,key,context);}
  const before=structuredClone(session.state), draft=structuredClone(session.state);
  const result=transition(draft,transitionMap,JSON.stringify(values));
  session.history.push({render:before.render,loopNumber:before.loopNumber,values:structuredClone(values),state:structuredClone(draft)});
  session.state=result==='halt'?draft:result;session.newFiles=newFiles;session.done=result==='halt';
  return view(session);
}
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(fs.readFileSync(path.join(__dirname,'interface.html')));}
    if(req.method==='POST'&&url.pathname==='/api/start'){
      const state=readState();state.render=null;
      const session={id:crypto.randomUUID(),state,done:false,newFiles:[...fixture.newFiles],history:[]};
      transition(state,transitionMap);sessions.set(session.id,session);return send(res,200,view(session));
    }
    if(req.method==='POST'&&url.pathname==='/api/submit'){
      const data=await body(req),session=sessions.get(data.id);if(!session)return send(res,404,{error:'Run not found.'});
      return send(res,200,handleSubmit(session,data));
    }
    send(res,404,{error:'Not found.'});
  }catch(error){send(res,400,{error:error.message});}
});
if(require.main===module){const port=Number(process.env.PORT||3000);server.listen(port,'127.0.0.1',()=>console.log('AGENTS interface: http://127.0.0.1:'+server.address().port));}
module.exports={server,handleSubmit,inputs};
