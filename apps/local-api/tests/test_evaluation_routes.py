from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from cratedig_local_api import db
from cratedig_local_api.evaluation_routes import create_evaluation_router
from cratedig_local_api.evaluation_service import EvaluationService
from cratedig_local_api.repository import Repository


@pytest.fixture
def evaluation_harness(tmp_path: Path):
    conn = db.connect(tmp_path / "evaluation.sqlite")
    repository = Repository(conn)
    library_id = db.get_or_create_library(conn, "Evaluation library", "folder")
    track_ids = [
        db.upsert_track(
            conn,
            library_id=library_id,
            title=f"Track {index}",
            artist=f"Artist {index}",
            location=str(tmp_path / f"track-{index}.wav"),
        )
        for index in range(4)
    ]
    manifest = repository.upsert_model_set_manifest(
        "effnet-eval",
        "1",
        {
            "name": "effnet-eval",
            "version": "1",
            "extractors": [{"name": "discogs-effnet", "version": "1"}],
        },
    )
    analysis_run = repository.create_analysis_run(
        library_id,
        manifest["id"],
        idempotency_key="analysis-evaluation-fixture",
    )
    now = db.utc_now()
    conn.executemany(
        """
        insert into similarity_neighbors (
          analysis_run_id, source_track_id, target_track_id, channel,
          rank, distance, score, explanation_json, created_at
        ) values (?, ?, ?, 'global', ?, ?, ?, ?, ?)
        """,
        [
            (
                analysis_run["id"],
                track_ids[0],
                candidate,
                rank,
                1 - score,
                score,
                '{"components":{"global_style":%s},"reason_codes":["similar_global_style"]}'
                % score,
                now,
            )
            for rank, (candidate, score) in enumerate(
                zip(track_ids[1:], (0.93, 0.81, 0.72), strict=True), start=1
            )
        ],
    )
    conn.commit()
    app = FastAPI()
    app.include_router(create_evaluation_router(EvaluationService(repository)))
    with TestClient(app) as client:
        yield client, conn, library_id, track_ids, analysis_run["id"]
    conn.close()


