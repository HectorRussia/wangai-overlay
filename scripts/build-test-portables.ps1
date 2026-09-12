# Opt-in: isolated identity, disposable key, loopback updater, no real AI traffic.
param([Parameter(Mandatory=$true)][string]$OutputRoot,[string]$RuntimeCache,[ValidateSet('0.3.0','0.3.1')][string[]]$Versions=@('0.3.0','0.3.1'))
$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Join-Path $PSScriptRoot '..')
$output=[IO.Path]::GetFullPath($OutputRoot)
New-Item -ItemType Directory -Path $output -Force | Out-Null
node scripts/desktop-licenses.mjs
if ($LASTEXITCODE -ne 0) { throw 'Fixture dependency notices could not be collected' }
$testKey=Join-Path $output 'test-only.key'
if (!(Test-Path -LiteralPath $testKey)) {
    node node_modules/@tauri-apps/cli/tauri.js signer generate --ci -p 'portable-fixture-only' -w $testKey *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Could not generate isolated fixture key' }
}
$saved=@{}
$names=@('WANGAI_UPDATER_PUBLIC_KEY','TAURI_SIGNING_PRIVATE_KEY','TAURI_SIGNING_PRIVATE_KEY_PATH','TAURI_SIGNING_PRIVATE_KEY_PASSWORD','WANGAI_API_BASE_URL','WANGAI_TEST_UPDATE_ENDPOINT','WANGAI_TEST_VERSION')
foreach ($name in $names) { $saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process') }
try {
    $env:WANGAI_UPDATER_PUBLIC_KEY=(Get-Content -LiteralPath "$testKey.pub" -Raw).Trim()
    $env:TAURI_SIGNING_PRIVATE_KEY_PATH=$null
    $env:TAURI_SIGNING_PRIVATE_KEY=(Get-Content -LiteralPath $testKey -Raw).Trim()
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD='portable-fixture-only'
    $env:WANGAI_API_BASE_URL='https://127.0.0.1:19439'
    $env:WANGAI_TEST_UPDATE_ENDPOINT='http://127.0.0.1:19438/latest-portable.json'
    if (!$RuntimeCache) { $RuntimeCache=Join-Path $output 'runtime-download' }
    $runtime=& "$PSScriptRoot/fetch-fixed-webview.ps1" -CacheRoot $RuntimeCache
    foreach ($version in $Versions) {
        $env:WANGAI_TEST_VERSION=$version
        node scripts/prepare-release.mjs --test
        if ($LASTEXITCODE -ne 0) { throw 'Fixture input validation failed' }
        pnpm tauri build --ci --no-bundle --features release-test --config src-tauri/tauri.release.generated.json
        if ($LASTEXITCODE -ne 0) { throw 'Fixture core build failed' }
        cargo build --locked --release --manifest-path portable/Cargo.toml --features host,release-test,tools
        if ($LASTEXITCODE -ne 0) { throw 'Fixture host build failed' }
        $target=if ($env:CARGO_TARGET_DIR) {[IO.Path]::GetFullPath($env:CARGO_TARGET_DIR)} else {'src-tauri/target'}
        $hostTarget=if ($env:CARGO_TARGET_DIR) {$target} else {'portable/target'}
        $python=if (Test-Path -LiteralPath '.packaging-venv/Scripts/python.exe') {'.packaging-venv/Scripts/python.exe'} else {(Get-Command python.exe -ErrorAction Stop).Source}
        & $python scripts/package-portable.py --core "$target/release/gamelingo.exe" --host "$hostTarget/release/WANGAI.exe" --verifier "$hostTarget/release/portable-verify.exe" --runtime $runtime --version $version --output (Join-Path $output "v$version")
        if ($LASTEXITCODE -ne 0) { throw 'Fixture packaging failed' }
        & $python scripts/verify-portable-artifacts.py (Join-Path $output "v$version") --verifier "$hostTarget/release/portable-verify.exe"
        if ($LASTEXITCODE -ne 0) { throw 'Fixture artifact verification failed' }
    }
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name,$saved[$name],'Process') }
}
Write-Host 'Requested Portable test builds prepared; never publish these artifacts or the fixture key.'
