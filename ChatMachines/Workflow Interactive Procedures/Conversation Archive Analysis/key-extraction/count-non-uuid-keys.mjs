import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {inventory} from './extract-keys.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function nonUuidCounts(map) {
  return [...map.values()].filter(r=>!uuid.test(r.key))
    .map(r=>({key:r.key,count:r.occurrences,observed_types:[...r.observed_types].sort()}))
    .sort((a,b)=>b.count-a.count || (a.key<b.key?-1:a.key>b.key?1:0));
}
if(process.argv.includes('--test')) {
  const value=JSON.parse('{"00000000-0000-0000-0000-000000000000":{"inside":1},"list":[{"inside":2},{"inside":null}],"0":true,"__proto__":false}');
  const rows=nonUuidCounts(inventory(value));
  assert.equal(rows.find(r=>r.key==='inside').count,3);
  assert.ok(!rows.some(r=>uuid.test(r.key)));
  assert.equal(rows.find(r=>r.key==='0').count,1);
  assert.equal(rows.find(r=>r.key==='__proto__').count,1);
  console.log('Non-UUID counts tests passed; descendants of UUID keys retained');
} else {
  const root=path.dirname(fileURLToPath(import.meta.url));
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'bins-manifest.json'),'utf8'));
  const keys=new Map(),seen=new Set();
  let conversations=0;
  for(const bin of manifest.bins) {
    assert.ok(!seen.has(bin.output),'Duplicate bin');seen.add(bin.output);
    const full=path.resolve(root,bin.output);assert.ok(full.startsWith(root+path.sep));
    const raw=fs.readFileSync(full);
    assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),bin.sha256,'Checksum mismatch');
    const data=JSON.parse(raw.toString('utf8'));
    assert.ok(Array.isArray(data));assert.equal(data.length,bin.conversation_count);
    inventory(data,keys);conversations+=data.length;
  }
  assert.equal(conversations,manifest.conversation_count);
  const rows=nonUuidCounts(keys),out=path.join(root,'outputs');
  fs.mkdirSync(out,{recursive:true});
  const summary={source_commit:process.env.GITHUB_SHA??null,file_count:seen.size,conversation_count:conversations,distinct_non_uuid_keys:rows.length,total_non_uuid_key_occurrences:rows.reduce((n,r)=>n+r.count,0),excluded_distinct_uuid_keys:keys.size-rows.length};
  const result={...summary,count_definition:'Each occurrence of an object property at every nesting depth; exclude UUID-shaped property names only, traverse their values; array indexes are not counted, numeric object keys are counted',uuid_pattern:uuid.source,keys:rows};
  fs.writeFileSync(path.join(out,'non_uuid_key_counts.json'),JSON.stringify(result,null,2)+'\n');
  const quote=s=>'"'+String(s).replaceAll('"','""')+'"';
  fs.writeFileSync(path.join(out,'non_uuid_key_counts.csv'),'key,count,observed_types\n'+rows.map(r=>[quote(r.key),r.count,quote(r.observed_types.join('|'))].join(',')).join('\n')+'\n');
  fs.writeFileSync(path.join(out,'non_uuid_key_counts_summary.json'),JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify(summary));
  if(process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,JSON.stringify(summary)+'\n');
}
