import os
import glob
import sys
from enum import Enum, auto
import numpy as np
from PIL import Image
import onnxruntime as ort

class PipelineState(Enum):
    INIT = auto()
    LOAD_ANCHOR = auto()
    SCAN_BATCH = auto()
    RANK_DISTANCES = auto()
    EMIT_METRICS = auto()
    COMPLETED = auto()
    ERROR = auto()

class VectorAdapter:
    """Two-stage adapter: Spatial Region Localization -> Latent Feature Extraction."""
    def __init__(self, detector_path, encoder_path):
        opts = ort.SessionOptions()
        opts.log_severity_level = 3  # Suppress warnings
        self.det_session = ort.InferenceSession(detector_path, opts)
        self.det_input_name = self.det_session.get_inputs()[0].name

        self.enc_session = ort.InferenceSession(encoder_path, opts)
        self.enc_input_name = self.enc_session.get_inputs()[0].name

    def _localize_region(self, img):
        """Identifies primary ROI bounding box in arbitrary frame."""
        w, h = img.size
        resized = img.resize((320, 240))
        arr = np.array(resized, dtype=np.float32)
        arr = (arr - 127.0) / 128.0
        tensor = np.expand_dims(arr.transpose(2, 0, 1), axis=0)

        confidences, boxes = self.det_session.run(None, {self.det_input_name: tensor})
        conf_arr = confidences[0]
        box_arr = boxes[0]

        best_idx = int(np.argmax(conf_arr[:, 1]))
        if conf_arr[best_idx, 1] < 0.65:
            return None

        box = box_arr[best_idx]
        x1 = max(0, int(box[0] * w))
        y1 = max(0, int(box[1] * h))
        x2 = min(w, int(box[2] * w))
        y2 = min(h, int(box[3] * h))

        if (x2 - x1 < 10) or (y2 - y1 < 10):
            return None

        return img.crop((x1, y1, x2, y2))

    def extract_vector(self, image_path):
        """Full pipeline: Load -> Localize ROI -> Crop -> Rescale -> Unit Embedding."""
        raw_img = Image.open(image_path).convert("RGB")
        roi = self._localize_region(raw_img)
        if roi is None:
            roi = raw_img  # Fallback to direct frame if no region isolated
        aligned = roi.resize((112, 112))
        # The encoder expects NHWC: [batch, height, width, RGB channels].
        arr = np.array(aligned, dtype=np.float32)
        arr = (arr - 127.5) / 128.0
        tensor = np.expand_dims(arr, axis=0)
        raw_output = self.enc_session.run(None, {self.enc_input_name: tensor})[0][0]
        vector = raw_output.flatten()
        norm = np.linalg.norm(vector)
        return vector / norm if norm > 0 else vector

