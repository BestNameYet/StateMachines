"""Analyze expressed emotion; never infer a speaker's internal feelings."""
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess

import librosa
import numpy as np
import soundfile as sf
import torch
from speechbrain.inference.interfaces import foreign_class

ROOT = Path(__file__).resolve().parent
EXPECTED = 'a4d9ab145898de71dd1bdc864e5a5e2c4b12b044a270fa6e8a0f1e0f0e8133c8'
SOURCE_NAME = 'ElevenLabs_2026-10-16T04_29_10_Heathery_ivc_sp100_s43_sb100_se100_b_m2 (1).mp3'
MODEL = 'speechbrain/emotion-recognition-wav2vec2-IEMOCAP'


def main():
    out = ROOT / 'outputs'
    out.mkdir(exist_ok=True)
    raw = base64.b64decode((ROOT / 'input.mp3.b64').read_text(), validate=True)
    digest = hashlib.sha256(raw).hexdigest()
    assert digest == EXPECTED and len(raw) == 327480, 'Input transfer mismatch'
    mp3, wav = out / 'input.mp3', out / 'input.wav'
    mp3.write_bytes(raw)
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(mp3), '-ac', '1', '-ar', '16000', str(wav)], check=True)
    y, sr = sf.read(wav, dtype='float32')
    assert sr == 16000 and len(y) > sr
    torch.set_num_threads(2)
    classifier = foreign_class(source=MODEL, pymodule_file='custom_interface.py', classname='CustomEncoderWav2vec2Classifier', savedir=str(ROOT / 'model-cache'), run_opts={'device': 'cpu'})

    def predict(samples):
        with torch.inference_mode():
            probs, score, index, labels = classifier.classify_batch(torch.from_numpy(samples.copy()).unsqueeze(0))
        p = probs.detach().cpu().reshape(-1)
        if bool((p < 0).any()) or abs(float(p.sum()) - 1) > .01:
            p = torch.softmax(p, dim=0)
        names = [str(v) for v in classifier.hparams.label_encoder.decode_torch(torch.arange(len(p)))]
        return {'label': names[int(torch.argmax(p))], 'scores': dict(zip(names, [round(float(v), 5) for v in p]))}

    intervals = librosa.effects.split(y, top_db=30, frame_length=512, hop_length=160)
    pauses, previous = [], 0
    for a, b in intervals:
        if (int(a) - previous) / sr >= .15:
            pauses.append({'start_s': round(previous / sr, 3), 'end_s': round(int(a) / sr, 3), 'duration_s': round((int(a) - previous) / sr, 3)})
        previous = int(b)
    if (len(y) - previous) / sr >= .15:
        pauses.append({'start_s': round(previous / sr, 3), 'end_s': round(len(y) / sr, 3), 'duration_s': round((len(y) - previous) / sr, 3)})

    segments = []
    for start in range(0, len(y), sr * 4):
        chunk = y[start:start + sr * 4]
        if len(chunk) < sr:
            continue
        rms = librosa.feature.rms(y=chunk, frame_length=1024, hop_length=256)[0]
        f0, voiced, _ = librosa.pyin(chunk, fmin=65, fmax=500, sr=sr, frame_length=1024, hop_length=256)
        pitch = f0[np.isfinite(f0)]
        segments.append({'start_s': round(start / sr, 3), 'end_s': round((start + len(chunk)) / sr, 3), 'emotion': predict(chunk), 'rms_dbfs': round(float(20 * np.log10(np.sqrt(np.mean(chunk ** 2)) + 1e-10)), 2), 'pitch_median_hz': round(float(np.median(pitch)), 2) if len(pitch) else None, 'pitch_p10_p90_hz': [round(float(v), 2) for v in np.percentile(pitch, [10, 90])] if len(pitch) else None})

    result = {'status': 'completed', 'source': {'filename': SOURCE_NAME, 'size_bytes': len(raw), 'sha256': digest}, 'execution': {'github_run_id': os.environ.get('GITHUB_RUN_ID'), 'github_sha': os.environ.get('GITHUB_SHA')}, 'model': MODEL, 'duration_s': round(len(y) / sr, 3), 'overall_emotion': predict(y), 'segments': segments, 'pauses': pauses, 'limitations': ['Four-class IEMOCAP model: anger, happiness, sadness, neutral; scores are model outputs, not calibrated probabilities of human judgments.', 'Synthetic voice is outside the original evaluation setting. These are estimates of expressed emotion, not internal feelings.', 'Four-second windows are not aligned to words. No transcript or word-level attribution was generated.', 'Pause detection uses an amplitude threshold; low-volume speech may be marked as silence. Pitch is estimated with pYIN.']}
    (out / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
