from __future__ import annotations

import math
import struct
import wave
from collections import deque

import pytest

from cratedig_engine.audio import hash_audio_file

from cratedig_local_api import db
from cratedig_local_api.jobs import (
    CancellationRequested,
    ErrorCode,
    StageOutputs,
    StageTerminalStatus,
)
from cratedig_local_api.repository import Repository
from cratedig_local_api.runtime import (
    ensure_local_fast_manifest,
    local_fast_registry,
    resolve_manifest_record,
)
from cratedig_local_api.worker import AnalysisWorker, EngineV2StageExecutor


def write_test_wave(path, *, frequency: float) -> None:
    sample_rate = 22_050
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(
            b"".join(
                struct.pack(
                    "<h",
                    int(
                        12_000
                        * math.sin(2 * math.pi * frequency * index / sample_rate)
                    ),
                )
                for index in range(sample_rate * 3)
            )
        )


def stage(
    stage_id: str,
    *,
    run_id: str = "run-1",
    attempt_count: int = 1,
    max_attempts: int = 3,
) -> dict:
    return {
        "id": stage_id,
        "run_id": run_id,
        "track_id": f"track-{stage_id}",
        "manifest_id": "manifest-fast-v1",
        "extractor_name": "fake",
        "extractor_version": "1.0.0",
        "track_location": f"/music/{stage_id}.wav",
        "attempt_count": attempt_count,
        "max_attempts": max_attempts,
    }


class FakeRepository:
    def __init__(self, stages=()):
        self.queued = deque(stages)
        self.running: dict[str, dict] = {}
        self.cancelled_runs: set[str] = set()
        self.completed: list[tuple[str, tuple, tuple]] = []
        self.failed: list[tuple[str, str, str, bool]] = []
        self.skipped: list[tuple[str, str, str]] = []

    def claim_next_stage(self, *, worker_id, run_id=None):
        for _ in range(len(self.queued)):
            item = self.queued.popleft()
            if run_id is not None and item["run_id"] != run_id:
                self.queued.append(item)
                continue
            item = dict(item, worker_id=worker_id, status="running")
            self.running[item["id"]] = item
            return item
        return None

    def reclaim_expired(self, stage_id):
        self.queued.append(self.running.pop(stage_id))

    def get_analysis_run(self, run_id):
        return {
            "id": run_id,
            "cancellation_requested": run_id in self.cancelled_runs,
        }

    def complete_stage(
        self, stage_id, *, features=(), embeddings=(), worker_id=None
    ):
        assert worker_id is not None
        self.running.pop(stage_id)
        self.completed.append((stage_id, tuple(features), tuple(embeddings)))

    def fail_stage(
        self, stage_id, error_code, error_message, *, retryable, worker_id=None
    ):
        assert worker_id is not None
        self.running.pop(stage_id)
        self.failed.append((stage_id, error_code, error_message, retryable))

    def skip_stage(
        self, stage_id, reason_code, reason_message="", *, worker_id=None
    ):
        assert worker_id is not None
        self.running.pop(stage_id)
        self.skipped.append((stage_id, reason_code, reason_message))


class SuccessfulExecutor:
    def __init__(self):
        self.calls = []

    def execute(self, claimed, should_cancel):
        self.calls.append(claimed)
        assert not should_cancel()
        return StageOutputs(features=("tempo", "key"), embeddings=("vector",))


class RaisingExecutor:
    def __init__(self, error):
        self.error = error
        self.calls = 0

    def execute(self, claimed, should_cancel):
        self.calls += 1
        raise self.error


def test_run_once_persists_successful_stage_outputs():
    repository = FakeRepository([stage("one")])
    executor = SuccessfulExecutor()

    result = AnalysisWorker(
        repository, executor, worker_id="worker-1"
    ).run_once()

    assert result.status is StageTerminalStatus.SUCCEEDED
    assert repository.completed == [
        ("one", ("tempo", "key"), ("vector",))
    ]
    assert repository.failed == []
    assert executor.calls[0].extractor_identity == ("fake", "1.0.0")


def test_corrupt_audio_is_terminal_and_does_not_stall_next_track():
    repository = FakeRepository([stage("bad"), stage("good")])

    class OneBadFile:
        def execute(self, claimed, should_cancel):
            if claimed.id == "bad":
                raise ValueError("could not decode audio file: invalid soundfile")
            return StageOutputs(features=("ok",))

    results = AnalysisWorker(repository, OneBadFile()).run(max_stages=2)

    assert [result.status for result in results] == [
        StageTerminalStatus.FAILED,
        StageTerminalStatus.SUCCEEDED,
    ]
    assert repository.failed[0][1:] == (
        ErrorCode.CORRUPT_AUDIO.value,
        "Audio could not be decoded; the file may be corrupt or unsupported.",
        False,
    )
    assert repository.completed[0][0] == "good"


