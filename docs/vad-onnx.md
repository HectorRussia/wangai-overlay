# Direct ONNX VAD

The worker uses NumPy and ONNX Runtime directly with the existing Silero 6.2.1
model, mono 16 kHz audio, 512-sample frames, recurrent state `(2, 1, 128)` and
64-sample context. Speech-boundary rules and reset semantics are unchanged.

`requirements.txt` contains runtime dependencies. Install `requirements-model.txt`
with `--no-deps`: Silero supplies a model asset only and its public Python package
must not be imported by the worker. Packaging uses hashed runtime/model locks,
includes only the ONNX model from Silero, and excludes torch/torchaudio.

Measured on the development machine on **2026-10-09**, after warmup:

| VAD Python process working set | MiB |
| --- | ---: |
| Original Silero/PyTorch wrapper | 233.1 |
| Direct ONNX | 69.4 |

These are individual VAD process measurements, not whole-app RAM or installer size.
The benchmark measures the actual Python PID rather than uv's Windows redirector.
Reproduce with `scripts/benchmark-vad.py --compare-legacy` from Desktop in an
existing legacy environment; omit the flag in a fresh torch-free environment.

Tests compare probabilities and boundary events against the original wrapper at
two volume levels over deterministic frames. A separate subprocess blocks all
torch/torchaudio imports and exercises the real model and resets. Frozen-worker
tests reject PyTorch bundle files and verify offline startup, Unicode/spaced
paths, frame decoding, reset and shutdown. Synthetic equivalence does not establish
live-game speech accuracy. Old development environments can retain torch on disk;
new worker processes do not load it.
