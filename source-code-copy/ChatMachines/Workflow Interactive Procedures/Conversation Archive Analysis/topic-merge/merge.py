"""Approximate consolidation of independently fitted TF-IDF/NMF topics."""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import joblib
import numpy as np
from scipy import sparse

def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")

def cluster_topics(similarity, partitions, threshold, distinct_partitions=True):
    """Deterministic greedy complete-link clustering; no transitive chain merges."""
    groups = [[i] for i in range(len(partitions))]
    while True:
        best = None
        for i in range(len(groups)):
            for j in range(i+1, len(groups)):
                if distinct_partitions and set(partitions[x] for x in groups[i]) & set(partitions[x] for x in groups[j]):
                    continue
                score = float(similarity[np.ix_(groups[i], groups[j])].min())
                if score >= threshold and (best is None or score > best[0]):
                    best = (score, i, j)
        if best is None:
            return sorted(groups, key=lambda g: min(g))
        _, i, j = best
        groups[i] = sorted(groups[i] + groups[j])
        groups.pop(j)

def remap_topics(assignments, crosswalk):
    totals = defaultdict(float)
    for item in assignments:
        target = crosswalk[item["topic_id"]]
        weight = float(item["relative_weight"])
        if not np.isfinite(weight) or weight < 0:
            raise ValueError("Invalid document topic weight")
        totals[target] += weight
    return [{"topic_id": k, "relative_weight": v} for k,v in
            sorted(totals.items(), key=lambda x: (-x[1], x[0]))]

