from __future__ import annotations

import inspect
from uuid import uuid4

import pytest

from cratedig_engine.cli import main
from cratedig_engine.job import (
    ANALYSIS_PIPELINE_VERSION,
    FEATURE_SCHEMA_VERSION,
    REDUCED_DIM,
    AnalyzeRunError,
    AnalyzeRunJob,
    AnalysisRunRow,
    AudioObjectRow,
    JobConfigError,
    JobSettings,
    TrackRow,
    pad_or_trim,
    search_embedding,
)
from tests.fakes import FakeBackend, FakeObjectStore, FakeStore


def _seed_library(store: FakeStore, objects: FakeObjectStore, n: int = 3, *, with_audio=True):
    library_id = str(uuid4())
    run_id = str(uuid4())
    store.add_run(
        AnalysisRunRow(
            id=run_id,
            library_id=library_id,
            mode="fast",
            backend_name="librosa",
            pipeline_version=ANALYSIS_PIPELINE_VERSION,
            feature_schema_version=FEATURE_SCHEMA_VERSION,
        )
    )
    tracks = []
    for i in range(n):
        track_id = str(uuid4())
        track = TrackRow(
            id=track_id,
            library_id=library_id,
            title=f"Track {i}",
            artist="DJ Test",
            bpm=120 + i,
        )
        original = None
        if with_audio:
            key = f"audio/{track_id}.wav"
            original = AudioObjectRow(
                id=str(uuid4()),
                track_id=track_id,
                kind="original",
                bucket="crate-dig-audio-dev",
                object_key=key,
            )
            objects.put("crate-dig-audio-dev", key, f"wav-bytes-{i}".encode())
        store.add_track(track, original)
        tracks.append(track)
    return run_id, tracks


def test_job_module_avoids_heavy_and_optional_imports():
    import cratedig_engine.job as job

    src = inspect.getsource(job)
    assert "import torch" not in src
    assert "import transformers" not in src
    assert "from supabase" not in src
    assert "import boto3" not in src
    assert "cratedig_analysis" not in src


def test_settings_from_env_and_r2_endpoint_from_account_id():
    settings = JobSettings.from_env(
        {
            "NEXT_PUBLIC_SUPABASE_URL": "https://example.supabase.co",
            "SUPABASE_SECRET_KEY": "secret",
            "R2_ACCOUNT_ID": "acct",
            "R2_ACCESS_KEY_ID": "id",
            "R2_SECRET_ACCESS_KEY": "key",
            "R2_BUCKET_AUDIO": "crate-dig-audio-dev",
        }
    )
    assert settings.r2_endpoint == "https://acct.r2.cloudflarestorage.com"
    assert settings.supabase_url.endswith("supabase.co")


def test_settings_missing_env_raises():
    with pytest.raises(JobConfigError, match="NEXT_PUBLIC_SUPABASE_URL"):
        JobSettings.from_env({"R2_ACCESS_KEY_ID": "x"})


def test_analyze_run_writes_features_embeddings_clusters(tmp_path):
    store = FakeStore()
    objects = FakeObjectStore()
    backend = FakeBackend()
    run_id, tracks = _seed_library(store, objects, n=3)
    job = AnalyzeRunJob(store, objects, workdir=tmp_path, backend=backend)
    job.run(run_id)

    run = store.runs[run_id]
    assert run.status == "completed"
    assert run.tracks_total == 3
    assert run.tracks_done == 3
    assert run.model_version == "fake-v1"
    assert len(backend.calls) == 3
    assert len(store.features) == 3
    assert all(feat.status == "ok" for feat in store.features.values())
    assert len(store.embeddings) == 3
    assert len(store.clusters[run_id]) >= 1
    assert len(store.members[run_id]) == 3
    for member in store.members[run_id]:
        assert len(member.reduced_embedding) == REDUCED_DIM
    stubs = [obj for obj in store.audio.values() if obj.kind in {"waveform", "preview"}]
    assert len(stubs) == 6
    assert any(key.endswith("waveform.stub.json") for _, key in objects.objects)
    assert any('"stub": true' in data.decode() for data in objects.objects.values())
    assert all(obj.sha256 for obj in store.audio.values() if obj.kind == "original")


def test_missing_audio_object_fails_track_but_completes_run(tmp_path):
    store = FakeStore()
    objects = FakeObjectStore()
    run_id, tracks = _seed_library(store, objects, n=1, with_audio=False)
    job = AnalyzeRunJob(store, objects, workdir=tmp_path, backend=FakeBackend())
    job.run(run_id)
    feat = store.features[(tracks[0].id, run_id)]
    assert feat.status == "failed"
    assert "no original audio object" in (feat.failure_reason or "")
    assert store.runs[run_id].status == "completed"


def test_r2_download_error_is_recorded(tmp_path):
    store = FakeStore()
    objects = FakeObjectStore()
    run_id, tracks = _seed_library(store, objects, n=1)
    objects.objects.clear()
    job = AnalyzeRunJob(store, objects, workdir=tmp_path, backend=FakeBackend())
    job.run(run_id)
    feat = store.features[(tracks[0].id, run_id)]
    assert feat.status == "failed"
    assert "r2 download failed" in (feat.failure_reason or "")


def test_backend_error_fails_track(tmp_path):
    store = FakeStore()
    objects = FakeObjectStore()
    run_id, tracks = _seed_library(store, objects, n=1)
    dest = tmp_path / f"{tracks[0].id}.wav"
    backend = FakeBackend(fail_paths={str(dest)})
    job = AnalyzeRunJob(store, objects, workdir=tmp_path, backend=backend)
    job.run(run_id)
    feat = store.features[(tracks[0].id, run_id)]
    assert feat.status == "failed"
    assert "backend boom" in (feat.failure_reason or "")
    assert store.runs[run_id].status == "completed"


