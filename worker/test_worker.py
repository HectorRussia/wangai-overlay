import io
import struct
import unittest

import numpy as np

from worker import main


class ProtocolTests(unittest.TestCase):
    def test_audio_frame(self):
        samples = np.array([0.0, 0.5, -0.5], dtype="<f4")
        body = struct.pack("<BBH", main.KIND_AUDIO, main.STREAM_GAME, 0) + samples.tobytes()
        frame = main.read_frame(io.BytesIO(struct.pack("<I", len(body)) + body))
        self.assertEqual(frame.kind, main.KIND_AUDIO)
        self.assertEqual(frame.stream, main.STREAM_GAME)
        np.testing.assert_allclose(frame.samples, samples)

    def test_rejects_large_frame(self):
        with self.assertRaises(ValueError):
            main.read_frame(io.BytesIO(struct.pack("<I", 999_999_999)))

    def test_vad_boundaries_emit_start_and_end(self):
        class FakeVad:
            def __init__(self):
                self.calls = 0

            def process(self, _samples):
                self.calls += 1
                if self.calls == 1:
                    return {"start": 0}
                if self.calls == 8:
                    return {"end": 0}
                return None

            def reset(self):
                pass

        events = []
        session = main.StreamSession(
            "game", 12_000, FakeVad(), events.append
        )
        session.ingest(np.ones(main.VAD_FRAME_SAMPLES * 8, dtype=np.float32) * 0.05)
        self.assertEqual(
            events,
            [
                {"type": "speech_state", "stream": "game", "active": True},
                {"type": "speech_state", "stream": "game", "active": False},
            ],
        )

    def test_finalize_ends_active_push_to_talk(self):
        events = []
        vad = main.EnergyVad(500)
        session = main.StreamSession("microphone", 12_000, vad, events.append)
        session.ingest(np.ones(main.VAD_FRAME_SAMPLES, dtype=np.float32) * 0.05)
        session.finalize()
        self.assertEqual([event["active"] for event in events], [True, False])

    def test_worker_source_has_no_local_stt_or_cuda(self):
        with open(main.__file__, encoding="utf-8") as source:
            code = source.read().lower()
        self.assertNotIn("faster" + "_whisper", code)
        self.assertNotIn("cuda", code)


if __name__ == "__main__":
    unittest.main()
