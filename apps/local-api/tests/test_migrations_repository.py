from __future__ import annotations

import sqlite3
import threading
from pathlib import Path

import pytest

from cratedig_local_api import db
from cratedig_local_api.migrations import LATEST_SCHEMA_VERSION
from cratedig_local_api.repository import (
    ConflictError,
    Repository,
    RetryLimitError,
)


def seed_library(conn: sqlite3.Connection, tmp_path: Path, count: int = 2) -> tuple[str, list[str]]:
    library_id = db.get_or_create_library(conn, "Test library", "folder")
    track_ids = [
        db.upsert_track(
            conn,
            library_id=library_id,
            title=f"Track {index}",
            artist="Artist",
            location=str(tmp_path / f"track-{index}.wav"),
        )
        for index in range(count)
    ]
    return library_id, track_ids


def seed_manifest(repository: Repository) -> dict:
    return repository.upsert_model_set_manifest(
        "fast-local",
        "1.0.0",
        {
            "name": "fast-local",
            "version": "1.0.0",
            "extractors": [{"name": "librosa", "version": "2.0.0"}],
        },
    )


def test_connect_configures_sqlite_and_migrates_an_existing_database(tmp_path: Path):
    path = tmp_path / "existing.sqlite"
    legacy = sqlite3.connect(path)
    legacy.executescript(
        """
        create table libraries (
          id text primary key, name text not null, source text not null,
          created_at text not null, updated_at text not null
        );
        create table tracks (
          id text primary key,
          library_id text not null references libraries (id) on delete cascade,
          title text not null default '', artist text not null default '',
          album text not null default '', duration_sec real,
          location text not null default '', location_kind text not null default 'file',
          created_at text not null, unique (library_id, location)
        );
        insert into libraries values ('library-1', 'Existing', 'folder', 'now', 'now');
        insert into tracks values (
          'track-1', 'library-1', 'Before migrations', 'Artist', '', null,
          '/music/before.wav', 'file', 'now'
        );
        """
    )
    legacy.close()

    conn = db.connect(path)
    try:
        assert conn.execute("pragma user_version").fetchone()[0] == LATEST_SCHEMA_VERSION
        assert conn.execute("pragma journal_mode").fetchone()[0] == "wal"
        assert conn.execute("pragma foreign_keys").fetchone()[0] == 1
        assert conn.execute("pragma busy_timeout").fetchone()[0] == 5000
        tables = {
            row["name"]
            for row in conn.execute("select name from sqlite_master where type = 'table'")
        }
        assert {
            "analysis_runs",
            "analysis_stages",
            "track_features",
            "track_embeddings",
            "model_set_manifests",
            "similarity_neighbors",
            "projection_artifacts",
            "evaluation_sets",
            "evaluation_anchors",
            "evaluation_set_tracks",
            "evaluation_configurations",
            "evaluation_runs",
            "evaluation_neighbor_results",
            "evaluation_run_metrics",
            "similarity_judgments",
            "track_metadata_sources",
            "clusters",
            "cluster_members",
        }.issubset(tables)
        assert conn.execute("select title from tracks where id = 'track-1'").fetchone()[0] == "Before migrations"
        metadata = conn.execute(
            "select bpm, musical_key, bpm_source, key_source from tracks where id = 'track-1'"
        ).fetchone()
        assert tuple(metadata) == (None, "", "", "")
    finally:
        conn.close()


def test_manifest_identity_and_analysis_submission_are_idempotent(tmp_path: Path):
    conn = db.connect(tmp_path / "local.sqlite")
    repository = Repository(conn)
    library_id, track_ids = seed_library(conn, tmp_path, count=2)
    manifest = seed_manifest(repository)

    same_manifest = seed_manifest(repository)
    assert same_manifest["id"] == manifest["id"]
    with pytest.raises(ConflictError):
        repository.upsert_model_set_manifest(
            "fast-local", "1.0.0", {"name": "changed", "version": "1.0.0"}
        )

    definitions = [
        {
            "stage_name": "fast_features",
            "extractor_name": "librosa",
            "extractor_version": "2.0.0",
        },
        {
            "stage_name": "global_embedding",
            "extractor_name": "discogs-effnet",
            "extractor_version": "1.0.0",
        },
    ]
    first = repository.create_analysis_run(
        library_id,
        manifest["id"],
        stages=definitions,
        idempotency_key="request-123",
    )
    second = repository.create_analysis_run(
        library_id,
        manifest["id"],
        stages=definitions,
        idempotency_key="request-123",
    )

    assert first["id"] == second["id"]
    assert first["manifest_json"]["extractors"][0]["name"] == "librosa"
    stages = repository.list_run_stages(first["id"])
    assert len(stages) == len(track_ids) * len(definitions)
    assert {(stage["extractor_name"], stage["extractor_version"]) for stage in stages} == {
        ("librosa", "2.0.0"),
        ("discogs-effnet", "1.0.0"),
    }
    assert len(repository.list_run_tracks(first["id"])) == 2

    other_library = db.get_or_create_library(conn, "Other library", "folder")
    with pytest.raises(ConflictError):
        repository.create_analysis_run(
            other_library,
            manifest["id"],
            stages=definitions,
            idempotency_key="request-123",
        )
    conn.close()


