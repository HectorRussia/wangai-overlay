# Portable 0.3.0 verification

Last run: 2026-09-10. Local working tree, not a published release.
Host: Windows 11 Pro build 26200, non-elevated user. This is a developer machine,
**not clean Windows**. Tests used disposable signing keys and a loopback update
server; no paid AI requests, production signing keys, Render changes, or releases.

### Live-server preview build (2026-09-12)

Built the production-identity 0.3.0 core and native host successfully, separately
from the isolated test artifacts. The core contains
`https://wangai-ai.onrender.com`, not the loopback test gateway or test identity.
Both entrypoints pass the Windows GUI subsystem check. The configured public key
matches the legacy 0.2.2 release key ID and is embedded in the core, host and
verifier. The pinned WebView2 CAB checksum and runtime version also pass.

A read-only `/v1/status` request returned HTTP 200 / `connected`. This checks
gateway availability only: no audio/translation request was sent, and real model
execution is not yet verified. The live preview itself has **not yet been opened**.

Unsigned build inputs are retained in
`E:\WANGAI-Portable-Preview-0.3.0\unsigned`. Final package signing is pending the
owner entering the existing key password locally using `finish-signing.sh` in
that preview directory. The Git Bash helper does not echo the password or write
it to a file, checks pinned executable/frontend hashes, then signs and audits
the package. Its preflight and syntax checks passed; a successful signing/package
run is still required. No release was published and `E:\dd\Data` was not modified.

## Verified so far

| Check | Evidence |
|---|---|
| Real 0.3.0 / 0.3.1 packages | 3,527 files per payload; SHA256 for every file/asset, archive and executable minisign verification; embedded payload exactly equals updater archive |
| Legacy channel | `latest.json` byte-for-byte matches checked-in 0.2.2 manifest; Portable channel names only signed update ZIPs |
| Runtime isolation | Observed bundled `webview2/msedgewebview2.exe` processes; profile identity equals `Data/WebView2` even with deliberately wrong inherited runtime/profile variables |
| Offline worker | Real CPU Silero ready event; packaged Python 3.12 and ONNX present; long Unicode/spaced path worked after the fix below |
| Automatic confirmation test | Real app 0.3.0 → 0.3.1, 42.9 s; Ready Room DOM + worker readiness, old core/worker exited, settings and installation ID unchanged |
| Readiness timeout rollback | Real 0.3.1 startup withheld only the readiness acknowledgement; 90 s timeout restored 0.3.0, fresh core/worker/UI ready, settings unchanged; scenario completed in 157.3 s |
| Real UI confirmation + launcher replacement | Clicked update offer and confirmation in the actual desktop UI; 78.2 s including click/inspection time, then Ready Room/worker ready and old process exited; launcher SHA256 changed from `1193e4ca…` to `5236d735…` and matched the new signed manifest |
| Distinct-launcher rollback | Observed the new launcher hash after the switch, then verified the exact old launcher hash after timeout recovery; old version's fresh Ready Room/worker started and both test processes exited |
| Customized settings upgrade | Real 0.3.0 → 0.3.1 in 44.4 s; preserved a Thai glossary entry, VAD threshold, Overlay scale/opacity, custom copy hotkey, auto-attach choice and installation ID; fresh Ready Room and offline worker ready |
| Native preparation UI | Inspected actual Win32 controls; readable Thai/dark theme, initial action focus, Tab focus outline, Escape closes idle preview; unrelated nonempty folder rejected without overwrite |
| Regression tests | Frontend 64 passed; executable-subsystem parser 4 passed; Rust core 85 passed / 1 ignored; Portable unit + signed-package/transaction suite 14 passed including Unicode dependency alias identity |

Full local reports live under the task-specific `WANGAI-build/portable-0.3.0`
directory, in `attempt5/ทดสอบ Portable */Data/acceptance-report.json` and
`attempt6/ทดสอบ Portable */Data/acceptance-report.json`.
These fixtures and their keys are **not distributable production releases**.
Copies of the acceptance reports (no signing material) are retained in
`output/portable-verification-0.3.0/` in this checkout.

The last child-control clipping and helper readiness-progress wording changes
compiled in the debug host, but were added after the signed `attempt6` fixtures.
They still need inspection in the final rebuilt signed host. Preparation
cancellation was not completed: the idle preparation window was minimized during
inspection, so further UI input was stopped. No preparation was started in that
attempt. The minimized test preparation window was left open; no test core,
worker, or update helper remained running at the final process check.

## Bugs found and fixed during real testing

