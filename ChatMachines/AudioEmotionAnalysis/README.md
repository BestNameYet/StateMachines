# Speech emotion analysis

Runs the existing SpeechBrain wav2vec2 IEMOCAP emotion classifier against the provided ElevenLabs MP3 on a GitHub Actions CPU runner. It also measures pitch, intensity, and threshold-based pauses.

The input is stored as base64 because the connected repository writer accepts UTF-8 text. The runner decodes the original bytes and checks their byte count and SHA-256 before any analysis. The source audio is not modified.

Run **Actions → Audio emotion analysis → Run workflow**, or push a change to this project or its workflow. Results are written to `outputs/result.json`, uploaded as a workflow artifact with the decoded audio, and committed back to this directory by the runner. The result includes the source hash and actual workflow run ID.

For a local run, install Python 3.11, FFmpeg, CPU PyTorch/torchaudio 2.5.1, and `requirements.txt`, then run `python analyze.py`. First use downloads the pretrained model and its upstream wav2vec2 dependency.

Labels are `ang` (anger), `hap` (happiness), `sad` (sadness), and `neu` (neutral). Model scores estimate expressed emotion; they are not calibrated judgments or evidence of a person's internal feelings. Synthetic speech can differ from the training data. Four-second windows are time-aligned, not word-aligned. Silence thresholds and pitch estimates have measurement limits. No automatic transcript is produced.

## Independent transcription

Run **Actions → Audio transcription → Run workflow** to transcribe the same verified input with faster-whisper `small.en` on CPU. A source push changing `transcribe.py` or `.github/workflows/audio-transcription.yml` also starts it. The separate emotion analysis workflow is unchanged.

The recognizer receives no reference transcript or initial prompt. It writes `outputs/transcript.txt` and `outputs/transcript.json`, including segment and word timestamps, source SHA-256 and execution provenance. These outputs are saved as an Actions artifact and committed back to this directory. ASR may mishear words and infer punctuation; the saved text is the recognizer output without editorial correction.
