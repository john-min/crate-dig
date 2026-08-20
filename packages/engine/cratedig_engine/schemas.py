"""Typed models shared by the engine, FastAPI, and tests."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


ANALYSIS_PIPELINE_VERSION = "1.0.0"
FEATURE_SCHEMA_VERSION = "1.0.0"


class AnalysisMode(str, Enum):
    fast = "fast"
    deep = "deep"


class AnalysisStatus(str, Enum):
    ok = "ok"
    failed = "failed"
    skipped = "skipped"


class Track(BaseModel):
    track_id: str
    title: str = ""
    artist: str = ""
    album: str = ""
    genre: str = ""
    label: str = ""
    bpm: float | None = None
    key: str = ""
    duration_sec: float | None = None
    location: str = ""
    rating: int = 0
    date_added: str = ""


class AudioFile(BaseModel):
    track_id: str
    path: str = ""
    hash: str | None = None
    exists: bool = False
    kind: str = "file"  # file | missing | pseudo | empty


class BackendOutput(BaseModel):
    """What an audio backend returns. The pipeline wraps this into AnalysisResult."""

    embedding: list[float]
    features: dict[str, Any] = Field(default_factory=dict)
    embedding_dim: int = 0

    def model_post_init(self, __context: Any) -> None:
        if not self.embedding_dim:
            self.embedding_dim = len(self.embedding)


class AnalysisRun(BaseModel):
    analysis_run_id: str
    mode: AnalysisMode = AnalysisMode.fast
    backend_name: str = "librosa"
    status: str = "pending"
    pipeline_version: str = ANALYSIS_PIPELINE_VERSION
    feature_schema_version: str = FEATURE_SCHEMA_VERSION
    model_version: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TrackFeatures(BaseModel):
    track_id: str
    values: dict[str, Any] = Field(default_factory=dict)


class TrackEmbedding(BaseModel):
    track_id: str
    vector: list[float]
    dim: int = 0
    model_version: str = ""

    def model_post_init(self, __context: Any) -> None:
        if not self.dim:
            self.dim = len(self.vector)


class ClusterAssignment(BaseModel):
    track_id: str
    cluster_id: int
    cluster_name: str = ""
    umap_x: float
    umap_y: float
    suggested_moment: str = ""
    reduced_embedding: list[float] = Field(default_factory=list)


class CrateTrack(BaseModel):
    track_id: str
    position: int = 0


class Crate(BaseModel):
    crate_id: str
    name: str
    notes: str = ""
    tracks: list[CrateTrack] = Field(default_factory=list)


class AnalysisResult(BaseModel):
    track_id: str
    audio_file_hash: str | None = None
    status: AnalysisStatus
    failure_reason: str | None = None
    analysis_pipeline_version: str = ANALYSIS_PIPELINE_VERSION
    model_version: str = ""
    feature_schema_version: str = FEATURE_SCHEMA_VERSION
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    embedding: list[float] | None = None
    features: dict[str, Any] = Field(default_factory=dict)

    @property
    def cache_key(self) -> tuple[str, str | None, str, str, str]:
        return (
            self.track_id,
            self.audio_file_hash,
            self.analysis_pipeline_version,
            self.model_version,
            self.feature_schema_version,
        )

    @property
    def terminal(self) -> bool:
        return self.status in {
            AnalysisStatus.ok,
            AnalysisStatus.failed,
            AnalysisStatus.skipped,
        }
