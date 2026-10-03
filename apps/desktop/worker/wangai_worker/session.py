"""Per-stream cursor tracking, speech boundaries and phrase splitting."""

from __future__ import annotations
from typing import Callable
import numpy as np
from .protocol import SAMPLE_RATE, emit

VAD_FRAME_SAMPLES = 512


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
        self.pending_start_cursor = 0
        self.expected_cursor: int | None = None
        self.speaking = False
        self.speech_samples = 0
        self.utterance_id = 0
        self.current_utterance_id: int | None = None

    def ingest(self, samples: np.ndarray, start_sample_cursor: int) -> None:
        if samples.size == 0:
            return
        if (
            self.expected_cursor is not None
            and start_sample_cursor != self.expected_cursor
        ):
            self.emit_event(
                {
                    "type": "audio_gap",
                    "stream": self.stream_name,
                    "expectedSampleCursor": self.expected_cursor,
                    "actualSampleCursor": start_sample_cursor,
                }
            )
            self._reset_detection(clear_pending=True)
        if self.pending.size == 0:
            self.pending_start_cursor = start_sample_cursor
        self.pending = np.concatenate((self.pending, samples))
        self.expected_cursor = start_sample_cursor + len(samples)
        while len(self.pending) >= VAD_FRAME_SAMPLES:
            frame_start_cursor = self.pending_start_cursor
            frame_end_cursor = frame_start_cursor + VAD_FRAME_SAMPLES
            frame = self.pending[:VAD_FRAME_SAMPLES]
            self.pending = self.pending[VAD_FRAME_SAMPLES:]
            self.pending_start_cursor = frame_end_cursor
            event = self.vad.process(frame)
            if event and "start" in event and not self.speaking:
                self.speaking = True
                self.speech_samples = 0
                self.utterance_id += 1
                self.current_utterance_id = self.utterance_id
                self._emit_state(True, frame_end_cursor)
            if self.speaking:
                self.speech_samples += len(frame)
            if event and "end" in event and self.speaking:
                self._finish_speech(frame_end_cursor, reset_vad=True)
            elif self.speaking and self.speech_samples >= self.max_samples:
                self._split_speech(frame_end_cursor)

    def finalize(self) -> None:
        if self.speaking:
            self._finish_speech(
                self.expected_cursor or self.pending_start_cursor, reset_vad=True
            )
        else:
            self.reset()

    def reset(self) -> None:
        self._reset_detection(clear_pending=True)
        self.expected_cursor = None
        self.pending_start_cursor = 0
        self.utterance_id = 0

    def _reset_detection(self, clear_pending: bool) -> None:
        if clear_pending:
            self.pending = np.empty(0, dtype=np.float32)
        self.speaking = False
        self.speech_samples = 0
        self.current_utterance_id = None
        self.vad.reset()

    def _finish_speech(self, sample_cursor: int, reset_vad: bool) -> None:
        self._emit_state(False, sample_cursor)
        self.speaking = False
        self.speech_samples = 0
        self.current_utterance_id = None
        if reset_vad:
            self.vad.reset()

    def _split_speech(self, sample_cursor: int) -> None:
        self._emit_state(False, sample_cursor)
        self.utterance_id += 1
        self.current_utterance_id = self.utterance_id
        self.speech_samples = 0
        self._emit_state(True, sample_cursor)

    def _emit_state(self, active: bool, sample_cursor: int) -> None:
        if self.current_utterance_id is None:
            return
        self.emit_event(
            {
                "type": "speech_state",
                "stream": self.stream_name,
                "active": active,
                "utteranceId": self.current_utterance_id,
                "sampleCursor": sample_cursor,
            }
        )
