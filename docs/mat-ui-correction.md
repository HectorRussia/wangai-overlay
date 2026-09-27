# Mat UI correction — verification

Date: 2026-09-27. Branch: `codex/mat-ui-preserve-backend`.

This is a new commit after `3c1f7a3`; the first attempt remains in history. Design source is `thefogusz/wangai-overlay`, `codex/mat-inspired-ui`, pinned at `5c3e05e4bd8990813458a1a7450af1f589f7b52c`. Selected UI/native files were ported and adapted, without merging the fork.

## Visual acceptance

Open [the side-by-side comparison](mat-ui/comparison.html). It includes the two user references, current rendered screens and the 390px Web Companion layout.

- Main: W logo, wordmark/slogan, history/settings actions and one panel containing selected app/start, incoming audio, microphone and translation rows. No Ready Room heading or latest-conversation panel. Desktop client size 820×480, minimum 720×410.
- Overlay settings: left controls and right preview remain side by side at 740px, matching the supplied screenshot. Preview screenshot uses 50% background, other opacity/text scales 100%, 30 seconds and four messages. The utility page scrolls vertically at the native 480px height.
- Compared control order, alignment, card boundaries, typography, cyan/warm colors, logo and preview content. Main reference includes Windows chrome; the browser comparison is the client area. App names/readiness differ with fixture state; this is not a claim of pixel identity.
- Checked 18 scenarios: ready/listening/no source/error/long text, settings, advanced AI/glossary, populated/empty/long history, and full-size Overlay populated/empty/error/long text, including 390px Web Companion. Fixed the inherited narrow-screen row collapse and overlapping header discovered during image review. Confirmed readable controls in the resulting screenshots, not just document width.

## Behavior and data

- `start_session` shares the existing listening pipeline, shows an editable Overlay and hides main only after capture startup succeeds. Capture startup now reports open/start failures synchronously to the caller. Stop hides Overlay and opens main.
- Settings temporarily hides Overlay; returning keeps the session and lock state. Overlay remains a 420×236 card by default. Legacy `set_overlay_presentation` accepts both values as a no-op.
- Tray uses the W icon, opens main, stops listening, or exits through the existing shutdown path. X hides the app. Portable launcher UI and packaging remain unchanged.
- Microphone discovery/selection uses Windows capture devices; `null` means Windows default. Missing selections return an error instead of falling back. Selection and hotkey capture are serialized with push-to-talk lifecycle operations and cannot change while speaking. Actual RMS/peak/time fields use the existing microphone capture path.
- Overlay appearance is a local draft until Save. Equal periodic WebSocket snapshots do not reset drafts. Settings changes, including saved Overlay position/size, are broadcast to native views; Web Companion receives the full snapshots through the existing session-checked stream.
- Native additions include microphone discovery/selection, session start and keyboard shortcut capture. Web additions are `GET /api/v1/microphones` and allowlisted `start_session` / `update_microphone_device` commands on the existing command endpoint. Existing auth/session/origin checks remain in place.
- Schema 16 adds microphone ID and six appearance fields. New fields default to 100% / Windows default. Existing opacity, font scale, hotkeys including F10, glossary, VAD, capture mode, duration and bounds are preserved. New installations use 30 seconds. Versions 14–16 are importable with validation; v14/v15 files are backed up as `settings.pre-v16.json` before rewriting. Older pre-v14 backup behavior remains intact.
- Legacy audio/AI/control routes remain valid. Diagnostics, VAD, AI & Terms, game glossary and Web Companion access are under Advanced. Keyboard shortcuts retain supported keyboard combinations; no Mouse4/Mouse5 support was imported.

## Automated results

| Check | Recorded prior commit baseline | This correction |
| --- | --- | --- |
| Vitest | 78 passed | 120 passed |
| Windows GUI executable checks | 4 passed | 4 passed |
| `pnpm build` | Passed | Passed |
| Rust tests (`cargo test --manifest-path src-tauri/Cargo.toml --locked`) | 89 passed, 2 ignored | 92 passed, 3 ignored |

