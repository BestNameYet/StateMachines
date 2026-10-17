"""Cluster saved topic vectors without predefined categories or an LLM."""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import numpy as np
from scipy import sparse
from scipy.cluster.hierarchy import linkage, fcluster, dendrogram
from scipy.spatial.distance import squareform
from sklearn.metrics import silhouette_score
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+"\n")

def hierarchy(vectors):
    matrix=sparse.csr_matrix(vectors,dtype=float)
    if matrix.shape[0]<2 or not np.isfinite(matrix.data).all():
        raise ValueError("Need at least two finite topic vectors")
    norms=np.sqrt(np.asarray(matrix.multiply(matrix).sum(axis=1)).ravel())
    if np.any(norms<=0): raise ValueError("Zero topic vector")
    normalized=sparse.diags(1/norms) @ matrix
    distance=np.clip(1-(normalized @ normalized.T).toarray(),0,2)
    distance=(distance+distance.T)/2
    np.fill_diagonal(distance,0)
    tree=linkage(squareform(distance,checks=True),method="average",optimal_ordering=True)
    return normalized, distance, tree

def groups_at(tree, threshold):
    if not 0 < threshold <= 2: raise ValueError("Distance threshold must be in (0,2]")
    labels=fcluster(tree,t=threshold,criterion="distance")
    groups={}
    for index,label in enumerate(labels): groups.setdefault(int(label),[]).append(index)
    return sorted(groups.values(),key=min)

def run(config, source, output):
    if output.exists() and any(output.iterdir()): raise ValueError("Output directory must be empty")
    topics=json.loads((source/"topics.json").read_text())
    vocabulary=json.loads((source/"vocabulary.json").read_text())
    vectors=sparse.load_npz(source/"merged_topic_vectors.npz")
    if vectors.shape!=(len(topics),len(vocabulary)): raise ValueError("Vector/catalog shape mismatch")
    ids=[t["topic_id"] for t in topics]
    if len(ids)!=len(set(ids)): raise ValueError("Duplicate topic IDs")
    normalized,distance,tree=hierarchy(vectors)
    output.mkdir(parents=True,exist_ok=True)
    thresholds=config["distance_thresholds"]
    if not thresholds or len(thresholds)!=len(set(thresholds)): raise ValueError("Use distinct thresholds")
    results=[]
    for threshold in thresholds:
        groups=groups_at(tree,threshold)
        assignments=np.empty(len(topics),dtype=int)
        catalog=[]
        for group_id,members in enumerate(groups):
            assignments[members]=group_id
            centroid=np.asarray(normalized[members].mean(axis=0)).ravel()
            best=centroid.argsort()[::-1][:config["keywords_per_group"]]
            keywords=[{"term":vocabulary[i],"weight":float(centroid[i])} for i in best if centroid[i]>0]
            refs=[]
            for i in members: refs.extend(topics[i].get("representative_document_ids",[]))
            pairwise=distance[np.ix_(members,members)]
            catalog.append({"group_id":group_id,"topic_ids":[ids[i] for i in members],
                            "keyword_label":" / ".join(k["term"] for k in keywords[:config["label_terms"]]),
                            "keywords":keywords,"topic_count":len(members),
                            "maximum_pairwise_distance":float(pairwise.max()),
                            "representative_document_ids":list(dict.fromkeys(refs))[:config["representatives_per_group"]]})
        score=float(silhouette_score(distance,assignments,metric="precomputed")) if 1<len(groups)<len(topics) else None
        result={"distance_threshold":threshold,"linkage":"average","metric":"cosine",
                "group_count":len(groups),"singleton_groups":sum(len(g)==1 for g in groups),
                "silhouette":score,"groups":catalog}
        name="groups-distance-"+str(threshold).replace(".","p")
        save(output/(name+".json"),result)
        with (output/(name+".csv")).open("w",newline="") as stream:
            writer=csv.writer(stream);writer.writerow(["topic_id","group_id","keyword_label"])
            for group in catalog:
                for topic_id in group["topic_ids"]: writer.writerow([topic_id,group["group_id"],group["keyword_label"]])
        results.append({k:v for k,v in result.items() if k!="groups"})
    leaves=[str(t["topic_id"])+": "+", ".join(k["term"] for k in t["keywords"][:4]) for t in topics]
    figure,axis=plt.subplots(figsize=(15,max(12,len(topics)*.27)))
    dendrogram(tree,labels=leaves,orientation="right",ax=axis,color_threshold=0,above_threshold_color="#355c7d")
    axis.set_title("Topic hierarchy — average linkage, cosine distance")
    axis.set_xlabel("Average cosine distance at merge")
    axis.tick_params(axis="y",labelsize=8)
    figure.tight_layout()
    figure.savefig(output/"dendrogram.png",dpi=180)
    figure.savefig(output/"dendrogram.svg")
    plt.close(figure)
    save(output/"hierarchy.json",{"topic_ids":ids,"linkage_columns":["left","right","distance","leaf_count"],"linkage_matrix":tree.tolist()})
    save(output/"config.json",config)
    receipts=[{"file":name,"sha256":hashlib.sha256((source/name).read_bytes()).hexdigest()} for name in ["topics.json","vocabulary.json","merged_topic_vectors.npz"]]
    save(output/"input-receipts.json",receipts)
    summary={"source_run_id":config["source_run_id"],"input_topics":len(topics),"vocabulary_terms":len(vocabulary),"cuts":results,
             "notes":["No fixed division count or manually selected category names.",
                      "Keyword labels are weighted terms, not human-validated concepts.",
                      "Average linkage limits average cross-cluster distance, not every topic pair.",
                      "Silhouette measures lexical geometry, not semantic correctness; no automatic best cut is selected.",
                      "All source topics, including noisy ones, are retained. Group IDs are local to each threshold."]}
    save(output/"summary.json",summary)
    print(json.dumps(summary),flush=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config",type=Path,required=True)
    parser.add_argument("--input",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    run(json.loads(args.config.read_text()),args.input,args.output)
if __name__=="__main__":main()
