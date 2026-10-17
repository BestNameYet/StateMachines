from __future__ import annotations

import copy
import datetime as dt
import uuid
from dataclasses import dataclass, field
from typing import Any

try:
    from .retrieval_adapter import RetrievalResult, RetrievalService
except ImportError:  # Allows direct script-path imports in the existing server layout.
    from retrieval_adapter import RetrievalResult, RetrievalService


def utcnow() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


@dataclass
class Tx:
    id: str
    desired_state: str
    retrieval_status: str = "ok"
    retrieval_query: str = ""
    retrieval_matches: list[dict[str, Any]] = field(default_factory=list)
    retrieval_adapter_id: str = "null"
    retrieval_provenance: dict[str, Any] = field(default_factory=dict)
    retrieval_error: str | None = None
    phase: str = "await_q1"
    questions: list[str] = field(default_factory=list)
    answers: list[dict[str, Any]] = field(default_factory=list)
    question_index: int = 0
    events: list[dict[str, Any]] = field(default_factory=list)
    final_script: str | None = None
    post_report: dict[str, Any] | None = None

    def emit(self, instruction: str, return_schema: dict[str, Any]) -> dict[str, Any]:
        event = {
            "sequence": len(self.events),
            "ts": utcnow(),
            "direction": "stdout",
            "instruction": instruction,
            "return_schema": copy.deepcopy(return_schema),
        }
        self.events.append(event)
        return {
            "transaction_id": self.id,
            "instruction": instruction,
            "return_schema": copy.deepcopy(return_schema),
        }

    def accept(self, response: dict[str, Any]) -> None:
        self.events.append(
            {
                "sequence": len(self.events),
                "ts": utcnow(),
                "direction": "stdin",
                "response": copy.deepcopy(response),
            }
        )


