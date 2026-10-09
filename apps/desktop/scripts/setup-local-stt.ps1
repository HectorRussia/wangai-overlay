param([ValidateSet('base')][string]$Preset = 'base')
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'bootstrap.ps1')
if ($LASTEXITCODE -ne 0) { throw 'VAD setup failed' }
& (Join-Path $PSScriptRoot 'setup-whisper.ps1') -Model $Preset
if ($LASTEXITCODE -ne 0) { throw 'Whisper setup failed' }
Write-Host 'Local STT ready. Open Start-WANGAI-Whisper.cmd in the repository root.'
