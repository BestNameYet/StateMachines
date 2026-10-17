# TF-IDF + NMF topic discovery

A CPU-based, unsupervised baseline. No LLM, pretrained language model, API key, or Gemini request is used. Topic keywords are candidates requiring review, not final classification labels.

## Files and execution

- `config.json`: input manifest, roles, document size, vocabulary filters, NMF settings and output limits.
- `run.py`: verify source hashes/counts, prepare message documents, fit one TF-IDF vocabulary and NMF model over the whole dataset, and save results.
- `test_pipeline.py`: source integrity, branch identity, excluded content, window boundaries and end-to-end model checks.
- `requirements.txt`: pinned runtime dependencies.
- Workflow: `.github/workflows/conversation-tfidf-nmf.yml`. Pushes to this folder run tests only. Use **Run workflow** to fit the configured dataset; it uploads results and does not commit derived analysis automatically.

From repository root:

```bash
python -m pip install -r "ChatMachines/Workflow Interactive Procedures/Conversation Archive Analysis/tfidf-nmf/requirements.txt"
python -m unittest discover -s "ChatMachines/Workflow Interactive Procedures/Conversation Archive Analysis/tfidf-nmf" -p "test_*.py"
python "ChatMachines/Workflow Interactive Procedures/Conversation Archive Analysis/tfidf-nmf/run.py" --config "ChatMachines/Workflow Interactive Procedures/Conversation Archive Analysis/tfidf-nmf/config.json" --output nmf-results/run-01
```

Output must be a new or empty directory. Paths in config are repository-relative. `--repo-root` permits an explicit checkout location. Run only trusted model files when loading joblib.

## Preparation choices

Default document unit: one message node, split at 1,000 words when longer. Windows do not overlap; offsets refer to the joined explicit text parts, not original JSON byte positions. Every source node is visited once, including alternative branches, without inventing an ordering across branches. Node IDs and source-file/record references distinguish repeated message IDs. Distinct nodes containing repeated text are retained and can influence frequencies.

Explicit string text parts and typed text parts are modeled. User and assistant roles are included; tool/system/other roles, non-text parts and messages under five words are intentionally excluded and counted in the coverage report. No titles, URL metadata, attachment identifiers or arbitrary nested values are turned into prose. Sources are not modified; this analytical view is not a replacement for the unresolved retention specification. Other content formats need explicit extraction rules before inclusion.

Defaults: 20 topics, unigrams/bigrams, English stop words, minimum document frequency 3, maximum 85%, 30,000 vocabulary terms, sublinear TF. These are starting settings, not validated optimal choices. Edit the config to compare topic counts and filters on the same corpus. The program fails clearly if eligible data cannot support the configured topic count. English defaults need revision for multilingual analysis. Short messages and limited context can produce noisy clusters; long assistant answers can dominate. A later passage/exchange pipeline requires a separate, branch-aware design.

## Results

- `topics.json`: ranked terms and representative document IDs per topic.
- `document_topics.jsonl`: source references, spans and top topic weights per document; no message text.
- `report.json`: coverage/exclusion counters, zero-vector documents, reconstruction error, iterations and convergence warnings.
- `sources.json`: source paths, byte counts and verified SHA-256 hashes.
- `config.json`: exact configuration used.
- `model.joblib`: fitted vocabulary/vectorizer and NMF model for compatible future transforms.

Relative weights are normalized NMF activations, not probabilities. Only the configured top topics are emitted per document, so their displayed weights may sum to less than one. Topic numbers have meaning only within the fitted model. Compare representatives with source messages before interpreting labels. The model vocabulary and topic keywords are derived private data; the workflow stores them as repository-access-controlled Actions artifacts for 30 days. Preserve chosen runs separately before expiry.

See the [scikit-learn topic extraction example](https://scikit-learn.org/stable/auto_examples/applications/plot_topics_extraction_with_nmf_lda.html).
