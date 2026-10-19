'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {renderCommandResult,fenced}=require('./command-renderer.js');
const B=String.fromCharCode(96);
function render(command,responseText,result={ok:true,status:200},issueNumber=60){
 return renderCommandResult({issueNumber,command:{command},result,responseText,receiptMarker:'<!-- receipt -->'});
}
test('renders GitHub Contents UTF-8 source instead of encoded JSON',()=>{
 const text='function example(){return 60;}\n';
 const body=render('repos/get-content',JSON.stringify({type:'file',path:'src/demo.js',sha:'blob123',size:Buffer.byteLength(text),encoding:'base64',content:Buffer.from(text).toString('base64'),download_url:'https://example.test/?token=private'}))[0];
 assert.match(body,/Issue:\*\* #60/);
 assert.match(body,/function example\(\)\{return 60;\}/);
 assert.match(body,/Blob SHA:\*\* blob123/);
 assert.match(body,/javascript/);
 assert.doesNotMatch(body,/download_url|private|ZnVuY3Rpb24/);
});
test('renders local/read source and metadata',()=>{
 const body=render('local/read',JSON.stringify({path:'README.md',encoding:'utf8',size:7,content:'# Hello'}))[0];
 assert.match(body,/# Hello/);assert.match(body,/README\.md/);assert.match(body,/markdown/);
});
test('renders generic JSON without exposing download tokens',()=>{
 const body=render('repos/get',JSON.stringify({name:'StateMachines',download_url:'https://example.test/?token=secret'}))[0];
 assert.match(body,/StateMachines/);
 assert.doesNotMatch(body,/secret/);
 assert.match(body,/\[omitted\]/);
});
test('renders failures with their returned error body',()=>{
 const body=render('repos/get',JSON.stringify({message:'Forbidden'}),{ok:false,status:403})[0];
 assert.match(body,/Failed, HTTP 403/);
 assert.match(body,/Forbidden/);
});
test('preserves issue-origin and keeps long responses bounded',()=>{
 const parts=render('local/test-read',JSON.stringify({text:'x'.repeat(62000)}),{ok:true,status:200},72);
 assert(parts.length>1);
 for(const p of parts){assert.match(p,/#72/);assert(p.length<=65000);}
 assert(!parts.some(p=>p.includes('Issue:** #59')));
});
test('uses a longer Markdown fence when source contains code fences',()=>{
 const sample='before\n'+B.repeat(3)+'\nafter';
 const block=fenced(sample,'text');
 assert(block.startsWith(B.repeat(4)+'text\n'));
 assert(block.endsWith('\n'+B.repeat(4)));
});
test('rejects missing origin issue number',()=>{
 assert.throws(()=>render('repos/get','{}',{ok:true,status:200},0),/issue number/);
});
