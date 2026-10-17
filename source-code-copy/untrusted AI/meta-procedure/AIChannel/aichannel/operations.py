from __future__ import annotations

import math
import re
from collections import Counter
from copy import deepcopy
from typing import Any, Callable

_TOKEN = re.compile(r"[a-z0-9][a-z0-9_-]+")


def _path_get(value: Any, path: str) -> Any:
    cur = value
    if not path:
        return cur
    for part in path.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            raise ValueError(f"path not found: {path}")
    return cur


def _path_set(target: dict[str, Any], path: str, value: Any) -> None:
    parts = path.split(".")
    cur = target
    for part in parts[:-1]:
        nxt = cur.get(part)
        if not isinstance(nxt, dict):
            nxt = {}
            cur[part] = nxt
        cur = nxt
    cur[parts[-1]] = value


def resolve(value: Any, ctx: dict[str, Any]) -> Any:
    if isinstance(value, dict) and set(value) == {"$ref"}:
        ref = value["$ref"]
        head, _, rest = ref.partition(".")
        if head not in ctx:
            raise ValueError(f"unknown reference root: {head}")
        return deepcopy(_path_get(ctx[head], rest))
    if isinstance(value, list):
        return [resolve(v, ctx) for v in value]
    if isinstance(value, dict):
        return {k: resolve(v, ctx) for k, v in value.items()}
    return deepcopy(value)


def op_echo(ctx: dict[str, Any], spec: dict[str, Any]) -> None:
    ctx["output"] = resolve(spec.get("value", {"$ref": "input"}), ctx)


def op_require(ctx: dict[str, Any], spec: dict[str, Any]) -> None:
    root = resolve(spec.get("value", {"$ref": "input"}), ctx)
    if not isinstance(root, dict):
        raise ValueError("require operation expects an object")
    missing = [k for k in spec.get("keys", []) if k not in root]
    if missing:
        raise ValueError("missing required keys: " + ", ".join(missing))


def op_assign(ctx: dict[str, Any], spec: dict[str, Any]) -> None:
    _path_set(ctx["state"], spec["path"], resolve(spec.get("value"), ctx))


def op_append(ctx: dict[str, Any], spec: dict[str, Any]) -> None:
    path = spec["path"]
    try:
        current = _path_get(ctx["state"], path)
    except ValueError:
        current = []
        _path_set(ctx["state"], path, current)
    if not isinstance(current, list):
        raise ValueError(f"append target is not a list: {path}")
    current.append(resolve(spec.get("value"), ctx))


def _tokens(value: str) -> list[str]:
    return _TOKEN.findall(value.lower())


def op_retrieve(ctx: dict[str, Any], spec: dict[str, Any]) -> None:
    query = str(resolve(spec.get("query", {"$ref": "input.query"}), ctx))
    corpus = resolve(spec.get("corpus", []), ctx)
    if not isinstance(corpus, list):
        raise ValueError("retrieve corpus must be an array")
    docs = []
    for i, item in enumerate(corpus):
        text = item if isinstance(item, str) else " ".join(str(v) for v in item.values())
        docs.append((i, item, Counter(_tokens(text))))
    q = Counter(_tokens(query))
    n = max(1, len(docs))
    df = Counter(t for _, _, d in docs for t in d)

    def vector(c: Counter[str]) -> dict[str, float]:
        return {t: f * (math.log((n + 1) / (df[t] + 1)) + 1) for t, f in c.items()}

    qv = vector(q)
    qnorm = sum(v * v for v in qv.values()) ** 0.5 or 1.0
    ranked = []
    for index, item, doc in docs:
        dv = vector(doc)
        dot = sum(qv.get(t, 0.0) * v for t, v in dv.items())
        dnorm = sum(v * v for v in dv.values()) ** 0.5 or 1.0
        ranked.append({"index": index, "score": round(dot / (qnorm * dnorm), 6), "item": item})
    ranked.sort(key=lambda x: (-x["score"], x["index"]))
    limit = int(spec.get("limit", len(ranked)))
    ctx[spec.get("as", "matches")] = ranked[: max(0, limit)]


def op_compose(ctx: dict[str, Any], spec: dict[str, Any]) -> None:
    value = resolve(spec.get("value", {}), ctx)
    ctx[spec.get("as", "last")] = value


def op_emit(ctx: dict[str, Any], spec: dict[str, Any]) -> None:
    ctx["output"] = resolve(spec.get("value", {"$ref": "last"}), ctx)


class OperationRegistry:
    """Fixed, auditable implementation primitives referenced by runtime configuration."""

    def __init__(self) -> None:
        self._ops: dict[str, Callable[[dict[str, Any], dict[str, Any]], None]] = {
            "echo": op_echo,
            "require": op_require,
            "assign": op_assign,
            "append": op_append,
            "retrieve": op_retrieve,
            "compose": op_compose,
            "emit": op_emit,
        }

    def names(self) -> list[str]:
        return sorted(self._ops)

    def run(self, steps: list[dict[str, Any]], ctx: dict[str, Any]) -> None:
        for step in steps:
            name = step.get("op")
            if name not in self._ops:
                raise ValueError(f"unknown operation: {name}")
            before_output = deepcopy(ctx.get("output"))
            self._ops[name](ctx, step)
            alias = step.get("as")
            if alias and alias in ctx:
                ctx["last"] = deepcopy(ctx[alias])
            elif ctx.get("output") != before_output:
                ctx["last"] = deepcopy(ctx.get("output"))