class VectorSignalPipeline:
    def __init__(self, base_dir="matching"):
        self.state = PipelineState.INIT
        self.base_dir = base_dir
        self.anchor_dir = os.path.join(base_dir, "datasets/anchor")
        self.batch_dir = os.path.join(base_dir, "datasets/telemetry_batch")
        self.det_model = os.path.join(base_dir, "models/spatial_detector.onnx")
        self.enc_model = os.path.join(base_dir, "models/feature_encoder.onnx")
        self.output_report = os.environ.get("GITHUB_STEP_SUMMARY", os.path.join(base_dir, "metrics.md"))
        self.adapter = None
        self.anchor_path = None
        self.anchor_vector = None
        self.batch_files = []
        self.evaluations = []
        self.error_message = ""
        self.coherence_threshold = 0.65

    def transition(self, next_state):
        print(f"[State Transition] {self.state.name} -> {next_state.name}")
        self.state = next_state

    def run(self):
        while self.state not in (PipelineState.COMPLETED, PipelineState.ERROR):
            if self.state == PipelineState.INIT:
                self._handle_init()
            elif self.state == PipelineState.LOAD_ANCHOR:
                self._handle_load_anchor()
            elif self.state == PipelineState.SCAN_BATCH:
                self._handle_scan_batch()
            elif self.state == PipelineState.RANK_DISTANCES:
                self._handle_rank_distances()
            elif self.state == PipelineState.EMIT_METRICS:
                self._handle_emit_metrics()
        if self.state == PipelineState.ERROR:
            print(f"[Pipeline Error]: {self.error_message}", file=sys.stderr)
            sys.exit(1)
        print("[Pipeline Finished]: All state machine transitions executed.")

    def _handle_init(self):
        os.makedirs(self.anchor_dir, exist_ok=True)
        os.makedirs(self.batch_dir, exist_ok=True)
        if not os.path.exists(self.det_model) or not os.path.exists(self.enc_model):
            self.error_message = f"Model tensors missing in {self.base_dir}/models/"
            self.transition(PipelineState.ERROR)
            return
        self.adapter = VectorAdapter(self.det_model, self.enc_model)
        self.transition(PipelineState.LOAD_ANCHOR)

    def _handle_load_anchor(self):
        anchors = [f for f in glob.glob(os.path.join(self.anchor_dir, "*")) if not f.endswith(".gitkeep")]
        if not anchors:
            self.error_message = f"No anchor baseline registered in {self.anchor_dir}"
            self.transition(PipelineState.ERROR)
            return
        self.anchor_path = anchors[0]
        try:
            self.anchor_vector = self.adapter.extract_vector(self.anchor_path)
            self.transition(PipelineState.SCAN_BATCH)
        except Exception as e:
            self.error_message = f"Failed processing anchor baseline: {e}"
            self.transition(PipelineState.ERROR)

    def _handle_scan_batch(self):
        self.batch_files = [f for f in glob.glob(os.path.join(self.batch_dir, "*")) if not f.endswith(".gitkeep")]
        if not self.batch_files:
            print(f"Notice: No telemetry batch items found in {self.batch_dir}.")
            self.transition(PipelineState.RANK_DISTANCES)
            return
        for filepath in self.batch_files:
            item_id = os.path.basename(filepath)
            try:
                candidate_vec = self.adapter.extract_vector(filepath)
                delta = float(np.linalg.norm(self.anchor_vector - candidate_vec))
                is_coherent = delta < self.coherence_threshold
                self.evaluations.append({
                    "id": item_id,
                    "delta": delta,
                    "coherent": is_coherent,
                    "status": "PASSED" if is_coherent else "DIVERGENT"
                })
            except Exception as e:
                self.evaluations.append({
                    "id": item_id,
                    "delta": 999.0,
                    "coherent": False,
                    "status": f"Fault: {e}"
                })
        self.transition(PipelineState.RANK_DISTANCES)

    def _handle_rank_distances(self):
        self.evaluations.sort(key=lambda x: x["delta"])
        self.transition(PipelineState.EMIT_METRICS)

    def _handle_emit_metrics(self):
        lines = [
            "# Signal Invariant Vector Report",
            f"- **Target Baseline:** `{os.path.basename(self.anchor_path) if self.anchor_path else 'None'}`",
            f"- **Batch Entities:** `{len(self.batch_files)}`",
            f"- **Delta Threshold:** `< {self.coherence_threshold}`",
            "",
            "| Rank | Entity ID | Vector Delta | Coherent? | State |",
            "| :--- | :--- | :--- | :--- | :--- |"
        ]
        for rank, item in enumerate(self.evaluations, start=1):
            delta_str = f"{item['delta']:.4f}" if item['delta'] != 999.0 else "N/A"
            flag = "**TRUE**" if item['coherent'] else "FALSE"
            lines.append(f"| {rank} | `{item['id']}` | {delta_str} | {flag} | `{item['status']}` |")
        report = "\n".join(lines)
        print("\n" + report)
        try:
            with open(self.output_report, "a") as f:
                f.write(report + "\n")
        except Exception as e:
            print(f"Notice: Step summary writing bypassed: {e}")
        self.transition(PipelineState.COMPLETED)

if __name__ == "__main__":
    pipeline = VectorSignalPipeline()
    pipeline.run()
