from __future__ import annotations

import math
import struct
import wave
from dataclasses import dataclass

import numpy as np
import pytest

from cratedig_engine.backends.librosa_backend import LibrosaBackend
from cratedig_engine.audio.decode import DecodedAudio
from cratedig_engine.audio.windows import LEGACY_LIBROSA
from cratedig_engine.extractors.librosa import (
    LIBROSA_EMBEDDING_DIMENSION,
    LibrosaExtractor,
)
from cratedig_engine.records import FeatureScope


SOURCE_HASH = "b" * 64


def _write_sine(path, *, seconds: float = 3.0, sr: int = 22_050) -> None:
    frames = int(seconds * sr)
    with wave.open(str(path), "w") as fh:
        fh.setnchannels(1)
        fh.setsampwidth(2)
        fh.setframerate(sr)
        fh.writeframes(
            b"".join(
                struct.pack(
                    "<h", int(24_000 * math.sin(2 * math.pi * 220 * index / sr))
                )
                for index in range(frames)
            )
        )


class SharedAudio:
    def __init__(self, samples: np.ndarray) -> None:
        self.source_hash = SOURCE_HASH
        self._samples = samples
        self.duration_sec = len(samples) / 22_050
        self.view_calls: list[dict[str, object]] = []

    def view(self, **kwargs):
        self.view_calls.append(kwargs)
        return self._samples


@dataclass(frozen=True)
class AudioTestWindow:
    start_sec: float
    end_sec: float

    def slice(self, samples: np.ndarray) -> np.ndarray:
        sr = 22_050
        return samples[int(self.start_sec * sr) : int(self.end_sec * sr)]


class TwoWindowPlan:
    version = "two-window-test-v1"

    def windows(self, frame_count: int, sample_rate: int):
        midpoint = frame_count // 2
        return (
            AudioTestWindow(0.0, midpoint / sample_rate),
            AudioTestWindow(midpoint / sample_rate, frame_count / sample_rate),
        )


def test_librosa_legacy_plan_matches_existing_backend_without_reopening(
    tmp_path, monkeypatch
):
    librosa = pytest.importorskip("librosa")
    source = tmp_path / "tone.wav"
    _write_sine(source)
    expected = LibrosaBackend().analyze(str(source))
    audio = DecodedAudio.from_file(source)

    def fail_if_reopened(*args, **kwargs):
        raise AssertionError("LibrosaExtractor reopened source audio")

    monkeypatch.setattr(librosa, "load", fail_if_reopened)
    bundle = LibrosaExtractor().extract(audio, LEGACY_LIBROSA)
    track_embedding = next(
        item for item in bundle.embeddings if item.scope is FeatureScope.TRACK
    )
    track_scalars = {
        item.feature_name: item.value
        for item in bundle.scalars
        if item.scope is FeatureScope.TRACK
    }

    assert track_embedding.dimension == expected.embedding_dim
    assert track_embedding.dimension == LIBROSA_EMBEDDING_DIMENSION
    np.testing.assert_allclose(
        track_embedding.vector, expected.embedding, rtol=1e-5, atol=1e-5
    )
    for name, value in expected.features.items():
        assert track_scalars[name] == value

    physical = {
        item.feature_name: item
        for item in bundle.scalars
        if item.scope is FeatureScope.TRACK and item.namespace == "physical"
    }
    assert {
        "duration_sec",
        "spectral_bandwidth_hz",
        "low_band_energy_ratio",
        "mid_band_energy_ratio",
        "high_band_energy_ratio",
        "onset_density_per_sec",
        "crest_factor",
        "tempo_confidence",
    } <= physical.keys()
    assert physical["duration_sec"].value == 3.0
    assert 0.99 <= sum(
        physical[name].value
        for name in (
            "low_band_energy_ratio",
            "mid_band_energy_ratio",
            "high_band_energy_ratio",
        )
    ) <= 1.01
    bpm = next(
        item
        for item in bundle.scalars
        if item.scope is FeatureScope.TRACK and item.feature_name == "est_bpm"
    )
    assert bpm.confidence == physical["tempo_confidence"].value
    assert 0.0 <= bpm.confidence <= 1.0


def test_librosa_retains_window_evidence_and_pools_native_dimension():
    pytest.importorskip("librosa")
    sr = 22_050
    seconds = 6
    time = np.arange(sr * seconds, dtype=np.float32) / sr
    samples = np.sin(2 * np.pi * 220 * time).astype(np.float32)

    bundle = LibrosaExtractor().extract(SharedAudio(samples), TwoWindowPlan())
    windows = [
        item for item in bundle.embeddings if item.scope is FeatureScope.WINDOW
    ]
    tracks = [item for item in bundle.embeddings if item.scope is FeatureScope.TRACK]

    assert len(windows) == 2
    assert len(tracks) == 1
    assert all(item.dimension == LIBROSA_EMBEDDING_DIMENSION for item in windows)
    assert tracks[0].dimension == LIBROSA_EMBEDDING_DIMENSION
    assert [(item.start_ms, item.end_ms) for item in windows] == [
        (0, 3_000),
        (3_000, 6_000),
    ]
    np.testing.assert_allclose(
        tracks[0].vector,
        np.mean(np.asarray([item.vector for item in windows]), axis=0),
        rtol=1e-6,
        atol=1e-6,
    )
    window_scalar_ranges = {
        (item.start_ms, item.end_ms)
        for item in bundle.scalars
        if item.scope is FeatureScope.WINDOW
    }
    assert window_scalar_ranges == {(0, 3_000), (3_000, 6_000)}
