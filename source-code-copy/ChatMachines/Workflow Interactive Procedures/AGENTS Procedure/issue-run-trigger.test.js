const assert = require('node:assert/strict');
const { parseTrigger, triggerMarker, issueBody, identifierFromFilename, initializeConsumedTrigger, appendProcedureReceipt } = require('./issue-run-trigger.js');

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

const initialReceipt = { state:{render:1}, done:false, request:1, lastCommentId:0, newFiles:[], history:[], toolInvocations:[], triggerIdentifier:'buildProcedure12' };
const consumed = initializeConsumedTrigger({ startProcedure:true, nonce:12 }, trigger, { number:8, html_url:'https://github.com/BestNameYet/StateMachines/issues/8', title:'AGENTS Procedure — test' }, initialReceipt);
assert.deepEqual(consumed.procedureReceipts,[initialReceipt]);
const laterReceipt = { ...initialReceipt, state:{render:2}, request:2, lastCommentId:41 };
const appended = appendProcedureReceipt(consumed,laterReceipt,8);
assert.deepEqual(appended.procedureReceipts,[initialReceipt,laterReceipt]);
assert.equal(appendProcedureReceipt(appended,laterReceipt,8),null);
assert.throws(()=>appendProcedureReceipt(appended,{...laterReceipt,triggerIdentifier:'other9'},8));
assert.throws(()=>appendProcedureReceipt(appended,laterReceipt,9));
assert.throws(()=>appendProcedureReceipt({...appended,procedureIssueNumber:9},laterReceipt,9));
console.log('Initial and append-only receipt snapshots remain bound to the matching trigger identifier and issue.');
