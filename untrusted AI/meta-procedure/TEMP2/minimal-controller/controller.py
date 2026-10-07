from __future__ import annotations

import json
import os
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class Transaction:
    transaction_id: str
    desired_state: str
    phase: str = "questions"
    questions: list[str] = field(default_factory=list)
    answers: list[dict[str, str]] = field(default_factory=list)
    question_index: int = 0
    script: str | None = None
    events: list[dict[str, Any]] = field(default_factory=list)


class Controller:
    """Deterministic instruction, validation, and receipt controller."""

    def __init__(self, receipt_dir: Path | None = None) -> None:
        self.transactions: dict[str, Transaction] = {}
        self.receipt_dir = receipt_dir or self._default_receipt_dir()

    def start(self, desired_state: str) -> dict[str, Any]:
        if not isinstance(desired_state, str) or not desired_state.strip():
            raise ValueError("desired_state must be a non-empty string")
        transaction_id = str(uuid.uuid4())
        transaction = Transaction(transaction_id, desired_state.strip())
        self.transactions[transaction_id] = transaction
        request = self._request(
            transaction,
            "Create a list of questions q1 that would assist a solver such as yourself in meeting "
            "the desired state. Return only the required return schema.",
            {"q1": ["<question>"]},
        )
        self._save(transaction)
        return {"transaction_id": transaction_id, **request}

    def respond(self, transaction_id: str, response: dict[str, Any]) -> dict[str, Any]:
        transaction = self._require(transaction_id)
        if not isinstance(response, dict):
            return self._reject(transaction, "response must be a JSON object")

        if transaction.phase == "questions":
            error = self._validate_questions(response)
            if error:
                return self._reject(transaction, error)
            self._record(transaction, "stdin", response)
            transaction.questions = response["q1"]
            if transaction.questions:
                transaction.phase = "answers"
                result = self._ask_current_question(transaction)
            else:
                result = self._ask_for_script(transaction)
        elif transaction.phase == "answers":
            error = self._validate_answer(response)
            if error:
                return self._reject(transaction, error)
            self._record(transaction, "stdin", response)
            question = transaction.questions[transaction.question_index]
            transaction.answers.append({"question": question, "answer": response["answer"]})
            transaction.question_index += 1
            if transaction.question_index < len(transaction.questions):
                result = self._ask_current_question(transaction)
            else:
                result = self._ask_for_script(transaction)
        elif transaction.phase == "script":
            error = self._validate_script(response)
            if error:
                return self._reject(transaction, error)
            self._record(transaction, "stdin", response)
            transaction.script = response["script"]
            transaction.phase = "complete"
            result = {
                "transaction_id": transaction_id,
                "status": "complete",
                "message": "Thanks, that completes the interrogation.",
                "script": transaction.script,
                "execution": "not_run",
            }
            self._record(transaction, "stdout", result)
        else:
            raise ValueError("transaction is already complete")

        self._save(transaction)
        return result

    def status(self, transaction_id: str) -> dict[str, Any]:
        transaction = self._require(transaction_id)
        return {
            "transaction_id": transaction.transaction_id,
            "desired_state": transaction.desired_state,
            "phase": transaction.phase,
            "question_index": transaction.question_index,
            "question_count": len(transaction.questions),
            "complete": transaction.phase == "complete",
        }

    def receipt(self, transaction_id: str) -> dict[str, Any]:
        return asdict(self._require(transaction_id))

    def _ask_current_question(self, transaction: Transaction) -> dict[str, Any]:
        return {
            "transaction_id": transaction.transaction_id,
            **self._request(
                transaction,
                transaction.questions[transaction.question_index],
                {"answer": "<answer>"},
            ),
        }

    def _ask_for_script(self, transaction: Transaction) -> dict[str, Any]:
        transaction.phase = "script"
        request = {
            "instruction": "Return a script using qa1 as the context parameter. Return only the required return schema.",
            "qa1": transaction.answers,
            "return_schema": {"script": "<script>"},
        }
        self._record(transaction, "stdout", request)
        return {"transaction_id": transaction.transaction_id, **request}

    def _request(self, transaction: Transaction, instruction: str, schema: dict[str, Any]) -> dict[str, Any]:
        request = {"instruction": instruction, "return_schema": schema}
        self._record(transaction, "stdout", request)
        return request

    def _reject(self, transaction: Transaction, error: str) -> dict[str, Any]:
        previous = next(event["data"] for event in reversed(transaction.events) if event["stream"] == "stdout")
        result = {"error": error, "repeat": previous}
        self._record(transaction, "validation", result)
        self._save(transaction)
        return result

    @staticmethod
    def _validate_questions(value: dict[str, Any]) -> str | None:
        if set(value) != {"q1"}:
            return "response keys must be exactly ['q1']"
        if not isinstance(value["q1"], list) or not all(isinstance(q, str) for q in value["q1"]):
            return "q1 must be a JSON array of strings"
        return None

    @staticmethod
    def _validate_answer(value: dict[str, Any]) -> str | None:
        if set(value) != {"answer"}:
            return "response keys must be exactly ['answer']"
        return None if isinstance(value["answer"], str) else "answer must be a string"

    @staticmethod
    def _validate_script(value: dict[str, Any]) -> str | None:
        if set(value) != {"script"}:
            return "response keys must be exactly ['script']"
        return None if isinstance(value["script"], str) else "script must be a string"

    def _require(self, transaction_id: str) -> Transaction:
        try:
            return self.transactions[transaction_id]
        except KeyError:
            raise ValueError("unknown transaction_id") from None

    @staticmethod
    def _record(transaction: Transaction, stream: str, data: dict[str, Any]) -> None:
        transaction.events.append({"sequence": len(transaction.events), "stream": stream, "data": data})

    def _save(self, transaction: Transaction) -> None:
        self.receipt_dir.mkdir(parents=True, exist_ok=True)
        path = self.receipt_dir / f"{transaction.transaction_id}.json"
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(asdict(transaction), ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(path)

    @staticmethod
    def _default_receipt_dir() -> Path:
        override = os.environ.get("ECC_DATA_DIR")
        if override:
            return Path(override)
        local_app_data = os.environ.get("LOCALAPPDATA")
        if local_app_data:
            return Path(local_app_data) / "ExecutionContractController" / "receipts"
        return Path.home() / ".execution-contract-controller" / "receipts"
