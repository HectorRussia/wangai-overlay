# Windows 0.2.2 startup recovery verification

Local checks: 2026-09-10, existing Windows 11 x64 developer machine.
The existing production installation, signing secrets and AI provider were not
changed by local testing. This is not clean-machine certification.

## Cause and changes

Tauri 2.11.5 creates auto-configured WebViews before the application setup hook.
WANGAI registered AppState inside that hook, after settings/client initialization.
The frontend could therefore request `get_snapshot` too early. Its initial read
had no retry/timeout; runtime events could not populate an absent full snapshot.

Both windows now defer creation until all required command managers are registered.
Snapshot reads have bounded retries/timeouts, cancellation guards and manual Retry
after exhaustion. Web Companion events supersede older initial HTTP reads.
The isolated installer harness now checks the rendered Ready Room DOM in addition
to backend/worker state and deliberately slows pre-registration startup by 3 s.

## Verified

- Before the fix, four new frontend regression cases failed: transient missing
  state, retry exhaustion, hung IPC, and stale Web Companion bootstrap results.
- After the fix, all 64 React tests plus 4 PE-header tests passed. Seven startup
  tests use the real SettingsApp/useSnapshot path, not a mocked snapshot hook.
  Includes automatic recovery to Ready Room, keyboard-focusable manual Retry,
  bounded hung requests, ignored late results, cancellation during both a request
  and retry delay, React StrictMode cleanup, and Web Companion recovery.
- Desktop Rust: 83 passed, 1 existing live native-inspection test ignored.
  New tests reject absent/partial managed state and assert that neither configured
  window auto-creates. Python worker: 10 passed. No audio code changed.
- Production frontend build, version consistency (0.2.2), Python script syntax
  and Git diff whitespace checks passed.
- Playwright in a real browser at 980x660 and 1180x780 used isolated simulated
  Tauri responses with the actual frontend, without Preview's snapshot bypass.
  Transient failures recovered automatically; exhausted and hung requests showed
  Retry; pressing Enter reached Ready Room without restarting. Error details fit
  the window without horizontal overflow. Final browser console had no errors.
  Ignored screenshots: `output/playwright/startup-*.png`.

## Native installer verification / remaining gates

The test installers are isolated fixtures labeled 0.2.0 and 0.2.1, both built
from this patch using the existing temporary test key, not production artifacts.
Both NSIS installers built and signed successfully; both Windows GUI-subsystem
checks passed. The runner's production-process guard was exercised first: it
refused before launching NSIS while production WANGAI was running.

After production WANGAI was closed, the actual NSIS install -> signed Tauri update
-> new NSIS install completed successfully on 2026-09-10 at 09:51 ICT. Both installed
WebViews rendered Ready Room (`uiReady: true`) despite the deliberate three-second
startup delay; both bundled workers became ready. Old/new app and worker processes
exited, and settings including installation ID matched across the upgrade. Both
installed executables passed the GUI-subsystem check. The isolated test product
was uninstalled afterward; production `E:\WANGAI` was not replaced.
The fresh result is retained in ignored `output/release-test/upgrade-result.json`.

Production 0.2.2 CI signing/publication and clean Windows VM testing remain undone.
Live game/microphone capture, F8/F9, Overlay, duplicate launch and Web Companion
should also be checked manually after the final production build. Settings remain
schema v14; in-memory History still clears when the application exits.
