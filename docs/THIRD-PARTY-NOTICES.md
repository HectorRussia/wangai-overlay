# WANGAI third-party notices

The installer includes a CPU-only Python/Silero worker. Its dependency versions,
license texts and vendored notices are installed in `worker/licenses/`.
The packaging job copies those files from the locked distributions, not a manually
maintained summary. Python's runtime license is also included in the frozen bundle.

Major dependencies: CPython (PSF), PyInstaller (GPL with bootloader distribution
exception), PyTorch/torchaudio (BSD-style), Silero VAD (MIT), ONNX Runtime (MIT),
NumPy (BSD), React (MIT), Tauri and its plugins (MIT/Apache-2.0), Lucide (ISC).
Refer to the included upstream license texts for complete terms and attributions.

Additional desktop dependency notices are generated from Cargo/npm metadata during
release packaging and shipped alongside the worker notices. WANGAI does not bundle
CUDA, faster-whisper, AI provider credentials, or cloud STT model weights.