def test_incremental_skip_reuses_prior_hash_without_reanalyze(tmp_path):
    store = FakeStore()
    objects = FakeObjectStore()
    first_id, tracks = _seed_library(store, objects, n=1)
    backend = FakeBackend()
    AnalyzeRunJob(store, objects, workdir=tmp_path, backend=backend).run(first_id)
    assert len(backend.calls) == 1

    second_id = str(uuid4())
    store.add_run(
        AnalysisRunRow(
            id=second_id,
            library_id=store.runs[first_id].library_id,
            mode="fast",
            backend_name="librosa",
            pipeline_version=ANALYSIS_PIPELINE_VERSION,
            model_version="fake-v1",
            feature_schema_version=FEATURE_SCHEMA_VERSION,
        )
    )
    AnalyzeRunJob(store, objects, workdir=tmp_path, backend=backend).run(second_id)
    assert len(backend.calls) == 1
    reused = store.features[(tracks[0].id, second_id)]
    assert reused.status == "skipped"
    assert (tracks[0].id, second_id, "librosa") in store.embeddings
    assert store.runs[second_id].status == "completed"


def test_resume_skips_terminal_rows(tmp_path):
    store = FakeStore()
    objects = FakeObjectStore()
    run_id, tracks = _seed_library(store, objects, n=1)
    store.upsert_track_feature(
        run_id,
        tracks[0].id,
        status="ok",
        features={"energy_rms": 0.2},
        audio_file_hash="abc",
        failure_reason=None,
    )
    store.upsert_track_embedding(
        run_id, tracks[0].id, model_name="librosa", vector=[0.1, 0.2, 0.3]
    )
    backend = FakeBackend()
    AnalyzeRunJob(store, objects, workdir=tmp_path, backend=backend).run(run_id)
    assert backend.calls == []
    assert store.runs[run_id].status == "completed"
    assert len(store.members[run_id]) == 1


def test_reissuing_completed_run_is_a_noop(tmp_path):
    store = FakeStore()
    objects = FakeObjectStore()
    run_id, _tracks = _seed_library(store, objects, n=2)
    backend = FakeBackend()
    job = AnalyzeRunJob(store, objects, workdir=tmp_path, backend=backend)
    job.run(run_id)
    updates_after_first_run = list(store.run_updates)
    object_count = len(objects.objects)

    job.run(run_id)

    assert len(backend.calls) == 2
    assert store.run_updates == updates_after_first_run
    assert len(objects.objects) == object_count


def test_resume_fails_closed_when_resolved_model_changed(tmp_path):
    store = FakeStore()
    objects = FakeObjectStore()
    run_id, _tracks = _seed_library(store, objects, n=1)
    store.runs[run_id].status = "running"
    store.runs[run_id].model_version = "old-model-v1"

    with pytest.raises(AnalyzeRunError, match="identity mismatch"):
        AnalyzeRunJob(
            store, objects, workdir=tmp_path, backend=FakeBackend()
        ).run(run_id)

    assert store.runs[run_id].status == "failed"
    assert store.runs[run_id].tracks_done == 0


def test_cluster_ids_are_stable_when_interrupted_run_resumes(tmp_path):
    store = FakeStore()
    objects = FakeObjectStore()
    run_id, _tracks = _seed_library(store, objects, n=3)
    job = AnalyzeRunJob(store, objects, workdir=tmp_path, backend=FakeBackend())
    job.run(run_id)
    first_ids = [item.id for item in store.clusters[run_id]]

    # Simulate a stale worker being resumed after all per-track rows persisted
    # but before the terminal run update was observed.
    store.runs[run_id].status = "running"
    job.run(run_id)

    assert [item.id for item in store.clusters[run_id]] == first_ids


def test_missing_run_raises(tmp_path):
    job = AnalyzeRunJob(FakeStore(), FakeObjectStore(), workdir=tmp_path, backend=FakeBackend())
    with pytest.raises(AnalyzeRunError, match="not found"):
        job.run(str(uuid4()))


def test_backend_init_failure_marks_run_failed(tmp_path):
    store = FakeStore()
    objects = FakeObjectStore()
    run_id, _tracks = _seed_library(store, objects, n=1)

    def boom(*_args, **_kwargs):
        raise RuntimeError("no clap")

    job = AnalyzeRunJob(
        store, objects, workdir=tmp_path, backend_factory=boom
    )
    with pytest.raises(AnalyzeRunError, match="backend init failed"):
        job.run(run_id)
    assert store.runs[run_id].status == "failed"


def test_pad_or_trim_and_search_embedding():
    assert pad_or_trim([1.0, 2.0], 4) == [1.0, 2.0, 0.0, 0.0]
    assert pad_or_trim(list(range(10)), 4) == [0.0, 1.0, 2.0, 3.0]
    assert search_embedding([0.1] * 4) is None
    assert len(search_embedding([0.1] * 512) or []) == 512


def test_cli_version_and_analyze_run_requires_id(capsys):
    assert main(["version"]) == 0
    out = capsys.readouterr().out
    assert "0.1.0" in out
    with pytest.raises(SystemExit):
        main(["analyze-run"])


def test_cli_analyze_run_missing_env_returns_1(monkeypatch):
    for key in (
        "NEXT_PUBLIC_SUPABASE_URL",
        "SUPABASE_URL",
        "SUPABASE_SECRET_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "R2_ENDPOINT",
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET_AUDIO",
        "ANALYSIS_RUN_ID",
    ):
        monkeypatch.delenv(key, raising=False)
    rc = main(["analyze-run", "--analysis-run-id", str(uuid4())])
    assert rc == 1
