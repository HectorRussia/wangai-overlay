"""GameLingo local Silero VAD worker.

stdin uses compact binary frames so raw PCM never touches a socket or disk:
  u32-le payload length, u8 kind, u8 stream, u16 reserved, f32-le samples
stdout is UTF-8 JSON Lines containing VAD status and speech boundary events only.
"""

from __future__ import annotations

import argparse
import io
import json
import math
import queue
import struct
import sys
import threading
from dataclasses import dataclass
from typing import Callable

import numpy as np

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

KIND_AUDIO = 1
KIND_RESET = 2
KIND_FINALIZE = 3
KIND_SHUTDOWN = 4
STREAM_GAME = 1
STREAM_MICROPHONE = 2
SAMPLE_RATE = 16_000
VAD_FRAME_SAMPLES = 512


def emit(event: dict) -> None:
    sys.stdout.write(json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def read_exact(stream, length: int) -> bytes | None:
    chunks: list[bytes] = []
    remaining = length
    while remaining:
        chunk = stream.read(remaining)
        if not chunk:
            return None
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


@dataclass(slots=True)
class Frame:
    kind: int
    stream: int
    samples: np.ndarray


def read_frame(stream) -> Frame | None:
    raw_length = read_exact(stream, 4)
    if raw_length is None:
        return None
    (length,) = struct.unpack("<I", raw_length)
    if length < 4 or length > 4 + SAMPLE_RATE * 4 * 15:
        raise ValueError(f"invalid frame length: {length}")
    body = read_exact(stream, length)
    if body is None:
        return None
    kind, stream_id, _reserved = struct.unpack("<BBH", body[:4])
    pcm = np.frombuffer(body[4:], dtype="<f4").copy()
    return Frame(kind=kind, stream=stream_id, samples=pcm)


class FrameReader(threading.Thread):
    def __init__(self, output: queue.Queue[Frame | None]):
        super().__init__(name="gamel-vad-stdin", daemon=True)
        self.output = output

    def run(self) -> None:
        try:
            while True:
                frame = read_frame(sys.stdin.buffer)
                self.output.put(frame)
                if frame is None or frame.kind == KIND_SHUTDOWN:
                    return
        except Exception as exc:
            emit({"type": "error", "message": f"อ่าน audio frame ไม่สำเร็จ: {exc}"})
            self.output.put(None)


class SileroVad:
    def __init__(self, model, threshold: float, silence_ms: int):
        from silero_vad import VADIterator

        self.iterator = VADIterator(
            model,
            threshold=threshold,
            sampling_rate=SAMPLE_RATE,
            min_silence_duration_ms=silence_ms,
            speech_pad_ms=0,
        )

    def reset(self) -> None:
        self.iterator.reset_states()

    def process(self, samples: np.ndarray) -> dict | None:
        import torch

        return self.iterator(torch.from_numpy(samples), return_seconds=False)


class EnergyVad:
    """Deterministic VAD used only by tests and --mock developer mode."""

    def __init__(self, silence_ms: int):
        self.silence_samples = int(silence_ms * SAMPLE_RATE / 1_000)
        self.speaking = False
        self.silent_samples = 0

    def reset(self) -> None:
        self.speaking = False
        self.silent_samples = 0

    def process(self, samples: np.ndarray) -> dict | None:
        rms = math.sqrt(float(np.mean(np.square(samples))) + 1e-12)
        if rms >= 0.012:
            self.silent_samples = 0
            if not self.speaking:
                self.speaking = True
                return {"start": 0}
        elif self.speaking:
            self.silent_samples += len(samples)
            if self.silent_samples >= self.silence_samples:
                self.speaking = False
                self.silent_samples = 0
                return {"end": 0}
        return None


class StreamSession:
    def __init__(
        self,
        stream_name: str,
        max_utterance_ms: int,
        vad,
        emit_event: Callable[[dict], None] = emit,
    ):
        self.stream_name = stream_name
        self.max_samples = int(max_utterance_ms * SAMPLE_RATE / 1_000)
        self.vad = vad
        self.emit_event = emit_event
        self.pending = np.empty(0, dtype=np.float32)
        self.speaking = False
        self.speech_samples = 0

    def ingest(self, samples: np.ndarray) -> None:
        if samples.size == 0:
            return
        self.pending = np.concatenate((self.pending, samples))
        while len(self.pending) >= VAD_FRAME_SAMPLES:
            frame = self.pending[:VAD_FRAME_SAMPLES]
            self.pending = self.pending[VAD_FRAME_SAMPLES:]
            event = self.vad.process(frame)
            if event and "start" in event and not self.speaking:
                self.speaking = True
                self.speech_samples = 0
                self._emit_state(True)
            if self.speaking:
                self.speech_samples += len(frame)
            if event and "end" in event and self.speaking:
                self._finish_speech()
            elif self.speaking and self.speech_samples >= self.max_samples:
                self._finish_speech()

    def finalize(self) -> None:
        if self.speaking:
            self._finish_speech()
        else:
            self.reset()

    def reset(self) -> None:
        self.pending = np.empty(0, dtype=np.float32)
        self.speaking = False
        self.speech_samples = 0
        self.vad.reset()

    def _finish_speech(self) -> None:
        self._emit_state(False)
        self.reset()

    def _emit_state(self, active: bool) -> None:
        self.emit_event(
            {
                "type": "speech_state",
                "stream": self.stream_name,
                "active": active,
            }
        )


def run(args) -> int:
    try:
        if args.mock:
            vad_factory = lambda: EnergyVad(args.silence_ms)
        else:
            from silero_vad import load_silero_vad

            model = load_silero_vad(onnx=True)
            vad_factory = lambda: SileroVad(model, args.vad_threshold, args.silence_ms)
        sessions = {
            STREAM_GAME: StreamSession(
                "game", args.max_utterance_ms, vad_factory()
            ),
            STREAM_MICROPHONE: StreamSession(
                "microphone", args.max_utterance_ms, vad_factory()
            ),
        }
    except Exception as exc:
        emit({"type": "error", "message": f"โหลด Silero VAD ไม่สำเร็จ: {exc}"})
        return 2

    incoming: queue.Queue[Frame | None] = queue.Queue(maxsize=96)
    FrameReader(incoming).start()
    emit({"type": "ready", "model": "silero-vad", "device": "cpu"})
    while True:
        frame = incoming.get()
        if frame is None or frame.kind == KIND_SHUTDOWN:
            break
        session = sessions.get(frame.stream)
        if session is None:
            continue
        if frame.kind == KIND_AUDIO:
            session.ingest(frame.samples)
        elif frame.kind == KIND_FINALIZE:
            session.finalize()
        elif frame.kind == KIND_RESET:
            session.reset()
    return 0


def self_test() -> int:
    payload = struct.pack("<BBH", KIND_AUDIO, STREAM_GAME, 0) + np.zeros(320, dtype="<f4").tobytes()
    frame = read_frame(io.BytesIO(struct.pack("<I", len(payload)) + payload))
    assert frame is not None and frame.kind == KIND_AUDIO and frame.samples.shape == (320,)
    assert read_exact(io.BytesIO(b"abc"), 3) == b"abc"
    print("GameLingo VAD worker protocol self-test: OK")
    return 0


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--vad-threshold", type=float, default=0.5)
    parser.add_argument("--silence-ms", type=int, default=500)
    parser.add_argument("--max-utterance-ms", type=int, default=12_000)
    parser.add_argument("--mock", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args()


if __name__ == "__main__":
    parsed = parse_args()
    raise SystemExit(self_test() if parsed.self_test else run(parsed))
