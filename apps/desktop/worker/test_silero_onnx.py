import subprocess
import sys
import unittest
from pathlib import Path


class TorchFreeVadTests(unittest.TestCase):
    def test_real_model_loads_and_processes_without_torch(self):
        script = '''
import sys
import importlib.abc
class BlockTorch(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname.split('.')[0] in ('torch', 'torchaudio'):
            raise AssertionError('VAD must not import ' + fullname)
sys.meta_path.insert(0, BlockTorch())
from worker.wangai_worker.vad import SileroVad
import numpy as np
from worker.wangai_worker.silero_onnx import SileroOnnx
model = SileroOnnx()
vad = SileroVad(model, 0.5, 500)
for _ in range(40):
    assert vad.process(np.zeros(512, dtype=np.float32)) is None
vad.reset()
a = model(np.zeros(512, dtype=np.float32), 16000)
model.reset_states()
b = model(np.zeros(512, dtype=np.float32), 16000)
assert float(a) == float(b)
for shape, rate in [((256,), 16000), ((512,), 8000), ((1, 512), 16000)]:
    try:
        model(np.zeros(shape, dtype=np.float32), rate)
    except ValueError:
        pass
    else:
        raise AssertionError('Invalid audio format accepted')
assert 'torch' not in sys.modules
'''
        result = subprocess.run([sys.executable, '-c', script], cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
