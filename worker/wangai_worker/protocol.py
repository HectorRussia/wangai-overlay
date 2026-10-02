"""Binary stdin frames and JSONL stdout events shared with the Rust decoder."""
from __future__ import annotations
import json
import queue
import struct
import sys
import threading
from dataclasses import dataclass
import numpy as np

KIND_AUDIO = 1
KIND_RESET = 2
KIND_FINALIZE = 3
KIND_SHUTDOWN = 4
STREAM_INCOMING = 1
STREAM_MICROPHONE = 2
SAMPLE_RATE = 16_000


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
    start_sample_cursor: int
    samples: np.ndarray


def read_frame(stream) -> Frame | None:
    raw_length = read_exact(stream, 4)
    if raw_length is None:
        return None
    (length,) = struct.unpack("<I", raw_length)
    if length < 12 or length > 12 + SAMPLE_RATE * 4 * 15:
        raise ValueError(f"invalid frame length: {length}")
    body = read_exact(stream, length)
    if body is None:
        return None
    kind, stream_id, _reserved, start_sample_cursor = struct.unpack("<BBHQ", body[:12])
    pcm = np.frombuffer(body[12:], dtype="<f4").copy()
    return Frame(
        kind=kind,
        stream=stream_id,
        start_sample_cursor=start_sample_cursor,
        samples=pcm,
    )


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