def test_cancellation_before_execution_skips_with_canonical_reason():
    repository = FakeRepository([stage("one")])
    repository.cancelled_runs.add("run-1")
    executor = SuccessfulExecutor()

    result = AnalysisWorker(repository, executor).run_once()

    assert result.status is StageTerminalStatus.SKIPPED
    assert result.error_code == ErrorCode.CANCELLED_BY_USER.value
    assert repository.skipped == [
        (
            "one",
            ErrorCode.CANCELLED_BY_USER.value,
            "Analysis was cancelled by the user.",
        )
    ]
    assert executor.calls == []


def test_cancellation_after_extractor_discards_outputs_and_skips():
    repository = FakeRepository([stage("one")])

    class CancelAtBoundary:
        def execute(self, claimed, should_cancel):
            repository.cancelled_runs.add(claimed.run_id)
            return StageOutputs(features=("must-not-persist",))

    result = AnalysisWorker(repository, CancelAtBoundary()).run_once()

    assert result.status is StageTerminalStatus.SKIPPED
    assert repository.completed == []
    assert repository.skipped[0][1] == ErrorCode.CANCELLED_BY_USER.value


def test_executor_can_cooperate_at_an_internal_window_boundary():
    repository = FakeRepository([stage("one")])

    class WindowAwareExecutor:
        def execute(self, claimed, should_cancel):
            repository.cancelled_runs.add(claimed.run_id)
            if should_cancel():
                raise CancellationRequested
            return StageOutputs()

    result = AnalysisWorker(repository, WindowAwareExecutor()).run_once()

    assert result.status is StageTerminalStatus.SKIPPED
    assert repository.skipped[0][1] == ErrorCode.CANCELLED_BY_USER.value


@pytest.mark.parametrize(
    ("attempt_count", "expected_retryable"),
    [(1, True), (3, False)],
)
def test_retryable_failure_obeys_finite_attempt_ceiling(
    attempt_count, expected_retryable
):
    repository = FakeRepository(
        [stage("one", attempt_count=attempt_count, max_attempts=3)]
    )

    result = AnalysisWorker(
        repository,
        RaisingExecutor(TimeoutError("temporary accelerator timeout")),
        max_attempts=3,
    ).run_once()

    assert result.error_code == ErrorCode.RESOURCE_EXHAUSTED.value
    assert result.retryable is expected_retryable
    assert repository.failed[0][3] is expected_retryable


def test_process_interruption_leaves_claim_for_lease_expiry_and_reclaim():
    repository = FakeRepository([stage("one")])
    interrupted_worker = AnalysisWorker(
        repository,
        RaisingExecutor(KeyboardInterrupt()),
        worker_id="worker-that-died",
    )

    with pytest.raises(KeyboardInterrupt):
        interrupted_worker.run_once()

    assert "one" in repository.running
    assert repository.completed == repository.failed == repository.skipped == []

    # The real repository performs this transition atomically when the lease
    # expires. The replacement worker can then finish the same durable stage.
    repository.reclaim_expired("one")
    replacement = AnalysisWorker(
        repository, SuccessfulExecutor(), worker_id="replacement-worker"
    )
    result = replacement.run_once()

    assert result.status is StageTerminalStatus.SUCCEEDED
    assert repository.completed[0][0] == "one"


def test_run_is_bounded_and_filters_claims_by_run():
    repository = FakeRepository(
        [stage("other", run_id="run-2"), stage("one"), stage("two")]
    )

    results = AnalysisWorker(repository, SuccessfulExecutor()).run(
        max_stages=2, run_id="run-1"
    )

    assert [result.stage_id for result in results] == ["one", "two"]
    assert [item["id"] for item in repository.queued] == ["other"]


def test_idle_wait_is_capped_at_sixty_seconds():
    worker = AnalysisWorker(FakeRepository(), SuccessfulExecutor())
    with pytest.raises(ValueError, match="between 0 and 60"):
        worker.run(max_stages=1, idle_wait_seconds=60.1)


