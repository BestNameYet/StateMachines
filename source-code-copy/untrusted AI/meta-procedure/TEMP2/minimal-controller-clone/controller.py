from __future__ import annotations

import json
import os
import uuid
import importlib.util
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class Transaction:
    transaction_id: str
    desired_state: str
    phase: str = "architecture_choice"
    architecture: dict[str, Any] = field(default_factory=dict)
    architecture_source: str = ""
    architecture_error: str | None = None
    architecture_choice: dict[str, str] = field(default_factory=dict)
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
        architecture, source, error = self._design_architecture(transaction.desired_state)
        transaction.architecture = architecture
        transaction.architecture_source = source
        transaction.architecture_error = error
        request = self._ask_architecture_choice(transaction)
        self._save(transaction)
        return {"transaction_id": transaction_id, **request}

    def respond(self, transaction_id: str, response: dict[str, Any]) -> dict[str, Any]:
        transaction = self._require(transaction_id)
        if not isinstance(response, dict):
            return self._reject(transaction, "response must be a JSON object")

        if transaction.phase == "architecture_choice":
            error = self._validate_architecture_choice(transaction, response)
            if error:
                return self._reject(transaction, error)
            self._record(transaction, "stdin", response)
            transaction.architecture_choice = response
            transaction.phase = "solution_application_questions"
            result = self._ask_solution_application_questions(transaction)
        elif transaction.phase == "solution_application_questions":
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

    def _ask_architecture_choice(self, transaction: Transaction) -> dict[str, Any]:
        request = {
            "instruction": (
                "Interrogate the solver-architecture choice before accepting it. Compare every candidate against "
                "the desired state, retrieved evidence, applicability conditions, failure modes, constraints, "
                "coverage gaps, and validation burden. Select exactly one candidate name from candidate_architectures "
                "and give a concise evidence-grounded rationale. Return only the required return schema."
            ),
            "desired_state": transaction.desired_state,
            "solver_architecture": transaction.architecture,
            "architecture_source": transaction.architecture_source,
            "architecture_error": transaction.architecture_error,
            "return_schema": {
                "selected_architecture": "<exact candidate name>",
                "rationale": "<why it fits better than the alternatives>",
            },
        }
        self._record(transaction, "stdout", request)
        return request

    def _ask_solution_application_questions(self, transaction: Transaction) -> dict[str, Any]:
        request = {
            "instruction": (
                "Assume a capable model has chosen solution category X = selected_architecture for problem Y = "
                "desired_state. Generate the questions that model would explore to determine how to apply X to Y. "
                "The questions must operationalize the chosen category: map Y's objects and state into X's primitives "
                "and representations; choose among X's variants, algorithms, decompositions, and control flows; bind "
                "required data, evidence, tools, interfaces, parameters, and resources; adapt X's assumptions to Y; "
                "anticipate application-specific failure modes; and define outputs, tests, feedback, failure routing, "
                "and stopping conditions. Each question must be answerable in a way that changes the design or execution "
                "of X-on-Y. Exclude generic questions about Y, questions that merely restate the goal, and questions "
                "about choosing X unless an discovered contradiction invalidates X. Return only the required schema."
            ),
            "desired_state": transaction.desired_state,
            "selected_architecture": transaction.architecture_choice,
            "solver_architecture": transaction.architecture,
            "return_schema": {"q1": ["<question a model would explore when applying X to Y>"]},
        }
        self._record(transaction, "stdout", request)
        return request

    def _ask_for_script(self, transaction: Transaction) -> dict[str, Any]:
        transaction.phase = "script"
        request = {
            "instruction": (
                "Create the executable solver instruction for desired_state using solver_architecture as the "
                "primary method map. Compare the candidate architectures, preserve provenance and uncertainty, "
                "resolve coverage gaps with explicit bounded assumptions unless a missing fact makes safe progress "
                "impossible, and include tools, stages, validation gates, failure routing, and stopping conditions. "
                "Do not generate generic context questions. Return only the required return schema."
            ),
            "desired_state": transaction.desired_state,
            "solver_architecture": transaction.architecture,
            "selected_architecture": transaction.architecture_choice,
            "solution_application_qa": transaction.answers,
            "architecture_source": transaction.architecture_source,
            "architecture_error": transaction.architecture_error,
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
    def _validate_architecture_choice(transaction: Transaction, value: dict[str, Any]) -> str | None:
        if set(value) != {"selected_architecture", "rationale"}:
            return "response keys must be exactly ['rationale', 'selected_architecture']"
        if not all(isinstance(value[key], str) and value[key].strip() for key in value):
            return "selected_architecture and rationale must be non-empty strings"
        names = {
            candidate.get("name")
            for candidate in transaction.architecture.get("candidate_architectures", [])
            if isinstance(candidate, dict)
        }
        if value["selected_architecture"] not in names:
            return "selected_architecture must exactly match a candidate architecture name"
        return None

    @staticmethod
    def _validate_questions(value: dict[str, Any]) -> str | None:
        if set(value) != {"q1"}:
            return "response keys must be exactly ['q1']"
        if not isinstance(value["q1"], list) or not all(isinstance(q, str) and q.strip() for q in value["q1"]):
            return "q1 must be a JSON array of non-empty strings"
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
    def _design_architecture(desired_state: str) -> tuple[dict[str, Any], str, str | None]:
        configured = os.environ.get("SOLVER_ARCHITECTURE_KB_PATH")
        candidates = [Path(configured)] if configured else []
        candidates.extend([
            Path(__file__).resolve().parent.parent / "solver-architecture-kb",
            Path.home() / "plugins" / "solver-architecture-kb",
        ])
        for root in candidates:
            module_path = root / "scripts" / "server.py"
            if not module_path.is_file():
                continue
            try:
                spec = importlib.util.spec_from_file_location("shared_solver_architecture_kb", module_path)
                if spec is None or spec.loader is None:
                    raise RuntimeError("could not load KB module")
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                return module.architecture(desired_state), str(root), None
            except Exception as exc:
                error = f"{type(exc).__name__}: {exc}"
                continue
        fallback = {
            "problem_representation": {"goal": desired_state, "coverage": "kb-unavailable"},
            "candidate_architectures": [
                {"name": "requirements-to-tests pipeline", "tradeoff": "Deterministic but may miss domain-specific solver families."},
                {"name": "fresh design with adversarial review", "tradeoff": "Broader but less grounded without retrieved cases."},
            ],
            "selected_architecture": {
                "stages": ["frame", "generate alternatives", "select", "execute", "validate"],
                "stop_conditions": ["acceptance gates pass", "required authority is unavailable"],
            },
            "warning": "Shared Solver Architecture KB was unavailable; this is a bounded fallback, not semantic retrieval.",
        }
        return fallback, "embedded-fallback", locals().get("error", "Solver Architecture KB path was not found")

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
