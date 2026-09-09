# Explicitly opt-in. Makes isolated, test-signed artifacts only; no GitHub calls.
param([switch]$SkipWorker)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw 'Test installer build failed' } }
$testOutput = New-Item -ItemType Directory -Force -Path output/release-test
if (-not $SkipWorker) { & "$PSScriptRoot/package-worker.ps1"; Check-Exit }
node scripts/desktop-licenses.mjs
Check-Exit
$testKeyPath = Join-Path $testOutput.FullName 'updater-test.key'
if (-not (Test-Path -LiteralPath $testKeyPath)) {
    # CLI output is suppressed so even temporary private key material cannot hit logs.
    pnpm tauri signer generate --ci -p 'wangai-test-only' -w $testKeyPath *> $null
    Check-Exit
}
$env:WANGAI_UPDATER_PUBLIC_KEY = (Get-Content -LiteralPath "$testKeyPath.pub" -Raw).Trim()
$env:TAURI_SIGNING_PRIVATE_KEY = $testKeyPath
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = 'wangai-test-only'
# No real AI requests; this intentionally unreachable HTTPS endpoint is test-only.
$env:WANGAI_API_BASE_URL = 'https://127.0.0.1:19439'
$env:WANGAI_TEST_UPDATE_ENDPOINT = 'http://127.0.0.1:19438/latest.json'
foreach ($testVersion in @('0.2.0', '0.2.1')) {
    $env:WANGAI_TEST_VERSION = $testVersion
    node scripts/prepare-release.mjs --test
    Check-Exit
    pnpm tauri build --ci --features release-test --bundles nsis --config src-tauri/tauri.release.generated.json
    Check-Exit
    node scripts/check-windows-gui.mjs src-tauri/target/release/gamelingo.exe
    Check-Exit
    $versionOutput = New-Item -ItemType Directory -Force -Path (Join-Path $testOutput.FullName "v$testVersion")
    $installer = Get-Item -LiteralPath "src-tauri/target/release/bundle/nsis/WANGAI Release Test_${testVersion}_x64-setup.exe"
    Copy-Item -LiteralPath $installer.FullName -Destination $versionOutput.FullName
    Copy-Item -LiteralPath "$($installer.FullName).sig" -Destination $versionOutput.FullName
}
Write-Host 'Two isolated test installers prepared in output/release-test; not published.'
