# Windows 0.2.1: installer, updates and owner checklist

This repository **prepares** releases. Nothing is deployed or published by running
the tests. Do not distribute the isolated `WANGAI Release Test` installers.

The checked-in Tauri config contains an empty updater public key so the plugin can
initialize in development. Without `WANGAI_UPDATER_PUBLIC_KEY`, update checks stay
disabled; no test signing key is needed for `pnpm tauri dev`. Release preparation
overrides this with the owner's public key, and release build validation still
rejects missing or invalid keys.

## What the user does

1. Download `WANGAI_0.2.1_x64-setup.exe` from
   [HectorRussia/wangai-overlay Releases](https://github.com/HectorRussia/wangai-overlay/releases).
2. Install for the current Windows user. No Python, pip, Rust or Node is needed.
   WebView2 is required; the NSIS bootstrapper installs it if absent (internet needed).
3. Choose a running app and press F8. F9 microphone and Overlay work as before.
4. On later launches, WANGAI checks GitHub once. A notice is shown for newer versions.
   **No download starts until the user clicks Update and confirms.** Manual check is
   in Advanced → Controls & Overlay. Local Web Companion cannot install updates.
5. Downloading does not stop audio. After signature verification WANGAI saves settings,
   invalidates pending AI work, stops capture/worker, then launches the installer.
   The updated application starts again. Settings and installation ID stay intact;
   in-memory History clears on exit, including an update.

Windows 11 x64 is recommended for per-process capture. Windows 10 x64 can run the
application, but older builds need the existing **System Output (MIXED)** fallback.
Microsoft's process-loopback API requires build 20348 or later; do not advertise
per-app isolation on Windows 10 22H2 build 19045 without testing a supported capture
backend. This release does not change capture code or silently switch capture mode.
[Microsoft process-loopback requirements](https://learn.microsoft.com/en-us/samples/microsoft/windows-classic-samples/applicationloopbackaudio-sample/).

No Windows Authenticode certificate is configured for this trial. Windows/SmartScreen
may show an unknown-publisher warning. Tauri signatures protect update integrity;
they do **not** establish a Windows publisher or suppress that warning. Never ask
users to disable antivirus. Provide the download source and SHA256 checksums.

## Owner: first production release (manual actions, not done by tests)

1. Complete [Render setup](render-free.md), rotate the previously exposed AI key,
   test real STT/translation explicitly, and copy the public HTTPS gateway URL.
2. Generate a **production** signing key on your own trusted machine:

   ```powershell
   pnpm tauri signer generate -w C:/secure-backup/wangai-updater.key
   ```

   Choose a strong password. Keep the private file and password in a password manager
   and a second encrypted backup. Never put the private key in Git, screenshots,
   `.env.example`, a desktop bundle, or a Render environment. Losing this key breaks
   automatic upgrades for existing installations. The `.pub` file is public.
3. In GitHub repository Settings → Secrets and variables → Actions, add:

   | Type | Name | Value |
   | --- | --- | --- |
   | Variable | `WANGAI_API_BASE_URL` | Deployed Render HTTPS URL, without `/v1` |
   | Variable | `WANGAI_UPDATER_PUBLIC_KEY` | Complete content of the Tauri `.pub` file |
   | Secret | `TAURI_SIGNING_PRIVATE_KEY` | Complete content of the private key file |
   | Secret | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Signing password |

   AI provider keys belong **only on Render**, not in Desktop CI. No GitHub token
   is embedded in the app: this public repository supplies unauthenticated updates.
4. Commit reviewed changes. Confirm package.json, src-tauri/Cargo.toml,
   src-tauri/tauri.conf.json and Cargo.lock agree on `0.2.1`. Run
   `node scripts/prepare-release.mjs --check-version` and the full CI suite.
5. Only when ready, create and push tag `v0.2.1`. The release workflow first runs
   tests and clean worker packaging, then builds/signs NSIS and creates a **Draft**.
   It does not publish. Do not rerun a partially completed draft job blindly: inspect
   the existing draft first; `gh release create` deliberately refuses to overwrite it.
6. Download and test the draft installer on a clean Windows VM, review notes/assets,
   then click **Publish release** yourself. Required assets: `.exe`, `.exe.sig`,
   `latest.json`, `SHA256SUMS.txt`, `RELEASE-NOTES.md`.

The client reads
`https://github.com/HectorRussia/wangai-overlay/releases/latest/download/latest.json`.
The manifest points to version-specific tag URLs, not mutable `latest` installer
URLs. Keep this a stable, non-prerelease channel; drafts/prereleases do not become
the normal GitHub latest release. Before the first published release, 404 is a
normal unpublished status and never an AI-service failure.

### 0.2.1 console/search correction

Keep the existing 0.2.0 draft unpublished: its main executable uses the Console
subsystem. The 0.2.1 patch builds the release as a Windows GUI application and
returns the app-picker list to the top when its search changes, without resetting
scroll during automatic refresh. It does not change capture, F8/F9 or settings.
After committing/pushing the patch and passing Verify, create a new `v0.2.1` tag;
do not move the existing `v0.2.0` tag or replace its assets. Keep the same signing
key and GitHub Secrets. The production installer must be built/signed by CI.

Release asset preparation now checks the linked application's PE subsystem and
rejects Console builds before creating a draft. The isolated installer QA checks
the actually installed binary both before and after upgrading and no longer uses
`CREATE_NO_WINDOW` when starting the main app (the worker still uses it).

## Local builds

Development remains `pnpm tauri dev` plus the AI gateway in a separate terminal.
Run `scripts/bootstrap.ps1` for the dev `.venv`; release resources are not required.

Production packaging (PowerShell):

```powershell
pnpm install --frozen-lockfile
./scripts/package-worker.ps1
node scripts/desktop-licenses.mjs
# Set the same four build variables/secrets above in this shell, not in source.
node scripts/prepare-release.mjs
pnpm tauri build --ci --bundles nsis --config src-tauri/tauri.release.generated.json
node scripts/release-assets.mjs
```

The generated release config is ignored by Git. Missing/placeholder URL, invalid
public key, missing signer, or incomplete worker files fail the release preparation.
The production binary has no Python-on-PATH/source-tree fallback. The release
config installs the frozen one-folder worker as `worker/`, not an external Python
installation. It preserves the existing console stdin/stdout framing while Rust
starts it with `CREATE_NO_WINDOW`.

`worker/packaging/requirements.lock` locks versions and hashes for Python 3.12 x64.
To deliberately update it, edit requirements.in then run:

```powershell
uv pip compile worker/packaging/requirements.in --python-version 3.12 --python-platform windows --generate-hashes --output-file worker/packaging/requirements.lock
```

Rebuild and retest frozen startup after any dependency change. PyTorch/torchaudio
are CPU wheels; Silero's existing wrapper still uses them for tensor operations.
No CUDA or faster-whisper is included. Model load plus an inference frame runs
before `ready`; missing ONNX/DLL files produce an app error instead of installing
packages at runtime. Dependency notices are shipped under `worker/licenses/`.

## Isolated signed-upgrade test (opt-in)

```powershell
./scripts/build-test-installers.ps1
.packaging-venv/Scripts/python.exe scripts/test-installed-upgrade.py --install-test-product
```

The first command builds **two real NSIS installers** (0.2.0 and 0.2.1), using a
temporary test key in ignored `output/release-test/`. The second explicitly installs
the uniquely identified `WANGAI Release Test`, serves updates on 127.0.0.1:19438,
and runs the real Tauri download/verify/install sequence. It checks worker readiness,
old worker termination, new version startup and settings/installation-ID equality.
It uninstalls only its own test product. Reports remain for review. If interrupted,
inspect the test product before cleanup; do not delete real WANGAI settings.

The `release-test` Cargo feature enables this loopback-only test harness. It cannot
be built under the production identifier; release CI never enables it. Never
distribute test artifacts or reuse the test signing key. The test does not claim
live microphone/game QA: also complete the manual checklist below on a clean VM.
The same opt-in job is available as **Isolated signed installer QA** in GitHub
Actions. It uses an isolated product and generated test keys, never production
signing secrets, and uploads only the result report.

## Pre-distribution manual checklist

- Ordinary Windows user, no Python/.venv/development tools; offline Silero startup.
- Fresh install + install-over-old-version; ensure existing settings/installation ID
  survive and uninstall behavior is clearly understood before deleting app data.
- Launch twice: one engine/worker, original Settings focused.
- F8 start/stop leaves Settings open. F9, actual speech, Overlay drag/gear/hotkeys,
  process switching with late-result rejection, Web Companion all work.
- Confirm update while listening; no capture/worker remains after exit, no old
  pending subtitle reappears after restart. Test slow/truncated downloads and
  invalid signature; listening must remain usable when download/verification fails.
- AI gateway asleep/offline while GitHub update is available; updater still works.
- UI at 980×660 / 1180×780 and zoom; keyboard focus, progress, Later and error states.
- Inspect bundled files/requests/logs for credentials. Review dependency licenses.

See the [0.2.1 patch verification](windows-0.2.1-verification.md) and the
[historical preparation record](windows-release-verification.md) for what was actually run.
[Tauri updater documentation](https://v2.tauri.app/plugin/updater/).