def merge(config, source, output):
    if not 0 < config["cosine_threshold"] <= 1:
        raise ValueError("Threshold must be >0 and <=1")
    if output.exists() and any(output.iterdir()):
        raise ValueError("Output must be new or empty")
    folders = [source / ("partition-" + str(i)) for i in range(config["partition_count"])]
    models, local_topics, terms, receipts = [], [], set(), []
    source_paths = set()
    conversation_count = 0
    for partition, folder in enumerate(folders):
        for name in ("model.joblib", "topics.json", "sources.json", "document_topics.jsonl", "report.json"):
            raw = (folder/name).read_bytes()
            receipts.append({"partition":partition,"file":name,"sha256":hashlib.sha256(raw).hexdigest(),"bytes":len(raw)})
        # Only load models from the configured trusted repository workflow artifact.
        bundle = joblib.load(folder/"model.joblib")
        vocabulary = bundle["vectorizer"].get_feature_names_out()
        components = np.asarray(bundle["nmf"].components_, dtype=float)
        idf = np.asarray(bundle["vectorizer"].idf_, dtype=float)
        if components.shape[1] != len(vocabulary) or not np.isfinite(components).all() or np.any(components < 0):
            raise ValueError("Invalid model components")
        if not np.isfinite(idf).all() or np.any(idf <= 0):
            raise ValueError("Invalid IDF values")
        models.append((vocabulary, components, idf))
        topics = json.loads((folder/"topics.json").read_text())
        if {t["topic_id"] for t in topics} != set(range(len(components))):
            raise ValueError("Topic metadata does not match model")
        local_topics.append({t["topic_id"]:t for t in topics})
        terms.update(vocabulary)
        for item in json.loads((folder/"sources.json").read_text()):
            if item["path"] in source_paths:
                raise ValueError("Overlapping source files")
            source_paths.add(item["path"])
            conversation_count += item["conversations"]
    if len(source_paths) != config["expected_files"] or conversation_count != config["expected_conversations"]:
        raise ValueError("Input coverage differs from configured expectations")
    vocabulary = sorted(terms)
    positions = {term:i for i,term in enumerate(vocabulary)}
    vectors, identities = [], []
    for partition,(words, components,idf) in enumerate(models):
        columns = [positions[str(word)] for word in words]
        for topic_id, component in enumerate(components):
            corrected = component / idf if config["remove_local_idf"] else component.copy()
            norm = np.linalg.norm(corrected)
            if norm == 0:
                raise ValueError("Zero topic vector")
            vector = sparse.csr_matrix((corrected/norm, ([0]*len(columns),columns)), shape=(1,len(vocabulary)))
            vectors.append(vector)
            identities.append({"partition":partition,"local_topic_id":topic_id})
    matrix = sparse.vstack(vectors).tocsr()
    similarity = np.clip((matrix @ matrix.T).toarray(),0,1)
    groups = cluster_topics(similarity,[i["partition"] for i in identities],config["cosine_threshold"],config["distinct_partitions_only"])
    global_vectors, catalog, crosswalk = [], [], []
    mappings = [dict() for _ in folders]
    for global_id,group in enumerate(groups):
        vector = sparse.csr_matrix(matrix[group].mean(axis=0))
        norm = float(np.sqrt(vector.multiply(vector).sum()))
        vector = vector / norm
        global_vectors.append(vector)
        dense = vector.toarray().ravel()
        top = dense.argsort()[::-1][:config["terms_per_topic"]]
        members, representatives = [], []
        for index in group:
            identity = identities[index]
            mappings[identity["partition"]][identity["local_topic_id"]] = global_id
            crosswalk.append({**identity,"global_topic_id":global_id})
            members.append(identity)
            representatives.extend(local_topics[identity["partition"]][identity["local_topic_id"]]["representative_document_ids"])
        minimum = min((float(similarity[a,b]) for a in group for b in group if a!=b), default=1.0)
        catalog.append({"topic_id":global_id,"members":members,"minimum_pairwise_cosine":minimum,
                        "keywords":[{"term":vocabulary[i],"weight":float(dense[i])} for i in top if dense[i]>0],
                        "representative_document_ids":list(dict.fromkeys(representatives))[:config["representatives_per_topic"]]})
    output.mkdir(parents=True,exist_ok=True)
    doc_ids=set()
    input_docs=0
    with (output/"document_topics.jsonl").open("w") as out:
        for partition,folder in enumerate(folders):
            for line in (folder/"document_topics.jsonl").open():
                record=json.loads(line)
                if record["document_id"] in doc_ids:
                    raise ValueError("Duplicate document reference")
                doc_ids.add(record["document_id"])
                original=record.get("topics",[])
                merged=remap_topics(original,mappings[partition])
                if not np.isclose(sum(x["relative_weight"] for x in original),sum(x["relative_weight"] for x in merged)):
                    raise ValueError("Lost assignment weight")
                record.update(partition=partition,local_topics=original,topics=merged)
                out.write(json.dumps(record,ensure_ascii=False)+"\n")
                input_docs+=1
    save(output/"topics.json",catalog)
    save(output/"crosswalk.json",crosswalk)
    save(output/"vocabulary.json",vocabulary)
    sparse.save_npz(output/"merged_topic_vectors.npz",sparse.vstack(global_vectors))
    with (output/"pairwise_similarities.csv").open("w") as stream:
        stream.write("partition_a,topic_a,partition_b,topic_b,cosine\n")
        for a in range(len(identities)):
            for b in range(a+1,len(identities)):
                x,y=identities[a],identities[b]
                stream.write(f'{x["partition"]},{x["local_topic_id"]},{y["partition"]},{y["local_topic_id"]},{similarity[a,b]:.8f}\n')
    summary={"input_topics":len(identities),"global_topics":len(groups),"merged_groups":sum(len(g)>1 for g in groups),
             "singleton_topics":sum(len(g)==1 for g in groups),"documents":input_docs,"files":len(source_paths),
             "conversations":conversation_count,"config":config,
             "limitations":["Approximate catalog consolidation, not a globally fitted NMF model.",
                            "Dividing by local IDF reduces a weighting difference but does not undo document normalization or independent fitting.",
                            "Only saved top topic assignments are available; missing topic weights are not recovered.",
                            "Remapped weights preserve original saved mass and are not recalibrated across models.",
                            "Lexical similarity may miss synonyms or merge topics that need human separation."]}
    save(output/"summary.json",summary)
    save(output/"input_receipts.json",receipts)
    print(json.dumps(summary),flush=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config",type=Path,required=True)
    parser.add_argument("--input",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    merge(json.loads(args.config.read_text()),args.input,args.output)

if __name__=="__main__":main()
