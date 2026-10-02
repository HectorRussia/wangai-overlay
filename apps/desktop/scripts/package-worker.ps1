param([switch]$SkipSync)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw 'Worker packaging command failed' } }
if (-not $SkipSync) {
    uv venv --python 3.12 --managed-python .packaging-venv
    Check-Exit
    uv pip sync --python .packaging-venv/Scripts/python.exe --extra-index-url https://download.pytorch.org/whl/cpu --require-hashes worker/packaging/requirements.lock
    Check-Exit
}
& .packaging-venv/Scripts/python.exe -c "import struct,sys; assert sys.version_info[:2] == (3,12) and struct.calcsize('P') == 8"
Check-Exit
& .packaging-venv/Scripts/python.exe -m PyInstaller --noconfirm --clean --distpath output/worker --workpath output/pyinstaller worker/packaging/worker.spec
Check-Exit
& .packaging-venv/Scripts/python.exe scripts/worker-licenses.py output/worker/wangai-worker/licenses
Check-Exit
& .packaging-venv/Scripts/python.exe scripts/test-frozen-worker.py output/worker/wangai-worker
Check-Exit
