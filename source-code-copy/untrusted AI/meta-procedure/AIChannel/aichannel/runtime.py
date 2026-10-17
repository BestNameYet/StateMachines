from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any

from .operations import OperationRegistry
from .store import Store


def load_default_config(path: str | Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def validate_config(config: dict[str, Any], registry: OperationRegistry) -> None:
    if not isinstance(config, dict):
        raise ValueError("config must be an object")
    if not isinstance(config.get("behaviors"), dict) or not config["behaviors"]:
        raise ValueError("config.behaviors must be a non-empty object")
    default = config.get("default_behavior")
    if default not in config["behaviors"]:
        raise ValueError("default_behavior must name a configured behavior")
    allowed_ops = set(registry.names())
    for name, behavior in config["behaviors"].items():
        if not isinstance(behavior, dict):
            raise ValueError(f"behavior {name} must be an object")
        kind = behavior.get("kind")
        if kind == "pipeline":
            step_sets = [behavior.get("steps", [])]
        elif kind == "state_machine":
            states = behavior.get("states")
            if not isinstance(states, dict) or behavior.get("initial") not in states:
                raise ValueError(f"state_machine {name} has invalid states/initial")
            step_sets = []
            for state_name, state in states.items():
                step_sets.append(state.get("on_enter", []))
                for transition in state.get("transitions", []):
                    if transition.get("target") not in states:
                        raise ValueError(f"behavior {name} transition from {state_name} has unknown target")
                    step_sets.append(transition.get("actions", []))
        else:
            raise ValueError(f"behavior {name} has unsupported kind: {kind}")
        for steps in step_sets:
            if not isinstance(steps, list):
                raise ValueError(f"behavior {name} steps must be arrays")
            for step in steps:
                if not isinstance(step, dict) or step.get("op") not in allowed_ops:
                    raise ValueError(f"behavior {name} uses unavailable operation: {step.get('op') if isinstance(step, dict) else step}")


class AIChannelRuntime:
    """One stable control surface over versioned, data-defined behavior."""

    def __init__(self, db_path: str | Path, default_config_path: str | Path) -> None:
        self.registry = OperationRegistry()
        default_config = load_default_config(default_config_path)
        validate_config(default_config, self.registry)
        self.store = Store(db_path, default_config)

    def _config(self) -> tuple[int, dict[str, Any]]:
        return self.store.get_config()

    def configure(self, config: dict[str, Any], expected_version: int | None = None) -> dict[str, Any]:
        validate_config(config, self.registry)
        version = self.store.replace_config(config, expected_version=expected_version)
        return {"status": "configured", "config_version": version, "behaviors": sorted(config["behaviors"])}

    def get_config(self) -> dict[str, Any]:
        version, config = self._config()
        return {"config_version": version, "config": config}

    def list_behaviors(self) -> dict[str, Any]:
        version, config = self._config()
        return {
            "config_version": version,
            "default_behavior": config["default_behavior"],
            "behaviors": [
                {"name": name, "kind": value["kind"], "description": value.get("description", "")}
                for name, value in sorted(config["behaviors"].items())
            ],
            "internal_operations": self.registry.names(),
        }

    def _pipeline(self, behavior: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        ctx = {"input": deepcopy(payload), "state": {}, "last": None, "output": None}
        self.registry.run(behavior.get("steps", []), ctx)
        return {"status": "complete", "output": ctx["output"], "state": ctx["state"]}

    def _state_machine(
        self,
        name: str,
        behavior: dict[str, Any],
        payload: dict[str, Any],
        config_version: int,
        transaction_id: str | None,
    ) -> dict[str, Any]:
        new = transaction_id is None
        if new:
            machine_state = {"current": behavior["initial"], "data": {}}
            transaction_id = self.store.create_transaction(name, config_version, machine_state)
        else:
            tx = self.store.get_transaction(transaction_id)
            if tx["behavior"] != name:
                raise ValueError("transaction behavior does not match requested behavior")
            if tx["config_version"] != config_version:
                raise ValueError("transaction/config version mismatch")
            machine_state = tx["state"]

        current = machine_state["current"]
        state_spec = behavior["states"][current]
        ctx = {"input": deepcopy(payload), "state": machine_state["data"], "last": None, "output": None}
        event = payload.get("event", "start" if new else None)

        if new:
            self.registry.run(state_spec.get("on_enter", []), ctx)
        else:
            transition = next((t for t in state_spec.get("transitions", []) if t.get("event") == event), None)
            if transition is None:
                raise ValueError(f"no transition for event {event!r} from state {current!r}")
            required = transition.get("required", [])
            missing = [k for k in required if k not in payload]
            if missing:
                raise ValueError("missing transition inputs: " + ", ".join(missing))
            self.registry.run(transition.get("actions", []), ctx)
            machine_state["current"] = transition["target"]
            current = machine_state["current"]
            state_spec = behavior["states"][current]
            self.registry.run(state_spec.get("on_enter", []), ctx)

        machine_state["data"] = ctx["state"]
        status = "complete" if state_spec.get("final") else "active"
        self.store.update_transaction(transaction_id, machine_state, status=status)
        self.store.append_event(transaction_id, "invoke", {"event": event, "input": payload, "state": machine_state, "output": ctx["output"]})
        return {
            "status": status,
            "transaction_id": transaction_id,
            "state": current,
            "output": ctx["output"],
            "config_version": config_version,
        }

    def invoke(self, behavior_name: str | None, payload: dict[str, Any], transaction_id: str | None = None) -> dict[str, Any]:
        active_version, active_config = self._config()
        if transaction_id is not None:
            tx = self.store.get_transaction(transaction_id)
            version = int(tx["config_version"])
            config = self.store.get_config_version(version)
            name = behavior_name or tx["behavior"]
        else:
            version = active_version
            config = active_config
            name = behavior_name or config["default_behavior"]
        behavior = config["behaviors"].get(name)
        if behavior is None:
            raise ValueError(f"unknown behavior: {name}")
        if behavior["kind"] == "pipeline":
            if transaction_id is not None:
                raise ValueError("pipeline behaviors do not accept transaction_id")
            result = self._pipeline(behavior, payload)
            result.update({"behavior": name, "config_version": version})
            return result
        return self._state_machine(name, behavior, payload, version, transaction_id)

    def call(self, arguments: dict[str, Any]) -> dict[str, Any]:
        action = arguments.get("action", "invoke")
        if action == "invoke":
            payload = arguments.get("input") or {}
            if not isinstance(payload, dict):
                raise ValueError("input must be an object")
            return self.invoke(arguments.get("behavior"), payload, arguments.get("transaction_id"))
        if action == "configure":
            return self.configure(arguments.get("config"), arguments.get("expected_version"))
        if action == "get_config":
            return self.get_config()
        if action == "list_behaviors":
            return self.list_behaviors()
        if action == "status":
            return self.store.get_transaction(arguments["transaction_id"])
        if action == "receipt":
            return self.store.receipt(arguments["transaction_id"])
        raise ValueError(f"unknown action: {action}")
