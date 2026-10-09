$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$VirtualEnvironment = Join-Path $ProjectRoot ".venv"

$PythonExecutable = Join-Path $VirtualEnvironment "Scripts\python.exe"
if (Get-Command uv -ErrorAction SilentlyContinue) {
    if (-not (Test-Path $PythonExecutable)) {
        uv venv --python 3.12 $VirtualEnvironment
    }
    uv pip install --python $PythonExecutable -r (Join-Path $ProjectRoot "worker\requirements.txt")
    if ($LASTEXITCODE -ne 0) { throw 'Worker dependency setup failed' }
    uv pip install --python $PythonExecutable --no-deps -r (Join-Path $ProjectRoot "worker\requirements-model.txt")
} else {
    if (-not (Test-Path $PythonExecutable)) {
        py -3.12 -m venv $VirtualEnvironment
    }
    & $PythonExecutable -m pip install --upgrade pip
    & $PythonExecutable -m pip install -r (Join-Path $ProjectRoot "worker\requirements.txt")
    if ($LASTEXITCODE -ne 0) { throw 'Worker dependency setup failed' }
    & $PythonExecutable -m pip install --no-deps -r (Join-Path $ProjectRoot "worker\requirements-model.txt")
}
if ($LASTEXITCODE -ne 0) { throw 'Silero model asset setup failed' }

Write-Host "Python ONNX VAD worker is ready (no PyTorch required)."
