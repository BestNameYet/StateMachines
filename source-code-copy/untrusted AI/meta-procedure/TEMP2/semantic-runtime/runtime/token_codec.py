"""Encode and decode self-contained, versioned continuation addresses."""
import base64
import json
REQUIRED = {"script", "version", "screen", "bindings", "step"}

def encode(value: dict) -> str:
    """Return compact URL-safe JSON without padding."""
    raw = json.dumps(value, separators=(",", ":"), sort_keys=True).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")

def decode(token: str) -> dict:
    """Decode a token and require its address fields."""
    try:
        value = json.loads(base64.urlsafe_b64decode(token + "=" * (-len(token) % 4)))
    except Exception as exc:
        raise ValueError("invalid token") from exc
    missing = REQUIRED - value.keys()
    if missing:
        raise ValueError(f"token missing: {', '.join(sorted(missing))}")
    return value
