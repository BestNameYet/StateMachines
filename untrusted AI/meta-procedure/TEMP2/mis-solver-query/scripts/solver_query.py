from __future__ import annotations
import copy, json, math, pathlib, re
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parents[1]
KB_PATH = ROOT / "data" / "execution_knowledge_base.json"
KNOWLEDGE_TYPES = {"action","capability","heuristic","instruction","invariant","pattern","procedure"}
_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _tokens(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower().replace("_", " ").replace("-", " ").replace(".", " "))


def _flatten_text(value: Any) -> str:
    if isinstance(value, str): return value
    if isinstance(value, list): return " ".join(_flatten_text(v) for v in value)
    if isinstance(value, dict): return " ".join(f"{k} {_flatten_text(v)}" for k,v in value.items())
    if value is None: return ""
    return str(value)


def _record_search_text(item: dict[str, Any]) -> str:
    parts=[item.get("id",""),item.get("type",""),item.get("summary",""),_flatten_text(item.get("retrieval",{}))]
    if item.get("type") in {"action","procedure"}:
        parts.append(_flatten_text(item.get("applicability",{})))
        parts.append(_flatten_text(item.get("execution",{}).get("success","")))
    if item.get("type")=="capability": parts.append(_flatten_text(item.get("interface",{})))
    if item.get("type")=="pattern": parts.append(_flatten_text(item.get("composition",[])))
    return " ".join(parts)


def _link_ids(item: dict[str, Any]) -> list[str]:
    links=item.get("links",{})
    if not isinstance(links,dict): return []
    out=[]
    for value in links.values():
        if isinstance(value,list): out.extend(v for v in value if isinstance(v,str))
    return out


def load_kb(path: str|pathlib.Path=KB_PATH) -> dict[str, Any]:
    obj=json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    if not isinstance(obj,dict) or not isinstance(obj.get("records"),list):
        raise ValueError("KB must be an object containing a records list")
    return obj


def search_knowledge(query: str, requested_types: list[str]|None=None, top_k: int|None=None, kb_path: str|pathlib.Path=KB_PATH) -> dict[str, Any]:
    """Canonical Solver-KB query recovered from execution_contract_controller.py.

    Ranking: BM25-style token score + exact ID/alias boosts + type priors,
    followed by one-hop linked-record expansion. This is intentionally not the
    unrelated ChatGPT-history NumPy/GloVe query implementation.
    """
    if not isinstance(query,str) or not query.strip(): raise ValueError("knowledge query must be non-empty")
    kb=load_kb(kb_path)
    cfg=kb.get("retrieval",{}) if isinstance(kb.get("retrieval"),dict) else {}
    max_k=int(cfg.get("max_top_k",16)); k=min(max(1,int(top_k or cfg.get("default_top_k",8))),max_k)
    types=requested_types or sorted(KNOWLEDGE_TYPES)
    bad=[t for t in types if t not in KNOWLEDGE_TYPES]
    if bad: raise ValueError(f"unknown knowledge types: {bad}")
    qset=set(_tokens(query))
    records=[r for r in kb["records"] if isinstance(r,dict) and r.get("type") in types]
    if not records:
        return {"schema":kb.get("schema"),"version":kb.get("version"),"query":query,"types":types,"results":[]}
    docs={}; df={}
    for r in records:
        toks=_tokens(_record_search_text(r)); docs[r["id"]]=toks
        for tok in set(toks): df[tok]=df.get(tok,0)+1
    n=len(records); avgdl=sum(map(len,docs.values()))/max(n,1)
    priors=cfg.get("type_prior",{}) if isinstance(cfg.get("type_prior"),dict) else {}
    scored=[]
    low_query=query.lower()
    for r in records:
        toks=docs[r["id"]]; counts={}
        for tok in toks: counts[tok]=counts.get(tok,0)+1
        score=0.0
        for tok in qset:
            if tok not in counts: continue
            freq=counts[tok]
            idf=math.log(1.0+(n-df.get(tok,0)+0.5)/(df.get(tok,0)+0.5))
            denom=freq+1.2*(1-0.75+0.75*len(toks)/max(avgdl,1.0))
            score += idf*(freq*2.2/denom)
        kid=str(r["id"]).lower()
        if kid in low_query: score += 8.0
        retrieval=r.get("retrieval",{}) if isinstance(r.get("retrieval"),dict) else {}
        aliases=retrieval.get("aliases",[])
        if isinstance(aliases,list):
            for alias in aliases:
                if isinstance(alias,str) and alias.lower() in low_query: score += 4.0
        score *= float(priors.get(r.get("type"),1.0))
        if score>0: scored.append((score,r))
    scored.sort(key=lambda x:(-x[0],x[1]["id"])); primary=scored[:k]
    by_id={r["id"]:r for r in kb["records"] if isinstance(r,dict) and isinstance(r.get("id"),str)}
    results=[]; seen=set()
    for score,r in primary:
        results.append({"id":r["id"],"type":r["type"],"score":round(score,6),"source":"primary","record":copy.deepcopy(r)})
        seen.add(r["id"])
    for score,r in primary:
        for linked_id in _link_ids(r):
            if linked_id in seen or linked_id not in by_id: continue
            linked=by_id[linked_id]
            results.append({"id":linked_id,"type":linked.get("type"),"score":round(score*0.35,6),"source":f"link:{r['id']}","record":copy.deepcopy(linked)})
            seen.add(linked_id)
            if len(results)>=max_k: break
        if len(results)>=max_k: break
    return {"schema":kb.get("schema"),"version":kb.get("version"),"query":query,"types":types,"results":results}
