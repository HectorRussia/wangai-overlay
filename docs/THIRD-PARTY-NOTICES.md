# WANGAI third-party notices

The Portable package includes a CPU-only Python/Silero worker. Its dependency versions,
license texts and vendored notices are shipped in `worker/licenses/`.
The packaging job copies those files from the locked distributions, not a manually
maintained summary. Python's runtime license is also included in the frozen bundle.

Major dependencies: CPython (PSF), PyInstaller (GPL with bootloader distribution
exception), Silero VAD (MIT), ONNX Runtime (MIT),
NumPy (BSD), React (MIT), Tauri and its plugins (MIT/Apache-2.0), Lucide (ISC).
Refer to the included upstream license texts for complete terms and attributions.

Additional desktop dependency notices are generated from Cargo/npm metadata during
release packaging and shipped alongside the worker notices. WANGAI does not bundle
CUDA, faster-whisper, AI provider credentials, or cloud STT model weights.

Portable releases also include Microsoft Edge WebView2 Fixed Version Runtime x64,
pinned in `portable/webview2.lock.json`. Its upstream runtime files, embedded Chromium
credits, and vendored LICENSE files are retained unmodified under `webview2/`.
Microsoft's supplied `show_third_party_software_licenses.bat` describes how to open
the runtime's built-in credits; WANGAI does not automatically run this script.
See https://developer.microsoft.com/en-us/microsoft-edge/webview2/ for the runtime
distribution and applicable Microsoft terms. WebView2 is updated only with a WANGAI release.

## Local STT

The opt-in native recognizer uses whisper.cpp (MIT), pinned to v1.9.4 commit
`927cfce34f31707e17f2bff35c349632fb9e2c3a`, and the multilingual Whisper base
Q5_1 weights from the pinned ggerganov/whisper.cpp model repository revision
`5359861c739e955e79d9a303bcbc70fb988958b1`. OpenAI Whisper code/model weights are
MIT-licensed. Portable 0.6.0 includes the native recognizer, base Q5_1 weights and
upstream MIT license texts under `whisper/`. The pinned source is used at build
time and is not included in the binary package. Silero is
installed only for its MIT ONNX asset; the frozen runtime excludes PyTorch and
torchaudio. No provider API keys are bundled.
