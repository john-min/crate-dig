"""Per-track analysis with cache/idempotency."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from cratedig_engine.audio.hash import hash_audio_file, location_kind
from cratedig_engine.backends.base import AudioBackend
from cratedig_engine.pipeline.cache import AnalysisCache
from cratedig_engine.schemas import (
    ANALYSIS_PIPELINE_VERSION,
    FEATURE_SCHEMA_VERSION,
    AnalysisResult,
    AnalysisStatus,
    Track,
)


def analyze_track(
    track: Track,
    backend: AudioBackend,
    cache: AnalysisCache | None = None,
    *,
    pipeline_version: str = ANALYSIS_PIPELINE_VERSION,
    feature_schema_version: str = FEATURE_SCHEMA_VERSION,
) -> AnalysisResult:
    kind = location_kind(track.location)
    audio_hash = _hash_for_location(track.location, kind)

    if cache is not None:
        cached = cache.get(
            track.track_id,
            audio_hash,
            analysis_pipeline_version=pipeline_version,
            model_version=backend.model_version,
            feature_schema_version=feature_schema_version,
        )
        if cached is not None and cached.terminal:
            return cached

    result = _run_analysis(
        track,
        backend,
        kind=kind,
        audio_hash=audio_hash,
        pipeline_version=pipeline_version,
        feature_schema_version=feature_schema_version,
    )
    if cache is not None:
        cache.put(result)
    return result


def analyze_tracks(
    tracks: list[Track],
    backend: AudioBackend,
    cache: AnalysisCache | None = None,
) -> list[AnalysisResult]:
    return [analyze_track(track, backend, cache) for track in tracks]


def _hash_for_location(location: str, kind: str) -> str | None:
    if kind != "file":
        return None
    path = Path(location)
    if not path.exists():
        return None
    return hash_audio_file(path)


def _run_analysis(
    track: Track,
    backend: AudioBackend,
    *,
    kind: str,
    audio_hash: str | None,
    pipeline_version: str,
    feature_schema_version: str,
) -> AnalysisResult:
    now = datetime.now(timezone.utc)
    base = dict(
        track_id=track.track_id,
        audio_file_hash=audio_hash,
        analysis_pipeline_version=pipeline_version,
        model_version=backend.model_version,
        feature_schema_version=feature_schema_version,
        created_at=now,
    )
    if kind == "empty":
        return AnalysisResult(
            status=AnalysisStatus.skipped,
            failure_reason="empty location",
            **base,
        )
    if kind == "pseudo":
        return AnalysisResult(
            status=AnalysisStatus.failed,
            failure_reason=f"unsupported streaming location: {track.location}",
            **base,
        )
    if not track.location or not Path(track.location).exists():
        return AnalysisResult(
            status=AnalysisStatus.failed,
            failure_reason=f"missing file: {track.location}",
            **base,
        )
    try:
        output = backend.analyze(track.location)
    except Exception as exc:
        return AnalysisResult(
            status=AnalysisStatus.failed,
            failure_reason=str(exc),
            **base,
        )
    return AnalysisResult(
        status=AnalysisStatus.ok,
        failure_reason=None,
        embedding=output.embedding,
        features=output.features,
        **base,
    )
