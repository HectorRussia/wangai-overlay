# Local STT 0.6 developer handoff

This is **0.6.0**. The distributed Portable uses bundled Whisper; development
can opt in with the launcher. It ports the Whisper and
direct-ONNX work from `thefogusz/wangai-overlay` commit
`544380d3cb642dd09922ffa1beaf204da46c2d74` into the current Desktop module layout.
Only multilingual **Whisper base Q5_1** is supported; small and Qwen are excluded.
Ordinary development builds retain cloud speech recognition. Release Portable
builds enable `local-stt`, include the native recognizer/model and send text to the
configured HTTPS gateway. Provider keys belong on that gateway, never in Portable.

## Portable use

Download `WANGAI_0.6.0_x64-portable.exe` from the release, prepare an empty folder,
then run `WANGAI.exe` in that folder. Python, Node, Rust, setup scripts and local
env files are unnecessary for the distributed Portable. The package includes
Whisper base Q5_1, frozen ONNX VAD and WebView2. Translation still needs internet.
The local launcher/env below are for development only.

## Setup and launch

Requires Windows x64/AVX2, Node 24/pnpm, Rust MSVC, and Visual Studio 2022 C++ Build
Tools with CMake. Bootstrap uses uv-managed Python 3.12; without uv, install Python
3.12 for `py -3.12`.

Run from the repository root:

```powershell
pnpm --dir apps/desktop install --frozen-lockfile
powershell -NoProfile -ExecutionPolicy Bypass -File apps/desktop/scripts/setup-local-stt.ps1
# For a new preview configuration only:
Copy-Item server/local-stt.env.example server/.env.local-stt
# Edit server/.env.local-stt privately: fill TRANSLATION_API_KEY with an xAI key.
.\Start-WANGAI-Whisper.cmd
```

The launcher creates the blank preview env file if missing and asks for its key.
Do not copy a Groq/cloud key into this file. Existing `server/.env` is independent.
The sample uses `grok-4.20-0309-non-reasoning` at `https://api.x.ai/v1`; provider/model
configuration remains in `TRANSLATION_*`. Do not commit credentials, logs, usage
databases, downloaded models, build output, or complete development environments.
An explicit `WANGAI_SERVER_ENV_FILE` selects an existing alternate preview file;
the launcher resolves it before changing directories and checks translation-only mode.

Rebuild the preview after source changes:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File apps/desktop/scripts/start-local-stt.ps1 -Build
```

Setup pins whisper.cpp v1.9.4 at `927cfce34f31707e17f2bff35c349632fb9e2c3a`, the
multilingual model revision `5359861c739e955e79d9a303bcbc70fb988958b1`, and its SHA-256.
Models/builds stay under `apps/desktop/output`; VAD uses the separately installed
Silero 6.2.1 model asset and ONNX Runtime. No PyTorch is installed on fresh setup.

## Runtime and recovery

Cargo feature `local-stt` selects a persistent native CPU recognizer shared by
INCOMING (English) and MICROPHONE/F9 (Thai). Existing audio capture, bounded queues,
glossary, deduplication, history, and generation-based cancellation remain in use.
Speech PCM stays in memory and only final text goes to the translation gateway.
Local recognition failures never upload audio as a fallback.

The native pipe contract is little-endian u32 payload length, one language byte
(`0=en`, `1=th`), then mono PCM16 at 16 kHz, limited to 30 seconds. Output is JSONL:
`{"ready":true}`, `{"text":"..."}`, or `{"error":"..."}`. Initialization has a
60-second deadline; inference including pipe writes has a 20-second watchdog.
Both VAD and Whisper must be ready before listening starts. The existing recovery
button in Desktop/Web Companion retries model initialization without restarting
Desktop. Worker exit/timeout clears readiness; shutdown reaps the native process.

Launcher builds an isolated debug identity with embedded Desktop UI and starts its
own translation-only gateway on `127.0.0.1:18080`. Web Companion serves the built
UI on a dynamic loopback port, without a Vite server. An occupied gateway port is
an error; no unrelated listener is killed. Normal launcher exit stops its gateway.
Force-terminating the launcher host can leave the gateway running; inspect its
owner before restarting. Do not run multiple preview instances simultaneously.

## Verification

Run from `apps/desktop`:

```powershell
pnpm test
pnpm build
node scripts/prepare-release.mjs --check-version
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml --features local-stt
cargo test --locked --manifest-path portable/Cargo.toml --features host
cargo test --locked --manifest-path ../../server/Cargo.toml
cargo test --manifest-path ../../ai-protocol/Cargo.toml
.venv/Scripts/python.exe -m unittest discover -s worker -v
./scripts/package-worker.ps1
.packaging-venv/Scripts/python.exe -m unittest discover -s worker -v
.venv/Scripts/python.exe scripts/benchmark-vad.py
```

CI runs both Desktop feature modes, frontend, server, and torch-free frozen VAD
checks. Native Whisper tests explicitly skip when the optional binary/model is
absent; after setup they must run. The legacy probability comparison uses an
existing torch environment only and skips on fresh torch-free environments.
Neither CI nor unit tests need a paid API key. Actual Grok translation requires
the separately supplied xAI key. See [verification](local-stt-verification.md).

## Limits

Whisper base can make substantial Thai transcription errors. Local output has no
cloud confidence scores, so its text bypasses that confidence filter while keeping
the existing activity and deduplication checks. Live-game quality and fresh-machine
installation must be evaluated separately from automated package tests.
Portable packages include the native worker, the pinned base model and licenses.
Local release builds require the generated resource configuration and assets;
builds without them are rejected. There is no separate NSIS Local STT installer.
