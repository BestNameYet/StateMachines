const assert=require('node:assert/strict');
const {server}=require('./interface-server.js');
const {validate}=require('./validator.js');
const path=require('node:path');
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 async function post(route,body){const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
 const start=()=>post('/api/start',{});
 const submit=(s,values,newFiles=s.newFiles)=>post('/api/submit',{id:s.id,values,newFiles});
 let s=(await start()).data;assert.equal(s.render,1);
 assert.equal((await submit(s,{'$verbatimUserPrompt':7})).status,400);
 s=(await submit(s,{'$verbatimUserPrompt':'What does JSON stand for?'})).data;assert.equal(s.render,2);
 s=(await submit(s,{'$userIntent':'Explain JSON.'})).data;
 assert.equal((await submit(s,{'$exampleMatch':'true'})).status,400);
 s=(await submit(s,{'$exampleMatch':true})).data;
 assert.equal(s.render,4);
 const schemaContext={root:path.join(__dirname,'fixtures'),newFiles:['summary.json']};
 assert.throws(()=>validate(1.5,{type:'integer'}));
 assert.throws(()=>validate('missing.json',{type:'string',format:'file-reference'},'file',schemaContext));
 validate('summary.json',{type:'string',format:'file-reference'},'file',schemaContext);
 assert.throws(()=>validate('../escape.json',{type:'string',format:'file-reference'},'file',{...schemaContext,newFile:true}));
 const record={filename:'people.json',frombyte:0,tobyte:1,description:'Update Ada',intent:'Requested',operator:'edit'};
 function sample(schema){if(schema.anyOf)return sample(schema.anyOf[0]);if(Object.hasOwn(schema,'const'))return schema.const;switch(schema.type){case 'string':return schema.format==='file-reference'?'people.json':'text';case 'integer':return 0;case 'boolean':return true;case 'array':return [];case 'object':return Object.fromEntries(Object.entries(schema.properties).map(([k,v])=>[k,sample(v)]));default:return 'answer';}}
 const traces={};
 for(const kind of ['minimal','fidelity','accountability','repeat']){
  let state=(await start()).data,trace=[],passes=0;
  while(!state.done){trace.push(state.render);assert(trace.length<80);const values={};for(const field of state.inputs)values['$'+field.name]=sample(field.schema);
   if(state.render===3)values.$exampleMatch=kind==='minimal';
   if(state.render===8)values.$targetFiles=['people.json','settings.json','notes.txt','summary.json'];
   if(state.render===9||state.render===12||state.render===16)values.$requirements=[record];
   if(state.render===11)values.$matchedExample={example:kind==='fidelity'?1:2,promptText:'Test intent'};
   if(state.render===14||state.render===18)values.$changeList=[record];
   if(state.render===21)values.$requirementsCompleted=[record];
   if(state.render===23){passes++;values.$requirements=kind==='repeat'&&passes===1?[record]:[];}
   if(state.render===9){const bad=await submit(state,{'$requirements':[{...record,frombyte:'0'}]});assert.equal(bad.status,400);}
   const result=await submit(state,values);assert.equal(result.status,200,JSON.stringify(result.data));state=result.data;
  }
  traces[kind]=trace;
  if(kind==='repeat')assert.equal(state.state.loopNumber,2);
 }
 assert.deepEqual(traces.minimal,[1,2,3,4,5,6,7]);
 assert.deepEqual(traces.fidelity,[1,2,3,8,9,10,11,12,13,14]);
 assert.equal(new Set(Object.values(traces).flat()).size,23);
 console.log(JSON.stringify({passed:true,scenarios:4,coveredRenders:23,structuralRejections:true,newFileException:true,traces},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
