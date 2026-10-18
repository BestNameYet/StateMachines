#!/usr/bin/env node
'use strict';
/**
 * GitHub Actions: node commit-manifest.js --manifest <repository-relative path> [--commit]
 * Repeat --manifest to combine mappings into ONE tree/commit. Default: dry run.
 * Requires an Actions checkout with origin and write permission when --commit is used.
 * Reads manifests/sources from the fetched branch commit, never from dirty worktree files.
 * No dependencies beyond Node.js and Git. Does not run repository scripts or hooks.
 */
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const hash=value=>typeof value==='string'&&/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value);
function relative(value,label){
 if(typeof value!=='string'||!value||value.startsWith('/')||/^[a-z]:/i.test(value)||value.includes('\\')||/[\x00-\x1f\x7f]/.test(value)||value.split('/').some(p=>!p||p==='.'||p==='..'||p.toLowerCase()==='.git'))throw Error('Invalid '+label+': use a repository-relative path.');
 return value;
}
function git(root,args,{input,env={},binary=false}={}){
 try{return execFileSync('git',['--literal-pathspecs','-c','core.hooksPath=/dev/null','-c','commit.gpgsign=false',...args],{cwd:root,env:{...process.env,...env},input,encoding:binary?undefined:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe']});}
 catch(error){throw Error('git '+args[0]+' failed: '+String(error.stderr||error.message).trim());}
}
function entry(root,ref,name,env={}){
 const output=git(root,['ls-tree','-z',ref,'--',name],{env});
 if(!output)return null;
 const rows=output.split('\0').filter(Boolean);if(rows.length!==1)throw Error('Ambiguous Git path: '+name);
 const m=rows[0].match(/^(\d+) (\w+) ([0-9a-f]+)\t([\s\S]+)$/);
 if(!m||m[4]!==name||m[2]!=='blob'||!['100644','100755'].includes(m[1]))throw Error('Only regular files are supported: '+name);
 return {mode:m[1],sha:m[3]};
}
function loadManifests(root,ref,names,repository){
 if(!names.length)throw Error('Supply at least one --manifest.');
 const result=[];let branch;
 for(const name of names){
  relative(name,'manifest');const blob=entry(root,ref,name);if(!blob)throw Error('Manifest not found in branch: '+name);
  const m=JSON.parse(git(root,['cat-file','blob',blob.sha]));
  if(m.schema_version!==1||m.repository!==repository||m.target_base!=='repository root'||typeof m.branch!=='string'||!Array.isArray(m.entries)||!m.entries.length)throw Error('Invalid manifest header: '+name);
  git(root,['check-ref-format','refs/heads/'+m.branch]);
  if(branch&&branch!==m.branch)throw Error('All manifests must name the same branch.');branch=m.branch;
  const base=relative(m.source_base,'source_base');if(path.posix.dirname(name)!==base)throw Error('Manifest must be located directly inside its source_base.');
  for(const e of m.entries){
   if(e.requires_merge!==false)throw Error('Unresolved merge: '+e.target+' in '+name);
   if(!['create_file','replace_file','apply_patch'].includes(e.operation)||!hash(e.source_blob_sha)||!(e.target_blob_sha_at_manifest_creation===null||hash(e.target_blob_sha_at_manifest_creation)))throw Error('Invalid mapping entry in '+name);
   result.push({...e,source:base+'/'+relative(e.source,'source'),target:relative(e.target,'target'),manifest:name,sourceBase:base});
  }
 }
 const seen=new Set(),bases=[...new Set(result.map(e=>e.sourceBase))];
 for(const e of result){
  if(seen.has(e.target))throw Error('Duplicate target across manifests: '+e.target);seen.add(e.target);
  if(bases.some(b=>e.target===b||e.target.startsWith(b+'/')))throw Error('A target cannot overwrite a review workspace: '+e.target);
 }
 for(const target of seen){const parts=target.split('/');parts.pop();while(parts.length){if(seen.has(parts.join('/')))throw Error('File/directory target collision: '+target);parts.pop();}}
 return {branch,mappings:result};
}
function prepareMapping({root,baseRef,manifestPaths,repository}){
 const base=git(root,['rev-parse','--verify','--end-of-options',baseRef+'^{commit}']).trim();
 const {branch,mappings}=loadManifests(root,base,manifestPaths,repository);
 // Verify every source and target before preparing any changes.
 const resolved=mappings.map(e=>{
  const source=entry(root,base,e.source);if(!source||source.sha!==e.source_blob_sha)throw Error('Source hash changed: '+e.source);
  const target=entry(root,base,e.target),expected=e.target_blob_sha_at_manifest_creation;
  if((target?.sha??null)!==expected)throw Error('Target changed since manifest capture; re-review: '+e.target);
  if(e.operation==='create_file'&&expected!==null)throw Error('create_file requires an absent target: '+e.target);
  if(e.operation!=='create_file'&&expected===null)throw Error(e.operation+' requires an existing target: '+e.target);
  return {...e,sourceEntry:source,targetEntry:target};
 });
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'manifest-index-'));
 const env={GIT_INDEX_FILE:path.join(temp,'index')};
 try{
  git(root,['read-tree',base],{env});const changes=[];
  for(const e of resolved){
   if(e.operation==='apply_patch'){
    const patch=git(root,['cat-file','blob',e.sourceEntry.sha],{binary:true});
    const stats=git(root,['apply','--numstat','-z'],{input:patch}).split('\0').filter(Boolean);
    if(stats.length!==1)throw Error('Patch must affect exactly its declared target: '+e.source);
    const stat=stats[0].match(/^(\d+)\t(\d+)\t([\s\S]+)$/);
    if(!stat||stat[3]!==e.target)throw Error('Patch changes an undeclared target or unsupported binary: '+e.source);
    git(root,['apply','--cached','--check','--whitespace=nowarn'],{env,input:patch});
    git(root,['apply','--cached','--whitespace=nowarn'],{env,input:patch});
   }else{
    const mode=e.targetEntry?.mode||e.sourceEntry.mode;
    git(root,['update-index','-z','--index-info'],{env,input:mode+' '+e.sourceEntry.sha+'\t'+e.target+'\0'});
   }
   const tree=git(root,['write-tree'],{env}).trim();const after=entry(root,tree,e.target);
   if(!after)throw Error('Mapping unexpectedly removed its target: '+e.target);
   changes.push({manifest:e.manifest,source:e.source,target:e.target,operation:e.operation,before_sha:e.targetEntry?.sha??null,after_sha:after.sha,mode:after.mode});
  }
  const tree=git(root,['write-tree'],{env}).trim();const baseTree=git(root,['rev-parse',base+'^{tree}']).trim();
  return {branch,base,tree,changed:tree!==baseTree,changes};
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
function commitMapping(root,plan,message){
 if(!plan.changed)return {...plan,commit:null,pushed:false};
 if(!hash(plan.base)||!hash(plan.tree))throw Error('Invalid prepared Git object.');
 git(root,['check-ref-format','refs/heads/'+plan.branch]);
 const identity={GIT_AUTHOR_NAME:'github-actions[bot]',GIT_AUTHOR_EMAIL:'github-actions[bot]@users.noreply.github.com',GIT_COMMITTER_NAME:'github-actions[bot]',GIT_COMMITTER_EMAIL:'github-actions[bot]@users.noreply.github.com'};
 const commit=git(root,['commit-tree',plan.tree,'-p',plan.base,'-m',message],{env:identity}).trim();
 // Never force: an intervening remote commit rejects the entire promotion.
 git(root,['push','--porcelain','origin',commit+':refs/heads/'+plan.branch]);
 return {...plan,commit,pushed:true};
}
function parseArgs(args){
 const options={manifestPaths:[],commit:false};
 for(let i=0;i<args.length;i++){
  const a=args[i];
  if(a==='--commit')options.commit=true;
  else if(a==='--dry-run')options.commit=false;
  else if(['--manifest','--branch','--message'].includes(a)){
   const value=args[++i];if(!value||value.startsWith('--'))throw Error('Missing value for '+a);
   if(a==='--manifest')options.manifestPaths.push(relative(value,'manifest'));else options[a.slice(2)]=value;
  }else throw Error('Unknown argument: '+a);
 }
 if(!options.manifestPaths.length)throw Error('Usage: node commit-manifest.js --manifest <path> [--manifest <path>] [--commit] [--branch main] [--message <text>]');
 return options;
}
function main(args=process.argv.slice(2)){
 const options=parseArgs(args),root=git(process.env.GITHUB_WORKSPACE||process.cwd(),['rev-parse','--show-toplevel']).trim();
 const repository=process.env.GITHUB_REPOSITORY;if(!repository||!repository.includes('/'))throw Error('GITHUB_REPOSITORY must identify the workflow repository.');
 // Establish the declared branch from the checked-out manifest, then fetch and re-read
 // all manifests at the remote branch head. Local modifications never select content.
 const initial=loadManifests(root,'HEAD',options.manifestPaths,repository);
 const branch=options.branch||initial.branch;if(branch!==initial.branch)throw Error('--branch must match the manifest branch.');
 git(root,['fetch','--no-tags','origin','refs/heads/'+branch]);
 const base=git(root,['rev-parse','FETCH_HEAD']).trim();
 const plan=prepareMapping({root,baseRef:base,manifestPaths:options.manifestPaths,repository});
 if(plan.branch!==branch)throw Error('Manifest branch changed after fetch.');
 const result=options.commit?commitMapping(root,plan,options.message||'Promote reviewed workspace manifest mappings'):{...plan,commit:null,pushed:false,dry_run:true};
 if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'commit_sha='+(result.commit||'')+'\ntree_sha='+result.tree+'\nchanged='+result.changed+'\n');
 process.stdout.write(JSON.stringify(result,null,2)+'\n');return result;
}
if(require.main===module){try{main();}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={relative,loadManifests,prepareMapping,commitMapping,parseArgs,main};
