"""Deterministic TF-IDF + NMF topic discovery; no language model or API calls."""
import argparse
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import re
import warnings

import joblib
import numpy as np
import sklearn
from sklearn.decomposition import NMF
from sklearn.exceptions import ConvergenceWarning
from sklearn.feature_extraction.text import TfidfVectorizer

def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")

def text_parts(content, counters):
    """Keep explicit text parts; never stringify attachment/tool metadata as prose."""
    result = []
    if not isinstance(content, dict):
        counters["non_object_content"] += 1
        return result
    parts = content.get("parts", [])
    if not isinstance(parts, list):
        counters["non_array_parts"] += 1
        return result
    for part in parts:
        if isinstance(part, str):
            result.append(part)
        elif isinstance(part, dict) and part.get("content_type") == "text" and isinstance(part.get("text"), str):
            result.append(part["text"])
        else:
            counters["non_text_parts"] += 1
    return result

def documents_for(conversation, source, record_index, config, counters):
    mapping = conversation.get("mapping")
    if not isinstance(mapping, dict):
        raise ValueError("Conversation has no mapping: " + source)
    cid = conversation.get("conversation_id") or conversation.get("id")
    if not cid:
        raise ValueError("Conversation lacks source identifier")
    for node_id, node in mapping.items():
        counters["nodes_seen"] += 1
        message = node.get("message") if isinstance(node, dict) else None
        if not isinstance(message, dict):
            counters["null_or_non_message_nodes"] += 1
            continue
        counters["messages_seen"] += 1
        role = (message.get("author") or {}).get("role")
        if role not in config["roles"]:
            counters["excluded_role:" + str(role)] += 1
            continue
        parts = text_parts(message.get("content"), counters)
        text = "\n".join(parts)
        words = list(re.finditer(r"\S+", text))
        if len(words) < config["min_words"]:
            counters["below_min_words"] += 1
            continue
        size = config["max_words_per_document"]
        for segment, start in enumerate(range(0, len(words), size)):
            end = min(start + size, len(words))
            first, last = words[start].start(), words[end-1].end()
            doc = {
                "document_id": source + "#" + str(record_index) + "/" + str(node_id) + "/" + str(segment),
                "source_file": source, "source_record_index": record_index,
                "conversation_id": cid, "node_id": node_id,
                "message_id": message.get("id"), "parent_node_id": node.get("parent"),
                "role": role, "create_time": message.get("create_time"),
                "segment": segment, "word_start": start, "word_end_exclusive": end,
                "char_start": first, "char_end_exclusive": last,
                "text": text[first:last],
            }
            counters["documents_prepared"] += 1
            yield doc

def load_documents(config, repo_root):
    manifest_path = (repo_root / config["input"]["manifest"]).resolve()
    if not manifest_path.is_relative_to(repo_root):
        raise ValueError("Manifest outside repository")
    manifest = json.loads(manifest_path.read_text())
    source_root = manifest_path.parent
    documents, sources, counters = [], [], Counter()
    seen = set()
    for item in manifest["bins"]:
        relative = item["output"]
        if relative in seen:
            raise ValueError("Duplicate source path: " + relative)
        seen.add(relative)
        path = (source_root / relative).resolve()
        if not path.is_relative_to(source_root):
            raise ValueError("Source outside input directory")
        raw = path.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        if digest != item["sha256"]:
            raise ValueError("Source checksum mismatch: " + relative)
        records = json.loads(raw)
        if not isinstance(records, list) or len(records) != item["conversation_count"]:
            raise ValueError("Conversation count mismatch: " + relative)
        source = path.relative_to(repo_root).as_posix()
        for index, record in enumerate(records):
            counters["conversations_seen"] += 1
            documents.extend(documents_for(record, source, index, config["documents"], counters))
        sources.append({"path": source, "sha256": digest, "bytes": len(raw), "conversations": len(records)})
    if counters["conversations_seen"] != manifest["conversation_count"]:
        raise ValueError("Dataset conversation coverage mismatch")
    return documents, sources, counters

