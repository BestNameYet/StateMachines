import json,hashlib,collections
from pathlib import Path
import argparse
parser=argparse.ArgumentParser(description='Extract branch-preserving pilot passages from a Git-verified source manifest.')
parser.add_argument('--source-manifest',type=Path,default=Path(__file__).parent/'sources.json')
parser.add_argument('--repository-root',type=Path)
parser.add_argument('--output-directory',type=Path,default=Path(__file__).parent)
args=parser.parse_args();root=args.output_directory;root.mkdir(parents=True,exist_ok=True)
sources=json.loads(args.source_manifest.read_text())
if isinstance(sources,dict):sources=sources['sources']
def uid(prefix,*parts):return prefix+'_'+hashlib.sha256(json.dumps(parts,separators=(',',':')).encode()).hexdigest()[:24]
node_table={};branches=[];passages=[];anomalies=[];exchanges_table={};conversation_count=0
models={'A':'Atomic Exchange Unit','B':'Sliding Triad Window','C':'Macro Sub-Session (5-turn, exchange-preserving)'}
for si,src in enumerate(sources):
 raw=((args.repository_root/src['path']) if args.repository_root else root/f'sample{si}.json').read_bytes()
 if hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()!=src['sha']:raw=raw[:-1]
 assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==src['sha']
 for ci,c in enumerate(json.loads(raw)):
  conversation_count+=1;cid=c['conversation_id'];mapping=c['mapping'];children=collections.defaultdict(list)
  for nid,n in mapping.items():
   parent=n.get('parent')
   if parent is not None:
    if parent not in mapping:raise ValueError('Missing parent '+parent)
    children[parent].append(nid)
   m=n.get('message')
   if not m:continue
   parts=(m.get('content') or {}).get('parts',[]);segments=[]
   for pi,part in enumerate(parts):
    if isinstance(part,str):segments.append({'segment':f'content.parts[{pi}]','text':part,'char_start':0,'char_end_exclusive':len(part)})
    else:segments.append({'segment':f'content.parts[{pi}]','type':type(part).__name__,'source_json_path':f'$[{ci}].mapping[{json.dumps(nid)}].message.content.parts[{pi}]','attachment_payload_availability':'not established; descriptor is not payload'})
   key=uid('node',cid,nid)
   node_table[key]={'conversation_id':cid,'node_id':nid,'message_id':m.get('id'),'role':m.get('author',{}).get('role'),'create_time':m.get('create_time'),'source_file':src['path'],'source_blob':src['sha'],'source_record_index':ci,'segments':segments,'text_character_count':sum(len(p) for p in parts if isinstance(p,str)),'content_type':m.get('content',{}).get('content_type')}
  leaves=sorted(n for n in mapping if not children[n]);assert leaves
  for leaf in leaves:
   chain=[];seen=set();n=leaf
   while n is not None:
    if n in seen:raise ValueError('Cycle')
    seen.add(n);chain.append(n);n=mapping[n].get('parent')
   chain.reverse();bid=uid('branch',cid,chain)
   assert all(mapping[b].get('parent')==a for a,b in zip(chain,chain[1:]))
   turns=[uid('node',cid,nid) for nid in chain if mapping[nid].get('message') is not None]
   exchanges=[];current=[];has_assistant=False;preamble=[]
   for key in turns:
    role=node_table[key]['role']
    if role=='user':
     if current and has_assistant:
      exchanges.append(current);current=[];has_assistant=False
     current.append(key)
    elif current:
     current.append(key)
     if role=='assistant':has_assistant=True
    else:preamble.append(key)
   if current:
    if has_assistant:exchanges.append(current)
    else:anomalies.append({'branch_id':bid,'kind':'unanswered_user_turn','node_refs':current})
   eids=[]
   for nodes in exchanges:
    eid=uid('exchange',cid,nodes);eids.append(eid)
    exchanges_table[eid]={'exchange_id':eid,'conversation_id':cid,'node_refs':nodes,'turn_count':len(nodes),'text_character_count':sum(node_table[k]['text_character_count'] for k in nodes)}
   branches.append({'branch_id':bid,'conversation_id':cid,'source_file':src['path'],'source_record_index':ci,'mapping_node_ids':chain,'exchange_ids':eids,'preamble_node_refs':preamble})
   def emit(model,target,before,after,index):
    assert not(set(target)&set(before) or set(target)&set(after) or set(before)&set(after))
    target_nodes=[{'node_ref':k,'node_id':node_table[k]['node_id'],'author_role':node_table[k]['role']} for k in target]
    passages.append({'passage_id':uid('passage',model,cid,bid,index,target),'conversation_id':cid,'branch_id':bid,'model':model,'model_name':models[model],'target_nodes':target_nodes,'context_before_nodes':before,'context_after_nodes':after,'target_turn_count':len(target),'payload_turn_count':len(target)+len(before)+len(after),'target_character_count':sum(node_table[k]['text_character_count'] for k in target),'context_character_count':sum(node_table[k]['text_character_count'] for k in before+after),'evidence_keys':target,'target_exceeds_five_turns':model=='C' and len(target)>5})
   for i,nodes in enumerate(exchanges):
    emit('A',nodes,[],[],i);emit('B',nodes,exchanges[i-1] if i else [],exchanges[i+1] if i+1<len(exchanges) else [],i)
   window=[];start=0
   for i,nodes in enumerate(exchanges):
    if window and len(window)+len(nodes)>5:emit('C',window,[],[],start);window=[];start=i
    if not window:start=i
    window+=nodes
   if window:emit('C',window,[],[],start)
