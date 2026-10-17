const fs = require('node:fs');
const path = require('node:path');
const {screenFromGeminiResponse, saveGeminiScreen} = require('./gemini-screen.js');
const {lastGeminiScreen} = require('./render-gemini.js');
const {validate} = require('./validator.js');

// Deliberately accept only the schema vocabulary enforced by the workflow.
function validateInputSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw Error('Input schema must be an object.');
  const allowed = ['type','const','anyOf','items','properties','required','additionalProperties'];
  for (const key of Object.keys(schema)) if (!allowed.includes(key)) throw Error('Unsupported schema keyword: '+key);
  if (schema.anyOf !== undefined) {
    if (Object.keys(schema).length !== 1 || !Array.isArray(schema.anyOf) || !schema.anyOf.length) throw Error('anyOf requires a nonempty array and no sibling keywords.');
    schema.anyOf.forEach(validateInputSchema);
    return;
  }
  if (Object.hasOwn(schema,'const')) {
    if (Object.keys(schema).length !== 1) throw Error('const must stand alone.');
    return;
  }
  if (!['string','integer','boolean','null','array','object'].includes(schema.type)) throw Error('Unsupported or missing schema type.');
  if (schema.type === 'array') validateInputSchema(schema.items);
  if (schema.type === 'object') {
    if (!schema.properties || typeof schema.properties !== 'object' || Array.isArray(schema.properties)) throw Error('Object schema needs properties.');
    Object.values(schema.properties).forEach(validateInputSchema);
    if (!Array.isArray(schema.required) || schema.required.some(k=>typeof k!=='string'||!Object.hasOwn(schema.properties,k))) throw Error('Object schema needs valid required keys.');
    if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== 'boolean') throw Error('additionalProperties must be Boolean.');
  }
  for (const key of Object.keys(schema)) {
    if (['items'].includes(key) && schema.type !== 'array') throw Error('items requires array type.');
    if (['properties','required','additionalProperties'].includes(key) && schema.type !== 'object') throw Error(key+' requires object type.');
  }
}

function validateGeminiScreen(response) {
  const screen = screenFromGeminiResponse(response);
  if (!screen.expectedInputs.length) throw Error('Every Gemini screen must request at least one return value.');
  for (const input of screen.expectedInputs) {
    validateInputSchema(input.schema);
    if (!screen.instruction.includes('{$'+input.name+'}')) throw Error('Instruction must describe and request return {$'+input.name+'}.');
  }
  return screen;
}

function validateControl(control) {
  const object=(value,keys,label)=>{
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))throw Error(label+' must contain exactly '+keys.join(', ')+'.');
  };
  object(control,['target','current','gap','mode'],'control');
  for(const key of ['target','current']) {
    object(control[key],['outcome','process'],'control.'+key);
    for(const field of ['outcome','process'])if(typeof control[key][field]!=='string'||!control[key][field].trim())throw Error('control.'+key+'.'+field+' needs a nonempty description.');
  }
  object(control.gap,['outcome','process'],'control.gap');
  for(const field of ['outcome','process'])if(!Array.isArray(control.gap[field])||control.gap[field].some(v=>typeof v!=='string'||!v.trim()))throw Error('control.gap.'+field+' must be an array of nonempty descriptions.');
  if(!['continue','completion'].includes(control.mode))throw Error('control.mode must be continue or completion.');
  const gaps=control.gap.outcome.length+control.gap.process.length;
  if(control.mode==='completion'&&gaps)throw Error('Completion requires both outcome and process gaps to be empty.');
  if(control.mode==='continue'&&!gaps)throw Error('Continue requires an identified outcome or process gap.');
  return structuredClone(control);
}

function validateGeminiResponse(response) {
  const message=typeof response==='string'?JSON.parse(response):response;
  if(!message||typeof message!=='object'||Array.isArray(message))throw Error('Gemini response must be an object.');
  const control=validateControl(message.control);
  const keys=control.mode==='completion'?['control']:['control','instruction','expectedInputs'];
  if(Object.keys(message).length!==keys.length||keys.some(k=>!Object.hasOwn(message,k)))throw Error(control.mode+' response must contain exactly '+keys.join(', ')+'.');
  return {control,screen:control.mode==='completion'?null:validateGeminiScreen({instruction:message.instruction,expectedInputs:message.expectedInputs})};
}

