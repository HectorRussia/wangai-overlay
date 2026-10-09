param([ValidateSet('base')][string]$Model = 'base', [string]$Python)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Source = Join-Path $Root 'output\whisper-src'
$Build = Join-Path $Root 'output\whisper-build'
$Revision = '927cfce34f31707e17f2bff35c349632fb9e2c3a'
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw 'Whisper setup failed' } }
$CMakeCommand = Get-Command cmake -ErrorAction SilentlyContinue
if ($CMakeCommand) { $CMake = $CMakeCommand.Source } else {
    $VsWhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    $VsRoot = & $VsWhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    $CMake = Join-Path $VsRoot 'Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe'
}
if (-not (Test-Path -LiteralPath $CMake)) { throw 'Install C++ Build Tools with CMake support first.' }
if (-not (Test-Path -LiteralPath $Source)) {
    git clone --depth 1 --branch v1.9.4 https://github.com/ggml-org/whisper.cpp.git $Source
    Check-Exit
}
if ((git -C $Source rev-parse HEAD) -ne $Revision) { throw 'Unexpected whisper.cpp revision; expected pinned v1.9.4.' }
git -C $Source diff --quiet HEAD
Check-Exit
& $CMake -S (Join-Path $Root 'worker\whisper') -B $Build -G 'Visual Studio 17 2022' -A x64 "-DWHISPER_SOURCE=$Source"
Check-Exit
& $CMake --build $Build --config Release --target wangai-whisper --parallel 2
Check-Exit
if (-not $Python) { $Python = Join-Path $Root '.venv\Scripts\python.exe' }
& $Python (Join-Path $PSScriptRoot 'download-whisper.py') --model $Model
Check-Exit
Copy-Item -LiteralPath (Join-Path $Source 'LICENSE') -Destination (Join-Path $Build 'Release\LICENSE-whisper.cpp.txt')
Write-Host "Whisper $Model ready (CPU AVX2)."
