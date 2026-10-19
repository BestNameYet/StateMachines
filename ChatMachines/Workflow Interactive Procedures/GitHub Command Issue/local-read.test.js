'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {localRead}=require('./issue-command.js');
function workspace(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-read-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('reads UTF-8 text and reports metadata',t=>{const root=workspace(t);fs.writeFileSync(path.join(root,'sample.txt'),'hello\n');const result=localRead(root,'sample.txt');assert.equal(result.content,'hello\n');assert.equal(result.size,6);assert.equal(result.path,'sample.txt');assert.equal(result.encoding,'utf8');});
test('rejects missing file',t=>{assert.throws(()=>localRead(workspace(t),'missing.txt'),/ENOENT/);});
test('rejects invalid paths',t=>{const root=workspace(t);for(const p of ['../outside','/etc/passwd','./sample.txt','sub/../sample.txt','C:\\Windows\\win.ini'])assert.throws(()=>localRead(root,p));});
test('rejects directory',t=>{const root=workspace(t);assert.throws(()=>localRead(root,'sub'),/ENOENT/);fs.mkdirSync(path.join(root,'sub'));assert.throws(()=>localRead(root,'sub'),/regular file/);});
test('rejects symlink and symlink traversal',t=>{const root=workspace(t),external=workspace(t);fs.writeFileSync(path.join(external,'out.txt'),'outside');try{fs.symlinkSync(external,path.join(root,'link'),'dir');}catch(e){if(['EPERM','EACCES','ENOTSUP'].includes(e.code)){t.skip('symlink unsupported');return;}throw e;}assert.throws(()=>localRead(root,'link/out.txt'),/Symbolic links/);});
test('enforces size bound',t=>{const root=workspace(t);fs.writeFileSync(path.join(root,'large.txt'),'x'.repeat(65));assert.throws(()=>localRead(root,'large.txt',64),/limit/);});