function buildGeminiRequest(state) {
  if (typeof state.verbatimUserPrompt !== 'string') throw Error('Verbatim user prompt is missing.');
  if (!Array.isArray(state.renderedScreens) || !Array.isArray(state.variables)) throw Error('Screen and variable arrays are required.');
  const request = JSON.parse(fs.readFileSync(path.join(__dirname,'gemini-request-template.json'),'utf8'));
  // Send the complete workflow-owned state, without substituting into old screens.
  request.state = structuredClone(state);
  request.state.controls ??= [];
  if(!Array.isArray(request.state.controls))throw Error('Control history must be an array.');
  return request;
}

async function callGemini(request, {fetchImpl=fetch, apiKey=process.env.GEMINI_API_KEY, model=process.env.GEMINI_MODEL || 'gemini-3.8-flash'}={}) {
  if (!apiKey) throw Error('GEMINI_API_KEY is missing.');
  const response = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent', {
    method:'POST',
    headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},
    body:JSON.stringify({contents:[{role:'user',parts:[{text:JSON.stringify(request)}]}],generationConfig:{responseMimeType:'application/json'}}),
    signal:AbortSignal.timeout(60000)
  });
  if (!response.ok) throw Error('Gemini API returned HTTP '+response.status+'.');
  const result = await response.json();
  const parts = result.candidates?.[0]?.content?.parts || [];
  const text = parts.filter(part=>typeof part.text==='string'&&!part.thought).map(part=>part.text).join('');
  if (!text) throw Error('Gemini API returned no response text.');
  return text;
}

async function generateGeminiScreen(record, saveRecord, {generate=callGemini,maxAttempts=3}={}) {
  if(record.done)return null;
  if (!record.geminiPending) return lastGeminiScreen(record.state);
  const request = buildGeminiRequest(record.state);
  for (let attempt=1; attempt<=maxAttempts; attempt++) {
    const response = await generate(structuredClone(request));
    let assessment;
    try {assessment = validateGeminiResponse(response);}
    catch (error) {
      if (attempt===maxAttempts) throw Error('Gemini response format rejected: '+error.message);
      request.correction = {previousResponse:response,validationError:error.message,instruction:'Return a corrected response with a fresh control assessment. Continue mode requires instruction and expectedInputs; completion mode contains only control. Preserve the task and supplied state.'};
      continue;
    }
    const previousState=record.state,previousDone=record.done,previousPending=record.geminiPending;
    record.state={...previousState,controls:[...(previousState.controls||[]),assessment.control]};
    record.geminiPending=false;
    try {
      if(assessment.control.mode==='completion') {
        record.done=true;
        await saveRecord();
        return null;
      }
      return await saveGeminiScreen(record,assessment.screen,saveRecord);
    } catch(error) {
      record.state=previousState;record.geminiPending=previousPending;
      if(previousDone===undefined)delete record.done;else record.done=previousDone;
      throw error;
    }
  }
  throw Error('Gemini response was not generated.');
}

function acceptGeminiValues(record, values, fileRoot) {
  if(record.done)throw Error('This run has finished.');
  if (record.geminiPending) throw Error('The previous return is saved. Type retry to request the next Gemini screen; do not repeat the work.');
  if (!values || typeof values!=='object' || Array.isArray(values)) throw Error('Return a JSON object of variable names and values.');
  const screen = lastGeminiScreen(record.state);
  const names = screen.expectedInputs.map(input=>input.name);
  if (Object.keys(values).length!==names.length || Object.keys(values).some(name=>!names.includes(name))) throw Error('Returned keys must exactly match: '+names.join(', '));
  for (const input of screen.expectedInputs) {
    if (!Object.hasOwn(values,input.name)) throw Error('Missing input: '+input.name);
    validate(values[input.name],input.schema,input.name,{root:fileRoot,newFiles:record.newFiles});
  }
  const before = structuredClone(record.state);
  for (const input of screen.expectedInputs) record.state.variables.push({name:input.name,value:structuredClone(values[input.name])});
  record.history.push({request:record.request,render:record.state.render,values:structuredClone(values),state:before});
  record.request++;
  record.geminiPending = true;
  record.view = 'instruction';
}

module.exports = {validateControl,validateGeminiResponse,validateInputSchema,validateGeminiScreen,buildGeminiRequest,callGemini,generateGeminiScreen,acceptGeminiValues};
