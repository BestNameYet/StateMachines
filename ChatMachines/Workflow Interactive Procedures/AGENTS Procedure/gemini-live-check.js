const {generateGeminiScreen,acceptGeminiValues}=require('./gemini-workflow.js');
const {renderGeminiScreen}=require('./render-gemini.js');

async function main() {
  const record={geminiPending:true,request:1,history:[],newFiles:[],state:{
    procedureMode:'gemini',verbatimUserPrompt:'Have the executor calculate twelve times five and submit exactly one integer named total. The objective is met when that correct product has been submitted. No other tasks or process requirements.',
    renderedScreens:[],variables:[],controls:[]
  }};
  let saved;
  const screen=await generateGeminiScreen(record,async()=>{saved=JSON.stringify(record);});
  if(!saved)throw Error('Generated screen was not saved.');
  if(!screen||screen.expectedInputs.length!==1||screen.expectedInputs[0].name!=='total'||screen.expectedInputs[0].schema.type!=='integer')throw Error('Live calculation screen did not request the specified integer total.');
  const renderedInstruction=renderGeminiScreen(screen);
  const screenCount=record.state.renderedScreens.length;
  acceptGeminiValues(record,{total:12*5},__dirname);
  await generateGeminiScreen(record,async()=>{saved=JSON.stringify(record);});
  if(!record.done||record.state.renderedScreens.length!==screenCount||record.state.controls.at(-1).mode!=='completion')throw Error('Live control loop did not complete without another screen.');
  console.log(JSON.stringify({liveGemini:true,renderedInstruction,returnedTotal:60,completed:record.done,screenCount:record.state.renderedScreens.length,controls:JSON.parse(saved).state.controls},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