def create_set(client: TestClient, library_id: str, track_ids: list[str], run_id: str):
    response = client.post(
        "/evaluation-sets",
        json={
            "library_id": library_id,
            "name": "Jeff pilot",
            "version": "2026-08-25",
            "description": "Blind retrieval pilot",
            "purpose": "Compare the first-pass global embeddings",
            "track_ids": track_ids,
            "track_splits": [{"track_id": track_ids[0], "split": "test"}],
            "anchors": [
                {
                    "track_id": track_ids[0],
                    "label": "Dry rolling anchor",
                    "split": "test",
                    "held_out": True,
                }
            ],
            "configurations": [
                {
                    "name": "discogs-effnet-multi",
                    "version": "1",
                    "analysis_run_id": run_id,
                    "channel": "global",
                }
            ],
            "evaluator_ids": ["local"],
            "hidden_metadata_policy": {"hide_during_primary_judgment": True},
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_evaluation_set_and_materialized_blind_round_contract(evaluation_harness):
    client, _conn, library_id, track_ids, analysis_run_id = evaluation_harness
    created = create_set(client, library_id, track_ids, analysis_run_id)
    set_id = created["id"]
    configuration_id = created["configurations"][0]["id"]

    listed = client.get("/evaluation-sets")
    detail = client.get(f"/evaluation-sets/{set_id}")
    run = client.post(
        f"/evaluation-sets/{set_id}/runs",
        json={
            "configuration_ids": [configuration_id],
            "requested_k": 2,
            "idempotency_key": "evaluation-run-001",
        },
    )
    replay = client.post(
        f"/evaluation-sets/{set_id}/runs",
        json={
            "configuration_ids": [configuration_id],
            "requested_k": 2,
            "idempotency_key": "evaluation-run-001",
        },
    )
    round_response = client.get(
        f"/evaluation-sets/{set_id}/next",
        params=[("anchor_id", track_ids[0]), ("configuration_id", configuration_id)],
    )

    assert listed.status_code == 200
    assert listed.json()["contract_version"] == "evaluation.v1"
    assert listed.json()["evaluation_sets"][0]["anchor_count"] == 1
    assert detail.status_code == 200
    assert detail.json()["evaluation_set"]["hidden_metadata"] is True
    assert detail.json()["anchors"][0]["track"]["id"] == track_ids[0]
    assert run.status_code == 201
    assert replay.json()["id"] == run.json()["id"]
    assert round_response.status_code == 200, round_response.text
    round_body = round_response.json()
    assert round_body["blind"] is True
    assert "title" not in round_body["anchor"]
    assert len(round_body["rankings"][0]["candidates"]) == 2
    candidate = round_body["rankings"][0]["candidates"][0]
    assert candidate["target_track_id"] == track_ids[1]
    assert "title" not in candidate["track"]
    assert candidate["provenance"]["analysis_run_id"] == analysis_run_id


def test_ui_judgment_aliases_idempotency_metrics_and_report(evaluation_harness):
    client, conn, library_id, track_ids, analysis_run_id = evaluation_harness
    created = create_set(client, library_id, track_ids, analysis_run_id)
    set_id = created["id"]
    configuration_id = created["configurations"][0]["id"]
    run = client.post(
        f"/evaluation-sets/{set_id}/runs",
        json={
            "configuration_ids": [configuration_id],
            "requested_k": 3,
            "idempotency_key": "evaluation-run-002",
        },
    ).json()
    payload = {
        "anchor_track_id": track_ids[0],
        "candidate_a_track_id": track_ids[1],
        "configuration_id": configuration_id,
        "component_dimension": "overall",
        "judgment": "similar",
        "rank": 1,
        "blind": True,
        "ordinal_rating": 4,
        "notes": "Same drum and bass world",
    }
    first = client.post(
        f"/evaluation-sets/{set_id}/judgments",
        json=payload,
        headers={"Idempotency-Key": "judgment-001"},
    )
    replay = client.post(
        f"/evaluation-sets/{set_id}/judgments",
        json=payload,
        headers={"Idempotency-Key": "judgment-001"},
    )
    conflict = client.post(
        f"/evaluation-sets/{set_id}/judgments",
        json={**payload, "judgment": "not_similar"},
        headers={"Idempotency-Key": "judgment-001"},
    )
    metrics = client.post(
        f"/evaluation-sets/{set_id}/runs/{run['id']}/metrics",
        json={
            "metrics": [
                {
                    "configuration_id": configuration_id,
                    "metric_name": "runtime_per_audio_minute",
                    "value": 0.42,
                    "sample_count": 4,
                }
            ]
        },
    )
    report = client.get(f"/evaluation-sets/{set_id}/report")

    assert first.status_code == 201, first.text
    assert first.json()["evaluation_run_id"] == run["id"]
    assert replay.json()["id"] == first.json()["id"]
    assert conflict.status_code == 409
    assert metrics.status_code == 200, metrics.text
    assert report.status_code == 200, report.text
    summary = report.json()["configurations"][0]
    assert summary["accepted_at_10"] == 1.0
    assert summary["ndcg_at_10"] == 1.0
    assert summary["runtime_per_audio_minute"] == 0.42
    assert summary["judgment_count"] == 4
    assert conn.execute("select count(*) from similarity_judgments").fetchone()[0] == 1


def test_create_set_rejects_cross_library_tracks(evaluation_harness, tmp_path: Path):
    client, conn, library_id, track_ids, analysis_run_id = evaluation_harness
    other_library = db.get_or_create_library(conn, "Other", "folder")
    other_track = db.upsert_track(
        conn,
        library_id=other_library,
        title="Other",
        artist="Elsewhere",
        location=str(tmp_path / "other.wav"),
    )
    response = client.post(
        "/evaluation-sets",
        json={
            "library_id": library_id,
            "name": "Invalid",
            "version": "1",
            "track_ids": [*track_ids, other_track],
            "anchors": [{"track_id": track_ids[0]}],
            "configurations": [
                {
                    "name": "effnet",
                    "version": "1",
                    "analysis_run_id": analysis_run_id,
                }
            ],
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "evaluation_request_invalid"


@pytest.mark.parametrize("remaining", [0, 1])
def test_evaluation_run_fails_closed_when_materialized_candidates_are_incomplete(
    evaluation_harness, remaining: int
):
    client, conn, library_id, track_ids, analysis_run_id = evaluation_harness
    created = create_set(client, library_id, track_ids, analysis_run_id)
    set_id = created["id"]
    configuration_id = created["configurations"][0]["id"]
    conn.execute(
        """
        delete from similarity_neighbors
        where analysis_run_id = ? and source_track_id = ? and rank > ?
        """,
        (analysis_run_id, track_ids[0], remaining),
    )
    conn.commit()

    response = client.post(
        f"/evaluation-sets/{set_id}/runs",
        json={
            "configuration_ids": [configuration_id],
            "requested_k": 2,
            "idempotency_key": f"incomplete-evaluation-{remaining}",
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "evaluation_state_conflict"
    assert "incomplete similarity candidates" in response.json()["detail"]["message"]
    assert conn.execute("select count(*) from evaluation_runs").fetchone()[0] == 0


def test_evaluation_run_replay_rejects_a_damaged_frozen_ranking(evaluation_harness):
    client, conn, library_id, track_ids, analysis_run_id = evaluation_harness
    created = create_set(client, library_id, track_ids, analysis_run_id)
    set_id = created["id"]
    configuration_id = created["configurations"][0]["id"]
    payload = {
        "configuration_ids": [configuration_id],
        "requested_k": 2,
        "idempotency_key": "evaluation-damaged-replay",
    }
    first = client.post(f"/evaluation-sets/{set_id}/runs", json=payload)
    assert first.status_code == 201
    conn.execute(
        """
        delete from evaluation_neighbor_results
        where evaluation_run_id = ? and rank = 2
        """,
        (first.json()["id"],),
    )
    conn.commit()

    replay = client.post(f"/evaluation-sets/{set_id}/runs", json=payload)
    assert replay.status_code == 409
    assert "incomplete frozen candidates" in replay.json()["detail"]["message"]