def fit(documents, config):
    tfidf = dict(config["tfidf"])
    tfidf["ngram_range"] = tuple(tfidf["ngram_range"])
    vectorizer = TfidfVectorizer(**tfidf)
    matrix = vectorizer.fit_transform(doc["text"] for doc in documents)
    nonzero = np.asarray(matrix.getnnz(axis=1)).ravel() > 0
    active = matrix[nonzero]
    n_topics = config["nmf"]["n_components"]
    if min(active.shape) < n_topics:
        raise ValueError("Too few nonempty documents/features for configured topic count; reduce n_components")
    model = NMF(**config["nmf"])
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always", ConvergenceWarning)
        weights = model.fit_transform(active)
    scores = np.zeros((len(documents), n_topics))
    sums = weights.sum(axis=1, keepdims=True)
    scores[nonzero] = np.divide(weights, sums, out=np.zeros_like(weights), where=sums != 0)
    return vectorizer, model, scores, nonzero, [str(w.message) for w in caught]

def run(config, repo_root, output):
    validate(config)
    if output.exists() and any(output.iterdir()):
        raise ValueError("Output directory must be empty; choose a new run directory")
    documents, sources, counters = load_documents(config, repo_root)
    if not documents:
        raise ValueError("No eligible text documents")
    vectorizer, model, scores, nonzero, notices = fit(documents, config)
    output.mkdir(parents=True, exist_ok=True)
    features = vectorizer.get_feature_names_out()
    terms = config["output"]["terms_per_topic"]
    examples = config["output"]["representatives_per_topic"]
    topics = []
    for index, component in enumerate(model.components_):
        order = component.argsort()[::-1][:terms]
        best = scores[:, index].argsort()[::-1]
        best = [int(i) for i in best if scores[i, index] > 0][:examples]
        topics.append({"topic_id": index, "keywords": [
            {"term": str(features[i]), "weight": float(component[i])} for i in order
        ], "representative_document_ids": [documents[i]["document_id"] for i in best]})
    top = config["output"]["topics_per_document"]
    with (output / "document_topics.jsonl").open("w") as stream:
        for index, doc in enumerate(documents):
            reference = {k: v for k, v in doc.items() if k != "text"}
            selected = scores[index].argsort()[::-1][:top]
            reference.update(status="modeled" if nonzero[index] else "empty_after_vectorization",
                             topics=[{"topic_id": int(i), "relative_weight": float(scores[index,i])}
                                     for i in selected if scores[index,i] > 0])
            stream.write(json.dumps(reference, ensure_ascii=False) + "\n")
    dump(output / "topics.json", topics)
    dump(output / "config.json", config)
    dump(output / "sources.json", sources)
    report = {"source_commit": os.environ.get("GITHUB_SHA"), "sklearn_version": sklearn.__version__,
              "coverage": dict(counters), "modeled_documents": int(nonzero.sum()),
              "empty_after_vectorization": int((~nonzero).sum()), "features": len(features),
              "topics": len(topics), "iterations": model.n_iter_,
              "reconstruction_error": float(model.reconstruction_err_), "warnings": notices,
              "limitations": ["Topics are keyword-based candidates, not validated semantic labels.",
                             "Relative weights are normalized NMF activations, not calibrated probabilities.",
                             "Each message node is processed once; branches are not concatenated.",
                             "Non-text parts and excluded roles are recorded but not modeled.",
                             "Long messages use nonoverlapping word windows; no cross-message context.",
                             "Repeated content in distinct source nodes is retained and may affect frequencies."]}
    dump(output / "report.json", report)
    joblib.dump({"vectorizer": vectorizer, "nmf": model}, output / "model.joblib")
    print(json.dumps(report, ensure_ascii=False))

def validate(config):
    docs = config["documents"]
    if not docs["roles"] or docs["min_words"] < 1 or docs["max_words_per_document"] < docs["min_words"]:
        raise ValueError("Invalid document configuration")
    if config["nmf"]["n_components"] < 2:
        raise ValueError("Use at least two topics")
    if config["output"]["topics_per_document"] < 1:
        raise ValueError("topics_per_document must be positive")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    run(config, args.repo_root.resolve(), args.output.resolve())

if __name__ == "__main__":
    main()
