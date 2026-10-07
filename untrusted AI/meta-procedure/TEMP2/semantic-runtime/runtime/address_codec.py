"""Encode complete, URL-safe requests for the address endpoint."""

import base64
import json


def encode_request(command: dict) -> str:
    """Serialize one precomputed OutToken and terminal as an address."""
    request = {"value": command["value"]}
    if "response" in command:
        request["response"] = command["response"]
    if "terminal" in command:
        request["terminal"] = command["terminal"]
    raw = json.dumps(request, separators=(",", ":"), sort_keys=True).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_request(address: str) -> dict:
    """Decode and validate one transaction command address."""
    try:
        raw = base64.urlsafe_b64decode(address + "=" * (-len(address) % 4))
        command = json.loads(raw)
    except Exception as exc:
        raise ValueError("invalid address") from exc
    if not isinstance(command, dict) or "value" not in command:
        raise ValueError("address requires an OutToken")
    return command
