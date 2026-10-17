# Fixed 12-label conversation classification

Uses the frozen 12 group vectors from hierarchical clustering as label prototypes. No manually named categories, LLM, retraining of topic models, or aggregation of previous message-window labels is used.

One preparation job reads every source conversation, verifies checksums/counts, extracts explicit user/assistant text across all message nodes once, and computes a shared TF-IDF representation in the saved 73,106-term vocabulary. It applies the same corpus-wide IDF weights to each fixed group centroid. This adaptation to a fixed vocabulary is a zero-shot lexical classifier, not a supervised model trained on labeled examples.

Four parallel classification matrix jobs each consume a disjoint quarter of the conversations, balanced greedily by text length. Each returns the nearest label by cosine similarity. Equal scores select lower label ID. Conversations without any positive match are explicitly unassigned. Alternative branches are included as unordered text, not invented linear exchanges; long/mixed conversations may have multiple subjects despite the requested single-label result.

Collection verifies 1,334 unique conversations across the four batches and saves per-conversation label, all 12 scores, margin, source reference and status. Outputs are JSONL, CSV and summary JSON. Cosine scores/margins are diagnostics, not calibrated probabilities or validated correctness. Original source data is unchanged. Only retained text is modeled; non-text attachment parts and system/tool messages are excluded. Group labels are automatically generated keyword strings.

Workflow runs on a push changing classify.py, config.json or the workflow, or manually. Results are committed under outputs/ and uploaded as an artifact. CLI modes: prepare, classify --batch 0..3, collect. Preparation expects downloaded source artifacts at merged/ and clustered/; classification expects prepared/; collection expects results/.
