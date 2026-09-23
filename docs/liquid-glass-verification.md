# WANGAI 0.4.0 Quiet Studio — verification record

2026-09-18 · branch `codex/liquid-glass-0.4.0` · **Preview, not Stable**.
0.3.0 remains the published manually downloaded Pre-release; 0.2.2 remains Latest.
No 0.4.0 tag, public release, normal updater channel, old release asset or Render
configuration is changed by this work.

### Compact typography follow-up — signed Preview 2026-09-23

The user-requested compact text/buttons and multiline Overlay repair is committed
and pushed as `46f7120859c2177d79f3ce2c2d2c36c001704b7d`. Frontend verification:
86 frontend + 6 Node tests and TypeScript/Vite build passed again on 2026-09-23.
Browser visual/scrolling evidence is in the compact follow-up section in root
`design-qa.md`. The older artifact at commit `343a840` does not include this fix.

2026-09-23 follow-up: the user confirmed that the revised UI was tried in the
actual app and that scrolling is comfortable. This is user-reported native
acceptance of the compact typography/Overlay repair, not a clean-Windows,
performance or update/rollback certification.

The newly signed Preview passed all CI jobs:
https://github.com/HectorRussia/wangai-overlay/actions/runs/35887304454
Artifact `WANGAI-portable-preview-35887304454-1`, ID `10764406787`.
Downloaded to `E:\WANGAI-Portable-Preview-0.4.0\github-35887304454`.
Independent local verification with the original public key passed all three
signatures (manifest, archive, preparer), checksums, 3,529 file hashes, production
gateway/key identity, embedded payload equivalence and unchanged legacy 0.2.2
manifest. Portable size: 548,626,346 bytes. SHA256:
`86ef838eac75c68543615f20bd1f8837ce2ca5db8112cd50029bbb159accde10`.

CI also passed core Rust 89 tests (2 ignored), Portable 14 tests, the opt-in
packaged-worker decoder test, 11 Python worker tests, 11 preview guard tests and
server verification. No paid AI was called. This exact signed executable was not
launched locally; clean Windows, performance and update/rollback of this revision
remain unverified. No tag, release or normal updater channel was changed.
Use a fresh folder for this same-version 0.4.0 Preview; do not overwrite an older
0.4.0 Portable or its Data. Public release/Stable publication is not authorized.

## Implemented

Collapsible desktop sidebar, Ready Room source/control strip, large latest phrase,
history, all three settings sections, source picker and frameless readable Overlay.
Native Windows titlebar and Portable preparation UI are unchanged. Local Thai font
stack/Lucide only, no font/script CDN, no CSP relaxation, schema v14 and existing
commands/events/routes/Data remain intact. In-memory history remains in memory.

`liquid-glass-react` is pinned to **1.1.1** behind `GlassSurface`. Shipping uses CSS
glass; only `?preview=1&glass=liquid` in a non-Tauri browser mounts the experimental
library. Controls are outside Suspense/error boundaries. No shader, elasticity,
mousemove tracking or continuous glass animation is enabled. Reduced motion,
forced colors, off-screen and hidden states remove the optional effect; the
Overlay expiry clock also stops while hidden. These are code/test guarantees,
not a measured native GPU/performance certification.

## Checks actually run

| Check | Result |
| --- | --- |
| `pnpm test` | 78 frontend tests + 6 Node tests passed |
| `pnpm build` / version agreement | Passed, 0.4.0 across app/host/config |
| Core Rust unit tests | 89 passed; 2 opt-in tests excluded from default run |
| Packaged-worker Rust decoder contract | Explicit opt-in test passed using real one-folder worker |
| Portable host/archive/transaction tests | 14 passed, including malicious archive, locked launcher and interrupted journal cases |
| Python worker tests | 11 passed, synthetic audio only |
| Preview/release guard tests | 11 passed, including branch ↔ version binding |
| Browser visual and interactive QA | Passed scoped handoff; see root `design-qa.md` |
| Real installed pair, 0.3.0 → 0.4.0 idle update | Passed on this Windows development PC, 28.3 seconds after confirmation through test hook |
| Failed-ready rollback, 0.4.0 → 0.3.0 | Passed, 118.6 seconds including the 90-second readiness deadline |

The excluded read-only process-list test was not used as proof of live Process
Tree capture. Browser tests/fixtures never record audio, call paid AI or write
user settings. Runtime commands for real Desktop/Web Companion are unchanged.

## Real portable pair evidence

The baseline was built from the **actual v0.3.0 checkout** at
`E:\WANGAI-Release-0.3.0\source`, not current UI source with a fake old version.
Both artifacts use the same **disposable fixture key** and isolated release-test
identity. The gateway is unreachable loopback, updater is a local test server.
These fixtures **must never be published or handed out as production previews**.

- Artifacts: `E:\WANGAI-UI-QA-0.4.0\artifacts\v0.3.0` and `v0.4.0`.
- Final 0.4.0 test preparer: 548,802,348 bytes; SHA256
  `31b3bfe9b7f927ac5248fc803c20d4b9360482ac12b4dcd72d4dc8f3b3c2e41c`.
