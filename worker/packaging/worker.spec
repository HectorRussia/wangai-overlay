# Run from the repository root. Keep console=True: stdout is the wire protocol.
from PyInstaller.utils.hooks import collect_data_files, copy_metadata
from pathlib import Path
root = Path(SPECPATH).parents[1]

datas = collect_data_files('silero_vad')
for name in ('silero-vad', 'torch', 'torchaudio', 'onnxruntime', 'numpy'):
    datas += copy_metadata(name)
a = Analysis([str(root / 'worker/main.py')], pathex=[str(root / 'worker')], datas=datas,
             hiddenimports=['silero_vad', 'onnxruntime', 'torchaudio'],
             excludes=['faster_whisper', 'ctranslate2', 'transformers', 'IPython',
                       'matplotlib', 'pytest', 'tensorboard', 'tkinter'])
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='wangai-worker',
          console=True, debug=False, strip=False, upx=False)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='wangai-worker')
