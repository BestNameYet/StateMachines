"""Initialize the matching workspace and ONNX sessions; never process images."""
from __future__ import annotations

import json
from pathlib import Path

import onnxruntime as ort

ROOT = Path(__file__).resolve().parent
DIRECTORIES = (
    ROOT / "models",
    ROOT / "datasets" / "anchor",
    ROOT / "datasets" / "telemetry_batch",
)
MODELS = {
    "spatial_detector": ROOT / "models" / "spatial_detector.onnx",
    "feature_encoder": ROOT / "models" / "feature_encoder.onnx",
}


def bootstrap() -> dict:
    for directory in DIRECTORIES:
        directory.mkdir(parents=True, exist_ok=True)

    missing = [str(path.relative_to(ROOT)) for path in MODELS.values() if not path.is_file()]
    if missing:
        raise FileNotFoundError("Missing model weights: " + ", ".join(missing))

    sessions = {}
    for name, path in MODELS.items():
        # Loading a model is initialization, not image inference or comparison.
        session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        sessions[name] = {
            "path": str(path.relative_to(ROOT)),
            "inputs": [item.name for item in session.get_inputs()],
            "outputs": [item.name for item in session.get_outputs()],
        }

    return {
        "status": "ready",
        "directories": [str(path.relative_to(ROOT)) for path in DIRECTORIES],
        "models": sessions,
        "image_comparison_performed": False,
    }


if __name__ == "__main__":
    print(json.dumps(bootstrap(), indent=2))
