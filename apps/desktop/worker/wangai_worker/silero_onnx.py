"""Silero's 16 kHz ONNX inference contract, without the PyTorch wrapper.

State/context layout follows silero-vad utils_vad.OnnxWrapper (MIT).
Only the application's mono, 512-sample frame format is supported.
"""
from importlib.metadata import distribution
from pathlib import Path
import sys

import numpy as np
import onnxruntime as ort


def model_path():
    if getattr(sys, 'frozen', False):
        return Path(sys._MEIPASS) / 'silero_vad/data/silero_vad.onnx'
    # Metadata lookup does not import silero_vad (which imports torch).
    return Path(distribution('silero-vad').locate_file('silero_vad/data/silero_vad.onnx'))


class SileroOnnx:
    def __init__(self, path=None):
        options = ort.SessionOptions()
        options.inter_op_num_threads = 1
        options.intra_op_num_threads = 1
        self.session = ort.InferenceSession(str(path or model_path()), sess_options=options,
                                            providers=['CPUExecutionProvider'])
        self.reset_states()

    def reset_states(self):
        self.state = np.zeros((2, 1, 128), dtype=np.float32)
        self.context = np.zeros((1, 64), dtype=np.float32)

    def __call__(self, samples, sample_rate):
        samples = np.asarray(samples, dtype=np.float32)
        if sample_rate != 16000 or samples.shape != (512,):
            raise ValueError('Silero expects 512 mono samples at 16000 Hz')
        audio = np.concatenate((self.context, samples[None, :]), axis=1)
        probability, self.state = self.session.run(None, {
            'input': audio, 'state': self.state, 'sr': np.array(sample_rate, dtype=np.int64),
        })
        self.context = audio[:, -64:].copy()
        return probability[0, 0]
