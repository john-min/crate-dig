"""Versioned HTTP contract for the local similarity evaluation lab."""

from __future__ import annotations

import sqlite3
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Header, HTTPException, Query, status
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, JsonValue

from cratedig_local_api.evaluation_service import DIMENSIONS, EvaluationService
from cratedig_local_api.repository import ConflictError, NotFoundError


Split = Literal["train", "validation", "test", "evaluation"]
JudgmentType = Literal["pair_rating", "triplet", "top_k"]
Decision = Literal[
    "accepted", "rejected", "similar", "not_similar",
    "a_closer", "b_closer", "tie", "skip",
]


class StrictModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid", str_strip_whitespace=True, populate_by_name=True
    )


class TrackSplit(StrictModel):
    track_id: str = Field(min_length=1)
    split: Split = "evaluation"


class EvaluationAnchorInput(StrictModel):
    track_id: str = Field(min_length=1)
    label: str = Field(default="", max_length=200)
    notes: str = Field(default="", max_length=2000)
    split: Split = "evaluation"
    held_out: bool = False
    candidate_track_ids: list[str] = Field(default_factory=list)


class EvaluationConfigurationInput(StrictModel):
    name: str = Field(min_length=1, max_length=128)
    version: str = Field(min_length=1, max_length=64)
    analysis_run_id: str | None = None
    channel: str = Field(default="global", min_length=1, max_length=128)
    parameters: dict[str, Any] = Field(default_factory=dict)


class CreateEvaluationSetRequest(StrictModel):
    library_id: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=128)
    version: str = Field(min_length=1, max_length=64)
    description: str = Field(default="", max_length=2000)
    purpose: str = Field(default="", max_length=1000)
    track_ids: list[str] = Field(default_factory=list)
    track_splits: list[TrackSplit] = Field(default_factory=list)
    anchors: list[EvaluationAnchorInput] = Field(default_factory=list)
    configurations: list[EvaluationConfigurationInput] = Field(default_factory=list)
    hidden_metadata_policy: dict[str, Any] = Field(
        default_factory=lambda: {"hide_during_primary_judgment": True}
    )
    split_policy: dict[str, Any] = Field(default_factory=dict)
    evaluator_ids: list[str] = Field(default_factory=list)


class CreateEvaluationRunRequest(StrictModel):
    configuration_ids: list[str] = Field(min_length=1)
    requested_k: int = Field(default=25, ge=1, le=100)
    idempotency_key: str = Field(min_length=8, max_length=128)


class CreateJudgmentRequest(StrictModel):
    evaluator_id: str = Field(default="local", min_length=1, max_length=200)
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=128)
    judgment_type: JudgmentType = "top_k"
    dimension: str = Field(
        default="overall",
        validation_alias=AliasChoices("dimension", "component_dimension"),
    )
    anchor_track_id: str = Field(min_length=1)
    candidate_a_track_id: str = Field(min_length=1)
    candidate_b_track_id: str | None = None
    configuration_id: str | None = None
    evaluation_run_id: str | None = None
    rank_position: int | None = Field(
        default=None, ge=1, validation_alias=AliasChoices("rank_position", "rank")
    )
    decision: Decision = Field(validation_alias=AliasChoices("decision", "judgment"))
    ordinal_rating: int | None = Field(default=None, ge=0, le=4)
    confidence: float | None = Field(default=None, ge=0, le=1)
    blind: bool = True
    notes: str = Field(default="", max_length=2000)


class MetricInput(StrictModel):
    configuration_id: str = Field(min_length=1)
    metric_name: Literal[
        "runtime_per_audio_minute",
        "peak_memory_bytes",
        "artifact_bytes_per_track",
        "failure_rate",
    ]
    dimension: str = "overall"
    k: int = Field(default=0, ge=0, le=100)
    value: float | None = None
    sample_count: int = Field(default=0, ge=0)
    details: dict[str, Any] = Field(default_factory=dict)


class SaveMetricsRequest(StrictModel):
    metrics: list[MetricInput] = Field(min_length=1)


class ExtensibleResponse(BaseModel):
    model_config = ConfigDict(extra="allow")


class EvaluationSetResponse(ExtensibleResponse):
    contract_version: Literal["evaluation.v1"]
    id: str
    library_id: str
    name: str
    version: str
    hidden_metadata: bool
    anchor_count: int | None = None
    track_count: int | None = None
    configuration_count: int | None = None
    configurations: list[dict[str, JsonValue]] = Field(default_factory=list)


class EvaluationSetListResponse(BaseModel):
    contract_version: Literal["evaluation.v1"]
    evaluation_sets: list[EvaluationSetResponse]


