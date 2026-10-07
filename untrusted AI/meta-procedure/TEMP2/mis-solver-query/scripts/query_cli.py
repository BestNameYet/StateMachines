import argparse, json
from solver_query import KNOWLEDGE_TYPES, search_knowledge
p=argparse.ArgumentParser(); p.add_argument("query"); p.add_argument("--top-k",type=int,default=8); p.add_argument("--types",nargs="*",default=sorted(KNOWLEDGE_TYPES)); a=p.parse_args()
print(json.dumps(search_knowledge(a.query,a.types,a.top_k),ensure_ascii=False,indent=2))
