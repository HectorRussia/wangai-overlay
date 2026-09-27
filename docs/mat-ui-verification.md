# Mat UI integration verification

Date: 2026-09-27

## Source and boundaries

- Branch: `codex/mat-ui-preserve-backend`.
- Base: `main` at `e5041ff52b01047d6abe4d085ddd3868fa2f76ed`.
- Design source: `thefogusz/wangai-overlay`, `codex/mat-inspired-ui`, commit `5c3e05e4bd8990813458a1a7450af1f589f7b52c`.
- Adapted the compact dark control panel, warm action colors, cyan status accents, settings/picker surfaces, history styling and overlay palette. Bundled the source WOFF2 Thai fonts with both OFL license files.
- Kept existing hash routes, History, AI & Terms, diagnostics, update controls, explicit Save actions and the desktop Exit command. Desktop and Web Companion share the same presentation.
- Kept the original overlay capsule/expanded state machine, message count, expiry, font scaling, Copy, drag/edit permissions and window dimensions. Overlay changes are CSS only.
- Did not import the fork's microphone picker, hotkey capture, start-session/minimize-to-tray behavior, extra overlay settings, STT vocabulary or translation pipeline changes.
- No changes to backend directories, portable launcher, app icons, native window configuration, dependencies, API transport, settings types, hooks or routing. The pre-existing untracked `ai-protocol/Cargo.lock` is excluded.

## Automated results

| Check | Before | After |
| --- | --- | --- |
| `pnpm test`: Vitest | 65 passed | 78 passed |
| `pnpm test`: Windows GUI executable checks | 4 passed | 4 passed |
| `pnpm build` | Passed | Passed |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked` | Not run for baseline | 89 passed, 2 ignored |

All original UI tests remain intact. Added 12 Desktop/Web-context command-binding regressions and one Overlay Copy regression. These verify start/stop, app selection and refresh, explicit hotkey/overlay/VAD/glossary saves, advanced routes, error recovery, desktop-only actions and Copy permissions. The Desktop-context tests mock the native API; they do not exercise physical keyboard input or a real WebView.

## Browser verification

Used Playwright against Vite at `http://127.0.0.1:1420`.

- Checked 17 visual scenarios across 1180×780, 980×660, 390×844, 420×236 and 332×52: ready/listening/busy/setup/warning/error, long application names and Thai translations, history populated/empty/long, AI & Terms, Controls, and expanded/collapsed Overlay. Checked the app picker separately.
- Checked document and settings workspace widths: no horizontal overflow in those scenarios. Long history/settings content remains vertically scrollable.
- Exercised the real frontend REST/WebSocket transport with mocked engine responses: start, choose Discord, failed stop with visible error, explicit overlay save and a pushed translation appearing in History. Verified the existing command names and payloads and absence of auto-save. This is not a live engine/session-authentication test.
- Local screenshots and browser QA scripts are under `output/playwright/` (ignored artifacts). `mat-visual-qa.js` runs the visual matrix; `mat-web-qa.js` runs the mocked transport exercise from a fresh browser session initially on Preview.
- The existing development-server favicon request returns 404. The transport exercise intentionally returns one 503 to verify error feedback; neither is an application JavaScript failure.

## Remaining manual checks

Not verified in this session: actual Windows F7–F10 registration/input, microphone/WASAPI capture, live AI transcription/translation, native window close/hide/drag/click-through, a real authenticated Web Companion session, or portable installation/upgrade. Rust and mocked frontend coverage do not replace these hardware/native checks. The two ignored Rust tests are not counted as passes.

Run `pnpm tauri dev` with the existing engine configuration to check these on Windows. Confirm that F8 starts/stops, holding/releasing F9 translates speech, F10 copies, F7 enables movement and re-locks, and closing settings preserves the existing listening-dependent behavior. Then open Web App from Desktop and repeat source selection, start/stop and settings saves against the real engine.

No merge into `main`, push, version bump or release publication is included.
