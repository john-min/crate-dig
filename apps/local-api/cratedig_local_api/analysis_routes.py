"""HTTP contracts for durable, asynchronous track analysis.

The router deliberately depends on a small protocol instead of SQLite.  The
same HTTP surface can therefore sit in front of the local repository today and
a cloud service later without putting model inference inside request handlers.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal, Mapping, Protocol, Sequence

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field


JsonObject = Mapping[str, Any]


class CreateAnalysisRunRequest(BaseModel):
    """Select a reproducible model set and an idempotent submission key."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    manifest_name: str = Field(min_length=1, max_length=128)
    manifest_version: str = Field(min_length=1, max_length=64)
    mode: Literal["fast", "deep"] = "fast"
    idempotency_key: str = Field(min_length=8, max_length=128)


class CancelAnalysisRunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    reason: Literal["cancelled_by_user"] = "cancelled_by_user"


class RetryAnalysisStageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    reason: str | None = Field(default=None, max_length=500)


class AnalysisService(Protocol):
    """Persistence/service contract required by :func:`create_analysis_router`."""

    def resolve_model_set_manifest(
        self, name: str, version: str
    ) -> JsonObject | object | None: ...

    def create_analysis_run(
        self,
        library_id: str,
        manifest_id: str,
        *,
        mode: str,
        idempotency_key: str,
    ) -> JsonObject: ...

    def get_analysis_run(self, run_id: str) -> JsonObject | None: ...

    def list_run_tracks(self, run_id: str) -> Sequence[JsonObject]: ...

    def request_cancellation(
        self, run_id: str, *, reason: str
    ) -> JsonObject | None: ...

    def retry_stage(
        self, stage_id: str, *, reason: str | None = None
    ) -> JsonObject | None: ...

    def get_track_analysis(
        self, track_id: str, *, run_id: str | None = None
    ) -> JsonObject | None: ...

    def list_neighbors(
        self,
        track_id: str,
        *,
        run_id: str | None = None,
        limit: int = 25,
    ) -> Sequence[JsonObject] | None: ...


class AnalysisAPIError(RuntimeError):
    """Expected service error with a stable public representation."""

    status_code = status.HTTP_400_BAD_REQUEST
    code = "analysis_request_invalid"
    retryable = False

    def __init__(
        self,
        message: str,
        *,
        remediation: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.remediation = remediation

    def detail(self) -> dict[str, Any]:
        value: dict[str, Any] = {
            "code": self.code,
            "message": self.message,
            "retryable": self.retryable,
        }
        if self.remediation:
            value["remediation"] = self.remediation
        return value


class AnalysisNotFoundError(AnalysisAPIError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "analysis_resource_not_found"


class AnalysisConflictError(AnalysisAPIError):
    status_code = status.HTTP_409_CONFLICT
    code = "analysis_state_conflict"


class IdempotencyConflictError(AnalysisConflictError):
    code = "idempotency_key_conflict"


class RetryLimitExceededError(AnalysisConflictError):
    code = "retry_ceiling_reached"


class StageNotRetryableError(AnalysisConflictError):
    code = "analysis_stage_not_retryable"


def _raise_http(exc: AnalysisAPIError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.detail()) from exc


def _manifest_id(manifest: JsonObject | object) -> str:
    if isinstance(manifest, Mapping):
        value = manifest.get("id")
    else:
        value = getattr(manifest, "id", None)
    if not isinstance(value, str) or not value:
        raise RuntimeError("resolved model-set manifest has no string id")
    return value


def create_analysis_router(service: AnalysisService) -> APIRouter:
    """Build the analysis router around an injected repository or service.

    ``create_analysis_run`` is expected to enforce a unique idempotency key.
    Repeating an identical submission returns the original run. Reusing that
    key for a different library, manifest, or mode raises
    :class:`IdempotencyConflictError`.
    """

    router = APIRouter(tags=["analysis"])

    @router.post(
        "/libraries/{library_id}/analysis-runs",
        status_code=status.HTTP_202_ACCEPTED,
    )
    def create_run(library_id: str, body: CreateAnalysisRunRequest):
        manifest = service.resolve_model_set_manifest(
            body.manifest_name, body.manifest_version
        )
        if manifest is None:
            _raise_http(
                AnalysisNotFoundError(
                    "Model-set manifest was not found",
                    remediation="Choose an installed manifest name and version.",
                )
            )
        try:
            return service.create_analysis_run(
                library_id,
                _manifest_id(manifest),
                mode=body.mode,
                idempotency_key=body.idempotency_key,
            )
        except AnalysisAPIError as exc:
            _raise_http(exc)

    @router.get("/analysis-runs/{run_id}")
    def get_run(run_id: str):
        run = service.get_analysis_run(run_id)
        if run is None:
            _raise_http(AnalysisNotFoundError("Analysis run was not found"))
        return run

    @router.get("/analysis-runs/{run_id}/tracks")
    def get_run_tracks(run_id: str):
        if service.get_analysis_run(run_id) is None:
            _raise_http(AnalysisNotFoundError("Analysis run was not found"))
        return {"run_id": run_id, "tracks": list(service.list_run_tracks(run_id))}

    @router.post(
        "/analysis-runs/{run_id}/cancel",
        status_code=status.HTTP_202_ACCEPTED,
    )
    def cancel_run(
        run_id: str, body: CancelAnalysisRunRequest = CancelAnalysisRunRequest()
    ):
        try:
            run = service.request_cancellation(run_id, reason=body.reason)
        except AnalysisAPIError as exc:
            _raise_http(exc)
        if run is None:
            _raise_http(AnalysisNotFoundError("Analysis run was not found"))
        return run

    @router.post(
        "/analysis-stages/{stage_id}/retry",
        status_code=status.HTTP_202_ACCEPTED,
    )
    def retry_stage(
        stage_id: str, body: RetryAnalysisStageRequest = RetryAnalysisStageRequest()
    ):
        try:
            stage = service.retry_stage(stage_id, reason=body.reason)
        except AnalysisAPIError as exc:
            _raise_http(exc)
        if stage is None:
            _raise_http(AnalysisNotFoundError("Analysis stage was not found"))
        return stage

    @router.get("/tracks/{track_id}/analysis")
    def get_track_analysis(track_id: str, run_id: str | None = None):
        analysis = service.get_track_analysis(track_id, run_id=run_id)
        if analysis is None:
            _raise_http(AnalysisNotFoundError("Track analysis was not found"))
        return analysis

    @router.get("/tracks/{track_id}/neighbors")
    def get_track_neighbors(
        track_id: str,
        run_id: str | None = None,
        limit: Annotated[int, Query(ge=1, le=100)] = 25,
    ):
        neighbors = service.list_neighbors(track_id, run_id=run_id, limit=limit)
        if neighbors is None:
            _raise_http(AnalysisNotFoundError("Track was not found"))
        return {
            "track_id": track_id,
            "run_id": run_id,
            "limit": limit,
            "neighbors": list(neighbors),
        }

    return router


__all__ = [
    "AnalysisAPIError",
    "AnalysisConflictError",
    "AnalysisNotFoundError",
    "AnalysisService",
    "CancelAnalysisRunRequest",
    "CreateAnalysisRunRequest",
    "IdempotencyConflictError",
    "RetryAnalysisStageRequest",
    "RetryLimitExceededError",
    "StageNotRetryableError",
    "create_analysis_router",
]
