"""Crate Dig analysis engine.

Owns audio excerpts, analysis backends, clustering, Rekordbox import/export,
and local cache/idempotency. Persistence adapters (local files now; Supabase
and SQLite later) sit behind `storage`.
"""

from .schemas import (
    ANALYSIS_PIPELINE_VERSION,
    FEATURE_SCHEMA_VERSION,
    AnalysisMode,
    AnalysisResult,
    AnalysisRun,
    AnalysisStatus,
    AudioFile,
    BackendOutput,
    ClusterAssignment,
    Crate,
    CrateTrack,
    Track,
    TrackEmbedding,
    TrackFeatures,
)

__version__ = "0.1.0"

__all__ = [
    "ANALYSIS_PIPELINE_VERSION",
    "FEATURE_SCHEMA_VERSION",
    "__version__",
    "AnalysisMode",
    "AnalysisResult",
    "AnalysisRun",
    "AnalysisStatus",
    "AudioFile",
    "BackendOutput",
    "ClusterAssignment",
    "Crate",
    "CrateTrack",
    "Track",
    "TrackEmbedding",
    "TrackFeatures",
]
