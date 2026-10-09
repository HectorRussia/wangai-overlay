"""Silero detection and deterministic developer/test VAD."""

from __future__ import annotations
import math
import numpy as np
from .protocol import SAMPLE_RATE


class SileroVad:
    def __init__(
        self,
        model,
        threshold: float,
        silence_ms: int,
        adaptive_floor: float | None = None,
    ):
        self.model = model
        self.threshold = threshold
        self.adaptive_floor = min(
            threshold,
            adaptive_floor if adaptive_floor is not None else threshold,
        )
        self.end_threshold = max(
            0.02,
            min(threshold - 0.15, self.adaptive_floor * 0.8),
        )
        self.silence_samples = int(silence_ms * SAMPLE_RATE / 1_000)
        self.speaking = False
        self.weak_speech_frames = 0
        self.silent_samples = 0

    def reset(self) -> None:
        self.model.reset_states()
        self.speaking = False
        self.weak_speech_frames = 0
        self.silent_samples = 0

    def process(self, samples: np.ndarray) -> dict | None:
        probability = float(self.model(samples, SAMPLE_RATE))
        strong_speech = probability >= self.threshold
        if probability >= self.adaptive_floor:
            self.weak_speech_frames += 1
        else:
            self.weak_speech_frames = 0

        if not self.speaking and (strong_speech or self.weak_speech_frames >= 3):
            self.speaking = True
            self.silent_samples = 0
            return {"start": 0}

        if self.speaking:
            if probability < self.end_threshold:
                self.silent_samples += len(samples)
                if self.silent_samples >= self.silence_samples:
                    self.speaking = False
                    self.weak_speech_frames = 0
                    self.silent_samples = 0
                    return {"end": 0}
            else:
                self.silent_samples = 0
        return None


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
