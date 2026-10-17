const {generateGeminiScreen}=require('./gemini-workflow.js');
const {renderGeminiScreen}=require('./render-gemini.js');

async function main() {
  const record={geminiPending:true,state:{
    procedureMode:'gemini',verbatimUserPrompt:'Ask the executor to calculate twelve times five and return the integer product.',
    renderedScreens:[],variables:[]
  }};
  let saved;
  const screen=await generateGeminiScreen(record,async()=>{saved=JSON.stringify(record);});
  if(!saved)throw Error('Generated screen was not saved.');
  console.log(JSON.stringify({liveGemini:true,savedScreenIndex:record.state.render,screen:JSON.parse(saved).state.renderedScreens[0],renderedInstruction:renderGeminiScreen(screen)},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
