const assert = require('node:assert/strict');
const { screenFromGeminiResponse } = require('./gemini-screen.js');
const { render, renderScreen, entriesForState } = require('./render-instructions.js');
const { validate } = require('./validator.js');

const message = {
  instruction: 'Choose the next action. Keep this text verbatim.\n${placeholder}',
  expectedInputs: [
    {name: 'action', schema: {anyOf: [{const: 'continue'}, {const: 'stop'}]}},
    {name: 'confirmed', schema: {type: 'boolean'}}
  ]
};
const screen = screenFromGeminiResponse(JSON.stringify(message));
assert.deepEqual(Object.fromEntries(screen), message);
// Existing screen renderers consume the result directly, without another format.
assert.deepEqual(JSON.parse(render(screen)), message);
assert.deepEqual(JSON.parse(renderScreen([screen], 1)), message);
assert.deepEqual(entriesForState({render: 1}, [screen]), screen);
// The declared contract, not text parsing, supplies the validation schema.
const inputs = Object.fromEntries(screen).expectedInputs;
validate('continue', inputs[0].schema);
assert.throws(() => validate('unknown', inputs[0].schema));
validate(true, inputs[1].schema);
assert.throws(() => validate('true', inputs[1].schema));
const copy = screenFromGeminiResponse(message);
copy[1][1][0].schema.anyOf[0].const = 'changed';
assert.equal(message.expectedInputs[0].schema.anyOf[0].const, 'continue');
assert.deepEqual(screenFromGeminiResponse({instruction: 'Perform this action.', expectedInputs: []}),
  [['instruction', 'Perform this action.'], ['expectedInputs', []]]);
for (const invalid of [null, [], '{}', '{broken', {instruction: 'x'},
  {instruction: '', expectedInputs: []}, {instruction: 'x', expectedInputs: {},},
  {instruction: 'x', expectedInputs: [{name: 'a', schema: []}]},
  {instruction: 'x', expectedInputs: [{name: '$a', schema: {}}]},
  {instruction: 'x', expectedInputs: [{name: 'a', schema: {}}, {name: 'a', schema: {}}]},
  {...message, render: 99}]) {
  assert.throws(() => screenFromGeminiResponse(invalid));
}
console.log('Gemini screen conversion, existing renderer compatibility, supplied contracts, isolation, and malformed responses passed.');
