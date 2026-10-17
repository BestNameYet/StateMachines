from __future__ import annotations
import hashlib, pathlib
from typing import Any
try:
    from .retrieval_adapter import RetrievalResult
    from .solver_query import KB_PATH, KNOWLEDGE_TYPES, search_knowledge
except ImportError:
    from retrieval_adapter import RetrievalResult
    from solver_query import KB_PATH, KNOWLEDGE_TYPES, search_knowledge

class SolverKnowledgeAdapter:
    adapter_id = "execution-kb-native-bm25-v1"
    def __init__(self, kb_path: str|pathlib.Path=KB_PATH): self.kb_path=pathlib.Path(kb_path)
    def retrieve_context(self, query: str, limit: int=5) -> RetrievalResult:
        result=search_knowledge(query,sorted(KNOWLEDGE_TYPES),top_k=limit,kb_path=self.kb_path)
        matches=[]
        for hit in result["results"]:
            rec=hit["record"]
            matches.append({
                "id":hit["id"], "type":hit["type"], "score":hit["score"], "source":hit["source"],
                "summary":rec.get("summary"), "retrieval":rec.get("retrieval",{}),
                "record":rec,
            })
        sha=hashlib.sha256(self.kb_path.read_bytes()).hexdigest()
        return RetrievalResult(query=query,matches=matches,status="ok",adapter_id=self.adapter_id,
            provenance={"kb_path":str(self.kb_path),"kb_sha256":sha,"kb_schema":result.get("schema"),
                        "kb_version":result.get("version"),"retrieval":"native BM25-style + id/alias boosts + type priors + 1-hop links"})
