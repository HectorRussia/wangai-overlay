# Local STT 0.6 verification — 2026-10-09

Verified in the Windows development checkout. This record describes local checks;
it is not a claim that a GitHub Actions run or production release was published.

| Check | Result |
| --- | --- |
| Frontend | 121 tests + 4 build-tool tests passed; type check/build and formatting passed |
| Desktop Rust, Cloud | 94 passed, 3 environment-specific tests ignored |
| Desktop Rust, Local | 102 passed, 3 environment-specific tests ignored |
| Frozen VAD / Rust decoder | Real packaged-worker IPC contract test passed |
| Portable | 7 library + 7 package tests passed; Windows host build passed |
| Gateway | 16 unit + 2 explicit-env-file integration tests passed |
| Shared protocol | Build, unit-test target and doc-test target passed |
| Python development | 15 passed, including legacy ONNX equivalence and both native Whisper tests |
| Python torch-free packaging | 14 passed; optional legacy comparison skipped because torch is absent |
| Frozen VAD | Offline real-model startup, Unicode/spaced paths, reset and frame smoke passed; no torch/torchaudio bundle files |
| Native Whisper | Pinned source/model setup and CPU CMake build passed |
| Preview application | Tauri debug/no-bundle build passed |
| Actual preview smoke | Ready Room DOM, combined model readiness, Desktop/Web adapter parity and HTTP recovery passed |
| Web Companion HTTP | Built index served without Vite; unauthenticated snapshot rejected; session exchange, authenticated snapshot and restart passed |
| Launcher | Isolated fixture env loaded; preview exited successfully and its gateway port was released |
| Live Grok follow-up | Two synthetic text requests (en→th and th→en) returned HTTP 200 using the user's separate xAI configuration; provider status became ready |
| Docker gateway | Cloud and Local health/status, non-root SQLite, redaction and SIGTERM shutdown passed; Local rejects transcription requests without STT credentials |
| Release metadata | Version consistency passed; PE display version `0.6.0-alpha.1` and numeric version `0.6.0` verified |
| Dependency notices | Frozen worker and 464 desktop dependency notices generated successfully |
| Diff | Whitespace check passed |

The actual GUI/HTTP smoke used the existing isolated `release-test` product with
`local-stt` enabled, a fixture key, and `WANGAI_TEST_START_SMOKE=1`. It did not select
or record an application/microphone or call a paid provider. Its QA-only probe
checks the rendered Ready Room, adapter parity, a real session cookie, snapshot,
HTTP recovery, and clean exit. The ordinary preview executable was restored after
the smoke; QA controls are excluded from ordinary builds.

The CI workflow now tests both Desktop feature modes. A clean CI checkout explicitly
skips native Whisper tests until optional setup assets are present. The packaging
environment intentionally skips the optional old-wrapper comparison instead of
installing PyTorch. Both native tests actually ran in this checkout.

VAD working set after warmup was **233.1 MiB → 69.4 MiB**, measuring the actual Python
process on Python 3.12.12, ONNX Runtime 1.29.0, NumPy 2.5.2 and Silero asset 6.2.1.
Frozen packaging separately uses its pinned ONNX Runtime 1.22.1/NumPy 2.2.6 locks.
These are VAD measurements, not total application RAM; see [details](vad-onnx.md).

## Remaining manual checks

- The follow-up smoke on 2026-10-09 verified real Grok translation with two short
  synthetic text requests. This does not establish live-game speech quality.
- Live-game audio quality, Thai accuracy, F9 speech recognition with a real user,
  clean-machine setup and packaged updates remain unverified.
- No Local STT installer, production deployment, release/tag, or updater promotion
  was created. See the [handoff](local-stt-handoff.md) for use and limitations.

## Follow-up smoke — 2026-10-09

After the user supplied the xAI key, the preview configuration was moved from
`server/local-stt.env` to the launcher's ignored `server/.env.local-stt` path.
The gateway accepted both translation directions and rejected cloud transcription.
The English request included a glossary term, which was preserved in the result.
The native Whisper real-model contract tests and offline frozen ONNX smoke passed
again. These native contract tests use silence, not recorded speech.

A fresh isolated QA build passed rendered Ready Room, combined VAD/Whisper
readiness, Desktop/Web recovery and authenticated Web Companion HTTP checks.
The launcher rejected an occupied port, exited with code 0, and released port
18080. No owned preview, gateway or Whisper process remained. The ordinary
preview executable was restored and its hash matched its pre-smoke value.
Local evidence is under `apps/desktop/output/local-stt-import/smoke-rerun-*`.
The initial QA build attempt omitted its required test updater endpoint; the
correctly configured rebuild passed before the application smoke ran.

## Portable 0.6.0 preparation

The owner changed the release scope from source preview to a Portable that bundles
Whisper and its model. Version metadata now agrees on `0.6.0`. The historical alpha
results above are retained; they are not claims about the later signed artifact.

- Rust Cloud: 94 passed, 3 ignored; Rust Local: 103 passed, 3 ignored.
- Portable: 7 library and 8 signed-package tests passed, including incomplete
  Whisper assets and changed model rejection during ordinary launch verification.
- Frontend: 121 + 4 tests and type check/build passed; Python packaging: 14 passed
  with one optional legacy comparison skipped; packaging regression: 2 passed.
- Native worker now uses Unicode file loading and a static MSVC runtime. Offline
  model load, both language frames and shutdown passed from Thai/spaced paths.
- Synthetic Windows TTS speech was recognized by the real native worker and sent
  as text to the live Render/Grok gateway. Both translations returned HTTP 200.
  English matched the test phrase; Thai contained recognition errors. These are
  synthetic fixture results, not a live-game or microphone accuracy benchmark.
- Signed Portable, upgrade/rollback and GitHub CI results will be recorded after
  those exact artifacts and commits have been checked.
