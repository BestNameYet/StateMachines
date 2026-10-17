const {generateGeminiScreen,acceptGeminiValues}=require('./gemini-workflow.js');
const {renderGeminiScreen}=require('./render-gemini.js');
const {runGeminiWorkers}=require('./gemini-workers.js');
const {localStorage}=require('./supervisor-tools.js');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');

async function main() {
  const record={geminiPending:true,request:1,history:[],newFiles:[],state:{
    procedureMode:'gemini',verbatimUserPrompt:'First request view_inventory as a commands-only response without a screen. After receiving its result, use a single instruction/expectedInputs screen (no worker assignments) to have the executor calculate twelve times five and submit exactly one integer named total. The objective is met when that correct product has been submitted. No other tasks or process requirements.',
    renderedScreens:[],variables:[],controls:[]
  }};
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'supervisor-live-'));const storage=localStorage(root);
  let saved;
  const screen=await generateGeminiScreen(record,async()=>{saved=JSON.stringify(record);},{storage});
  if(!saved)throw Error('Generated screen was not saved.');
  if(!screen||screen.expectedInputs.length!==1||screen.expectedInputs[0].name!=='total'||screen.expectedInputs[0].schema.type!=='integer')throw Error('Live calculation screen did not request the specified integer total.');
  if(!record.state.commandResults?.some(r=>r.command.name==='view_inventory'))throw Error('Live supervisor did not request workspace inventory.');
  const renderedInstruction=renderGeminiScreen(screen);
  const screenCount=record.state.renderedScreens.length;
  acceptGeminiValues(record,{total:12*5},__dirname);
  await generateGeminiScreen(record,async()=>{saved=JSON.stringify(record);},{storage});
  if(!record.done||record.state.renderedScreens.length!==screenCount||record.state.controls.at(-1).mode!=='completion')throw Error('Live control loop did not complete without another screen.');
  const workerRecord={request:1,geminiPending:false,history:[],state:{procedureMode:'gemini',verbatimUserPrompt:'Calculate twelve times five.',variables:[],controls:[],render:0,renderedScreens:[{instruction:'Worker assignment',standingInstructions:'Calculate the requested product. Return only the requested value and no files.',expectedInputs:[],assignments:[{id:'live-worker',worker:'gemini',instruction:'Calculate twelve times five. Return the integer product as {$total}.',expectedInputs:[{name:'total',schema:{type:'integer'}}]}]}]}};
  await runGeminiWorkers(workerRecord,storage,async()=>{});
  if(workerRecord.state.assignmentReturns?.[0]?.values.total!==60||!workerRecord.state.workers?.[0]?.nonce)throw Error('Live worker calculation or nonce registration failed.');
  fs.rmSync(root,{recursive:true,force:true});
  console.log(JSON.stringify({liveGemini:true,liveWorker:true,workerReturns:workerRecord.state.assignmentReturns,commandResults:record.state.commandResults,renderedInstruction,returnedTotal:60,completed:record.done,screenCount:record.state.renderedScreens.length,controls:JSON.parse(saved).state.controls},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
