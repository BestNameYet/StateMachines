"""Independent ASR of the verified audio, without a supplied reference transcript."""
import base64
import hashlib
import json
import os
from pathlib import Path
from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parent
MODEL = 'small.en'


def main():
    raw = base64.b64decode((ROOT / 'input.mp3.b64').read_text(), validate=True)
    digest = hashlib.sha256(raw).hexdigest()
    assert len(raw) == 327480 and digest == 'a4d9ab145898de71dd1bdc864e5a5e2c4b12b044a270fa6e8a0f1e0f0e8133c8'
    out = ROOT / 'outputs'
    out.mkdir(exist_ok=True)
    audio = out / 'transcription-input.mp3'
    audio.write_bytes(raw)
    model = WhisperModel(MODEL, device='cpu', compute_type='int8', cpu_threads=2)
    segments, info = model.transcribe(str(audio), language='en', beam_size=5, word_timestamps=True, vad_filter=False, initial_prompt=None)
    rows = []
    for s in segments:
        rows.append({'start_s': s.start, 'end_s': s.end, 'text': s.text.strip(), 'avg_logprob': s.avg_logprob, 'no_speech_prob': s.no_speech_prob, 'words': [{'start_s': w.start, 'end_s': w.end, 'word': w.word, 'probability': w.probability} for w in (s.words or [])]})
    text = ' '.join(s['text'] for s in rows)
    assert text.strip(), 'ASR produced no text'
    result = {'status': 'completed', 'source': {'sha256': digest, 'size_bytes': len(raw)}, 'execution': {'github_run_id': os.environ.get('GITHUB_RUN_ID'), 'github_sha': os.environ.get('GITHUB_SHA')}, 'engine': 'faster-whisper', 'model': MODEL, 'language': info.language, 'duration_s': info.duration, 'initial_prompt': None, 'text': text, 'segments': rows, 'limitations': ['Automatic speech recognition may mishear words and infer punctuation. No reference text or expected wording was supplied to the recognizer.']}
    (out / 'transcript.json').write_text(json.dumps(result, indent=2) + '\n')
    (out / 'transcript.txt').write_text(text + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