class MISController:
    """Minimal Instruction Set with an optional pre-q1 retrieval/context hook."""

    BARE_Q1_INSTRUCTION = (
        "Create a list of questions q1 that would assist a solver such as yourself in meeting "
        "the desired state. Return only the required return schema."
    )

    BARE_SCRIPT_INSTRUCTION = (
        "Return an executable procedure using desired_state and qa1 as context. The procedure "
        "must produce the requested outcome, use concrete operations available to the solver, "
        "validate the result, define failure handling and a stopping condition, and identify any "
        "step that requires user approval. Do not return a proposal, architecture-only outline, "
        "or illustrative pseudo-script. Return only the required return schema."
    )

    def __init__(self, retrieval_service: RetrievalService | None = None, retrieval_limit: int = 5):
        self.retrieval_service = retrieval_service or RetrievalService()
        self.retrieval_limit = retrieval_limit
        self.txs: dict[str, Tx] = {}

    @staticmethod
    def _retrieval_context(result: RetrievalResult) -> dict[str, Any]:
        # Only prospective, task-relevant retrieval data is injected into model context.
        return {
            "adapter_id": result.adapter_id,
            "provenance": copy.deepcopy(result.provenance),
            "matches": copy.deepcopy(result.matches),
        }

    def _q1_instruction(self, tx: Tx) -> str:
        if not tx.retrieval_matches:
            return self.BARE_Q1_INSTRUCTION
        context = self._retrieval_context_from_tx(tx)
        return (
            "Using desired_state and retrieved_context as context, create a list of questions q1 "
            "that would assist a solver such as yourself in meeting the desired state. Return only "
            "the required return schema.\n\n"
            f"desired_state={tx.desired_state!r}\nretrieved_context={context!r}"
        )

    def _script_instruction(self, tx: Tx) -> str:
        if not tx.retrieval_matches:
            return self.BARE_SCRIPT_INSTRUCTION
        context = self._retrieval_context_from_tx(tx)
        return (
            "Return an executable procedure using desired_state, retrieved_context, and qa1 as "
            "context. The procedure must produce the requested outcome, use concrete operations "
            "available to the solver, validate the result, define failure handling and a stopping "
            "condition, and identify any step that requires user approval. Do not return a proposal, "
            "architecture-only outline, or illustrative pseudo-script. Return only the required "
            "return schema.\n\n"
            f"desired_state={tx.desired_state!r}\nretrieved_context={context!r}\nqa1={tx.answers!r}"
        )

    @staticmethod
    def _retrieval_context_from_tx(tx: Tx) -> dict[str, Any]:
        return {
            "adapter_id": tx.retrieval_adapter_id,
            "provenance": copy.deepcopy(tx.retrieval_provenance),
            "matches": copy.deepcopy(tx.retrieval_matches),
        }

    def start(self, desired_state: str) -> dict[str, Any]:
        if not isinstance(desired_state, str) or not desired_state.strip():
            raise ValueError("desired_state must be a non-empty string")

        txid = str(uuid.uuid4())
        retrieval = self.retrieval_service.retrieve(desired_state, self.retrieval_limit)
        tx = Tx(
            id=txid,
            desired_state=desired_state,
            retrieval_status=retrieval.status,
            retrieval_query=retrieval.query,
            retrieval_matches=copy.deepcopy(retrieval.matches),
            retrieval_adapter_id=retrieval.adapter_id,
            retrieval_provenance=copy.deepcopy(retrieval.provenance),
            retrieval_error=retrieval.error,
        )
        tx.events.append(
            {
                "sequence": 0,
                "ts": utcnow(),
                "direction": "internal",
                "event": "kb_retrieval",
                "status": retrieval.status,
                "query": retrieval.query,
                "adapter_id": retrieval.adapter_id,
                "provenance": copy.deepcopy(retrieval.provenance),
                "match_count": len(retrieval.matches),
                "matches": copy.deepcopy(retrieval.matches),
                "error": retrieval.error,
            }
        )
        self.txs[txid] = tx
        return tx.emit(self._q1_instruction(tx), {"q1": ["<question>"]})

    def respond(self, txid: str, response: dict[str, Any]) -> dict[str, Any]:
        tx = self.txs[txid]
        tx.accept(response)

        if tx.phase == "await_q1":
            q1 = response.get("q1")
            if not isinstance(q1, list) or not all(isinstance(q, str) and q.strip() for q in q1):
                raise ValueError('Expected {"q1":["<question>"]}')
            tx.questions = q1
            tx.phase = "questions" if q1 else "await_script"
            if q1:
                return tx.emit(q1[0], {"answer": "<answer>"})

        elif tx.phase == "questions":
            if set(response) != {"answer"}:
                raise ValueError('Expected {"answer":"<answer>"}')
            tx.answers.append(
                {
                    "question": tx.questions[tx.question_index],
                    "answer": response["answer"],
                }
            )
            tx.question_index += 1
            if tx.question_index < len(tx.questions):
                return tx.emit(tx.questions[tx.question_index], {"answer": "<answer>"})
            tx.phase = "await_script"

        elif tx.phase == "await_script":
            script = response.get("script")
            if not isinstance(script, str) or not script.strip():
                raise ValueError('Expected {"script":"<script>"}')
            tx.final_script = script
            tx.phase = "complete"
            return self.status(txid)

        else:
            raise ValueError("Transaction is already complete")

        return tx.emit(self._script_instruction(tx), {"script": "<script>"})

    def status(self, txid: str) -> dict[str, Any]:
        tx = self.txs[txid]
        return {
            "transaction_id": tx.id,
            "desired_state": tx.desired_state,
            "phase": tx.phase,
            "question_index": tx.question_index,
            "question_count": len(tx.questions),
            "retrieval_status": tx.retrieval_status,
            "retrieval_match_count": len(tx.retrieval_matches),
            "retrieval_adapter_id": tx.retrieval_adapter_id,
            "complete": tx.phase == "complete",
        }

    def prospective_state(self, txid: str) -> dict[str, Any]:
        """Model-safe current projection; excludes the complete retrospective event ledger."""
        tx = self.txs[txid]
        return {
            **self.status(txid),
            "retrieval": {
                "query": tx.retrieval_query,
                "status": tx.retrieval_status,
                "adapter_id": tx.retrieval_adapter_id,
                "provenance": copy.deepcopy(tx.retrieval_provenance),
                "matches": copy.deepcopy(tx.retrieval_matches),
                "error": tx.retrieval_error,
            },
            "questions": copy.deepcopy(tx.questions),
            "answers": copy.deepcopy(tx.answers),
        }

    def receipt(self, txid: str) -> dict[str, Any]:
        tx = self.txs[txid]
        return {
            "transaction_id": tx.id,
            "desired_state": tx.desired_state,
            "retrieval": {
                "query": tx.retrieval_query,
                "status": tx.retrieval_status,
                "adapter_id": tx.retrieval_adapter_id,
                "provenance": copy.deepcopy(tx.retrieval_provenance),
                "matches": copy.deepcopy(tx.retrieval_matches),
                "error": tx.retrieval_error,
            },
            "events": copy.deepcopy(tx.events),
            "status": self.status(txid),
            "final_script": tx.final_script,
        }

    def finalize(self, txid: str, report: dict[str, Any]) -> dict[str, Any]:
        tx = self.txs[txid]
        tx.post_report = copy.deepcopy(report)
        tx.events.append(
            {
                "sequence": len(tx.events),
                "ts": utcnow(),
                "direction": "post",
                "report": copy.deepcopy(report),
            }
        )
        return self.receipt(txid)
