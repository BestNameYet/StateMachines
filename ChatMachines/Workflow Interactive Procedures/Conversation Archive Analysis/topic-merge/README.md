# Topic catalog merger

Approximate consolidation of four independent TF-IDF/NMF topic catalogs, without refitting the corpus or making LLM calls.

Run `python merge.py --config config.json --input <collected-artifact-directory> --output <new-directory>` with the parent's `tfidf-nmf/requirements.txt` installed. Input must contain `partition-0` through `partition-3`. Only load trusted model.joblib files: joblib loading can execute code.

Configuration names the source Actions run/artifact, partition count, cosine threshold (default 0.70), optional local-IDF removal, and expected coverage. The workflow downloads the configured run's collected artifact from this repository, runs tests and the merger, and uploads `consolidated-topic-catalog`. Editing this folder triggers a merge; manual workflow runs are also available. It never reruns the four source models.

Algorithm: align full component vectors by vocabulary term; optionally divide component weights by their local IDF (an approximate adjustment); L2 normalize; compute cosine similarity; greedily merge the strongest qualifying clusters using complete linkage. Every pair in each merged group must meet the threshold, preventing weak transitive chain matches. By default a group contains at most one topic from each source partition. Unmatched topics remain separate. Global vectors are equal-weight normalized centroids, not globally trained NMF components.

Outputs: `topics.json`, local/global `crosswalk.json`, remapped `document_topics.jsonl` retaining original local assignments and source references, all pairwise similarity scores, aligned vocabulary, sparse centroid vectors, summary/config and input-file checksums. Duplicate files/documents, missing topics, source coverage mismatches, invalid vectors and lost assignment weight fail the run.

Only saved top-three assignments can be remapped; omitted weights cannot be recovered. Saved weight mass is preserved without renormalization or claims of cross-model calibration. IDF removal cannot undo document normalization or independent learning. Similar word use does not prove semantic equivalence; review candidate groups and source examples, and tune the threshold as needed. Global IDs are deterministic within an identical run configuration, not stable across changed thresholds. Results remain access-controlled Actions artifacts for 30 days.
