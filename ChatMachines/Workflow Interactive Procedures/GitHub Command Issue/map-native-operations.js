'use strict';
/**
 * Derive one explicit JavaScript execution binding for EVERY operation in
 * command-catalog.json. Classification is deliberately conservative:
 * local equivalents exist only when the requested object is in this runner's
 * checked-out workspace. A remote GitHub object is never represented as local.
 *
 * Run: node map-native-operations.js
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = __dirname;
const catalog = JSON.parse(fs.readFileSync(path.join(root,'command-catalog.json'),'utf8'));
const rules = [
  // GitHub Contents is local only when owner/repo/ref denote this checkout.
  {test:/^repos\/(get-content|get-contents)$/,method:'GET',kind:'workspace',fn:'fs.promises.readFile / fs.promises.readdir',verify:'read succeeds; record SHA-256; render content or directory entries'},
  {test:/^repos\/create-or-update-file-contents$/,kind:'workspace',fn:'fs.promises.writeFile',verify:'read back and byte-compare; render resulting file'},
  {test:/^repos\/delete-file$/,kind:'workspace',fn:'fs.promises.rm',verify:'stat returns ENOENT; render deletion receipt'},
  {test:/^repos\/(get-archive-link|download-zipball-archive|download-tarball-archive)$/,kind:'git-store',fn:'Git repository object access / archive implementation',verify:'archive content and ref verification'},
  {test:/^git\/(get-blob|create-blob)$/,kind:'git-store',fn:'Git object store adapter (library required)',verify:'hash and object type'},
  {test:/^git\/(get-tree|create-tree)$/,kind:'git-store',fn:'Git tree adapter (library required)',verify:'tree object hash and entries'},
  {test:/^git\/(get-commit|create-commit)$/,kind:'git-store',fn:'Git commit adapter (library required)',verify:'commit hash and parents'},
  {test:/^git\/(get-ref|list-matching-refs|create-ref|update-ref|delete-ref)$/,kind:'git-store',fn:'Git ref adapter (library required)',verify:'ref resolution and expected commit'},
  {test:/^repos\/(get|list-branches|list-tags)$/,kind:'git-store',fn:'Local checkout metadata / Git object store where applicable',verify:'resolved local data; remote metadata remains unavailable'}
];
function binding(id,op){
  const rule=rules.find(r=>r.test.test(id)&&(!r.method||r.method===op.method));
  const common={apiOperation:id,httpMethod:op.method,route:op.route,description:op.description};
  if(rule)return {...common,execution:'conditional-local',adapter:rule.kind,jsFunction:rule.fn,verification:rule.verify,preconditions:['target is the currently checked-out repository and revision','requested data is present in local checkout/object store','workspace authorization and path containment pass'],remoteFallback:'required when preconditions are not met'};
  return {...common,execution:'remote-required',adapter:'github-remote',jsFunction:null,verification:'verify server response and remote resource state',reason:'GitHub-hosted state or service action has no generally equivalent Node.js filesystem operation'};
}
const entries=Object.entries(catalog.commands).sort(([a],[b])=>a.localeCompare(b));
const mapped=Object.fromEntries(entries.map(([id,op])=>[id,binding(id,op)]));
const counts={total:entries.length,conditionalLocal:0,remoteRequired:0};
for(const b of Object.values(mapped))counts[b.execution==='conditional-local'?'conditionalLocal':'remoteRequired']++;
const output={schemaVersion:1,catalogRevision:catalog.revision,generatedBy:'map-native-operations.js',counts,operations:mapped};
fs.writeFileSync(path.join(root,'native-operation-map.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({file:'native-operation-map.json',...counts}));