def test_manifest_upsert_repairs_legacy_hash_for_structurally_equal_json(tmp_path: Path):
    conn = db.connect(tmp_path / "legacy-manifest.sqlite")
    repository = Repository(conn)
    manifest_document = {
        "name": "fast-local",
        "version": "1.0.0",
        "extractors": [{"name": "librosa", "version": "2.0.0"}],
    }
    manifest = repository.upsert_model_set_manifest(
        "fast-local", "1.0.0", manifest_document
    )
    conn.execute(
        "update model_set_manifests set manifest_hash = ? where id = ?",
        ("legacy-digest", manifest["id"]),
    )
    conn.commit()

    repaired = repository.upsert_model_set_manifest(
        "fast-local", "1.0.0", manifest_document
    )

    assert repaired["id"] == manifest["id"]
    assert repaired["manifest_hash"] != "legacy-digest"
    assert repaired["manifest_json"] == manifest_document
    conn.close()


def test_durable_cache_reuses_identical_content_and_invalidates_manifest_changes(
    tmp_path: Path,
):
    conn = db.connect(tmp_path / "cache.sqlite")
    repository = Repository(conn)
    library_id = db.get_or_create_library(conn, "Cache library", "folder")
    content_hash = "a" * 64
    track_ids = [
        db.upsert_track(
            conn,
            library_id=library_id,
            title=f"Duplicate {index}",
            artist="Artist",
            location=str(tmp_path / f"duplicate-{index}.wav"),
            audio_content_hash=content_hash,
        )
        for index in range(2)
    ]
    manifest = seed_manifest(repository)
    first_run = repository.create_analysis_run(
        library_id,
        manifest["id"],
        idempotency_key="cache-first-run",
    )
    claimed = repository.claim_next_stage(worker_id="cache-worker", run_id=first_run["id"])
    assert claimed is not None
    repository.complete_stage(
        claimed["id"],
        worker_id="cache-worker",
        features=[{"feature_key": "tempo:track", "value": 124.0}],
        embeddings=[
            {
                "embedding_key": "retrieval:track",
                "embedding": [0.1, 0.2],
                "dimensions": 2,
                "pooling_strategy": "mean-v1",
            }
        ],
    )

    cached_stage = repository.claim_next_stage(
        worker_id="cache-worker", run_id=first_run["id"]
    )
    assert cached_stage is not None
    assert cached_stage["cache_source_stage_id"] == claimed["id"]
    repository.complete_stage_from_cache(
        cached_stage["id"],
        cached_stage["cache_source_stage_id"],
        worker_id="cache-worker",
    )
    assert repository.claim_next_stage(
        worker_id="cache-worker", run_id=first_run["id"]
    ) is None
    first_stages = repository.list_run_stages(first_run["id"])
    assert all(stage["status"] == "succeeded" for stage in first_stages)
    assert sum(stage["cache_hit_from_stage_id"] is not None for stage in first_stages) == 1
    hit_stage = next(
        stage for stage in first_stages if stage["cache_hit_from_stage_id"] is not None
    )
    copied = repository.get_track_analysis(
        hit_stage["track_id"], run_id=first_run["id"]
    )
    assert copied is not None and copied["embeddings"][0]["dimensions"] == 2

    second_run = repository.create_analysis_run(
        library_id,
        manifest["id"],
        idempotency_key="cache-second-run",
    )
    for _ in range(2):
        cached_stage = repository.claim_next_stage(
            worker_id="cache-worker", run_id=second_run["id"]
        )
        assert cached_stage is not None
        assert cached_stage["cache_source_stage_id"] is not None
        repository.complete_stage_from_cache(
            cached_stage["id"],
            cached_stage["cache_source_stage_id"],
            worker_id="cache-worker",
        )
    assert repository.claim_next_stage(
        worker_id="cache-worker", run_id=second_run["id"]
    ) is None
    assert all(
        stage["cache_hit_from_stage_id"] is not None
        for stage in repository.list_run_stages(second_run["id"])
    )

    changed_manifest = repository.upsert_model_set_manifest(
        "fast-local",
        "2.0.0",
        {
            "name": "fast-local",
            "version": "2.0.0",
            "extractors": [{"name": "librosa", "version": "3.0.0"}],
        },
    )
    changed_run = repository.create_analysis_run(
        library_id,
        changed_manifest["id"],
        idempotency_key="cache-changed-manifest",
    )
    assert repository.claim_next_stage(
        worker_id="cache-worker", run_id=changed_run["id"]
    ) is not None
    conn.close()