class EvaluationSetDetailResponse(BaseModel):
    contract_version: Literal["evaluation.v1"]
    evaluation_set: EvaluationSetResponse
    tracks: list[dict[str, JsonValue]]
    anchors: list[dict[str, JsonValue]]
    configurations: list[dict[str, JsonValue]]
    latest_run: dict[str, JsonValue] | None


class EvaluationRunResponse(ExtensibleResponse):
    contract_version: Literal["evaluation.v1"]
    id: str
    evaluation_set_id: str
    evaluation_set_version: str
    status: str
    requested_k: int
    configuration_ids: list[str]


class EvaluationRoundResponse(BaseModel):
    contract_version: Literal["evaluation.v1"]
    evaluation_set_id: str
    evaluation_set_version: str
    evaluation_run_id: str
    blind: bool
    anchor: dict[str, JsonValue]
    configurations: list[dict[str, JsonValue]]
    rankings: list[dict[str, JsonValue]]


class EvaluationNeighborsResponse(BaseModel):
    contract_version: Literal["evaluation.v1"]
    evaluation_set_id: str
    evaluation_run_id: str
    anchor_track_id: str
    configurations: list[dict[str, JsonValue]]


class JudgmentResponse(ExtensibleResponse):
    contract_version: Literal["evaluation.v1"]
    id: str
    evaluation_set_id: str
    evaluation_run_id: str | None
    evaluator_id: str
    judgment_type: JudgmentType
    dimension: str
    anchor_track_id: str
    candidate_a_track_id: str
    decision: Decision
    blind: bool


class MetricResponse(BaseModel):
    metric_name: str
    dimension: str
    k: int | None
    value: float | None
    sample_count: int
    details: dict[str, JsonValue]
    computed_at: str


class MetricsResponse(BaseModel):
    contract_version: Literal["evaluation.v1"]
    evaluation_run_id: str
    metrics: list[MetricResponse]


class EvaluationReportResponse(BaseModel):
    contract_version: Literal["evaluation.v1"]
    evaluation_set_id: str
    evaluation_set_version: str
    evaluation_run_id: str | None
    configurations: list[dict[str, JsonValue]]
    comparisons: list[dict[str, JsonValue]]


def _configuration_ids(values: list[str]) -> list[str]:
    """Accept repeated query params as well as one comma-separated value."""

    result: list[str] = []
    for value in values:
        result.extend(item.strip() for item in value.split(",") if item.strip())
    return list(dict.fromkeys(result))


def _raise_service_error(exc: Exception) -> None:
    if isinstance(exc, NotFoundError):
        code = "evaluation_resource_not_found"
        status_code = status.HTTP_404_NOT_FOUND
    elif isinstance(exc, ConflictError):
        code = "evaluation_state_conflict"
        status_code = status.HTTP_409_CONFLICT
    else:
        code = "evaluation_request_invalid"
        status_code = status.HTTP_400_BAD_REQUEST
    raise HTTPException(
        status_code=status_code,
        detail={"code": code, "message": str(exc), "retryable": False},
    ) from exc


