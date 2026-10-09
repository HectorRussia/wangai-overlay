param([switch]$Build)
$ErrorActionPreference = 'Stop'
$DesktopRoot = Split-Path -Parent $PSScriptRoot
$RepositoryRoot = (Resolve-Path (Join-Path $DesktopRoot '..\..')).Path
$ServerRoot = Join-Path $RepositoryRoot 'server'
$EnvFile = if ($env:WANGAI_SERVER_ENV_FILE) {
    (Resolve-Path -LiteralPath $env:WANGAI_SERVER_ENV_FILE).Path
} else { Join-Path $ServerRoot '.env.local-stt' }
$PreviewRoot = Join-Path $DesktopRoot 'output\local-stt-preview'
$DesktopExe = Join-Path $PreviewRoot 'WANGAI-Whisper.exe'
$GatewayExe = Join-Path $ServerRoot 'target\debug\wangai-server.exe'
$WorkerPython = Join-Path $DesktopRoot '.venv\Scripts\python.exe'
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw 'Local preview build failed' } }

if (-not (Test-Path -LiteralPath $EnvFile)) {
    Copy-Item -LiteralPath (Join-Path $ServerRoot 'local-stt.env.example') -Destination $EnvFile
    throw "Add your xAI key to TRANSLATION_API_KEY in $EnvFile, then run again."
}
foreach ($Asset in @($WorkerPython, (Join-Path $DesktopRoot 'output\whisper-build\Release\wangai-whisper.exe'), (Join-Path $DesktopRoot 'output\models\ggml-base-q5_1.bin'))) {
    if (-not (Test-Path -LiteralPath $Asset)) { throw 'Run apps/desktop/scripts/setup-local-stt.ps1 first.' }
}
if (Get-NetTCPConnection -LocalPort 18080 -State Listen -ErrorAction SilentlyContinue) {
    throw 'Port 18080 is already in use. Close the previous local preview first.'
}
$Names = @('GAMELINGO_PYTHON', 'WANGAI_API_BASE_URL', 'WANGAI_SERVER_ENV_FILE')
$SavedEnvironment = @{}
foreach ($Name in $Names) { $SavedEnvironment[$Name] = [Environment]::GetEnvironmentVariable($Name, 'Process') }
Push-Location $DesktopRoot
try {
    $env:GAMELINGO_PYTHON = $WorkerPython
    $env:WANGAI_API_BASE_URL = 'http://127.0.0.1:18080'
    $env:WANGAI_SERVER_ENV_FILE = $EnvFile
    if ($Build -or -not (Test-Path -LiteralPath $DesktopExe) -or -not (Test-Path -LiteralPath $GatewayExe)) {
        cargo build --manifest-path (Join-Path $ServerRoot 'Cargo.toml') --locked
        Check-Exit
        & (Join-Path $DesktopRoot 'node_modules\.bin\tauri.cmd') build --debug --no-bundle --features local-stt --config src-tauri/tauri.local-stt.json
        Check-Exit
        New-Item -ItemType Directory -Path $PreviewRoot -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $DesktopRoot 'src-tauri\target\debug\gamelingo.exe') -Destination $DesktopExe
    }
    New-Item -ItemType Directory -Path $PreviewRoot -Force | Out-Null
    $GatewayErrorLog = Join-Path $PreviewRoot 'gateway-error.log'
    $GatewayProcess = Start-Process -FilePath $GatewayExe -WorkingDirectory $ServerRoot -WindowStyle Hidden -RedirectStandardError $GatewayErrorLog -PassThru
    try {
        $Ready = $false
        for ($Attempt = 0; $Attempt -lt 40; $Attempt++) {
            if ($GatewayProcess.HasExited) { throw "Local gateway stopped. Check configuration in $EnvFile. Log: $GatewayErrorLog" }
            try {
                $Status = Invoke-RestMethod 'http://127.0.0.1:18080/v1/status' -TimeoutSec 1
                if ($Status.incomingModel -eq 'local-on-device' -and $Status.translationModel) { $Ready = $true; break }
            } catch { Start-Sleep -Milliseconds 250 }
        }
        if (-not $Ready) { throw 'Local gateway did not start in time. Set STT_MODE=local and BIND_ADDRESS=127.0.0.1:18080 in the preview env file.' }
        $DesktopProcess = Start-Process -FilePath $DesktopExe -WorkingDirectory $DesktopRoot -WindowStyle Hidden -PassThru
        $DesktopProcess.WaitForExit()
        if ($DesktopProcess.ExitCode -ne 0) { throw "Desktop preview stopped with exit code $($DesktopProcess.ExitCode)." }
    } finally {
        if (-not $GatewayProcess.HasExited) { Stop-Process -Id $GatewayProcess.Id }
    }
} finally {
    Pop-Location
    foreach ($Name in $Names) { [Environment]::SetEnvironmentVariable($Name, $SavedEnvironment[$Name], 'Process') }
}
