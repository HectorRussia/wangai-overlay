import io
import struct
import unittest

import numpy as np

from worker import main


class ProtocolTests(unittest.TestCase):
    def test_adaptive_silero_starts_after_three_weak_speech_frames(self):
        class FakeModel:
            def __init__(self):
                self.values = iter([0.08, 0.09, 0.07])

            def __call__(self, _samples, _sample_rate):
                class Result:
                    def __init__(self, value):
                        self.value = value

                    def item(self):
                        return self.value

                return Result(next(self.values))

            def reset_states(self):
                pass

        vad = main.SileroVad(
            FakeModel(), threshold=0.2, silence_ms=500, adaptive_floor=0.05
        )
        frame = np.zeros(main.VAD_FRAME_SAMPLES, dtype=np.float32)

        self.assertIsNone(vad.process(frame))
        self.assertIsNone(vad.process(frame))
        self.assertEqual(vad.process(frame), {"start": 0})

    def test_audio_frame(self):
        samples = np.array([0.0, 0.5, -0.5], dtype="<f4")
        body = struct.pack("<BBHQ", main.KIND_AUDIO, main.STREAM_GAME, 0, 640) + samples.tobytes()
        frame = main.read_frame(io.BytesIO(struct.pack("<I", len(body)) + body))
        self.assertEqual(frame.kind, main.KIND_AUDIO)
        self.assertEqual(frame.stream, main.STREAM_GAME)
        self.assertEqual(frame.start_sample_cursor, 640)
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
        session.ingest(
            np.ones(main.VAD_FRAME_SAMPLES * 8, dtype=np.float32) * 0.05,
            0,
        )
        self.assertEqual(
            events,
            [
                {
                    "type": "speech_state",
                    "stream": "game",
                    "active": True,
                    "utteranceId": 1,
                    "sampleCursor": main.VAD_FRAME_SAMPLES,
                },
                {
                    "type": "speech_state",
                    "stream": "game",
                    "active": False,
                    "utteranceId": 1,
                    "sampleCursor": main.VAD_FRAME_SAMPLES * 8,
                },
            ],
        )

    def test_finalize_ends_active_push_to_talk(self):
        events = []
        vad = main.EnergyVad(500)
        session = main.StreamSession("microphone", 12_000, vad, events.append)
        session.ingest(np.ones(main.VAD_FRAME_SAMPLES, dtype=np.float32) * 0.05, 0)
        session.finalize()
        self.assertEqual([event["active"] for event in events], [True, False])

    def test_audio_gap_cancels_current_utterance(self):
        events = []
        session = main.StreamSession("game", 12_000, main.EnergyVad(500), events.append)
        speech = np.ones(main.VAD_FRAME_SAMPLES, dtype=np.float32) * 0.05
        session.ingest(speech, 0)
        session.ingest(speech, main.VAD_FRAME_SAMPLES * 2)

        self.assertEqual(events[0]["type"], "speech_state")
        self.assertTrue(events[0]["active"])
        self.assertEqual(events[1]["type"], "audio_gap")
        self.assertEqual(events[1]["expectedSampleCursor"], main.VAD_FRAME_SAMPLES)
        self.assertEqual(events[1]["actualSampleCursor"], main.VAD_FRAME_SAMPLES * 2)
        self.assertEqual(events[2]["type"], "speech_state")
        self.assertTrue(events[2]["active"])

    def test_max_phrase_splits_without_losing_pending_audio(self):
        class AlwaysSpeechVad:
            def __init__(self):
                self.started = False

            def process(self, _samples):
                if not self.started:
                    self.started = True
                    return {"start": 0}
                return None

            def reset(self):
                self.started = False

        events = []
        session = main.StreamSession(
            "game",
            int(main.VAD_FRAME_SAMPLES * 2 * 1_000 / main.SAMPLE_RATE),
            AlwaysSpeechVad(),
            events.append,
        )
        session.ingest(np.ones(main.VAD_FRAME_SAMPLES * 4, dtype=np.float32), 0)

        states = [(event["active"], event["sampleCursor"]) for event in events]
        self.assertEqual(
            states,
            [
                (True, main.VAD_FRAME_SAMPLES),
                (False, main.VAD_FRAME_SAMPLES * 2),
                (True, main.VAD_FRAME_SAMPLES * 2),
                (False, main.VAD_FRAME_SAMPLES * 4),
                (True, main.VAD_FRAME_SAMPLES * 4),
            ],
        )

    def test_game_and_voice_chat_sessions_keep_independent_cursors_and_ids(self):
        game_events = []
        voice_events = []
        game = main.StreamSession(
            "game", 12_000, main.EnergyVad(500), game_events.append
        )
        voice = main.StreamSession(
            "voice_chat", 12_000, main.EnergyVad(500), voice_events.append
        )
        speech = np.ones(main.VAD_FRAME_SAMPLES, dtype=np.float32) * 0.05

        game.ingest(speech, 0)
        voice.ingest(speech, 8_000)

        self.assertEqual(game_events[0]["stream"], "game")
        self.assertEqual(game_events[0]["utteranceId"], 1)
        self.assertEqual(game_events[0]["sampleCursor"], main.VAD_FRAME_SAMPLES)
        self.assertEqual(voice_events[0]["stream"], "voice_chat")
        self.assertEqual(voice_events[0]["utteranceId"], 1)
        self.assertEqual(
            voice_events[0]["sampleCursor"], 8_000 + main.VAD_FRAME_SAMPLES
        )

    def test_worker_source_has_no_local_stt_or_cuda(self):
        with open(main.__file__, encoding="utf-8") as source:
            code = source.read().lower()
        self.assertNotIn("faster" + "_whisper", code)
        self.assertNotIn("cuda", code)
        self.assertNotIn("langchain", code)
        self.assertNotIn("import groq", code)


if __name__ == "__main__":
    unittest.main()
