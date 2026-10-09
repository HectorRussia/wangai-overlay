"""Opt-in first-launch smoke of the exact signed release core in a fresh profile.

Uses the ordinary Portable startup acknowledgement, not production QA commands.
Never captures the user's audio. WM_QUIT ends this test process's UI event loop.
"""
import argparse
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import uuid
import zipfile


def processes():
    result = subprocess.run(['powershell', '-NoProfile', '-Command',
        '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath | ConvertTo-Json -Compress'],
        capture_output=True, text=True, encoding='utf8', check=True, timeout=15)
    rows = json.loads(result.stdout)
    return rows if isinstance(rows, list) else [rows]


parser = argparse.ArgumentParser()
parser.add_argument('artifacts', type=Path)
parser.add_argument('--verifier', type=Path, required=True)
parser.add_argument('--run-test-product', action='store_true', required=True)
args = parser.parse_args()
folder = args.artifacts.resolve()
subprocess.run([os.sys.executable, str(Path(__file__).with_name('verify-portable-artifacts.py')),
                str(folder), '--verifier', str(args.verifier.resolve()), '--production'], check=True)
existing = subprocess.run(['powershell', '-NoProfile', '-Command',
    'if (Get-Process gamelingo,WANGAI -ErrorAction SilentlyContinue) { exit 1 }'], capture_output=True)
assert existing.returncode == 0, 'Close WANGAI before isolated first-launch smoke'
manifest = json.loads((folder/'package-manifest.json').read_text())
version = manifest['version']
root = folder.parent / ('ทดสอบ release ' + str(uuid.uuid4()))
version_root = root/'App/versions'/version
version_root.mkdir(parents=True)
(root/'Data').mkdir()
with zipfile.ZipFile(folder/f'WANGAI_{version}_x64-update.zip') as archive:
    # The audited signed archive has already passed traversal/namespace checks.
    archive.extractall(version_root)
shutil.copy2(version_root/'WANGAI.exe', root/'WANGAI.exe')
(root/'App/portable.json').write_text(json.dumps({'format': 1, 'product': 'dev.gamelingo.overlay.portable'}))
(root/'App/active.json').write_text(json.dumps({'format': 1, 'current': version, 'previous': None}))
nonce = str(uuid.uuid4())
transaction = root/'App/.update'/nonce
transaction.mkdir(parents=True)
(transaction/'owner.json').write_text(json.dumps({'product': 'dev.gamelingo.overlay.portable', 'nonce': nonce}))
env = {k: v for k, v in os.environ.items() if not k.startswith(('PYTHON', 'VIRTUAL_ENV', 'GAMELINGO_', 'WANGAI_TEST_'))}
env['PATH'] = str(Path(os.environ['SystemRoot'])/'System32')
env['WEBVIEW2_BROWSER_EXECUTABLE_FOLDER'] = str(root/'missing-runtime')
env['WEBVIEW2_USER_DATA_FOLDER'] = str(root/'wrong-profile')
process = subprocess.Popen([str(version_root/'gamelingo.exe'), '--portable-startup', nonce],
    cwd=root, env=env, creationflags=subprocess.CREATE_NO_WINDOW)
report = {'version': version, 'pid': process.pid, 'root': str(root), 'cleanWindows': False}
try:
    deadline = time.monotonic() + 100
    ready = None
    while time.monotonic() < deadline:
        assert process.poll() is None, 'Production core exited before readiness'
        try:
            ready = json.loads((transaction/'ready.json').read_text())
            break
        except (OSError, ValueError):
            time.sleep(0.25)
    assert ready and ready['pid'] == process.pid and ready['workerReady'] and ready['uiReady'], 'No combined readiness acknowledgement'
    report['readiness'] = ready
    assert not (root/'wrong-profile').exists(), 'Inherited profile override was used'
    rows = processes()
    owned = {process.pid}
    while True:
        descendants = {row['ProcessId'] for row in rows if row['ParentProcessId'] in owned}
        expanded = owned | descendants
        if expanded == owned:
            break
        owned = expanded
    dependencies = [row for row in rows if row['ProcessId'] in owned and row['ProcessId'] != process.pid]
    report['dependencies'] = dependencies
    for dependency in ('worker/wangai-worker.exe', 'whisper/wangai-whisper.exe', 'webview2/msedgewebview2.exe'):
        def same_dependency(row):
            try:
                return row['ExecutablePath'] and Path(row['ExecutablePath']).samefile(version_root/dependency)
            except OSError:
                return False
        assert any(same_dependency(row) for row in dependencies), f'Bundled dependency was not observed: {dependency}'
    user = ctypes.WinDLL('user32', use_last_error=True)
    user.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    user.GetWindowThreadProcessId.restype = wintypes.DWORD
    user.PostThreadMessageW.argtypes = [wintypes.DWORD, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
    user.PostThreadMessageW.restype = wintypes.BOOL
    threads = set()
    callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    @callback_type
    def window_thread(handle, _):
        owner = wintypes.DWORD()
        thread = user.GetWindowThreadProcessId(handle, ctypes.byref(owner))
        if owner.value == process.pid:
            threads.add(thread)
        return True
    user.EnumWindows.argtypes = [callback_type, wintypes.LPARAM]
    user.EnumWindows(window_thread, 0)
    assert threads, 'No production GUI window observed'
    for thread in threads:
        assert user.PostThreadMessageW(thread, 0x0012, 0, 0), 'Could not quit test event loop'
    report['exitCode'] = process.wait(timeout=20)
    time.sleep(1)
    deadline = time.monotonic() + 10
    while owned & {row['ProcessId'] for row in processes()}:
        assert time.monotonic() < deadline, 'An observed bundled process survived shutdown'
        time.sleep(0.25)
    leftovers = subprocess.run(['powershell', '-NoProfile', '-Command',
        "$p = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith('" + str(root).replace("'", "''") + "') }); if ($p.Count) { exit 1 }"], capture_output=True)
    assert leftovers.returncode == 0, 'A bundled dependency survived shutdown'
    report['passed'] = report['exitCode'] == 0
    assert report['passed']
finally:
    if process.poll() is None:
        subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], capture_output=True)
    (root/'Data/release-smoke.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps(report, ensure_ascii=True, indent=2))
