# WANGAI third-party notices

The Portable package includes a CPU-only Python/Silero worker. Its dependency versions,
license texts and vendored notices are shipped in `worker/licenses/`.
The packaging job copies those files from the locked distributions, not a manually
maintained summary. Python's runtime license is also included in the frozen bundle.

Major dependencies: CPython (PSF), PyInstaller (GPL with bootloader distribution
exception), PyTorch/torchaudio (BSD-style), Silero VAD (MIT), ONNX Runtime (MIT),
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
