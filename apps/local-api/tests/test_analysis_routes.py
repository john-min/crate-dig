from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from cratedig_local_api.analysis_routes import (
    AnalysisConflictError,
    AnalysisNotFoundError,
    IdempotencyConflictError,
    RetryLimitExceededError,
    StageNotRetryableError,
    create_analysis_router,
)


@dataclass(frozen=True)
class Manifest:
    id: str
    name: str
    version: str


class FakeAnalysisService:
    def __init__(self) -> None:
        self.manifests = {
            ("local-fast", "1"): Manifest("manifest-1", "local-fast", "1")
        }
        self.libraries = {"library-1"}
        self.runs: dict[str, dict[str, Any]] = {
            "run-1": {
                "id": "run-1",
                "library_id": "library-1",
                "manifest_id": "manifest-1",
                "status": "running",
            }
        }
        self.run_tracks = {
            "run-1": [{"track_id": "track-1", "status": "ready_fast"}]
        }
        self.submissions: dict[str, tuple[tuple[str, str, str], dict[str, Any]]] = {}
        self.create_calls = 0
        self.stages = {
            "stage-1": {"id": "stage-1", "status": "failed", "attempt_count": 1},
            "at-limit": {"id": "at-limit", "status": "failed", "attempt_count": 3},
            "terminal": {"id": "terminal", "status": "failed", "attempt_count": 1},
        }
        self.track_analysis = {
            "track-1": {"track_id": "track-1", "state": "ready_fast"}
        }
        self.neighbors = {
            "track-1": [
                {
                    "track_id": "track-2",
                    "rank": 1,
                    "score": 0.91,
                    "components": {"global_style": 0.91},
                    "reason_codes": ["similar_global_style"],
                    "manifest_name": "local-fast",
                    "manifest_version": "1",
                }
            ]
        }

    def resolve_model_set_manifest(self, name: str, version: str):
        return self.manifests.get((name, version))

    def create_analysis_run(
        self,
        library_id: str,
        manifest_id: str,
        *,
        mode: str,
        idempotency_key: str,
    ):
        if library_id not in self.libraries:
            raise AnalysisNotFoundError("Library was not found")
        signature = (library_id, manifest_id, mode)
        existing = self.submissions.get(idempotency_key)
        if existing:
            if existing[0] != signature:
                raise IdempotencyConflictError(
                    "Idempotency key was already used for another submission"
                )
            return existing[1]
        self.create_calls += 1
        run = {
            "id": f"created-{self.create_calls}",
            "library_id": library_id,
            "manifest_id": manifest_id,
            "mode": mode,
            "status": "queued",
        }
        self.runs[run["id"]] = run
        self.submissions[idempotency_key] = (signature, run)
        return run

    def get_analysis_run(self, run_id: str):
        return self.runs.get(run_id)

    def list_run_tracks(self, run_id: str):
        return self.run_tracks.get(run_id, [])

    def request_cancellation(self, run_id: str, *, reason: str):
        run = self.runs.get(run_id)
        if run is None:
            return None
        if run["status"] in {"completed", "failed"}:
            raise AnalysisConflictError("A terminal analysis run cannot be cancelled")
        run = {**run, "status": "cancelling", "reason_code": reason}
        self.runs[run_id] = run
        return run

    def retry_stage(self, stage_id: str, *, reason: str | None = None):
        stage = self.stages.get(stage_id)
        if stage is None:
            return None
        if stage_id == "at-limit":
            raise RetryLimitExceededError("Stage reached its retry ceiling")
        if stage_id == "terminal":
            raise StageNotRetryableError("Stage failure is not retryable")
        stage = {
            **stage,
            "status": "queued",
            "attempt_count": stage["attempt_count"] + 1,
            "retry_reason": reason,
        }
        self.stages[stage_id] = stage
        return stage

    def get_track_analysis(self, track_id: str, *, run_id: str | None = None):
        value = self.track_analysis.get(track_id)
        if value is None:
            return None
        return {**value, "run_id": run_id}

    def list_neighbors(
        self, track_id: str, *, run_id: str | None = None, limit: int = 25
    ):
        values = self.neighbors.get(track_id)
        if values is None:
            return None
        return values[:limit]


@pytest.fixture
def service() -> FakeAnalysisService:
    return FakeAnalysisService()


@pytest.fixture
def client(service: FakeAnalysisService):
    app = FastAPI()
    app.include_router(create_analysis_router(service))
    with TestClient(app) as test_client:
        yield test_client


def create_payload(**overrides: Any) -> dict[str, Any]:
    value = {
        "manifest_name": "local-fast",
        "manifest_version": "1",
        "mode": "fast",
        "idempotency_key": "submission-001",
    }
    value.update(overrides)
    return value