- Artifact audit passed: 3,529 program files, 1,326,491,052 expanded bytes;
  manifest/archive/preparer signatures, file hashes, embedded payload identity,
  GUI subsystems and byte-for-byte legacy 0.2.2 manifest checked.
- Upgrade report:
  `E:\WANGAI-UI-QA-0.4.0\artifacts\ทดสอบ Portable 6f7cb54a-7dcb-4a49-a2ab-62e9594079ab\Data\acceptance-report.json`.
- Rollback report:
  `E:\WANGAI-UI-QA-0.4.0\artifacts\ทดสอบ Portable 4cb4fa37-4a58-4e94-a369-9886423fb892\Data\acceptance-report.json`.
  The helper observed the 90-second failure, restored the old launcher hash and
  active version, reopened the old worker/Ready Room, and kept Data unchanged.
- Before and after: worker ready and rendered Ready Room DOM observed in native
  Fixed WebView2. Runtime/profile environmental overrides were ignored; the
  bundled runtime and Data/WebView2 profile were used.
- All old app/worker processes exited, launcher hash changed, previous version
  retained, settings including non-default glossary/VAD/hotkey/Overlay and
  installation ID matched exactly. No archive download before confirmation.
- The harness uses its headless test mode. Confirmation is through an isolated
  test hook, **not a human click**; no
  real listening was active. This is stronger than a browser mock, but is not
  equivalent to testing a production-signed artifact with live audio.

Reproduce with the two checkout builds and shared fixture key, then:

```powershell
python scripts/test-portable-upgrade.py --artifacts E:\WANGAI-UI-QA-0.4.0\artifacts --run-test-product --from-version 0.3.0 --to-version 0.4.0
python scripts/test-portable-upgrade.py --artifacts E:\WANGAI-UI-QA-0.4.0\artifacts --run-test-product --from-version 0.3.0 --to-version 0.4.0 --rollback
```

## Still required before a stable/public 0.4.0 release

- First launch and native acceptance of the exact production-key-signed CI
  Preview. Its static/cryptographic audit passed as recorded below.
- Clean standard-user Windows 10/11 without dev dependencies; actual system DPI
  100–200%, Windows high contrast and keyboard-only use in the native app.
- Live F7/F8/F9/F10, drag/lock/click-through, copy/paste, Web Companion and update
  while listening. Paid AI calls were deliberately not run automatically.
- Same-scene native 0.3.0/0.4.0 frame-time, CPU/GPU and memory measurements,
  including minimized/hidden windows. Browser viewport checks are not that test.
- Native liquid-glass library/CSP/performance gate. CSS fallback remains enabled
  until that experiment is accepted; the library has no role in startup-ready.
- Additional clean-Windows fault matrix from the Portable plan, including storage
  exhaustion and abrupt power-loss recovery. Passing the existing unit tests is
  not a claim that every physical-machine case has been repeated.

Only `Portable Preview (no publish)` is used to produce a shareable signed build.
It requires the live gateway and existing public/private key match, audits before
upload, and has no release-write permission. Publication is a separate decision.

## Production-signed Preview delivery

- CI run [35312072091](https://github.com/HectorRussia/wangai-overlay/actions/runs/35312072091)
  completed successfully: server verification, Windows verification and package.
- Exact application source: `343a84087ba430d3001c60d671c801ad156348fa`, branch
  `codex/liquid-glass-0.4.0`. Later verification-only documentation is not a new
  application build.
- Artifact: `WANGAI-portable-preview-35312072091-1`, GitHub artifact ID
  `10534501953`. Downloaded without replacing an existing preview to
  `E:\WANGAI-Portable-Preview-0.4.0\github-35312072091`.
- Independently re-ran `verify-portable-artifacts.py --production` locally with
  a verifier compiled with the original **public** key: passed. Verified manifest,
  archive and preparer signatures, all supplied checksums, 3,529 payload file
  hashes, exact embedded archive, live gateway identity and unchanged legacy
  0.2.2 manifest. No private key or password was read locally.
- Production preparer: **548,623,973 bytes**, expanded program files
  **1,326,049,004 bytes**. SHA256:
  `19255b6e0fe0124d139bf278df07edb61eb81f707d45cbd1a26ddeebbc7b066b`.
- CI's PE audit records GUI subsystem 2 for both user entrypoints. Internal worker
  utilities retain subsystem 3 and rely on the existing no-console worker launch;
  this is not a claim that every bundled utility is a GUI executable.
- This exact artifact was **not launched** during the audit, and no live audio or
  paid AI was invoked. Isolated native upgrade/rollback evidence above remains a
  separate test build. No tag/release/Latest/updater channel was changed.

For the user trial: close other WANGAI instances, open
`WANGAI_0.4.0_x64-portable.exe` from that folder and choose a **new** destination.
Keep the old 0.3.0 folder and its Data intact. CSS glass remains the shipping
default; the optional liquid-glass library still awaits native performance QA.
