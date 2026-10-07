import argparse, json
from solver_query import rank_all_knowledge
p=argparse.ArgumentParser(); p.add_argument("query"); a=p.parse_args()
print(json.dumps(rank_all_knowledge(a.query),ensure_ascii=False,indent=2))
