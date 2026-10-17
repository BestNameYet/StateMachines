const assert=require('node:assert/strict');
const {issueNumberFromChangedPath,parseToolInvocationSubmission,isAcceptedReport}=require('./issue-run-tool-invocations.js');

const path='ChatMachines/Workflow Interactive Procedures/AGENTS Procedure/issue-runs/45-tool-invocations.json';
assert.equal(issueNumberFromChangedPath(path),45);
assert.equal(issueNumberFromChangedPath(path.replace('45-','0-')),null);
assert.equal(issueNumberFromChangedPath(path.replace('45-','45x-')),null);
assert.deepEqual(parseToolInvocationSubmission(JSON.stringify({procedureIssueNumber:45,toolInvocations:[]}),45),[]);
assert.throws(()=>parseToolInvocationSubmission('{bad json',45),/JSON/);
assert.throws(()=>parseToolInvocationSubmission(JSON.stringify({procedureIssueNumber:46,toolInvocations:[]}),45),/must equal 45/);
assert.throws(()=>parseToolInvocationSubmission(JSON.stringify({procedureIssueNumber:45,toolInvocations:[],extra:true}),45),/unexpected top-level/);
assert.throws(()=>parseToolInvocationSubmission(JSON.stringify({procedureIssueNumber:45,toolInvocations:{}}),45),/must be an array/);
assert.equal(isAcceptedReport(JSON.stringify({procedureIssueNumber:45,toolInvocations:[],submissionAccepted:true})),true);
assert.equal(isAcceptedReport(JSON.stringify({procedureIssueNumber:45,toolInvocations:[]})),false);
console.log('Run-specific tool-invocation paths and JSON envelopes validate.');
