// Root access is explicitly selected in the procedure issue body.
function rootWorkspaceRequested(issue){return /### Workspace access\s+repository-root(?:\s|$)/.test(issue.body||'');}
function rootStorage(api,issueNumber){
 const manifestPath='ChatMachines/Workflow Interactive Procedures/AGENTS Procedure/issue-workspaces/'+issueNumber+'/manifest.json';
 const route=p=>'/contents/'+p.split('/').map(encodeURIComponent).join('/');
 return {
  manifestPath,
  read:async p=>{const f=await api('GET',route(p),undefined,true);if(!f)return null;if(f.type&&f.type!=='file')throw Error('Not a regular file.');if(f.encoding==='none')throw Error('File is too large for a text read; use copy_files to preserve its blob.');return Buffer.from(f.content,'base64').toString('utf8');},
  write:async(p,text)=>{const f=await api('GET',route(p),undefined,true);await api('PUT',route(p),{message:'Issue '+issueNumber+' workspace write: '+p,content:Buffer.from(text).toString('base64'),...(f?{sha:f.sha}:{})});},
  list:async()=>{const tree=await api('GET','/git/trees/main?recursive=1');if(tree.truncated)throw Error('Repository inventory is truncated.');return tree.tree.filter(e=>e.type==='blob'&&e.mode!=='120000').map(e=>e.path);},
  copyFiles:async files=>{
   // Reference existing blobs directly: byte-identical copies, without model rewriting.
   const ref=await api('GET','/git/ref/heads/main');
   const commit=await api('GET','/git/commits/'+ref.object.sha);
   const tree=await api('GET','/git/trees/'+commit.tree.sha+'?recursive=1');
   if(tree.truncated)throw Error('Repository inventory is truncated.');
   const entries=new Map(tree.tree.filter(e=>e.type==='blob').map(e=>[e.path,e]));
   const copies=files.map(f=>{const source=entries.get(f.source);if(!source||source.mode==='120000')throw Error('Source is not a regular repository file: '+f.source);const existing=entries.get(f.path);if(existing&&existing.sha!==source.sha)throw Error('Destination already contains different data: '+f.path);return {path:f.path,mode:source.mode,type:'blob',sha:source.sha};});
   if(copies.every(e=>entries.get(e.path)?.sha===e.sha))return files.map(f=>({source:f.source,path:f.path,sha:entries.get(f.source).sha,unchanged:true}));
   const created=await api('POST','/git/trees',{base_tree:commit.tree.sha,tree:copies});
   const saved=await api('POST','/git/commits',{message:'Copy source files for procedure issue '+issueNumber,tree:created.sha,parents:[ref.object.sha]});
   await api('PATCH','/git/refs/heads/main',{sha:saved.sha,force:false});
   return files.map(f=>({source:f.source,path:f.path,sha:entries.get(f.source).sha,commit:saved.sha}));
  }
 };
}
module.exports={rootWorkspaceRequested,rootStorage};
