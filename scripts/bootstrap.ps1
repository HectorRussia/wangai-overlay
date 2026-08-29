$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$VirtualEnvironment = Join-Path $ProjectRoot ".venv"

$PythonExecutable = Join-Path $VirtualEnvironment "Scripts\python.exe"
if (Get-Command uv -ErrorAction SilentlyContinue) {
    if (-not (Test-Path $PythonExecutable)) {
        uv venv --python 3.12 $VirtualEnvironment
    }
    uv pip install --python $PythonExecutable -r (Join-Path $ProjectRoot "worker\requirements.txt")
} else {
    if (-not (Test-Path $PythonExecutable)) {
        py -3.12 -m venv $VirtualEnvironment
    }
    & $PythonExecutable -m pip install --upgrade pip
    & $PythonExecutable -m pip install -r (Join-Path $ProjectRoot "worker\requirements.txt")
}

Write-Host "Python Silero VAD worker is ready. Speech transcription runs through xAI."
