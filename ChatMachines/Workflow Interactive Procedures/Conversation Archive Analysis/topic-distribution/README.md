# Conversation distributions

Counts unique source conversations in the saved 12-group and 25-group cuts. Inputs are the consolidated-topic-catalog and hierarchical-topic-groups artifacts plus the current source bin manifest. The workflow computes results without rerunning topic models.

Each conversation's dominant group maximizes summed saved document topic weights. Ties select the lower group ID. Dominant counts plus unassigned conversations total 1,334. Overlapping counts include every group receiving a positive saved weight; these counts intentionally do not sum to 1,334. Long conversations have more contributions, but still count only once in each membership column. Only saved top-three topic assignments are available, and group weighting inherits approximate consolidation limitations.

Outputs include per-group counts/percentages, per-conversation memberships and weights, title/source references, and unassigned/multiple-group totals. Full source conversations remain intact. A push modifying this folder/workflow or a manual workflow run calculates and commits results, and uploads an artifact.
