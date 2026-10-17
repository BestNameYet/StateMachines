"""Fit a BERTopic model and assign prepared text documents to discovered topics.

Input is JSON Lines with one object per analysis document:
{"document_id":"stable-id","text":"prepared text","source_ref":"optional source pointer","metadata":{}}

The script deliberately accepts prepared documents rather than extracting whole
conversations. This keeps document boundaries, context, and source references
under the analysis pipeline's control.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
DEFAULT_CONFIG = HERE / "config.json"
OUTPUT_FIELDS = ("document_id", "topic_id", "membership_strength", "source_ref", "metadata_json")


def load_documents(path: Path) -> list[dict[str, Any]]:
    """Read validated JSONL records without copying document text to outputs."""
    documents: list[dict[str, Any]] = []
    seen: set[str] = set()

    with path.open("r", encoding="utf-8") as source:
        for line_number, line in enumerate(source, start=1):
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{line_number}: invalid JSON: {exc.msg}") from exc
            if not isinstance(record, dict):
                raise ValueError(f"{path}:{line_number}: each JSONL row must be an object")

            raw_id = record.get("document_id")
            if not isinstance(raw_id, (str, int)) or not str(raw_id).strip():
                raise ValueError(f"{path}:{line_number}: document_id must be a non-empty string or integer")
            document_id = str(raw_id)
            if document_id in seen:
                raise ValueError(f"{path}:{line_number}: duplicate document_id {document_id!r}")
            seen.add(document_id)

            text = record.get("text")
            if not isinstance(text, str) or not text.strip():
                raise ValueError(f"{path}:{line_number}: text must be a non-empty string")
            source_ref = record.get("source_ref")
            if source_ref is not None and not isinstance(source_ref, (str, int)):
                raise ValueError(f"{path}:{line_number}: source_ref must be a string, integer, or null")
            metadata = record.get("metadata", {})
            if not isinstance(metadata, dict):
                raise ValueError(f"{path}:{line_number}: metadata must be an object")

            documents.append({
                "document_id": document_id,
                "text": text,
                "source_ref": None if source_ref is None else str(source_ref),
                "metadata": metadata,
            })

    if len(documents) < 2:
        raise ValueError(f"{path}: at least two non-empty documents are required")
    return documents


def load_config(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as source:
        config = json.load(source)
    if not isinstance(config, dict):
        raise ValueError(f"{path}: config must be a JSON object")
    embedding_model = config.get("embedding_model")
    if not isinstance(embedding_model, str) or not embedding_model:
        raise ValueError(f"{path}: embedding_model must be a non-empty string")
    min_topic_size = config.get("min_topic_size")
    if not isinstance(min_topic_size, int) or min_topic_size < 2:
        raise ValueError(f"{path}: min_topic_size must be an integer of at least 2")
    return config


def json_safe(value: Any) -> Any:
    """Convert numpy/pandas scalar values into JSON-safe Python values."""
    if hasattr(value, "item") and callable(value.item):
        try:
            value = value.item()
        except (ValueError, TypeError):
            pass
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def membership_strength(probabilities: Any, index: int) -> float | None:
    """Return the document's scalar HDBSCAN membership score when available."""
    if probabilities is None:
        return None
    try:
        row = probabilities[index]
    except (IndexError, KeyError, TypeError):
        return None

    if hasattr(row, "tolist"):
        row = row.tolist()
    if isinstance(row, (list, tuple)):
        if not row:
            return None
        row = max(row)
    if hasattr(row, "item") and callable(row.item):
        row = row.item()
    try:
        value = float(row)
    except (TypeError, ValueError):
        return None
    return value if math.isfinite(value) else None


def ensure_empty_directory(path: Path) -> None:
    if path.exists() and (not path.is_dir() or any(path.iterdir())):
        raise ValueError(f"output path must be new or empty: {path}")
    path.mkdir(parents=True, exist_ok=True)


def topic_summaries(model: Any, topic_info: Any) -> list[dict[str, Any]]:
    rows = topic_info.to_dict(orient="records")
    summaries = []
    for row in rows:
        topic_id = int(row["Topic"])
        terms = model.get_topic(topic_id) or []
        summaries.append({
            "topic_id": topic_id,
            "name": row.get("Name"),
            "document_count": int(row.get("Count", 0)),
            "top_terms": [
                {"term": str(term), "weight": float(weight)}
                for term, weight in terms
            ],
        })
    return summaries