- ONNX DLL import failed with an excessively long canonical path. Worker launch
  now uses an existing NTFS short-path alias, verifies identical file identity,
  and gives an actionable error if the DLL path remains too long. No junction,
  registry change, or fallback to a different Data directory.
- Native owner-draw painting leaked font/text-color state to other controls.
  Save/restore the drawing context, disable incompatible checkbox/progress themes,
  and preserve visible keyboard focus. Enter/Escape map to the native dialog IDs.
- Error dialogs now belong to the preparation window. Parent background painting
  clips child controls so progress repaints cannot erase the heading.
- Test diagnostics are emitted before the 90 s supervisor deadline; the harness
  compares directory identity rather than virtualized path spelling, waits for a
  fresh rollback process report, and prints Unicode-safe machine-readable output.
- Native launcher resources include the real/test version so the two-version
  acceptance test can require different launcher binaries and verify replacement.

## Still required before publishing

- Clean Windows 10 and 11 VMs with no Python/venv, normal non-admin user, and no
  reliance on an installed Evergreen WebView2 runtime.
- Real DPI changes at 100%, 125%, 150%, 175%, 200%, screen readers, and all keyboard
  paths; preparation progress cancellation and retry using the final signed host.
- Full migration through the preparation UI: valid/corrupt legacy settings,
  existing Portable data, original file unchanged (JSON validator unit tests pass).
- USB NTFS, move across drives, read-only destination, disk full, interrupted
  download, and startup recovery after forced power loss using real artifacts.
  Archive traversal/signature/limits/downgrade/locked launcher/journal cases are
  covered by automated signed fixtures, not all by a real installed product.
- Update while actually listening, F8/F9 and Overlay, source switching, repeated
  opening and Web Companion behavior on the final Portable with a no-cost AI fixture.
- Rebuild final production-key artifacts, run CI, inspect Draft assets, then publish
  as a **separate** owner-approved step. Neither this report nor a green build alone
  means all release gates have passed.

## Reproduce

```powershell
./scripts/build-test-portables.ps1 -OutputRoot C:/WANGAI-QA/fixtures
python scripts/test-portable-upgrade.py --artifacts C:/WANGAI-QA/fixtures --run-test-product
python scripts/test-portable-upgrade.py --artifacts C:/WANGAI-QA/fixtures --run-test-product --rollback
python scripts/test-portable-upgrade.py --artifacts C:/WANGAI-QA/fixtures --run-test-product --manual-confirmation
```

Manual-confirmation mode waits for the update offer and confirmation buttons in
the real desktop window; it does not auto-call the update command. Build scripts
also run `scripts/verify-portable-artifacts.py` before declaring assets complete.

## 2026-09-12: worker speech-event contract fix

The first production-key preview opened Ready Room, loaded the bundled worker,
and showed audio levels in System Output mode, but never started transcription.
The blocking bug was the Python/Rust event contract: Python emits camelCase
fields (`utteranceId`, `sampleCursor`, `expectedSampleCursor`, `actualSampleCursor`),
while Rust previously expected snake_case variant fields. `ready` events decoded,
but speech and gap events were discarded into an unobserved `worker-log` event.

- Reproduced against the unchanged Rust type and both Python source events and
  the actual packaged worker; speech events failed with `missing field utterance_id`.
- The shared Python/Rust regression fixture failed before the fix and passed
  after enabling camelCase variant fields, retaining snake_case event names.
- Malformed events now reach the existing error UI without echoing raw output;
  the backend clears worker-ready/VAD flags and broadcasts the failure state.
- CI explicitly runs `packaged_worker_events_follow_rust_contract` after worker
  packaging, exercising the frozen executable through Rust's binary-frame writer
  and actual event decoder. Deterministic mock VAD is used for this protocol test;
  the separate real ONNX startup test is retained. No paid AI requests are made.
- A local synthetic-speech test independently established that the previous
  bundled real ONNX worker detects speech at -16.1 and -25.1 dBFS. This does not
  establish successful live capture/transcription/translation in the fixed app.
- Local fix verification passed: Rust core 89 tests (two intentionally ignored
  in the default run), the packaged-worker contract test explicitly executed and
  passed, Python worker 11 tests, frontend 65 tests, PE checks 4 tests, preview
  guards 7 tests, and frontend production build. Final signed CI artifact and
  live translation validation remain pending at this source checkpoint.

The repaired preview remains **0.3.0**, with its commit/run recorded separately.
Prepare it in a new folder; do not replace a same-version payload or overwrite
the previous preview's Data. Production publishing is still a separate step.
The earlier intermittent Process Tree digital silence remains a separate,
unresolved capture issue; it must not be claimed fixed by the event-contract fix.
