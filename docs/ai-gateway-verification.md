# AI gateway verification — 2026-09-08

Implemented: standalone env-configured gateway, shared protocol, central-only
Desktop/Web Companion, v14 migration/backup, error cooldown, SQLite usage and Docker
deployment files. Existing overlay dragging and Settings visibility changes retained.

## Automated checks

- `pnpm test`: 46 passed (including AI offline/degraded/recovery and removal of key/model controls).
- `pnpm build`: passed.
- `cargo test --manifest-path src-tauri/Cargo.toml --locked`: 75 passed, 1 intentionally ignored live-discovery test.
- `cargo test --manifest-path server/Cargo.toml --locked`: 12 passed, loopback providers only.
- `python -m unittest discover -s worker -p 'test_*.py'`: 10 passed in the existing `.venv`.
- `pnpm tauri build --debug --no-bundle`: passed; Windows debug executable produced.
- Server Clippy `--all-targets -- -D warnings`: passed.
- Desktop strict Clippy is not clean: pre-existing lints in `app_metadata.rs` and
  `worker.rs` are outside this change. A pre-existing obsolete probe-normalization
  test was removed together with that normalization path; diagnostics now also send original PCM.
- Frontend JS scan found no provider env-key names, legacy credential commands,
  provider endpoint or mock provider secret.

## Browser inspection

Used an isolated Vite session on loopback 1422 and Playwright. Ready Room / Advanced
AI at 980×660 and 1180×780 have no horizontal document overflow. Checked central
service status, read-only models, source picker action and offline presentation.
Changed the long AI details action to “ข้อมูล” after screenshot inspection showed
the longer label wrapping. Fixed Vite watching server Rust build artifacts, which
otherwise crashed the dev watcher with Windows EBUSY.

Screenshots (local, ignored artifacts):

- `output/playwright/ai-ready-room-980.png`
- `output/playwright/ai-advanced-980.png`
- `output/playwright/ai-advanced-1180.png`
- `output/playwright/ai-offline-1180.png`

## Not verified / not performed

- No real provider request, API key configuration or paid smoke was performed.
- Docker image/container was not run: Docker CLI is installed but Docker Engine is unavailable.
- Native Tauri live audio, global F8/F9 and live companion controls still require
  manual QA with an enabled gateway. Unit tests / browser preview do not substitute
  for this check.
- No hosting was created, no endpoint published, and no changes were pushed.

Setup and operator guidance: [server README](../server/README.md).
