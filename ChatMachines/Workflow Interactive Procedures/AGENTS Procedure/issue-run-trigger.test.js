const assert = require('node:assert/strict');
const { parseTrigger, triggerMarker, issueBody, identifierFromFilename } = require('./issue-run-trigger.js');

assert.deepEqual(identifierFromFilename('buildProcedure12.json', 12), {
  procedureName: 'buildProcedure', identifier: 'buildProcedure12'
});
assert.deepEqual(parseTrigger('buildProcedure12.json', { startProcedure: true, nonce: 12 }), {
  filename: 'buildProcedure12.json', procedureName: 'buildProcedure', identifier: 'buildProcedure12', nonce: 12
});
assert.equal(parseTrigger('buildProcedure12.json', { startProcedure: false, nonce: 12 }), null);
assert.throws(() => parseTrigger('buildProcedure12.json', { startProcedure: true, nonce: '12' }));
assert.throws(() => parseTrigger('buildProcedure12.json', { startProcedure: true, nonce: 13 }));
assert.throws(() => parseTrigger('../buildProcedure12.json', { startProcedure: true, nonce: 12 }));
assert.throws(() => parseTrigger('12.json', { startProcedure: true, nonce: 12 }));
assert.throws(() => parseTrigger('buildProcedure12.json', { startProcedure: true, nonce: 12, procedureIssueNumber: 8 }));
const trigger = parseTrigger('buildProcedure12.json', { startProcedure: true, nonce: 12 });
assert.equal(triggerMarker(trigger.identifier), '<!-- agents-procedure-trigger:buildProcedure12 -->');
assert.match(issueBody(trigger), /### Procedure acknowledgement/);
assert.match(issueBody(trigger), /- \[x\] I agree to follow each instruction/);
assert.match(issueBody(trigger), /Trigger identifier: `buildProcedure12`/);
console.log('Trigger filename, nonce, acknowledgement, and identifier tests passed.');
