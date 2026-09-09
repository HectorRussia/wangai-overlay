# Windows 0.2.1 console/search patch verification

Executed on 2026-09-09 on the existing Windows 11 x64 developer machine.
This is a follow-up to the historical [release preparation record](windows-release-verification.md),
not a clean-machine certification. No real AI provider was called.

## Fixes and evidence

- The installed production 0.2.0 main executable had PE subsystem 3 (Console).
  The new PE guard rejects that actual binary. Release builds now use subsystem 2
  (Windows GUI); development keeps Console output. Worker launch still uses
  `CREATE_NO_WINDOW` and its stdin/stdout protocol is unchanged.
- Native discovery using the existing Rust implementation found Mistfall Hunter
  with three grouped processes. Searching `mi` placed it fifth among 46 matches;
  searching `mistfall` placed it first among three. No discovery/capture rewrite
  or elevation was required. The picker retained an old scroll offset when the
  query changed; it now returns to the first result on search changes only.
- The new scroll regression test failed before the fix (offset 1200 instead of 0)
  and passed afterwards. Background refresh retains scroll, query and focus.

## Completed checks

- `pnpm test`: 57 React tests and 4 Node PE-header tests passed.
- Desktop Rust: 80 passed, 1 pre-existing live native inspection test ignored.
- Server Rust: 13 passed; Python worker: 10 passed.
- `pnpm build` and `pnpm tauri build --debug --no-bundle` succeeded.
- Version validation agrees on 0.2.1 across frontend, Rust, lockfile and Tauri.
  Script syntax checks and Git diff whitespace checks passed.
- Playwright exercised Browser Preview at 980x660 and 1180x780 with a long list:
  scroll down, search `Mi`/`Mistfall`, clear search, preserve input focus, wait for
  automatic refresh without jumping, and close with Escape. Mistfall is visible
  after search; no horizontal page overflow was found. The only browser console
  error was a missing favicon (404).
  Screenshots: `output/playwright/picker-scroll-{before,after}-{980,1180}.png`
  (ignored). These show the fixed app before/after changing its query, not a
  comparison of old and new binaries.
- Rebuilt two real, isolated, test-signed NSIS installers with the current patch,
  labeled 0.2.0 and 0.2.1 for the upgrade fixture. Both linked executables passed
  the Windows GUI PE check. The unchanged packaged Python/Silero worker was reused.
- Installed **WANGAI Release Test 0.2.0**, downloaded and verified the signed 0.2.1
  update through Tauri, ran the real installer, and started 0.2.1. The test harness
  no longer hides the main app's Console window. Installed PE checks passed both
  before and after the upgrade. Both workers became ready, the old process/worker
  exited, settings including installation ID matched, and the final updater phase
  was `up_to_date`. Report written at 03:32:35 +07:00:
  `output/release-test/upgrade-result.json` (ignored).

## Scope and remaining gates

- The isolated test product was uninstalled after testing. No app/worker or local
  preview/mock-update listener remained. The production installation in `E:\WANGAI`
  was not changed; its executable hash remained identical.
- No commit, push, tag, GitHub release modification or publication was performed
  in this patch pass. The real production 0.2.1 installer has **not** been built
  with the owner's signing key. Do not distribute the test installers.
- The upgrade above uses two newly built test fixtures, not the production 0.2.0
  draft installer. After review/commit/push and green Verify, build a new `v0.2.1`
  draft through CI using the existing signing secrets. Do not move `v0.2.0`.
- Test the resulting production installer on a clean ordinary-user Windows
  machine, including actual Mistfall audio, F8/F9, Overlay, duplicate launch,
  Web Companion and installation over the existing version. Browser Preview and
  the automated upgrade do not certify those native/manual interactions.
- No Linux Docker/Render redeploy or GitHub Actions artifact-upload investigation
  was performed in this patch pass; those are separate from these desktop fixes.

See the [release guide and manual checklist](windows-release.md) before publishing.
