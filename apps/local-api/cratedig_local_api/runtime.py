"""Composition root for the first offline analysis runtime."""

from __future__ import annotations

from typing import Any

from cratedig_engine.extractors import (
    ExtractorRegistry,
    LibrosaExtractor,
    librosa_extractor_spec,
)
from cratedig_engine.records import ModelSetManifest

from .analysis_routes import (
    AnalysisConflictError,
    AnalysisNotFoundError,
    IdempotencyConflictError,
    RetryLimitExceededError,
    StageNotRetryableError,
)
from .repository import (
    ConflictError,
    NotFoundError,
    Repository,
    RetryLimitError,
)


LOCAL_FAST_MANIFEST_NAME = "local-fast"
LOCAL_FAST_MANIFEST_VERSION = "1"


def local_fast_manifest() -> ModelSetManifest:
    """The intentionally single-extractor v0.1 offline manifest."""

    spec = librosa_extractor_spec()
    return ModelSetManifest(
        name=LOCAL_FAST_MANIFEST_NAME,
        version=LOCAL_FAST_MANIFEST_VERSION,
        required_extractors=(spec,),
        window_plan_version=spec.default_window_plan_version
        or "legacy-librosa-v1",
        pooling_configuration_version="librosa-arithmetic-mean-v1",
        component_normalization_version="unfrozen-v0",
        component_weighting_version="librosa-only-v1",
    )


def ensure_local_fast_manifest(repository: Repository) -> dict[str, Any]:
    return repository.upsert_model_set_manifest(local_fast_manifest())


def local_fast_registry() -> ExtractorRegistry:
    """Build the worker registry, loading optional librosa only in the worker."""

    return ExtractorRegistry((LibrosaExtractor(),))


def resolve_manifest_record(
    repository: Repository, manifest_id: str
) -> ModelSetManifest | None:
    row = repository.get_model_set_manifest(manifest_id)
    if row is None:
        return None
    return ModelSetManifest.model_validate(row["manifest_json"])


class RepositoryAnalysisService:
    """Translate persistence errors into stable HTTP-domain errors."""

    def __init__(self, repository: Repository) -> None:
        self.repository = repository

    def resolve_model_set_manifest(self, name: str, version: str):
        with self.repository.synchronized():
            return self.repository.resolve_model_set_manifest(name, version)

    def create_analysis_run(
        self,
        library_id: str,
        manifest_id: str,
        *,
        mode: str,
        idempotency_key: str,
    ):
        try:
            with self.repository.synchronized():
                return self.repository.create_analysis_run(
                    library_id,
                    manifest_id,
                    mode=mode,
                    idempotency_key=idempotency_key,
                )
        except NotFoundError as exc:
            raise AnalysisNotFoundError(str(exc)) from exc
        except ConflictError as exc:
            raise IdempotencyConflictError(str(exc)) from exc
        except ValueError as exc:
            raise AnalysisConflictError(str(exc)) from exc

    def get_analysis_run(self, run_id: str):
        with self.repository.synchronized():
            return self.repository.get_analysis_run(run_id)

    def list_run_tracks(self, run_id: str):
        with self.repository.synchronized():
            return self.repository.list_run_tracks(run_id)

    def request_cancellation(self, run_id: str, *, reason: str):
        with self.repository.synchronized():
            current = self.repository.get_analysis_run(run_id)
        if current is None:
            return None
        if current["status"] in {"completed", "failed"}:
            raise AnalysisConflictError("A terminal analysis run cannot be cancelled")
        try:
            with self.repository.synchronized():
                return self.repository.request_cancellation(run_id, reason=reason)
        except NotFoundError:
            return None
        except (ConflictError, ValueError) as exc:
            raise AnalysisConflictError(str(exc)) from exc

    def retry_stage(self, stage_id: str, *, reason: str | None = None):
        try:
            with self.repository.synchronized():
                return self.repository.retry_stage(stage_id, reason=reason)
        except NotFoundError:
            return None
        except RetryLimitError as exc:
            raise RetryLimitExceededError(str(exc)) from exc
        except ConflictError as exc:
            raise StageNotRetryableError(str(exc)) from exc

    def get_track_analysis(self, track_id: str, *, run_id: str | None = None):
        with self.repository.synchronized():
            return self.repository.get_track_analysis(track_id, run_id=run_id)

    def list_neighbors(
        self, track_id: str, *, run_id: str | None = None, limit: int = 25
    ):
        with self.repository.synchronized():
            return self.repository.list_neighbors(track_id, run_id=run_id, limit=limit)


__all__ = [
    "LOCAL_FAST_MANIFEST_NAME",
    "LOCAL_FAST_MANIFEST_VERSION",
    "RepositoryAnalysisService",
    "ensure_local_fast_manifest",
    "local_fast_manifest",
    "local_fast_registry",
    "resolve_manifest_record",
]