def create_evaluation_router(service: EvaluationService) -> APIRouter:
    router = APIRouter(tags=["similarity-evaluation"])

    @router.get(
        "/evaluation-sets",
        response_model=EvaluationSetListResponse,
        response_model_exclude_unset=True,
    )
    def list_sets(library_id: str | None = None):
        return {
            "contract_version": "evaluation.v1",
            "evaluation_sets": service.list_evaluation_sets(library_id=library_id),
        }

    @router.post(
        "/evaluation-sets",
        status_code=status.HTTP_201_CREATED,
        response_model=EvaluationSetResponse,
        response_model_exclude_unset=True,
    )
    def create_set(body: CreateEvaluationSetRequest):
        try:
            return service.create_evaluation_set(body.model_dump(mode="json"))
        except (ValueError, NotFoundError, ConflictError) as exc:
            _raise_service_error(exc)

    @router.get(
        "/evaluation-sets/{evaluation_set_id}",
        response_model=EvaluationSetDetailResponse,
        response_model_exclude_unset=True,
    )
    def get_set(evaluation_set_id: str):
        result = service.get_evaluation_set(evaluation_set_id)
        if result is None:
            _raise_service_error(NotFoundError("evaluation set not found"))
        return {
            "contract_version": "evaluation.v1",
            "evaluation_set": {
                key: value
                for key, value in result.items()
                if key not in {"tracks", "anchors", "configurations", "latest_run"}
            },
            "tracks": result["tracks"],
            "anchors": result["anchors"],
            "configurations": result["configurations"],
            "latest_run": result["latest_run"],
        }

    @router.post(
        "/evaluation-sets/{evaluation_set_id}/runs",
        status_code=status.HTTP_201_CREATED,
        response_model=EvaluationRunResponse,
        response_model_exclude_unset=True,
    )
    def create_run(evaluation_set_id: str, body: CreateEvaluationRunRequest):
        try:
            return service.create_evaluation_run(
                evaluation_set_id,
                configuration_ids=body.configuration_ids,
                requested_k=body.requested_k,
                idempotency_key=body.idempotency_key,
            )
        except (ValueError, NotFoundError, ConflictError) as exc:
            _raise_service_error(exc)

    @router.get(
        "/evaluation-sets/{evaluation_set_id}/next",
        response_model=EvaluationRoundResponse,
        response_model_exclude_unset=True,
    )
    def get_next(
        evaluation_set_id: str,
        evaluator_id: str = "local",
        anchor_id: str | None = None,
        configuration_id: Annotated[list[str] | None, Query()] = None,
        configuration_ids: Annotated[list[str] | None, Query()] = None,
    ):
        try:
            result = service.get_next(
                evaluation_set_id,
                evaluator_id=evaluator_id,
                anchor_id=anchor_id,
                configuration_ids=_configuration_ids(
                    (configuration_id or []) + (configuration_ids or [])
                ),
            )
        except (ValueError, NotFoundError, ConflictError) as exc:
            _raise_service_error(exc)
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "code": "evaluation_item_unavailable",
                    "message": "No materialized evaluation item is available.",
                    "retryable": False,
                },
            )
        return result

    @router.get(
        "/evaluation-sets/{evaluation_set_id}/anchors/{anchor_track_id}/neighbors",
        response_model=EvaluationNeighborsResponse,
        response_model_exclude_unset=True,
    )
    def get_neighbors(
        evaluation_set_id: str,
        anchor_track_id: str,
        configuration_ids: Annotated[list[str] | None, Query()] = None,
    ):
        try:
            return service.list_neighbors(
                evaluation_set_id,
                anchor_track_id=anchor_track_id,
                configuration_ids=_configuration_ids(configuration_ids or []),
            )
        except (ValueError, NotFoundError, ConflictError) as exc:
            _raise_service_error(exc)

    @router.post(
        "/evaluation-sets/{evaluation_set_id}/judgments",
        status_code=status.HTTP_201_CREATED,
        response_model=JudgmentResponse,
        response_model_exclude_unset=True,
    )
    def create_judgment(
        evaluation_set_id: str,
        body: CreateJudgmentRequest,
        idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
    ):
        dimension = "production_space" if body.dimension == "production" else body.dimension
        if dimension not in DIMENSIONS:
            _raise_service_error(ValueError(f"unsupported judgment dimension: {dimension}"))
        payload = body.model_dump(mode="json")
        payload["dimension"] = dimension
        payload["idempotency_key"] = body.idempotency_key or idempotency_key
        if not payload["idempotency_key"] or len(payload["idempotency_key"]) < 8:
            _raise_service_error(
                ValueError("an idempotency key of at least 8 characters is required")
            )
        try:
            return service.save_judgment(evaluation_set_id, payload)
        except (ValueError, NotFoundError, ConflictError) as exc:
            _raise_service_error(exc)

    @router.post(
        "/evaluation-sets/{evaluation_set_id}/runs/{evaluation_run_id}/metrics",
        response_model=MetricsResponse,
        response_model_exclude_unset=True,
    )
    def save_metrics(
        evaluation_set_id: str,
        evaluation_run_id: str,
        body: SaveMetricsRequest,
    ):
        try:
            metrics = service.save_operational_metrics(
                evaluation_set_id,
                evaluation_run_id,
                [item.model_dump(mode="json") for item in body.metrics],
            )
        except (ValueError, NotFoundError, ConflictError, sqlite3.IntegrityError) as exc:
            _raise_service_error(exc)
        return {
            "contract_version": "evaluation.v1",
            "evaluation_run_id": evaluation_run_id,
            "metrics": metrics,
        }

    @router.get(
        "/evaluation-sets/{evaluation_set_id}/report",
        response_model=EvaluationReportResponse,
        response_model_exclude_unset=True,
    )
    def report(evaluation_set_id: str):
        try:
            return service.report(evaluation_set_id)
        except (ValueError, NotFoundError, ConflictError) as exc:
            _raise_service_error(exc)

    return router


__all__ = [
    "CreateEvaluationRunRequest",
    "CreateEvaluationSetRequest",
    "CreateJudgmentRequest",
    "EvaluationConfigurationInput",
    "SaveMetricsRequest",
    "create_evaluation_router",
]
