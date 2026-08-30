import json
import os
import queue
import struct
import subprocess
import sys
import threading
import time
import unittest

import numpy as np

WORKER = os.path.join(os.path.dirname(__file__), "main.py")


def frame(kind: int, stream: int, samples=None, start_sample_cursor: int = 0) -> bytes:
    payload = b"" if samples is None else np.asarray(samples, dtype="<f4").tobytes()
    body = struct.pack("<BBHQ", kind, stream, 0, start_sample_cursor) + payload
    return struct.pack("<I", len(body)) + body


class WorkerIntegrationTests(unittest.TestCase):
    def test_mock_game_speech_boundaries(self):
        process = subprocess.Popen(
            [sys.executable, "-u", WORKER, "--mock"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=False,
        )
        events = queue.Queue()
        errors = queue.Queue()

        def read_events():
            assert process.stdout is not None
            for raw in process.stdout:
                events.put(json.loads(raw.decode("utf-8")))

        threading.Thread(target=read_events, daemon=True).start()

        def read_errors():
            assert process.stderr is not None
            for raw in process.stderr:
                errors.put(raw.decode("utf-8", errors="replace").strip())

        threading.Thread(target=read_errors, daemon=True).start()
        try:
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline:
                try:
                    event = events.get(timeout=max(0.1, deadline - time.monotonic()))
                except queue.Empty:
                    self.fail(
                        f"worker produced no final event (exit={process.poll()}, "
                        f"stderr={list(errors.queue)})"
                    )
                if event["type"] == "ready":
                    break
            else:
                self.fail("worker did not become ready")

            assert process.stdin is not None
            process.stdin.write(frame(1, 1, np.ones(8_000, dtype=np.float32) * 0.05))
            process.stdin.write(frame(3, 1))
            process.stdin.flush()

            deadline = time.monotonic() + 10
            boundaries = []
            while time.monotonic() < deadline:
                try:
                    event = events.get(timeout=max(0.1, deadline - time.monotonic()))
                except queue.Empty:
                    self.fail(
                        f"worker produced no final event (exit={process.poll()}, "
                        f"stderr={list(errors.queue)})"
                    )
                if event["type"] == "speech_state":
                    boundaries.append(event)
                    if len(boundaries) == 2:
                        break
            self.assertEqual([event["active"] for event in boundaries], [True, False])
            self.assertTrue(all(event["stream"] == "game" for event in boundaries))
        finally:
            if process.stdin and process.poll() is None:
                process.stdin.write(frame(4, 0))
                process.stdin.flush()
                process.stdin.close()
            process.wait(timeout=10)
            if process.stdout:
                process.stdout.close()
            if process.stderr:
                process.stderr.close()


if __name__ == "__main__":
    unittest.main()
