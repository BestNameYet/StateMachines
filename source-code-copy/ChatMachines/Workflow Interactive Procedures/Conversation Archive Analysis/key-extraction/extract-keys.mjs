import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

export function inventory(value, keys = new Map()) {
  const stack=[value];
  while(stack.length) {
    const item=stack.pop();
    if(item===null || typeof item!=='object') continue;
    if(Array.isArray(item)) { for(const v of item) stack.push(v); continue; }
    for(const [key,v] of Object.entries(item)) {
      const type=v===null?'null':Array.isArray(v)?'array':typeof v;
      let row=keys.get(key);
      if(!row) {row={key,observed_types:new Set(),occurrences:0};keys.set(key,row);}
      row.observed_types.add(type);row.occurrences++;
      stack.push(v);
    }
  }
  return keys;
}
function rows(map) {
  return [...map.values()].map(r=>({...r,observed_types:[...r.observed_types].sort()})).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
}
function main() {
  const root=path.dirname(fileURLToPath(import.meta.url));
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'bins-manifest.json'),'utf8'));
  const paths=manifest.bins.map(r=>r.output);
  assert.equal(new Set(paths).size,paths.length,'Duplicate manifest paths');
  const all=new Map(),files=[];
  let conversationCount=0;
  for(const relative of paths) {
    const full=path.resolve(root,relative);
    assert.ok(full.startsWith(root+path.sep),'Path outside key-extraction');
    const bytes=fs.readFileSync(full);
    const data=JSON.parse(bytes.toString('utf8'));
    assert.ok(Array.isArray(data),'Expected a conversation array');
    const expected=manifest.bins.find(r=>r.output===relative);
    const hash=crypto.createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash,expected.sha256,'Source checksum mismatch: '+relative);
    assert.equal(data.length,expected.conversation_count);
    inventory(data,all);
    const local=inventory(data);
    files.push({path:relative,bytes:bytes.length,sha256:hash,conversation_count:data.length,distinct_keys:local.size});
    conversationCount+=data.length;
  }
  assert.equal(conversationCount,manifest.conversation_count,'Incomplete conversation coverage');
  const output=path.join(root,'outputs');fs.mkdirSync(output,{recursive:true});
  const result={method:'Deterministic JavaScript recursive key scan; arrays traversed without treating indexes as keys; exact object key names retained at every depth',source_commit:process.env.GITHUB_SHA??null,source_files:files.map(r=>r.path),file_count:files.length,conversation_count:conversationCount,distinct_key_count:all.size,keys:rows(all)};
  fs.writeFileSync(path.join(output,'key_type_inventory.json'),JSON.stringify(result,null,2)+'\n');
  fs.writeFileSync(path.join(output,'source-manifest.json'),JSON.stringify(files,null,2)+'\n');
  const summary={source_commit:result.source_commit,file_count:files.length,conversation_count:conversationCount,distinct_key_count:all.size};
  fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify(summary));
  if(process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'Scanned '+files.length+' files, '+conversationCount+' conversations, '+all.size+' distinct exact key names.\n');
}
if(process.argv.includes('--test')) {
  const result=inventory(JSON.parse('{"x":null,"list":[{"x":1},{"x":"s","nested":{"__proto__":true}}],"empty":{}}'));
  assert.deepEqual([...result.get('x').observed_types].sort(),['null','number','string']);
  assert.equal(result.get('x').occurrences,3);
  assert.ok(result.has('__proto__'));assert.ok(!result.has('0'));
  assert.deepEqual([...result.get('list').observed_types],['array']);
  console.log('Key extraction tests passed');
} else if(process.argv[1]===fileURLToPath(import.meta.url)) main();