def test_worker_contract_integrates_with_sqlite_repository(tmp_path):
    connection = db.connect(tmp_path / "worker.sqlite")
    repository = Repository(connection)
    library_id = db.get_or_create_library(connection, "Worker library", "folder")
    db.upsert_track(
        connection,
        library_id=library_id,
        title="Track",
        artist="Artist",
        location=str(tmp_path / "track.wav"),
    )
    manifest = repository.upsert_model_set_manifest(
        "fast-local",
        "1.0.0",
        {"name": "fast-local", "version": "1.0.0"},
    )
    run = repository.create_analysis_run(
        library_id,
        manifest["id"],
        stages=[{"name": "fake", "version": "1.0.0"}],
    )

    class PersistableExecutor:
        def execute(self, claimed, should_cancel):
            return StageOutputs(
                features=(
                    {
                        "feature_key": "tempo.bpm:track",
                        "value": 124.0,
                        "unit": "bpm",
                        "confidence": 0.9,
                    },
                ),
                embeddings=(
                    {
                        "embedding_key": "layout:track",
                        "embedding": (0.1, 0.2, 0.3),
                        "dimensions": 3,
                    },
                ),
            )

    result = AnalysisWorker(
        repository,
        PersistableExecutor(),
        worker_id="sqlite-worker",
    ).run_once(run_id=run["id"])

    assert result.status is StageTerminalStatus.SUCCEEDED
    stored = repository.get_track_analysis(
        repository.list_run_tracks(run["id"])[0]["id"],
        run_id=run["id"],
    )
    assert stored is not None
    assert stored["features"][0]["feature_key"] == "tempo.bpm:track"
    assert stored["embeddings"][0]["dimensions"] == 3
    assert repository.get_analysis_run(run["id"])["status"] == "completed"
    connection.close()


def test_sqlite_cancellation_waits_for_running_worker_boundary(tmp_path):
    connection = db.connect(tmp_path / "cancel-worker.sqlite")
    repository = Repository(connection)
    library_id = db.get_or_create_library(connection, "Worker library", "folder")
    db.upsert_track(
        connection,
        library_id=library_id,
        title="Track",
        artist="Artist",
        location=str(tmp_path / "track.wav"),
    )
    manifest = repository.upsert_model_set_manifest(
        "fast-local",
        "1.0.0",
        {"name": "fast-local", "version": "1.0.0"},
    )
    run = repository.create_analysis_run(
        library_id,
        manifest["id"],
        stages=[{"name": "fake", "version": "1.0.0"}],
    )

    class CancelDuringExtraction:
        def execute(self, claimed, should_cancel):
            cancellation = repository.request_cancellation(claimed.run_id)
            assert cancellation["cancellation_requested"] is True
            assert should_cancel()
            return StageOutputs(features=("must-not-persist",))

    result = AnalysisWorker(
        repository,
        CancelDuringExtraction(),
        worker_id="cancellable-worker",
    ).run_once(run_id=run["id"])

    assert result.status is StageTerminalStatus.SKIPPED
    stored_stage = repository.list_run_stages(run["id"])[0]
    assert stored_stage["status"] == "skipped"
    assert stored_stage["reason_code"] == ErrorCode.CANCELLED_BY_USER.value
    assert repository.get_analysis_run(run["id"])["status"] == "cancelled"
    connection.close()


