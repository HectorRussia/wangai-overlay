"""Worker lifecycle and CLI; all model loading remains inside run()."""

from __future__ import annotations
import argparse
import io
import queue
import struct
import numpy as np
from .protocol import (
    KIND_AUDIO,
    KIND_FINALIZE,
    KIND_RESET,
    KIND_SHUTDOWN,
    STREAM_INCOMING,
    Frame,
    FrameReader,
    emit,
    read_exact,
    read_frame,
)
from .session import StreamSession, VAD_FRAME_SAMPLES
from .vad import EnergyVad, SileroVad


def run(args) -> int:
    try:
        if args.mock:
            incoming_vad = EnergyVad(args.silence_ms)
        else:
            from .silero_onnx import SileroOnnx

            incoming_vad = SileroVad(
                SileroOnnx(),
                args.vad_threshold,
                args.silence_ms,
                args.adaptive_floor,
            )
            # Exercise the bundled ONNX runtime and its DLLs before declaring ready.
            incoming_vad.process(np.zeros(VAD_FRAME_SAMPLES, dtype=np.float32))
            incoming_vad.reset()
        if args.model_self_check:
            emit({"type": "ready", "model": "silero-vad", "device": "cpu"})
            return 0
        sessions = {
            STREAM_INCOMING: StreamSession(
                "incoming", args.max_utterance_ms, incoming_vad
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
            session.ingest(frame.samples, frame.start_sample_cursor)
        elif frame.kind == KIND_FINALIZE:
            session.finalize()
        elif frame.kind == KIND_RESET:
            session.reset()
    return 0


def self_test() -> int:
    payload = (
        struct.pack("<BBHQ", KIND_AUDIO, STREAM_INCOMING, 0, 123)
        + np.zeros(320, dtype="<f4").tobytes()
    )
    frame = read_frame(io.BytesIO(struct.pack("<I", len(payload)) + payload))
    assert frame is not None and frame.kind == KIND_AUDIO
    assert frame.start_sample_cursor == 123 and frame.samples.shape == (320,)
    assert read_exact(io.BytesIO(b"abc"), 3) == b"abc"
    print("WANGAI VAD worker protocol self-test: OK")
    return 0


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--vad-threshold", type=float, default=0.5)
    parser.add_argument("--adaptive-floor", type=float)
    parser.add_argument("--silence-ms", type=int, default=500)
    parser.add_argument("--max-utterance-ms", type=int, default=12_000)
    parser.add_argument("--mock", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--model-self-check", action="store_true")
    return parser.parse_args()