The prior baseline is the retained first-pass report, not a claim of a second baseline run. Current tests cover independent text/opacity drafts and Save, repeated snapshots, command errors, keyboard recording/cancellation, preserved F10, microphone selection restrictions and retry/no-device states, API payloads, old settings migration/exact backup/round-trip validation, native microphone mutation restrictions and the legacy no-op command. Tests tied to removed capsule/old DOM behavior were updated for the explicitly requested new behavior.

## Windows checks actually performed

Used an isolated debug identifier `dev.gamelingo.mat-ui-qa`, separate from the user's normal profile. The real Tauri/WebView2 app and WASAPI device discovery/capture ran on Windows. AI responses came from a local fixture on port 8080 and VAD ran in existing mock mode; these checks do **not** establish real AI recognition quality.

- Discovered the real Windows default microphone and webcam microphone; selected the webcam and verified persistence, then restored Windows default in the test profile.
- Rejected an invalid device ID through native IPC and verified the previous selection was retained.
- Selected a running app through the native picker. Start button hid main and opened Overlay in placement mode. F8 stopped and returned to main; F8 with no selected app retained main and showed an error.
- F7 switched to locked mode. A native drag action was exercised, but displacement/click-through across other apps was not quantitatively verified.
- F9 press/release traversed the real microphone capture path and returned to idle. Sustained speech/meter response and unplug-during-recording were not verified.
- Slider changed preview to 50% while the settings file stayed at 92%; Save persisted 50% and changed the real Overlay. Native WebView2 integration additionally verified the settings broadcast, fixed 420×236 size, no-op collapse, settings hiding Overlay, and returning without unlocking it.
- Clicked native X; main became invisible while `get_snapshot` still responded.
- Called `quit_app` on a verified live engine; the app exited and its worker and native ports 1431/9223 were absent afterward. This exercises the shared shutdown function; it does not count as clicking Tray Quit.
- Opened authenticated Web Companion through Desktop and observed its real microphone/source state. An unauthenticated microphone request returned HTTP 401.

## Browser transport checks

Real React REST/WebSocket client with mocked engine responses: start session, select app, select Windows-default microphone, failed stop with visible error, draft preservation across pushed snapshots, explicit Overlay save, and a pushed translation appearing in History. Captured narrow settings and error states. This is separate from the limited authenticated browser observation above.

Local scripts, screenshots and logs are in ignored `output/mat-native-qa/`: `visual.js`, `web.js`, `desktop.js`, `*-results.log`, `ui-test.log`, `cargo-test.log`, `build.log`. During artifact copying Vite hit a Windows `EBUSY` file-watch error; restarting Vite restored access. No production-code workaround was added for that transient tooling error.

## Remaining manual acceptance

Not established in this session: actual Tray icon click/menu interactions, sustained F9 speech and meter behavior, unplugging hardware, changing microphones during a real held key (covered by simulated runtime tests), F10/Copy with a real translated reply, physical drag displacement and click-through over a game, live cloud transcription/translation, complete live authenticated Web Companion interaction matrix, or Portable install/upgrade. Three ignored Rust hardware/integration tests are not counted as passes.

## Scope and cleanup

Diff against `main` confirms no changes in `server/`, `ai-protocol/`, `worker/`, or Desktop `cloud_stt.rs`, `gateway.rs`, `translator.rs`, `worker.rs`. No model, vocabulary prompt, AI queue or protocol code was imported.

The pre-existing `src-tauri/Cargo.toml` bytes were backed up before work; its initial status had no textual diff. The only intentional Cargo change is enabling Tauri `tray-icon`. Untracked `ai-protocol/Cargo.lock` is excluded and its SHA-256 remains `86CA7E03FBC4C4BB3D902340EF2FB1CF8E0CF755DE7C1F5007AA87B83AEBAF13`.

No merge, push, release or version bump. Test servers are stopped and port 1420 is returned before delivery.
