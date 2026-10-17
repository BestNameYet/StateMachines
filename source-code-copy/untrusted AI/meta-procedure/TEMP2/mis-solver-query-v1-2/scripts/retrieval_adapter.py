from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Any, Mapping, Protocol, runtime_checkable


@dataclass(frozen=True)
class RetrievalResult:
    """Normalized result consumed by MIS and returned by the public retrieval boundary."""

    query: str
    matches: list[dict[str, Any]] = field(default_factory=list)
    status: str = "ok"
    adapter_id: str = "null"
    provenance: dict[str, Any] = field(default_factory=dict)
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "query": self.query,
            "matches": copy.deepcopy(self.matches),
            "status": self.status,
            "adapter_id": self.adapter_id,
            "provenance": copy.deepcopy(self.provenance),
            "error": self.error,
        }


@runtime_checkable
class RetrievalAdapter(Protocol):
    """Future Solver/KB adapters implement exactly this local Python interface."""

    adapter_id: str

    def retrieve_context(self, query: str, limit: int = 52) -> RetrievalResult | Mapping[str, Any]:
        ...


class NullRetrievalAdapter:
    """Default adapter: preserves bare MIS behavior when no KB is installed."""

    adapter_id = "null"

    def retrieve_context(self, query: str, limit: int = 52) -> RetrievalResult:
        return RetrievalResult(query=query, matches=[], adapter_id=self.adapter_id)


class RetrievalService:
    """Single fail-open normalization boundary shared by MIS and public tool calls."""

    def __init__(self, adapter: RetrievalAdapter | None = None):
        self.adapter: RetrievalAdapter = adapter or NullRetrievalAdapter()

    def set_adapter(self, adapter: RetrievalAdapter | None) -> None:
        self.adapter = adapter or NullRetrievalAdapter()

    def retrieve(self, query: str, limit: int = 52) -> RetrievalResult:
        if not isinstance(query, str) or not query.strip():
            raise ValueError("query must be a non-empty string")
        if not isinstance(limit, int) or isinstance(limit, bool) or limit < 1 or limit > 52:
            raise ValueError("limit must be an integer from 1 to 52")

        adapter_id = str(getattr(self.adapter, "adapter_id", self.adapter.__class__.__name__))
        try:
            raw = self.adapter.retrieve_context(query, limit)
            return self._normalize(query, raw, adapter_id)
        except Exception as exc:  # Retrieval must not prevent a transaction from starting.
            return RetrievalResult(
                query=query,
                matches=[],
                status="error",
                adapter_id=adapter_id,
                provenance={},
                error=f"{exc.__class__.__name__}: {exc}",
            )

    @staticmethod
    def _normalize(
        query: str,
        raw: RetrievalResult | Mapping[str, Any],
        fallback_adapter_id: str,
    ) -> RetrievalResult:
        if isinstance(raw, RetrievalResult):
            candidate = raw.to_dict()
        elif isinstance(raw, Mapping):
            candidate = dict(raw)
        else:
            raise TypeError("adapter result must be RetrievalResult or mapping")

        matches = candidate.get("matches", [])
        if not isinstance(matches, list) or not all(isinstance(item, Mapping) for item in matches):
            raise TypeError("adapter result 'matches' must be a list of mappings")

        provenance = candidate.get("provenance", {})
        if provenance is None:
            provenance = {}
        if not isinstance(provenance, Mapping):
            raise TypeError("adapter result 'provenance' must be a mapping")

        status = candidate.get("status", "ok")
        if status not in {"ok", "error"}:
            raise ValueError("adapter result 'status' must be 'ok' or 'error'")

        error = candidate.get("error")
        if error is not None and not isinstance(error, str):
            raise TypeError("adapter result 'error' must be a string or null")

        return RetrievalResult(
            query=query,
            matches=[copy.deepcopy(dict(item)) for item in matches],
            status=status,
            adapter_id=str(candidate.get("adapter_id") or fallback_adapter_id),
            provenance=copy.deepcopy(dict(provenance)),
            error=error,
        )


def public_retrieve(service: RetrievalService, query: str, limit: int = 52) -> dict[str, Any]:
    """Public MCP/tool boundary. MIS never calls this function through MCP transport."""

    return service.retrieve(query, limit).to_dict()
