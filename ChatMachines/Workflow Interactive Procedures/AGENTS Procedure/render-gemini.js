// Gemini content is already selected. Render its instruction verbatim.
function renderGeminiScreen(screen) {
  if (!screen || typeof screen.instruction !== 'string') {
    throw new Error('A saved Gemini screen with instruction text is required.');
  }
  if(screen.assignments||screen.standingInstructions)return broadcastParts(screen).join("\n\n");
  return screen.instruction;
}

function lastGeminiScreen(state) {
  if (!Array.isArray(state?.renderedScreens) || !state.renderedScreens.length) {
    throw new Error('No saved Gemini screen is available.');
  }
  return state.renderedScreens[state.renderedScreens.length - 1];
}

function broadcastParts(screen){
 if(!screen.assignments)return screen.standingInstructions?['## Screen A — Shared instructions\n\n'+screen.standingInstructions,'## Screen B — Instructions\n\n'+screen.instruction]:[screen.instruction];
 const parts=['## Screen A — Shared instructions\n\n'+screen.standingInstructions];
 const visible=screen.assignments;
 for(let i=0;i<visible.length;i+=2){
  const label=i===0?'B':'C';
  parts.push('## Screen '+label+' — Worker assignments\n\n'+visible.slice(i,i+2).map(a=>'### '+a.id+' ('+a.worker+(a.nonce?'; '+a.nonce:'')+(a.worker==='gemini'?'; API worker instruction echo':'')+')\n\n'+a.instruction).join('\n\n---\n\n'));
 }
 return parts;
}
module.exports = {renderGeminiScreen, lastGeminiScreen,broadcastParts};

