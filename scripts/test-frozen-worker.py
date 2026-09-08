"""Offline smoke test: frozen executable, Unicode/spaced path, no Python PATH/venv.

Only the test harness uses Python. The child has no dev overrides or user site.
"""
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile

def frame(kind, stream=1, cursor=0, samples=()):
    payload = struct.pack('<BBHQ', kind, stream, 0, cursor)
    payload += struct.pack(f'<{len(samples)}f', *samples)
    return struct.pack('<I', len(payload)) + payload

bundle = Path(sys.argv[1]).resolve()
with tempfile.TemporaryDirectory(prefix='WANGAI ทดสอบ worker ') as directory:
    copied = Path(directory) / 'แอป เสียง'
    shutil.copytree(bundle, copied)
    env = {k: v for k, v in os.environ.items() if not k.startswith(('PYTHON', 'VIRTUAL_ENV', 'GAMELINGO_', 'WANGAI_'))}
    env.update(PATH=os.path.join(os.environ['SystemRoot'], 'System32'),
               PYTHONNOUSERSITE='1', HF_HUB_OFFLINE='1')
    exe = str(copied / 'wangai-worker.exe')
    options = dict(cwd=directory, env=env, capture_output=True, timeout=90,
                   creationflags=subprocess.CREATE_NO_WINDOW)
    check = subprocess.run([exe, '--model-self-check'], **options)
    assert check.returncode == 0, check.stderr.decode(errors='replace') + check.stdout.decode(errors='replace')
    assert json.loads(check.stdout)['type'] == 'ready'
    # Real model, both wire IDs, cursor gap, reset/finalize and clean shutdown.
    payload = frame(1, cursor=512, samples=[0.0] * 512)
    payload += frame(1, stream=2, samples=[0.0] * 512)
    payload += frame(1, cursor=4096, samples=[0.0] * 512)
    payload += frame(2) + frame(3) + frame(4, stream=0)
    result = subprocess.run([exe], input=payload, **options)
    assert result.returncode == 0, result.stderr.decode(errors='replace')
    events = [json.loads(line) for line in result.stdout.splitlines()]
    assert events[0]['type'] == 'ready' and not any(e['type'] == 'error' for e in events)
print('Frozen worker: real ONNX, offline startup, Unicode path and frame/reset smoke passed')
