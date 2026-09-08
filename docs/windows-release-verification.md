# Windows release preparation verification

Local execution: 2026-09-08, Windows 11 x64 developer machine. This is **not** a
clean-machine certification and no real AI provider was called during testing.

## Verified locally

- React: 55 tests, including explicit update confirmation, progress, text-only
  release notes, cancel/Escape, Later, stale-event revisions and Web Companion UI.
- Frontend production build and Tauri debug build (`pnpm tauri build --debug --no-bundle`).
- Desktop Rust: 79 passed / 1 ignored (the pre-existing native inspection test).
  Covers existing audio/settings/source-generation behavior, lifecycle rejection,
  Desktop-only updater facade and Web Companion allowlist rejection.
- Real Tauri updater plugin against a loopback mock server: no download during
  check, generated temporary signatures, valid download verification, corrupt
  payload, invalid signature encoding, malformed manifest, timeout, 404, 204,
  equal version and downgrade rejection. No installer launched by these unit tests.
- Server Rust: 13 tests, including placeholder rejection/redaction, mock STT/chat,
  concurrency, 429 recovery, provider/model configuration and timeout handling.
- Python: 10 existing worker tests, run in the clean packaging environment.
- Frozen worker: real ONNX inference before ready, protocol frame/cursor gap/reset,
  separate wire IDs, path with Thai characters/spaces, child PATH containing only
  System32, no development overrides. Both the model check and framed worker ran
  successfully without source Python or `.venv` in the child's working directory.
- Two actual signed NSIS test installers, approximately 115 MiB each. Installed
  isolated product **WANGAI Release Test 0.2.0**, downloaded/verified its signed
  0.2.1 update through Tauri, invoked the real installer and restarted 0.2.1.
  Both workers reported ready, the old process/worker exited, and the complete
  settings object including installation ID was identical after upgrading.
  Repeated after the final Rust shutdown/worker changes with the same successful result.
  The test product was uninstalled afterwards; production WANGAI was not touched.
  Machine-readable report: `output/release-test/upgrade-result.json` (ignored).
- Playwright Browser Preview at 980×660 and 1180×780: update notice, inline
  confirmation, Escape and download progress. Screenshots are in
  `output/playwright/update-*.png` (ignored). The Playwright inspection led to a
  smaller notice layout and explicit theme styling for the progress bar.
- Release input/version checks, Node/Python script syntax, YAML syntax (Blueprint
  and three workflows), Git diff whitespace check and a provider-key pattern scan
  of distributable source passed. Real `.env`, temporary keys and generated config
  were confirmed Git-ignored. Preview/test listeners were stopped after the checks.

## Not yet verified / owner gates

- Docker Engine could not start on this host (`dockerDesktopLinuxEngine` named pipe
  unavailable). Linux Docker build/run, non-root `/data` write, ephemeral SQLite
  and SIGTERM smoke must pass the supplied CI/container script before deployment.
  Native Windows server tests are **not** a substitute for the Linux container test.
- No Render service, production signing key, tag, Draft Release or public release
  was created. GitHub workflows are prepared but not executed remotely here.
- No paid AI requests, live game/microphone capture, F8/F9 during installation,
  native Overlay interaction, duplicate-launch focus, or native Web Companion QA
  was performed in this packaging pass. Existing regression tests remain green;
  complete those manual checks on an ordinary-user clean Windows VM.
- Windows 10 compatibility/per-process API availability, WebView2 bootstrap on a
  machine without it, 125%/150% display scaling and native installer UI need manual
  verification. Browser Preview does not certify Tauri/Windows rendering.
- Production signing and actual HTTPS gateway build await owner-provided variables
  and secrets. Test-signed artifacts are **not for distribution**.

Reproduction commands and the remaining manual checklist are in
[Windows release guide](windows-release.md). Render limitations and setup are in
[Render Free guide](render-free.md).