def write_results(
    output_dir: Path,
    documents: list[dict[str, Any]],
    topics: list[int],
    probabilities: Any,
    *,
    topic_info: Any | None = None,
    model: Any | None = None,
) -> dict[str, Any]:
    if len(documents) != len(topics):
        raise ValueError("BERTopic returned a different number of topic IDs than input documents")

    rows = []
    for index, (document, topic_id) in enumerate(zip(documents, topics)):
        rows.append({
            "document_id": document["document_id"],
            "topic_id": int(topic_id),
            "membership_strength": membership_strength(probabilities, index),
            "source_ref": document["source_ref"],
            "metadata_json": json.dumps(json_safe(document["metadata"]), ensure_ascii=False, sort_keys=True),
        })

    with (output_dir / "assignments.jsonl").open("w", encoding="utf-8") as destination:
        for row in rows:
            destination.write(json.dumps(row, ensure_ascii=False) + "\n")
    with (output_dir / "assignments.csv").open("w", encoding="utf-8", newline="") as destination:
        writer = csv.DictWriter(destination, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    topic_rows = topic_summaries(model, topic_info) if model is not None and topic_info is not None else []
    with (output_dir / "topics.json").open("w", encoding="utf-8") as destination:
        json.dump(topic_rows, destination, ensure_ascii=False, indent=2)
        destination.write("\n")

    outlier_count = sum(1 for topic_id in topics if int(topic_id) == -1)
    report = {
        "documents": len(documents),
        "topics_including_outlier": len(topic_rows),
        "assigned_to_outlier_topic": outlier_count,
        "membership_strength_available": any(row["membership_strength"] is not None for row in rows),
        "text_saved_in_outputs": False,
        "score_note": "membership_strength is a clustering diagnostic, not a calibrated probability or correctness score.",
    }
    with (output_dir / "report.json").open("w", encoding="utf-8") as destination:
        json.dump(report, destination, ensure_ascii=False, indent=2)
        destination.write("\n")
    return report


def fit(args: argparse.Namespace) -> None:
    config = load_config(args.config)
    documents = load_documents(args.input)
    output_dir = args.output
    ensure_empty_directory(output_dir)

    try:
        from bertopic import BERTopic
    except ImportError as exc:
        raise RuntimeError("BERTopic is not installed; run pip install -r requirements.txt") from exc

    model = BERTopic(
        embedding_model=config["embedding_model"],
        min_topic_size=config["min_topic_size"],
        calculate_probabilities=False,
        language=config.get("language", "english"),
        verbose=True,
    )
    topic_ids, probabilities = model.fit_transform([item["text"] for item in documents])
    model_path = output_dir / "model"
    model.save(
        str(model_path),
        serialization="safetensors",
        save_ctfidf=True,
        save_embedding_model=config["embedding_model"],
    )
    report = write_results(
        output_dir,
        documents,
        list(topic_ids),
        probabilities,
        topic_info=model.get_topic_info(),
        model=model,
    )
    report.update({
        "mode": "fit",
        "embedding_model": config["embedding_model"],
        "bertopic_version": getattr(__import__("bertopic"), "__version__", "unknown"),
        "min_topic_size": config["min_topic_size"],
    })
    (output_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report), flush=True)


def predict(args: argparse.Namespace) -> None:
    documents = load_documents(args.input)
    output_dir = args.output
    ensure_empty_directory(output_dir)

    try:
        from bertopic import BERTopic
    except ImportError as exc:
        raise RuntimeError("BERTopic is not installed; run pip install -r requirements.txt") from exc

    model = BERTopic.load(str(args.model))
    topic_ids, probabilities = model.transform([item["text"] for item in documents])
    report = write_results(output_dir, documents, list(topic_ids), probabilities)
    report.update({"mode": "predict", "model_path": str(args.model)})
    (output_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report), flush=True)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    fit_parser = commands.add_parser("fit", help="discover topics and save a reusable model")
    fit_parser.add_argument("--input", type=Path, required=True, help="prepared JSONL documents")
    fit_parser.add_argument("--output", type=Path, required=True, help="new or empty output directory")
    fit_parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    fit_parser.set_defaults(handler=fit)

    predict_parser = commands.add_parser("predict", help="assign prepared documents using a saved model")
    predict_parser.add_argument("--input", type=Path, required=True, help="prepared JSONL documents")
    predict_parser.add_argument("--model", type=Path, required=True, help="saved BERTopic model directory")
    predict_parser.add_argument("--output", type=Path, required=True, help="new or empty output directory")
    predict_parser.set_defaults(handler=predict)
    return parser


if __name__ == "__main__":
    parsed = build_parser().parse_args()
    try:
        parsed.handler(parsed)
    except (ValueError, RuntimeError, OSError, json.JSONDecodeError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(2) from error
