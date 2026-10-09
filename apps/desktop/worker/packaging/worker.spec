# Run from apps/desktop. Keep console=True: stdout is the wire protocol.
from PyInstaller.utils.hooks import copy_metadata
from pathlib import Path
from importlib.metadata import distribution
root = Path(SPECPATH).parents[1]

model = distribution('silero-vad').locate_file('silero_vad/data/silero_vad.onnx')
datas = [(str(model), 'silero_vad/data')]
for name in ('silero-vad', 'onnxruntime', 'numpy'):
    datas += copy_metadata(name)
a = Analysis([str(root / 'worker/main.py')], pathex=[str(root / 'worker')], datas=datas,
             hiddenimports=['wangai_worker.runtime', 'onnxruntime'],
             excludes=['torch', 'torchaudio', 'silero_vad', 'faster_whisper', 'ctranslate2', 'transformers', 'IPython',
                       'matplotlib', 'pytest', 'tensorboard', 'tkinter'])
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='wangai-worker',
          console=True, debug=False, strip=False, upx=False)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='wangai-worker')
