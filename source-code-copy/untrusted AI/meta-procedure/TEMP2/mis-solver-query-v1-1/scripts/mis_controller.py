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
    inquiry_plan: dict[str, Any] | None = None
    external_evidence: list[dict[str, Any]] = field(default_factory=list)
    unresolved_evidence: list[dict[str, Any]] = field(default_factory=list)
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
        "Create a list of questions q1 that must be answered by the user to meet the desired "
        "state. Ask only for authority, preferences, constraints, or unavailable inputs; do not "
        "ask the user for facts that can be gathered from external sources. Return only the "
        "required return schema."
    )

    INQUIRY_PLAN_INSTRUCTION = (
        "Determine what externally checkable facts, measurements, or current state are needed to "
        "meet the desired state. Solver KB records are procedural guidance and must not be used as "
        "evidence for world claims. Set external_evidence_needed to false only when the task can be "
        "completed entirely from user-supplied inputs and deterministic local operations. Give each "
        "requirement a unique id and specify preferred authoritative sources, freshness, acquisition "
        "method, and whether it is required. Return only the required return schema."
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
            "Using desired_state and solver_guidance as context, create a list of questions q1 "
            "that must be answered by the user. Ask only for authority, preferences, constraints, "
            "or unavailable inputs; do not ask the user for facts that can be gathered from external "
            "sources. Solver guidance shapes the inquiry but is not evidence for world claims. "
            "Return only the required return schema.\n\n"
            f"desired_state={tx.desired_state!r}\nsolver_guidance={context!r}"
        )

    def _inquiry_plan_instruction(self, tx: Tx) -> str:
        return (
            f"{self.INQUIRY_PLAN_INSTRUCTION}\n\n"
            f"desired_state={tx.desired_state!r}\n"
            f"solver_guidance={self._retrieval_context_from_tx(tx)!r}\n"
            f"user_supplied_facts={tx.answers!r}"
        )

    def _evidence_instruction(self, tx: Tx) -> str:
        return (
            "Acquire the evidence required by inquiry_plan using appropriate external sources and "
            "available tools. Prefer primary and authoritative sources, satisfy freshness requirements, "
            "and search expansively enough to test material alternatives and contradictions. Return "
            "claim-relevant source content, not solver KB records. Every requirement must be covered by "
            "at least one evidence item's requirement_ids or by one unresolved entry describing attempts "
            "and the remaining gap. Return only the required return schema.\n\n"
            f"desired_state={tx.desired_state!r}\n"
            f"inquiry_plan={tx.inquiry_plan!r}"
        )

    def _script_instruction(self, tx: Tx) -> str:
        return (
            "Return an executable procedure using the separated contexts below. solver_guidance may "
            "govern methods and operations but must not support externally checkable factual claims. "
            "Base such claims on external_evidence, identify user-supplied facts as such, and label any "
            "model inference with its premises and uncertainty. The procedure must produce the requested "
            "outcome, use concrete available operations, address unresolved evidence gaps, validate the "
            "result, define failure handling and a stopping condition, and identify steps requiring user "
            "approval. Do not return a proposal, architecture-only outline, or illustrative pseudo-script. "
            "Return only the required return schema.\n\n"
            f"desired_state={tx.desired_state!r}\n"
            f"solver_guidance={self._retrieval_context_from_tx(tx)!r}\n"
            f"user_supplied_facts={tx.answers!r}\n"
            f"inquiry_plan={tx.inquiry_plan!r}\n"
            f"external_evidence={tx.external_evidence!r}\n"
            f"unresolved_evidence={tx.unresolved_evidence!r}"
        )

    @staticmethod
    def _validate_inquiry_plan(response: dict[str, Any]) -> dict[str, Any]:
        if set(response) != {"inquiry_plan"} or not isinstance(response["inquiry_plan"], dict):
            raise ValueError('Expected {"inquiry_plan":{"external_evidence_needed":true,"requirements":[]}}')
        plan = copy.deepcopy(response["inquiry_plan"])
        needed = plan.get("external_evidence_needed")
        requirements = plan.get("requirements")
        if not isinstance(needed, bool) or not isinstance(requirements, list):
            raise ValueError("inquiry_plan requires boolean external_evidence_needed and list requirements")
        ids: set[str] = set()
        required_fields = {"id", "claim_needed", "preferred_sources", "freshness", "acquisition_method", "required"}
        for requirement in requirements:
            if not isinstance(requirement, dict) or not required_fields.issubset(requirement):
                raise ValueError(f"Each information requirement requires fields: {sorted(required_fields)}")
            if not isinstance(requirement["id"], str) or not requirement["id"].strip() or requirement["id"] in ids:
                raise ValueError("Information requirement ids must be unique non-empty strings")
            if not isinstance(requirement["preferred_sources"], list) or not isinstance(requirement["required"], bool):
                raise ValueError("preferred_sources must be a list and required must be boolean")
            ids.add(requirement["id"])
        if needed != bool(requirements):
            raise ValueError("external_evidence_needed must be true exactly when requirements are present")
        return plan

    @staticmethod
    def _validate_evidence(response: dict[str, Any], plan: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        if set(response) != {"evidence", "unresolved"}:
            raise ValueError('Expected {"evidence":[],"unresolved":[]}')
        evidence, unresolved = response["evidence"], response["unresolved"]
        if not isinstance(evidence, list) or not isinstance(unresolved, list):
            raise ValueError("evidence and unresolved must be lists")
        requirement_ids = {item["id"] for item in plan["requirements"]}
        covered: set[str] = set()
        for item in evidence:
            fields = {"id", "requirement_ids", "source_type", "locator", "retrieved_at", "content"}
            if not isinstance(item, dict) or not fields.issubset(item):
                raise ValueError(f"Each evidence item requires fields: {sorted(fields)}")
            ids = item["requirement_ids"]
            if not isinstance(ids, list) or not ids or not set(ids).issubset(requirement_ids):
                raise ValueError("Evidence requirement_ids must reference inquiry_plan requirements")
            if item["source_type"] == "solver_kb":
                raise ValueError("Solver KB records cannot be submitted as external evidence")
            covered.update(ids)
        for item in unresolved:
            fields = {"requirement_id", "reason", "attempts"}
            if not isinstance(item, dict) or not fields.issubset(item):
                raise ValueError(f"Each unresolved entry requires fields: {sorted(fields)}")
            if item["requirement_id"] not in requirement_ids or not isinstance(item["attempts"], list):
                raise ValueError("Unresolved entries must reference a requirement and list acquisition attempts")
            covered.add(item["requirement_id"])
        if covered != requirement_ids:
            raise ValueError(f"Evidence packet does not account for requirements: {sorted(requirement_ids - covered)}")
        return copy.deepcopy(evidence), copy.deepcopy(unresolved)

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
            tx.phase = "questions" if q1 else "await_inquiry_plan"
            if q1:
                return tx.emit(q1[0], {"answer": "<answer>"})
            return tx.emit(
                self._inquiry_plan_instruction(tx),
                {"inquiry_plan": {"external_evidence_needed": "<boolean>", "requirements": [{
                    "id": "<id>", "claim_needed": "<claim>", "preferred_sources": ["<source>"],
                    "freshness": "<requirement>", "acquisition_method": "<method>", "required": True,
                }]}},
            )

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
            tx.phase = "await_inquiry_plan"
            return tx.emit(
                self._inquiry_plan_instruction(tx),
                {"inquiry_plan": {"external_evidence_needed": "<boolean>", "requirements": [{
                    "id": "<id>", "claim_needed": "<claim>", "preferred_sources": ["<source>"],
                    "freshness": "<requirement>", "acquisition_method": "<method>", "required": True,
                }]}},
            )

        elif tx.phase == "await_inquiry_plan":
            tx.inquiry_plan = self._validate_inquiry_plan(response)
            if tx.inquiry_plan["external_evidence_needed"]:
                tx.phase = "await_evidence"
                return tx.emit(self._evidence_instruction(tx), {"evidence": [{
                    "id": "<id>", "requirement_ids": ["<requirement-id>"],
                    "source_type": "<external-source-type>", "locator": "<source-locator>",
                    "retrieved_at": "<timestamp>", "content": "<claim-relevant-content>",
                }], "unresolved": [{
                    "requirement_id": "<requirement-id>", "reason": "<remaining-gap>",
                    "attempts": ["<attempt>"],
                }]})
            tx.phase = "await_script"

        elif tx.phase == "await_evidence":
            assert tx.inquiry_plan is not None
            tx.external_evidence, tx.unresolved_evidence = self._validate_evidence(response, tx.inquiry_plan)
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
            "external_evidence_needed": bool(tx.inquiry_plan and tx.inquiry_plan.get("external_evidence_needed")),
            "information_requirement_count": len((tx.inquiry_plan or {}).get("requirements", [])),
            "external_evidence_count": len(tx.external_evidence),
            "unresolved_evidence_count": len(tx.unresolved_evidence),
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
            "inquiry_plan": copy.deepcopy(tx.inquiry_plan),
            "external_evidence": copy.deepcopy(tx.external_evidence),
            "unresolved_evidence": copy.deepcopy(tx.unresolved_evidence),
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
            "inquiry_plan": copy.deepcopy(tx.inquiry_plan),
            "external_evidence": copy.deepcopy(tx.external_evidence),
            "unresolved_evidence": copy.deepcopy(tx.unresolved_evidence),
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
