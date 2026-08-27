from __future__ import annotations

from cratedig_engine.pipeline.analyze import analyze_track
from cratedig_engine.pipeline.cache import AnalysisCache
from cratedig_engine.schemas import AnalysisStatus, BackendOutput, Track


class FakeBackend:
    name = "fake"
    model_version = "fake-v1"

    def __init__(self):
        self.calls: list[str] = []

    def analyze(self, audio_path: str) -> BackendOutput:
        self.calls.append(audio_path)
        return BackendOutput(embedding=[0.1, 0.2, 0.3], features={"energy_rms": 0.2})


def test_success_is_cached_and_not_reanalyzed(tmp_path):
    audio = tmp_path / "ok.wav"
    audio.write_bytes(b"RIFF" + b"\x00" * 64)
    track = Track(track_id="T1", location=str(audio))
    cache = AnalysisCache(tmp_path / "audio_cache.jsonl")
    backend = FakeBackend()

    first = analyze_track(track, backend, cache)
    second = analyze_track(track, backend, cache)

    assert first.status is AnalysisStatus.ok
    assert second.status is AnalysisStatus.ok
    assert backend.calls == [str(audio)]
    assert cache.line_count() == 1


def test_permanent_failure_is_not_retried(tmp_path):
    track = Track(track_id="T-missing", location=str(tmp_path / "nope.wav"))
    cache = AnalysisCache(tmp_path / "audio_cache.jsonl")
    backend = FakeBackend()

    first = analyze_track(track, backend, cache)
    second = analyze_track(track, backend, cache)

    assert first.status is AnalysisStatus.failed
    assert "missing file" in (first.failure_reason or "")
    assert second.failure_reason == first.failure_reason
    assert backend.calls == []
    assert cache.line_count() == 1


def test_spotify_location_fails_once(tmp_path):
    track = Track(track_id="T-spot", location="spotify:track:abc")
    cache = AnalysisCache(tmp_path / "audio_cache.jsonl")
    backend = FakeBackend()

    first = analyze_track(track, backend, cache)
    analyze_track(track, backend, cache)

    assert first.status is AnalysisStatus.failed
    assert "spotify:" in (first.failure_reason or "")
    assert backend.calls == []
    assert cache.line_count() == 1


def test_hash_change_retries(tmp_path):
    audio = tmp_path / "changing.wav"
    audio.write_bytes(b"AAAA")
    track = Track(track_id="T-hash", location=str(audio))
    cache = AnalysisCache(tmp_path / "audio_cache.jsonl")
    backend = FakeBackend()

    analyze_track(track, backend, cache)
    audio.write_bytes(b"BBBB")
    analyze_track(track, backend, cache)

    assert backend.calls == [str(audio), str(audio)]
    assert cache.line_count() == 2