assert len({p['passage_id'] for p in passages})==len(passages)
assert all(set(p['evidence_keys'])<=set(node_table) for p in passages)
metrics=[]
for model,name in models.items():
 ps=[p for p in passages if p['model']==model]
 metrics.append({'modelName':name,'extractedCount':len(ps),'averageTurnCount':f'{sum(p["payload_turn_count"] for p in ps)/len(ps):.3f}','branchCoverage':len({p['branch_id'] for p in ps})})
summary=f'Processed {conversation_count} conversations across batches 00–03 into {len(branches)} independent root-to-leaf branch paths. Candidate counts: '+', '.join(m['modelName']+': '+str(m['extractedCount']) for m in metrics)+'. Full textual segments are stored once in the node table; passage references distinguish target and context. Shared-prefix targets must be deduplicated across branches. Model C follows the assignment’s five-turn boundary with whole-exchange preservation; oversized exchanges are retained intact and flagged.'
data={'schema_version':'1.0','extraction_summary':summary,'source_files':sources,'policy':{'branching':'Invert parent pointers; validate every root-to-leaf chain. No sibling concatenation.','exchanges':'Consecutive user messages form one prompt; all assistant/tool intermediates until the next user after an assistant are retained. Null nodes are routing only. Preamble and unanswered user groups are explicitly retained outside completed exchanges.','model_C':'Latest assignment says five-turn or session-bounded; choose five message-bearing turns, pack whole exchanges, branch-end remainder retained, oversized individual exchanges flagged. Prior specification says 5–10 exchanges: this discrepancy requires supervisor evaluation; no silent equivalence claim.','text':'String content.parts segments retained verbatim once; non-string content preserved by exact source pointer, not flattened into invented text. Offsets are Python Unicode code-point offsets within each source string, end-exclusive.','deduplication':'Evidence keyed by conversation/node/message and span; context contributes no independent observations.','sampling':'Same size-biased convenience sample of 34 conversations; metrics are descriptive, not archive-wide estimates.','coverage_status':'extracted and structurally verified; not semantically classified or synthesized'},'metrics':metrics,'node_table':node_table,'exchange_table':exchanges_table,'branches':branches,'passages':passages,'anomalies':anomalies,'structural_verification':{'source_blob_checks':True,'parent_edges_checked':True,'cycles':0,'passage_ids_unique':True,'target_context_disjoint':True,'source_conversations':conversation_count,'source_message_objects':len(node_table),'unique_exchanges':len(exchanges_table),'branch_paths':len(branches)}}
(root/'extracted-pilot-passages.json').write_text(json.dumps(data,separators=(',',':'),ensure_ascii=False)+'\n')
(root/'passages-return.json').write_text(json.dumps({'nonce':'chatgpt54_20261017_a7c9','assignmentId':'task_chatgpt_extract_sample_passages','values':{'extractionSummary':summary,'modelMetrics':metrics,'stagedFiles':['project/stage3-pilot/extracted-pilot-passages.json','project/stage3-pilot/extract-pilot-passages.py']}}))
print(summary);print('Bytes',(root/'extracted-pilot-passages.json').stat().st_size);print(metrics)
