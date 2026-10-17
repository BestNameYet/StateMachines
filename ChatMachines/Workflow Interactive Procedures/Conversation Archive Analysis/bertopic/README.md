# BERTopic topic discovery and assignment

This folder contains a BERTopic model runner for **prepared text documents**. BERTopic discovers clusters without labeled training examples, then can assign new prepared documents to the saved model's topics. It is not a supervised classifier with human-validated category names.

The runner accepts JSON Lines with one object per analysis document:

```json
{"document_id":"stable-id","text":"prepared passage text","source_ref":"conversation/message reference","metadata":{"period":"2025"}}
```

Use stable IDs and source references. Input text is used in memory for modeling but is not written to the result files. Outputs contain topic IDs, optional HDBSCAN membership strengths, topic terms, references, and metadata. Topic `-1` marks documents BERTopic leaves as outliers. Membership strengths are diagnostics, not calibrated probabilities or correctness scores.

## Install and test

Python 3.10 or newer is required. From the repository root:

```bash
python -m pip install -r "ChatMachines/Workflow Interactive Procedures/Conversation Archive Analysis/bertopic/requirements.txt"
python -m unittest discover -s "ChatMachines/Workflow Interactive Procedures/Conversation Archive Analysis/bertopic" -p "test_*.py"
```

The pinned BERTopic release is 0.17.4. The default embedding backend uses Sentence Transformers and downloads `sentence-transformers/all-MiniLM-L6-v2` the first time it runs.

## Fit a model

Prepare a JSONL file with at least two documents and run:

```bash
python "ChatMachines/Workflow Interactive Procedures/Conversation Archive Analysis/bertopic/run.py" fit \
  --input path/to/prepared_documents.jsonl \
  --output bertopic-results/run-01
```

The default config is in `config.json`. BERTopic chooses topic groupings from the input; `min_topic_size` is a clustering parameter, not a target topic count. Long conversations should be prepared into context-preserving passages before modeling so sentence-transformer input truncation does not silently discard later text. Follow the archive-analysis checklist for document boundaries and coverage before preparing a full-corpus run.

## Assign new documents

```bash
python "ChatMachines/Workflow Interactive Procedures/Conversation Archive Analysis/bertopic/run.py" predict \
  --input path/to/new_prepared_documents.jsonl \
  --model bertopic-results/run-01/model \
  --output bertopic-results/predictions-01
```

Each output directory must be new or empty. Results include `assignments.jsonl`, `assignments.csv`, `topics.json`, and `report.json`; fitted runs also save a reusable model under `model/`. Review topic terms and source documents before treating a cluster as a meaningful label.

BERTopic uses transformer embeddings followed by dimensionality reduction, density clustering, and class-based TF-IDF topic representations. Results depend on the chosen embedding model, document boundaries, and clustering settings. Keep the config and dependency versions with every run.

## References

- [BERTopic installation and release](https://pypi.org/project/bertopic/)
- [BERTopic quick start](https://maartengr.github.io/BERTopic/getting_started/quickstart/quickstart.html)
- [BERTopic embedding backends](https://maartengr.github.io/BERTopic/getting_started/embeddings/embeddings.html)