def test_cache_identity_uses_manifest_window_plan_when_extractor_has_no_default():
    common = {
        "required_extractors": [
            {
                "name": "challenger",
                "version": "1",
                "default_window_plan_version": None,
            }
        ]
    }
    first = Repository._cache_key(
        audio_content_hash="a" * 64,
        manifest={**common, "window_plan_version": "sampled-v1"},
        extractor_name="challenger",
        extractor_version="1",
    )
    second = Repository._cache_key(
        audio_content_hash="a" * 64,
        manifest={**common, "window_plan_version": "full-overlap-v1"},
        extractor_name="challenger",
        extractor_version="1",
    )

    assert first != second


def test_cache_identity_ignores_unrelated_sibling_extractor_changes():
    base = {
        "window_plan_version": "sampled-v1",
        "required_extractors": [
            {"name": "stable", "version": "1", "configuration_sha256": "a" * 64},
            {"name": "sibling", "version": "1", "configuration_sha256": "b" * 64},
        ],
    }
    changed = {
        **base,
        "required_extractors": [
            base["required_extractors"][0],
            {"name": "sibling", "version": "2", "configuration_sha256": "c" * 64},
        ],
    }

    first = Repository._cache_key(
        audio_content_hash="a" * 64,
        manifest=base,
        extractor_name="stable",
        extractor_version="1",
    )
    second = Repository._cache_key(
        audio_content_hash="a" * 64,
        manifest=changed,
        extractor_name="stable",
        extractor_version="1",
    )

    assert first == second


def test_shared_connection_lock_prevents_unrelated_commit(tmp_path: Path):
    conn = db.connect(tmp_path / "serialized.sqlite")
    connection_lock = threading.RLock()
    repository = Repository(conn, connection_lock=connection_lock)
    transaction_open = threading.Event()
    release_transaction = threading.Event()
    helper_finished = threading.Event()

    def rolled_back_write() -> None:
        try:
            with repository._write():
                conn.execute(
                    "insert into libraries values ('outer', 'Outer', 'test', 'now', 'now')"
                )
                transaction_open.set()
                assert release_transaction.wait(timeout=2)
                raise RuntimeError("force rollback")
        except RuntimeError:
            pass

    def unrelated_helper() -> None:
        assert transaction_open.wait(timeout=2)
        with repository.synchronized():
            db.get_or_create_library(conn, "Helper", "test")
        helper_finished.set()

    first = threading.Thread(target=rolled_back_write)
    second = threading.Thread(target=unrelated_helper)
    first.start()
    assert transaction_open.wait(timeout=2)
    second.start()
    assert not helper_finished.wait(timeout=0.1)
    release_transaction.set()
    first.join(timeout=2)
    second.join(timeout=2)

    assert conn.execute("select 1 from libraries where id = 'outer'").fetchone() is None
    assert conn.execute(
        "select 1 from libraries where name = 'Helper'"
    ).fetchone() is not None
    conn.close()


def test_claim_is_atomic_across_connections_and_supports_leases(tmp_path: Path):
    path = tmp_path / "local.sqlite"
    first_conn = db.connect(path)
    repository = Repository(first_conn)
    library_id, _ = seed_library(first_conn, tmp_path, count=2)
    manifest = seed_manifest(repository)
    run = repository.create_analysis_run(
        library_id,
        manifest["id"],
        stages=[{"name": "librosa", "version": "2.0.0"}],
    )
    second_conn = db.connect(path)
    other = Repository(second_conn)

    first = repository.claim_next_stage(worker_id="worker-a", run_id=run["id"])
    second = other.claim_next_stage(worker_id="worker-b", run_id=run["id"])

    assert first is not None and second is not None
    assert first["id"] != second["id"]
    assert first["status"] == second["status"] == "running"
    assert first["attempt_count"] == second["attempt_count"] == 1
    assert first["track_location"].endswith(".wav")
    assert first["extractor_name"] == "librosa"
    assert first["manifest_json"]["name"] == "fast-local"
    assert repository.renew_stage_lease(first["id"], "worker-a", lease_seconds=30)
    assert not other.renew_stage_lease(first["id"], "worker-b")
    assert repository.release_stage(first["id"], "worker-a")
    reclaimed = other.claim_next_stage(worker_id="worker-b", run_id=run["id"])
    assert reclaimed is not None
    assert reclaimed["id"] == first["id"]
    assert reclaimed["attempt_count"] == 1
    first_conn.close()
    second_conn.close()


