const assert = require('node:assert/strict');
const {screenFromGeminiResponse, saveGeminiScreen} = require('./gemini-screen.js');
const {renderState, renderScreen, loadScreens} = require('./render-instructions.js');
const {validate} = require('./validator.js');
const {renderGeminiScreen,lastGeminiScreen}=require('./render-gemini.js');

async function main() {
  const message = {
    instruction: 'Choose an action. Return the selection as {$action}.',
    expectedInputs: [{name: 'action', schema: {anyOf: [{const: 'continue'}, {const: 'stop'}]}}]
  };
  const screen = screenFromGeminiResponse(JSON.stringify(message));
  assert.deepEqual(screen, message);
  assert.equal(renderGeminiScreen(screen), message.instruction);
  validate('continue', screen.expectedInputs[0].schema);
  assert.throws(() => validate('unknown', screen.expectedInputs[0].schema));
  screen.expectedInputs[0].schema.anyOf[0].const = 'changed';
  assert.equal(message.expectedInputs[0].schema.anyOf[0].const, 'continue');

  const run = {state: {procedureMode: 'gemini', render: 1}};
  let persisted, saves = 0;
  const save = async () => {persisted = JSON.stringify(run); saves++;};
  const first = await saveGeminiScreen(run, message, save);
  assert.strictEqual(first, run.state.renderedScreens[0]);
  assert.equal(run.state.render, 0);
  assert.equal(Object.hasOwn(first, 'render'), false);
  assert.deepEqual(lastGeminiScreen(run.state), message);
  assert.deepEqual(JSON.parse(persisted).state.renderedScreens[0], message);
  const secondMessage = {instruction: 'Return a description as {$description}.', expectedInputs: [{name: 'description', schema: {type: 'string'}}]};
  const second = await saveGeminiScreen(run, secondMessage, save);
  assert.strictEqual(second, run.state.renderedScreens[1]);
  assert.equal(run.state.render, 1);
  assert.deepEqual(first, message);
  assert.deepEqual(lastGeminiScreen(run.state), secondMessage);
  const restored = JSON.parse(persisted);
  assert.deepEqual(lastGeminiScreen(restored.state), secondMessage);
  restored.state.render = 0;
  assert.deepEqual(lastGeminiScreen(restored.state), secondMessage);
  assert.throws(()=>lastGeminiScreen({renderedScreens:[]}), /No saved/);
  const before = structuredClone(run);
  await assert.rejects(() => saveGeminiScreen(run, secondMessage, async () => {throw Error('save failed');}), /save failed/);
  assert.deepEqual(run, before);
  await assert.rejects(() => saveGeminiScreen({state: {procedureMode: 'normal'}}, message, save), /Gemini mode/);
  await assert.rejects(() => saveGeminiScreen(run, message), /saver/);
  for (const invalid of [null, [], '{}', '{broken', {instruction: 'x'},
    {instruction: '', expectedInputs: []}, {instruction: 'x', expectedInputs: {}},
    {instruction: 'x', expectedInputs: [{name: 'a', schema: []}]},
    {instruction: 'x', expectedInputs: [{name: '$a', schema: {}}]},
    {instruction: 'x', expectedInputs: [{name: 'a', schema: {}}, {name: 'a', schema: {}}]},
    {...message, render: 99}]) {
    assert.throws(() => screenFromGeminiResponse(invalid));
    await assert.rejects(() => saveGeminiScreen(run, invalid, save));
    assert.deepEqual(run, before);
  }
  assert.equal(saves, 2);
  // Normal-mode predefined screen rendering retains its existing numbering.
  assert.equal(renderState({procedureMode: 'normal', render: 1}), renderScreen(loadScreens(), 1));
  console.log('Gemini object persistence, zero-based addresses, same-object rendering, reloads, failed saves, and normal-mode compatibility passed.');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
