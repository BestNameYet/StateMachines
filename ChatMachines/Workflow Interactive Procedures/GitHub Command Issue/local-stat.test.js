'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {localStat}=require('./issue-command.js');
test('local/stat reports real file size and type',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-stat-'));
 try{fs.writeFileSync(path.join(root,'ok.txt'),'hello');assert.deepEqual(localStat(root,'ok.txt'),{path:'ok.txt',type:'file',size:5});}
 finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('local/stat rejects missing files',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-stat-'));
 try{assert.throws(()=>localStat(root,'missing.txt'));}
 finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('local/stat rejects traversal and absolute paths',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-stat-'));
 try{assert.throws(()=>localStat(root,'../elsewhere'),/Invalid local path/);assert.throws(()=>localStat(root,'/etc/passwd'),/Invalid local path/);}
 finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('local/stat rejects symlink escape',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-stat-'));
 try{fs.symlinkSync(os.tmpdir(),path.join(root,'escape'));assert.throws(()=>localStat(root,'escape'),/Path resolves outside workspace/);}
 finally{fs.rmSync(root,{recursive:true,force:true});}
});
