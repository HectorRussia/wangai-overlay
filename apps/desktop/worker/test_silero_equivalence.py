"""Optional comparison with the original wrapper; torch is never a runtime dependency."""
import importlib.util
import unittest

import numpy as np

from worker.wangai_worker.silero_onnx import SileroOnnx
from worker.wangai_worker.vad import SileroVad


@unittest.skipUnless(importlib.util.find_spec('torch'), 'Legacy equivalence needs an existing torch environment; fresh VAD environments do not install it')
class LegacyEquivalenceTests(unittest.TestCase):
    def test_probabilities_and_boundaries_match_original_wrapper(self):
        import torch
        from silero_vad import load_silero_vad

        original = load_silero_vad(onnx=True)
        direct = SileroOnnx()

        class LegacyModel:
            def reset_states(self):
                original.reset_states()

            def __call__(self, samples, rate):
                return float(original(torch.from_numpy(samples), rate).item())

        old_vad = SileroVad(LegacyModel(), 0.2, 100, 0.05)
        new_vad = SileroVad(direct, 0.2, 100, 0.05)
        random = np.random.default_rng(42)
        for volume in (1.0, 0.1):
            original.reset_states()
            direct.reset_states()
            for _ in range(100):
                samples = (random.normal(0, 0.03, 512) * volume).astype(np.float32)
                self.assertAlmostEqual(float(original(torch.from_numpy(samples), 16000).item()), float(direct(samples, 16000)), places=6)
            old_vad.reset()
            new_vad.reset()
            for _ in range(100):
                samples = (random.normal(0, 0.03, 512) * volume).astype(np.float32)
                self.assertEqual(old_vad.process(samples), new_vad.process(samples))
