"""Fixed 12-label cosine classifier over whole conversation text."""
import argparse,csv,hashlib,json
from collections import Counter
from pathlib import Path
import numpy as np
from scipy import sparse
from sklearn.feature_extraction.text import CountVectorizer,TfidfTransformer
from sklearn.preprocessing import normalize

BASE=Path("ChatMachines/Workflow Interactive Procedures/Conversation Archive Analysis")
HERE=Path(__file__).resolve().parent
CONFIG=json.loads((HERE/"config.json").read_text())
def save(path,value):path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+"\n")
def prepare():
    output=Path("prepared");output.mkdir()
    vocabulary=json.loads(Path("merged/vocabulary.json").read_text())
    topics=json.loads(Path("merged/topics.json").read_text())
    vectors=sparse.load_npz("merged/merged_topic_vectors.npz")
    topic_positions={t["topic_id"]:i for i,t in enumerate(topics)}
    groups=json.loads(Path("clustered/groups-distance-0p9.json").read_text())["groups"]
    assert len(groups)==12
    prototypes=sparse.vstack([sparse.csr_matrix(vectors[[topic_positions[i] for i in g["topic_ids"]]].mean(axis=0)) for g in groups])
    manifest=json.loads((BASE/"key-extraction/bins-manifest.json").read_text())
    texts=[];records=[];seen=set()
    for item in manifest["bins"]:
        path=BASE/"key-extraction"/item["output"]
        raw=path.read_bytes()
        assert hashlib.sha256(raw).hexdigest()==item["sha256"]
        conversations=json.loads(raw);assert len(conversations)==item["conversation_count"]
        for index,c in enumerate(conversations):
            cid=c.get("conversation_id") or c["id"]
            assert cid not in seen;seen.add(cid)
            parts=[];nodes=0;nontext=0
            for node in c["mapping"].values():
                m=node.get("message") or {}
                if (m.get("author") or {}).get("role") not in CONFIG["roles"]:continue
                nodes+=1
                content=m.get("content") or {}
                for part in content.get("parts",[]):
                    if isinstance(part,str):parts.append(part)
                    elif isinstance(part,dict) and part.get("content_type")=="text" and isinstance(part.get("text"),str):parts.append(part["text"])
                    else:nontext+=1
            text="\n".join(parts);texts.append(text)
            records.append({"conversation_id":cid,"title":c.get("title"),"source_file":str(path),"source_record_index":index,"included_message_nodes":nodes,"nontext_parts":nontext,"characters":len(text)})
    assert len(records)==manifest["conversation_count"]==1334
    vectorizer=CountVectorizer(vocabulary={term:i for i,term in enumerate(vocabulary)},ngram_range=(1,2),lowercase=True,strip_accents="unicode",stop_words="english")
    counts=vectorizer.transform(texts)
    transformer=TfidfTransformer(sublinear_tf=True)
    matrix=transformer.fit_transform(counts)
    # Both documents and fixed prototypes receive the same corpus-wide IDF.
    prototypes=normalize(prototypes.multiply(transformer.idf_)).tocsr()
    sparse.save_npz(output/"prototypes.npz",prototypes)
    save(output/"labels.json",[{"label_id":g["group_id"],"label":g["keyword_label"],"topic_ids":g["topic_ids"]} for g in groups])
    buckets=[[] for _ in range(4)];loads=[0]*4
    for index in sorted(range(len(records)),key=lambda i:(-records[i]["characters"],i)):
        target=min(range(4),key=lambda i:(loads[i],i))
        buckets[target].append(index);loads[target]+=records[index]["characters"]
    for batch,indices in enumerate(buckets):
        indices.sort()
        sparse.save_npz(output/("batch-"+str(batch)+".npz"),matrix[indices])
        save(output/("batch-"+str(batch)+".json"),[records[i] for i in indices])
    save(output/"preparation.json",{"conversations":len(records),"vocabulary_size":len(vocabulary),"batch_conversations":[len(x) for x in buckets],"batch_characters":loads,"config":CONFIG})
    print(json.dumps({"batch_conversations":[len(x) for x in buckets],"batch_characters":loads}),flush=True)
def classify(batch):
    source=Path("prepared");output=Path("batch-results");output.mkdir(exist_ok=True)
    matrix=sparse.load_npz(source/("batch-"+str(batch)+".npz"))
    prototypes=sparse.load_npz(source/"prototypes.npz")
    labels=json.loads((source/"labels.json").read_text())
    records=json.loads((source/("batch-"+str(batch)+".json")).read_text())
    scores=(matrix @ prototypes.T).toarray()
    with (output/("batch-"+str(batch)+".jsonl")).open("w") as stream:
        for record,row in zip(records,scores):
            order=sorted(range(len(labels)),key=lambda i:(-row[i],labels[i]["label_id"]))
            first,second=order[:2]
            positive=row[first]>0
            record.update(batch=batch,label_id=labels[first]["label_id"] if positive else None,label=labels[first]["label"] if positive else None,
                          status="classified" if positive else "no_matching_vocabulary",
                          cosine_similarity=float(row[first]),margin=float(row[first]-row[second]),
                          all_label_scores=[{**labels[i],"cosine_similarity":float(row[i])} for i in order])
            stream.write(json.dumps(record,ensure_ascii=False)+"\n")
    print("classified batch",batch,"conversations",len(records),flush=True)
def collect():
    output=HERE/"outputs";output.mkdir(exist_ok=True)
    records=[]
    for i in range(4):
        records.extend(json.loads(line) for line in (Path("results")/("batch-"+str(i)+".jsonl")).read_text().splitlines())
    assert len(records)==len({r["conversation_id"] for r in records})==1334
    labels=json.loads(Path("prepared/labels.json").read_text())
    counts=Counter(r["label_id"] for r in records)
    summary={"conversations":len(records),"classified":sum(r["status"]=="classified" for r in records),"unassigned":counts[None],
             "distribution":[{**label,"conversation_count":counts[label["label_id"]]} for label in labels],
             "method":"Fixed nearest-prototype cosine classifier over complete user/assistant text per conversation; shared corpus-wide IDF; 12 frozen group prototypes; no message-window vote aggregation. Scores are not probabilities. Zero-match records explicitly unassigned."}
    save(output/"summary.json",summary)
    with (output/"conversation_labels.jsonl").open("w") as stream:
        for record in sorted(records,key=lambda r:r["conversation_id"]):stream.write(json.dumps(record,ensure_ascii=False)+"\n")
    with (output/"conversation_labels.csv").open("w",newline="") as stream:
        fields=["conversation_id","title","label_id","label","cosine_similarity","margin","status","batch","source_file","source_record_index"]
        writer=csv.DictWriter(stream,fieldnames=fields,extrasaction="ignore");writer.writeheader();writer.writerows(records)
    save(output/"config.json",CONFIG)
    print(json.dumps(summary),flush=True)
if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("mode",choices=["prepare","classify","collect"]);parser.add_argument("--batch",type=int,choices=range(4))
    args=parser.parse_args()
    if args.mode=="prepare":prepare()
    elif args.mode=="classify":
        if args.batch is None:parser.error("--batch required")
        classify(args.batch)
    else:collect()
