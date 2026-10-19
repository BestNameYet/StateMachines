'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {renderCommandResult,displayResponse}=require('./render-command');
const marker='<!-- github-command-receipt:7:'+ 'a'.repeat(64)+' -->';
const command={command:'repos/get-content',parameters:{path:'example.js'}};
test('returned content is decoded and assigned to the original issue',()=>{
 const file={type:'file',path:'example.js',encoding:'base64',size:11,content:Buffer.from('return 60;\n').toString('base64')};
 const parts=renderCommandResult({issueNumber:60,commentId:7,marker,command,result:{ok:true,status:200},responseText:JSON.stringify(file)});
 assert.equal(parts.length,1);
 assert(parts[0].includes('Source issue: #60'));
 assert(parts[0].includes('return 60;'));
});
test('failed results are marked correctly',()=>{
 const parts=renderCommandResult({issueNumber:72,commentId:7,marker,command,result:{ok:false,status:404},responseText:'{"message":"Not Found"}'});
 assert(parts[0].includes('Source issue: #72'));
 assert(parts[0].includes('Failed'));
});
test('plain text and JSON both have usable render forms',()=>{
 assert.equal(displayResponse({command:'local/read'},JSON.stringify({path:'f',content:'hello'})).content,'hello');
 assert(displayResponse({command:'x'},'plain text').content==='plain text');
});
