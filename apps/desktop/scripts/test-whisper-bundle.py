"""Offline native/model smoke from an independent Unicode/spaced directory."""
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile

bundle = Path(sys.argv[1]).resolve()
with tempfile.TemporaryDirectory(prefix='WANGAI ทดสอบ Whisper ') as temporary:
    copied = Path(temporary) / 'แอป เสียง'
    shutil.copytree(bundle, copied)
    if len(sys.argv) > 2:
        shutil.copyfile(sys.argv[2], copied/'ggml-base-q5_1.bin')
    env = {k: v for k, v in os.environ.items() if not k.startswith(('PYTHON', 'VIRTUAL_ENV', 'GAMELINGO_', 'WANGAI_'))}
    env['PATH'] = os.path.join(os.environ['SystemRoot'], 'System32')
    data = b''.join(struct.pack('<I', 6401) + bytes([lang]) + bytes(6400) for lang in (0, 1))
    result = subprocess.run([str(copied/'wangai-whisper.exe'), '--model-dir',
                             str(copied/'ggml-base-q5_1.bin')], input=data, env=env,
                            cwd=temporary, capture_output=True, timeout=60,
                            creationflags=subprocess.CREATE_NO_WINDOW)
    assert result.returncode == 0, result.stdout.decode(errors='replace')
    events = [json.loads(line) for line in result.stdout.splitlines()]
    assert events[0]['ready'] is True and events[1:] == [{'text': ''}, {'text': ''}]
print('Whisper: offline real model, both languages, Unicode/spaced path and clean shutdown passed')
