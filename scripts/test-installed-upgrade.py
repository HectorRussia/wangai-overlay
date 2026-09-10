"""OPT-IN: installs the isolated WANGAI Release Test product (never production).

Requires both test installers from build-test-installers.ps1. No real AI.
Leaves installers/reports for inspection, uninstalls ONLY its own test product.
Run on a disposable Windows VM for the clean-machine acceptance test.
"""
import argparse
import ctypes
import functools
import http.server
import json
import os
from pathlib import Path
import subprocess
import threading
import time

parser = argparse.ArgumentParser()
parser.add_argument('--install-test-product', action='store_true', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
output = root / 'output/release-test'
installed = output / 'installed'
reports = Path(os.environ['APPDATA']) / 'dev.gamelingo.overlay.release-test'
if installed.exists():
    raise SystemExit('Test install directory already exists: inspect/uninstall the isolated test product before rerunning')
# NSIS process checks can match the executable name across installation paths.
# Never let an isolated QA run stop a production app that the owner is using.
running_app = subprocess.run([
    'powershell.exe', '-NoProfile', '-NonInteractive', '-Command',
    'if (Get-Process -Name gamelingo -ErrorAction SilentlyContinue) { exit 1 }; exit 0',
], timeout=15)
if running_app.returncode != 0:
    raise SystemExit('Close running WANGAI before installer QA; no app was stopped or installer launched')
for version in ('0.2.0', '0.2.1'):
    if not (output / f'v{version}/WANGAI Release Test_{version}_x64-setup.exe').is_file():
        raise SystemExit('Build both isolated installers first')
new_version = '0.2.1'
new_name = f'WANGAI Release Test_{new_version}_x64-setup.exe'
signature = (output / f'v{new_version}' / f'{new_name}.sig').read_text().strip()
manifest = {'version': new_version, 'notes': 'Isolated upgrade smoke', 'platforms': {'windows-x86_64': {
    'url': f'http://127.0.0.1:19438/v{new_version}/{new_name.replace(" ", "%20")}', 'signature': signature}}}
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass
    def do_GET(self):
        if self.path == '/latest.json':
            data = json.dumps(manifest).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            super().do_GET()
def alive(pid):
    handle = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)
    if not handle:
        return False
    ctypes.windll.kernel32.CloseHandle(handle)
    return True
def wait_for(predicate, seconds=180):
    until = time.monotonic() + seconds
    while time.monotonic() < until:
        if predicate(): return
        time.sleep(1)
    raise AssertionError('Timed out waiting for installed app/upgrade')

server = http.server.ThreadingHTTPServer(('127.0.0.1', 19438), functools.partial(Handler, directory=output))
threading.Thread(target=server.serve_forever, daemon=True).start()
started_at = time.time()
try:
    subprocess.run([str(output / 'v0.2.0/WANGAI Release Test_0.2.0_x64-setup.exe'), '/S', f'/D={installed}'], check=True, timeout=240)
    exe = installed / 'gamelingo.exe'
    assert exe.is_file(), f'Installed binary missing: {exe}'
    subprocess.run(['node', str(root / 'scripts/check-windows-gui.mjs'), str(exe)], check=True)
    # Do not hide a Console window in the harness: the shipped app itself must be GUI.
    subprocess.Popen([str(exe), '--release-test-upgrade'])
    newer = reports / 'test-report-0.2.1.json'
    wait_for(lambda: newer.is_file() and newer.stat().st_mtime >= started_at, 300)
    before = json.loads((reports / 'test-report-0.2.0.json').read_text(encoding='utf-8'))
    after = json.loads(newer.read_text(encoding='utf-8'))
    subprocess.run(['node', str(root / 'scripts/check-windows-gui.mjs'), str(exe)], check=True)
    assert before['workerReady'] and after['workerReady']
    assert before['uiReady'] and after['uiReady'], 'Ready Room did not render in the installed WebView'
    assert before['workerPid'] != after['workerPid']
    wait_for(lambda: not alive(before['workerPid']) and not alive(before['pid']))
    wait_for(lambda: not alive(after['workerPid']) and not alive(after['pid']))
    assert before['settings'] == after['settings'], 'Settings/installation ID changed across update'
    assert after['update']['phase'] == 'up_to_date'
    (output / 'upgrade-result.json').write_text(json.dumps({'passed': True, 'before': before, 'after': after}, indent=2), encoding='utf-8')
    print('Real NSIS 0.2.0 -> signed updater -> NSIS 0.2.1 passed; Ready Room rendered; old worker exited; settings preserved')
finally:
    server.shutdown()
    server.server_close()
    # Only the uniquely named product installed by this script, never WANGAI proper.
    uninstaller = installed / 'uninstall.exe'
    if uninstaller.is_file():
        subprocess.run([str(uninstaller), '/S'], check=True, timeout=180)