def test_completion_persists_native_embedding_and_track_analysis(tmp_path: Path):
    conn = db.connect(tmp_path / "local.sqlite")
    repository = Repository(conn)
    library_id, track_ids = seed_library(conn, tmp_path, count=2)
    manifest = seed_manifest(repository)
    run = repository.create_analysis_run(
        library_id,
        manifest["id"],
        stages=[{"name": "librosa", "version": "2.0.0"}],
    )
    stage = repository.claim_next_stage(worker_id="worker", run_id=run["id"])
    assert stage is not None

    completed = repository.complete_stage(
        stage["id"],
        worker_id="worker",
        features=[{"name": "tempo_bpm", "value": 124.0, "unit": "bpm", "confidence": 0.8}],
        embeddings=[{"name": "global", "values": [0.1, 0.2, 0.3], "model_name": "librosa"}],
    )

    assert completed["status"] == "succeeded"
    analysis = repository.get_track_analysis(stage["track_id"], run_id=run["id"])
    assert analysis is not None
    assert analysis["features"][0]["value_json"] == 124.0
    assert analysis["embeddings"][0]["dimensions"] == 3
    assert analysis["embeddings"][0]["dtype"] == "float32-le"
    assert analysis["embeddings"][0]["byte_length"] == 12

    now = db.utc_now()
    conn.execute(
        """
        insert into similarity_neighbors (
          analysis_run_id, source_track_id, target_track_id, channel, rank,
          distance, score, explanation_json, created_at
        ) values (?, ?, ?, 'global', 1, 0.1, 0.9, '{"reason":"same palette"}', ?)
        """,
        (run["id"], track_ids[0], track_ids[1], now),
    )
    neighbors = repository.list_neighbors(track_ids[0], run_id=run["id"])
    assert neighbors[0]["target_track_id"] == track_ids[1]
    assert neighbors[0]["explanation_json"] == {"reason": "same palette"}
    conn.close()


def test_retry_ceiling_and_cancellation_are_durable(tmp_path: Path):
    conn = db.connect(tmp_path / "local.sqlite")
    repository = Repository(conn)
    library_id, _ = seed_library(conn, tmp_path, count=1)
    manifest = seed_manifest(repository)
    run = repository.create_analysis_run(
        library_id,
        manifest["id"],
        stages=[{"name": "librosa", "version": "2.0.0", "max_attempts": 2}],
        idempotency_key="retry-run",
    )

    first = repository.claim_next_stage(worker_id="worker", run_id=run["id"])
    assert first is not None
    failed = repository.fail_stage(
        first["id"], "decoder_timeout", "decoder timed out", retryable=True, worker_id="worker"
    )
    assert failed["status"] == "failed"
    assert failed["retryable"] is True
    queued = repository.retry_stage(first["id"])
    assert queued["status"] == "queued"
    second = repository.claim_next_stage(worker_id="worker", run_id=run["id"])
    assert second is not None and second["attempt_count"] == 2
    exhausted = repository.fail_stage(
        second["id"], "decoder_timeout", "still timed out", retryable=True, worker_id="worker"
    )
    assert exhausted["retryable"] is False
    assert repository.get_analysis_run(run["id"])["status"] == "failed"
    with pytest.raises(RetryLimitError):
        repository.retry_stage(second["id"])

    cancel_run = repository.create_analysis_run(
        library_id,
        manifest["id"],
        stages=[{"name": "librosa", "version": "2.0.0"}],
        idempotency_key="cancel-run",
    )
    claimed = repository.claim_next_stage(worker_id="worker", run_id=cancel_run["id"])
    assert claimed is not None
    cancelled = repository.request_cancellation(cancel_run["id"])
    assert cancelled["status"] == "cancel_requested"
    running = repository.list_run_stages(cancel_run["id"])[0]
    assert running["status"] == "running"
    repository.skip_stage(
        running["id"],
        "cancelled_by_user",
        "Analysis cancelled by user",
        worker_id="worker",
    )
    cancelled = repository.get_analysis_run(cancel_run["id"])
    assert cancelled is not None and cancelled["status"] == "cancelled"
    stage = repository.list_run_stages(cancel_run["id"])[0]
    assert stage["status"] == "skipped"
    assert stage["reason_code"] == "cancelled_by_user"
    assert repository.claim_next_stage(worker_id="other", run_id=cancel_run["id"]) is None
    with pytest.raises(ConflictError):
        repository.retry_stage(stage["id"])
    conn.close()
