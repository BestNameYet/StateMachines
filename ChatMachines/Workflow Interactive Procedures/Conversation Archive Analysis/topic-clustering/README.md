# Hierarchical topic clustering

Group the saved 54 merged topic vectors into broader divisions using average-linkage agglomerative clustering and cosine distance. No LLM, predefined categories, fixed group count, or manual topic selection is used. SciPy builds the full hierarchy; configurable thresholds cut that hierarchy at different levels.

## Run

Install `requirements.txt`, then:
```bash
python cluster.py --config config.json --input <consolidated-topic-catalog-directory> --output <new-directory>
python -m unittest discover -s . -p 'test_*.py'
```

Input files: `topics.json`, `vocabulary.json`, `merged_topic_vectors.npz` from the existing merger. The workflow reads the source run/artifact from config, downloads it from this repository, tests, clusters and uploads `hierarchical-topic-groups`. A commit changing this folder or its workflow runs it; manual workflow runs are supported. It does not retrain the corpus or invoke Gemini.

## Config and interpretation

`distance_thresholds` defaults to [0.50, 0.65, 0.80, 0.90]. Lower values retain finer distinctions; higher values produce broader divisions. These are cosine-distance thresholds (not similarities or confidence levels). Average linkage uses average cross-cluster distance; it does not require every pair within the result to be close. All topics, including filler/noisy clusters, are retained, and singleton groups remain visible.

`keywords_per_group`, `label_terms`, and `representatives_per_group` control group summaries. Labels are the strongest terms in the equal-topic-weight centroid; these are not validated semantic names. Every topic contributes equally, irrespective of how many source documents it has.

## Outputs

- `groups-distance-*.json`: all group memberships, centroid keywords, representative source document IDs and maximum within-group distance.
- Matching CSV files: topic ID to group ID crosswalk at each threshold.
- `dendrogram.png` / `dendrogram.svg`: full labeled hierarchy.
- `hierarchy.json`: linkage matrix and leaf topic IDs for reproducibility.
- `summary.json`: group/singleton counts and cosine silhouette scores at each cut.
- `config.json` and `input-receipts.json`: settings and source checksums.

Silhouette measures lexical separation, not semantic correctness. No best cut is chosen automatically. Group IDs are local to each threshold, and groups remain provisional until source evidence is reviewed. The current vectors inherit the approximate merge's independent-model/IDF limitations. Artifacts expire after 30 days; preserve selected results before expiry.
