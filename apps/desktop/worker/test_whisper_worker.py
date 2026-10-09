"""Contract tests against the real native process; no network or speech needed."""
import json
from pathlib import Path
import struct
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT / "output/whisper-build/Release/wangai-whisper.exe"
MODEL = ROOT / "output/models/ggml-base-q5_1.bin"


@unittest.skipUnless(
    WORKER.is_file() and MODEL.is_file(),
    "Native Whisper integration tests require scripts/setup-whisper.ps1 -Model base",
)
class WhisperWorkerTests(unittest.TestCase):
    def run_frames(self, data):
        result = subprocess.run(
            [str(WORKER), "--model-dir", str(MODEL)], input=data,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20,
        )
        events = [json.loads(line) for line in result.stdout.splitlines()]
        self.assertTrue(events[0]["ready"])
        return result.returncode, events[1:]

    def test_both_languages_share_process_and_silence_is_empty(self):
        frames = b"".join(struct.pack("<I", 6401) + bytes([language]) + bytes(6400) for language in [0, 1, 0])
        code, events = self.run_frames(frames)
        self.assertEqual(code, 0)
        self.assertEqual(events, [{"text": ""}] * 3)

    def test_invalid_and_truncated_frames_fail_without_hanging(self):
        for frame in [struct.pack("<I", 960003), struct.pack("<I", 4), b"\x03", struct.pack("<I", 3) + b"\x02\x00\x00"]:
            with self.subTest(frame=frame):
                code, events = self.run_frames(frame)
                self.assertNotEqual(code, 0)
                self.assertIn("error", events[0])


if __name__ == "__main__":
    unittest.main()
