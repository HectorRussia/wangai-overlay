param([string]$OutputRoot='output/portable-build',[string]$RuntimeCache,[switch]$TestBuild,[switch]$LocalStt)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $root
$output=[IO.Path]::GetFullPath($OutputRoot)
New-Item -ItemType Directory -Path $output -Force | Out-Null
node scripts/desktop-licenses.mjs
if ($LASTEXITCODE -ne 0) { throw 'Dependency notices could not be collected' }
if (!$RuntimeCache) { $RuntimeCache=Join-Path $output 'runtime-download' }
$runtime=& "$PSScriptRoot/fetch-fixed-webview.ps1" -CacheRoot $RuntimeCache
$prepareArgs=@('scripts/prepare-release.mjs')
if ($TestBuild) { $prepareArgs+='--test' }
if ($LocalStt) { $prepareArgs+='--local-stt' }
node @prepareArgs
if ($LASTEXITCODE -ne 0) { throw 'Release input validation failed' }
$coreTarget=if ($env:CARGO_TARGET_DIR) { [IO.Path]::GetFullPath($env:CARGO_TARGET_DIR) } else { Join-Path $root 'src-tauri/target' }
$buildArgs=@('tauri','build','--ci','--no-bundle','--config','src-tauri/tauri.release.generated.json')
$coreFeatures=@()
if ($TestBuild) { $coreFeatures+='release-test' }
if ($LocalStt) { $coreFeatures+='local-stt' }
if ($coreFeatures.Count) { $buildArgs+=@('--features',($coreFeatures -join ',')) }
pnpm @buildArgs
if ($LASTEXITCODE -ne 0) { throw 'Portable core build failed' }
$hostTarget=if ($env:CARGO_TARGET_DIR) { $coreTarget } else { Join-Path $root 'portable/target' }
$features=if ($TestBuild) {'host,release-test,tools'} else {'host,tools'}
cargo build --locked --release --manifest-path portable/Cargo.toml --features $features
if ($LASTEXITCODE -ne 0) { throw 'Portable host build failed' }
$python=Join-Path $root '.packaging-venv/Scripts/python.exe'
if (!(Test-Path -LiteralPath $python)) { $python=(Get-Command python.exe -ErrorAction Stop).Source }
$packArgs=@('scripts/package-portable.py','--core',(Join-Path $coreTarget 'release/gamelingo.exe'),'--host',(Join-Path $hostTarget 'release/WANGAI.exe'),'--verifier',(Join-Path $hostTarget 'release/portable-verify.exe'),'--runtime',$runtime,'--output',(Join-Path $output 'release'))
if ($TestBuild -and $env:WANGAI_TEST_VERSION) { $packArgs+=@('--version',$env:WANGAI_TEST_VERSION) }
if ($LocalStt) { $packArgs+='--local-stt' }
& $python @packArgs
if ($LASTEXITCODE -ne 0) { throw 'Portable packaging failed' }
& $python scripts/verify-portable-artifacts.py (Join-Path $output 'release') --verifier (Join-Path $hostTarget 'release/portable-verify.exe')
if ($LASTEXITCODE -ne 0) { throw 'Portable artifact verification failed' }
