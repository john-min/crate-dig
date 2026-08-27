from __future__ import annotations

import math
import struct
import wave

import pytest

from cratedig_engine.audio.hash import location_kind
from cratedig_engine.backends.factory import get_backend
from cratedig_engine.pipeline.analyze import analyze_track
from cratedig_engine.pipeline.cache import AnalysisCache
from cratedig_engine.schemas import AnalysisMode, AnalysisStatus, Track


def _write_sine(path, seconds=3.0, sr=22050, freq=220.0):
    n = int(seconds * sr)
    with wave.open(str(path), "w") as fh:
        fh.setnchannels(1)
        fh.setsampwidth(2)
        fh.setframerate(sr)
        frames = b"".join(
            struct.pack("<h", int(32767 * math.sin(2 * math.pi * freq * i / sr)))
            for i in range(n)
        )
        fh.writeframes(frames)


def test_factory_fast_defaults_to_librosa_without_importing_clap():
    pytest.importorskip("librosa")
    backend = get_backend("auto", mode=AnalysisMode.fast)
    assert backend.name == "librosa"
    assert "clap" not in backend.model_version


def test_librosa_fast_path_on_synthetic_wav(tmp_path):
    pytest.importorskip("librosa")
    audio = tmp_path / "tone.wav"
    _write_sine(audio)
    backend = get_backend("librosa")
    cache = AnalysisCache(tmp_path / "audio_cache.jsonl")
    track = Track(track_id="tone", title="Tone", location=str(audio))
    result = analyze_track(track, backend, cache)
    assert result.status is AnalysisStatus.ok
    assert result.embedding and len(result.embedding) > 8
    assert "est_bpm" in result.features
    assert result.audio_file_hash
    # Second pass is cache-only.
    again = analyze_track(track, backend, cache)
    assert again.status is AnalysisStatus.ok
    assert cache.line_count() == 1


def test_location_kinds():
    assert location_kind("") == "empty"
    assert location_kind("spotify:track:1") == "pseudo"
    assert location_kind("/tmp/a.wav") == "file"