def assert_error(response, status_code: int, code: str) -> None:
    assert response.status_code == status_code
    assert response.json()["detail"]["code"] == code
    assert response.json()["detail"]["retryable"] is False


def test_create_run_is_asynchronous_and_idempotent(
    client: TestClient, service: FakeAnalysisService
):
    first = client.post("/libraries/library-1/analysis-runs", json=create_payload())
    replay = client.post("/libraries/library-1/analysis-runs", json=create_payload())

    assert first.status_code == 202
    assert first.json()["status"] == "queued"
    assert replay.status_code == 202
    assert replay.json()["id"] == first.json()["id"]
    assert service.create_calls == 1


def test_create_run_maps_missing_resources_and_idempotency_conflicts(
    client: TestClient,
):
    missing_manifest = client.post(
        "/libraries/library-1/analysis-runs",
        json=create_payload(manifest_version="missing"),
    )
    assert_error(missing_manifest, 404, "analysis_resource_not_found")

    missing_library = client.post(
        "/libraries/missing/analysis-runs",
        json=create_payload(idempotency_key="missing-library"),
    )
    assert_error(missing_library, 404, "analysis_resource_not_found")

    first = client.post("/libraries/library-1/analysis-runs", json=create_payload())
    assert first.status_code == 202
    conflict = client.post(
        "/libraries/library-1/analysis-runs",
        json=create_payload(mode="deep"),
    )
    assert_error(conflict, 409, "idempotency_key_conflict")


@pytest.mark.parametrize(
    "changes",
    [
        {"manifest_name": ""},
        {"mode": "turbo"},
        {"idempotency_key": "short"},
        {"unexpected": True},
    ],
)
def test_create_run_validates_request_body(client: TestClient, changes: dict[str, Any]):
    response = client.post(
        "/libraries/library-1/analysis-runs", json=create_payload(**changes)
    )
    assert response.status_code == 422


def test_reads_runs_and_track_progress(client: TestClient):
    run = client.get("/analysis-runs/run-1")
    tracks = client.get("/analysis-runs/run-1/tracks")

    assert run.status_code == 200
    assert run.json()["status"] == "running"
    assert tracks.status_code == 200
    assert tracks.json()["tracks"][0]["status"] == "ready_fast"

    assert_error(
        client.get("/analysis-runs/missing"), 404, "analysis_resource_not_found"
    )
    assert_error(
        client.get("/analysis-runs/missing/tracks"),
        404,
        "analysis_resource_not_found",
    )


def test_cancel_is_cooperative_and_rejects_terminal_runs(
    client: TestClient, service: FakeAnalysisService
):
    cancelled = client.post("/analysis-runs/run-1/cancel")
    assert cancelled.status_code == 202
    assert cancelled.json()["status"] == "cancelling"
    assert cancelled.json()["reason_code"] == "cancelled_by_user"

    service.runs["completed"] = {"id": "completed", "status": "completed"}
    conflict = client.post("/analysis-runs/completed/cancel")
    assert_error(conflict, 409, "analysis_state_conflict")
    assert_error(
        client.post("/analysis-runs/missing/cancel"),
        404,
        "analysis_resource_not_found",
    )


def test_retry_maps_success_missing_ceiling_and_terminal_failures(client: TestClient):
    retried = client.post(
        "/analysis-stages/stage-1/retry", json={"reason": "File restored"}
    )
    assert retried.status_code == 202
    assert retried.json()["status"] == "queued"
    assert retried.json()["attempt_count"] == 2

    assert_error(
        client.post("/analysis-stages/missing/retry"),
        404,
        "analysis_resource_not_found",
    )
    assert_error(
        client.post("/analysis-stages/at-limit/retry"),
        409,
        "retry_ceiling_reached",
    )
    assert_error(
        client.post("/analysis-stages/terminal/retry"),
        409,
        "analysis_stage_not_retryable",
    )


def test_track_analysis_and_neighbors_include_query_context(client: TestClient):
    analysis = client.get("/tracks/track-1/analysis?run_id=run-1")
    neighbors = client.get("/tracks/track-1/neighbors?run_id=run-1&limit=1")

    assert analysis.status_code == 200
    assert analysis.json()["run_id"] == "run-1"
    assert neighbors.status_code == 200
    assert neighbors.json()["limit"] == 1
    assert neighbors.json()["neighbors"][0]["reason_codes"] == [
        "similar_global_style"
    ]

    assert_error(
        client.get("/tracks/missing/analysis"),
        404,
        "analysis_resource_not_found",
    )
    assert_error(
        client.get("/tracks/missing/neighbors"),
        404,
        "analysis_resource_not_found",
    )
    assert client.get("/tracks/track-1/neighbors?limit=0").status_code == 422
    assert client.get("/tracks/track-1/neighbors?limit=101").status_code == 422