def test_real_local_fast_runtime_analyzes_and_persists_one_track(tmp_path):
    source = tmp_path / "tone.wav"
    sample_rate = 22_050
    with wave.open(str(source), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(
            b"".join(
                struct.pack(
                    "<h",
                    int(
                        12_000
                        * math.sin(2 * math.pi * 220 * index / sample_rate)
                    ),
                )
                for index in range(sample_rate * 3)
            )
        )

    connection = db.connect(tmp_path / "real-worker.sqlite")
    repository = Repository(connection)
    library_id = db.get_or_create_library(connection, "Real worker", "folder")
    track_id = db.upsert_track(
        connection,
        library_id=library_id,
        title="Tone",
        artist="Synthetic",
        location=str(source),
    )
    manifest = ensure_local_fast_manifest(repository)
    run = repository.create_analysis_run(
        library_id,
        manifest["id"],
        idempotency_key="real-local-fast-001",
    )
    executor = EngineV2StageExecutor(
        lambda manifest_id: resolve_manifest_record(repository, manifest_id),
        local_fast_registry(),
    )

    result = AnalysisWorker(
        repository,
        executor,
        worker_id="real-worker",
    ).run_once(run_id=run["id"])

    assert result.status is StageTerminalStatus.SUCCEEDED
    stored = repository.get_track_analysis(track_id, run_id=run["id"])
    assert stored is not None
    assert stored["stages"][0]["status"] == "succeeded"
    assert any(
        item["embedding_key"] == "retrieval:track"
        and item["dimensions"] == 65
        and item["scope"] == "track"
        and item["pooling_strategy"] == "arithmetic-mean-v1"
        for item in stored["embeddings"]
    )
    assert any(
        item["scope"] == "window"
        and item["start_ms"] == 0
        and item["end_ms"] == 3000
        and item["pooling_strategy"] == "none"
        for item in stored["embeddings"]
    )
    assert any(
        item["feature_key"] == "librosa.est_bpm:track"
        for item in stored["features"]
    )
    connection.close()


def test_worker_rejects_audio_changed_after_run_was_queued(tmp_path):
    source = tmp_path / "changing.wav"
    write_test_wave(source, frequency=220)
    connection = db.connect(tmp_path / "source-change.sqlite")
    repository = Repository(connection)
    library_id = db.get_or_create_library(connection, "Changing source", "folder")
    original_hash = hash_audio_file(source)
    stat = source.stat()
    db.upsert_track(
        connection,
        library_id=library_id,
        title="Changing",
        artist="Synthetic",
        location=str(source),
        audio_content_hash=original_hash,
        file_size_bytes=stat.st_size,
        file_mtime_ns=stat.st_mtime_ns,
    )
    manifest = ensure_local_fast_manifest(repository)
    run = repository.create_analysis_run(
        library_id,
        manifest["id"],
        idempotency_key="source-change-001",
    )
    write_test_wave(source, frequency=440)
    executor = EngineV2StageExecutor(
        lambda manifest_id: resolve_manifest_record(repository, manifest_id),
        local_fast_registry(),
    )

    result = AnalysisWorker(repository, executor, worker_id="source-check").run_once(
        run_id=run["id"]
    )

    assert result.status is StageTerminalStatus.FAILED
    assert result.error_code == ErrorCode.SOURCE_CHANGED.value
    stage = repository.list_run_stages(run["id"])[0]
    assert stage["error_code"] == ErrorCode.SOURCE_CHANGED.value
    assert stage["retryable"] is False
    connection.close()


def test_worker_records_corrupt_audio_as_terminal_track_failure(tmp_path):
    source = tmp_path / "corrupt.wav"
    source.write_bytes(b"this is not a wave file")
    connection = db.connect(tmp_path / "corrupt.sqlite")
    repository = Repository(connection)
    library_id = db.get_or_create_library(connection, "Corrupt source", "folder")
    stat = source.stat()
    db.upsert_track(
        connection,
        library_id=library_id,
        title="Corrupt",
        artist="Unknown",
        location=str(source),
        audio_content_hash=hash_audio_file(source),
        file_size_bytes=stat.st_size,
        file_mtime_ns=stat.st_mtime_ns,
    )
    manifest = ensure_local_fast_manifest(repository)
    run = repository.create_analysis_run(
        library_id,
        manifest["id"],
        idempotency_key="corrupt-audio-001",
    )
    executor = EngineV2StageExecutor(
        lambda manifest_id: resolve_manifest_record(repository, manifest_id),
        local_fast_registry(),
    )

    result = AnalysisWorker(repository, executor, worker_id="corrupt-check").run_once(
        run_id=run["id"]
    )

    assert result.status is StageTerminalStatus.FAILED
    assert result.error_code == ErrorCode.CORRUPT_AUDIO.value
    assert result.retryable is False
    assert repository.get_analysis_run(run["id"])["status"] == "failed"
    connection.close()


def test_cache_hit_still_rejects_a_changed_duplicate_source(tmp_path):
    first_source = tmp_path / "first.wav"
    second_source = tmp_path / "second.wav"
    write_test_wave(first_source, frequency=220)
    second_source.write_bytes(first_source.read_bytes())
    content_hash = hash_audio_file(first_source)
    connection = db.connect(tmp_path / "cache-source-change.sqlite")
    repository = Repository(connection)
    library_id = db.get_or_create_library(connection, "Cache mutation", "folder")
    for index, source in enumerate((first_source, second_source)):
        stat = source.stat()
        db.upsert_track(
            connection,
            library_id=library_id,
            title=f"Duplicate {index}",
            artist="Synthetic",
            location=str(source),
            audio_content_hash=content_hash,
            file_size_bytes=stat.st_size,
            file_mtime_ns=stat.st_mtime_ns,
        )
    manifest = ensure_local_fast_manifest(repository)
    run = repository.create_analysis_run(
        library_id,
        manifest["id"],
        idempotency_key="cache-mutation-001",
    )
    executor = EngineV2StageExecutor(
        lambda manifest_id: resolve_manifest_record(repository, manifest_id),
        local_fast_registry(),
    )
    worker = AnalysisWorker(repository, executor, worker_id="cache-mutation")
    assert worker.run_once(run_id=run["id"]).status is StageTerminalStatus.SUCCEEDED
    pending = next(
        stage
        for stage in repository.list_run_stages(run["id"])
        if stage["status"] == "queued"
    )
    write_test_wave(pending["track_location"], frequency=440)

    result = worker.run_once(run_id=run["id"])

    assert result.status is StageTerminalStatus.FAILED
    assert result.error_code == ErrorCode.SOURCE_CHANGED.value
    assert repository.get_analysis_run(run["id"])["status"] == "failed"
    connection.close()
