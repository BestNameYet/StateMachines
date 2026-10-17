import csv,json
from collections import defaultdict,Counter
from pathlib import Path

base=Path("ChatMachines/Workflow Interactive Procedures/Conversation Archive Analysis")
manifest=json.loads((base/"key-extraction/bins-manifest.json").read_text())
conversations={}
for bin in manifest["bins"]:
    source=base/"key-extraction"/bin["output"]
    records=json.loads(source.read_text())
    assert len(records)==bin["conversation_count"]
    for index,record in enumerate(records):
        cid=record.get("conversation_id") or record["id"]
        if cid in conversations: raise ValueError("Duplicate conversation ID")
        conversations[cid]={"conversation_id":cid,"title":record.get("title"),"create_time":record.get("create_time"),"source_file":str(source),"source_record_index":index}
assert len(conversations)==1334
docs=[json.loads(line) for line in Path("merged/document_topics.jsonl").read_text().splitlines()]
assert len({d["document_id"] for d in docs})==len(docs)
assert all(d["conversation_id"] in conversations for d in docs)
out=base/"topic-distribution/outputs";out.mkdir(parents=True,exist_ok=True)
all_summaries=[]
for name,expected in [("groups-distance-0p9.json",12),("groups-distance-0p8.json",25)]:
    cut=json.loads((Path("clustered")/name).read_text())
    assert cut["group_count"]==expected
    crosswalk={tid:g["group_id"] for g in cut["groups"] for tid in g["topic_ids"]}
    assert len(crosswalk)==54
    weights=defaultdict(lambda:defaultdict(float));hits=defaultdict(set)
    for doc in docs:
        cid=doc["conversation_id"]
        for item in doc["topics"]:
            value=item["relative_weight"]
            if value>0:
                gid=crosswalk[item["topic_id"]]
                weights[cid][gid]+=value
                hits[cid].add(gid)
    dominant=Counter();touch=Counter();rows=[]
    for cid,reference in conversations.items():
        scores=weights[cid]
        top=min(scores,key=lambda g:(-scores[g],g)) if scores else None
        dominant[top]+=1
        touch.update(hits[cid])
        total=sum(scores.values())
        rows.append({**reference,"dominant_group":top,"groups_touched":sorted(hits[cid]),
                     "group_weights":[{"group_id":g,"summed_saved_weight":value,"share_of_saved_weight":value/total}
                                      for g,value in sorted(scores.items(),key=lambda x:(-x[1],x[0]))]})
    distribution=[]
    for group in cut["groups"]:
        gid=group["group_id"]
        distribution.append({"group_id":gid,"keyword_label":group["keyword_label"],"topic_ids":group["topic_ids"],
                             "dominant_conversations":dominant[gid],"dominant_percent":round(100*dominant[gid]/len(conversations),2),
                             "conversations_touching_group":touch[gid]})
    distribution.sort(key=lambda r:(-r["dominant_conversations"],r["group_id"]))
    assert sum(g["dominant_conversations"] for g in distribution)+dominant[None]==len(conversations)
    assert all(g["conversations_touching_group"]>=g["dominant_conversations"] for g in distribution)
    summary={"groups":expected,"distance_threshold":cut["distance_threshold"],"total_conversations":len(conversations),
             "unassigned_conversations":dominant[None],"multi_group_conversations":sum(len(hits[cid])>1 for cid in conversations),
             "documents":len(docs),"distribution":distribution,
             "method":"Dominant group = largest sum of saved document topic weights per conversation, deterministic lower-group-ID tie break. Touch counts include any positive saved weight. Uses top-three source assignments only; not exhaustive topic prevalence."}
    (out/(str(expected)+"-groups-summary.json")).write_text(json.dumps(summary,indent=2)+"\n")
    with (out/(str(expected)+"-groups-conversations.jsonl")).open("w") as stream:
        for row in rows:stream.write(json.dumps(row,ensure_ascii=False)+"\n")
    with (out/(str(expected)+"-groups-distribution.csv")).open("w",newline="") as stream:
        writer=csv.DictWriter(stream,fieldnames=list(distribution[0]));writer.writeheader();writer.writerows(distribution)
    all_summaries.append(summary)
    print(json.dumps(summary),flush=True)
(out/"distribution-summary.json").write_text(json.dumps(all_summaries,indent=2)+"\n")
