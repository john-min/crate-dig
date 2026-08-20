"""In-memory fakes for analyze-run tests. No network, supabase, or R2."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from cratedig_engine.job import (
    AnalysisRunRow,
    AudioObjectRow,
    ClusterMemberWrite,
    ClusterWrite,
    EmbeddingRow,
    FeatureRow,
    ReusableAnalysis,
    TrackBundle,
    TrackRow,
)
from cratedig_engine.schemas import BackendOutput


class FakeBackend:
    name = "librosa"
    model_version = "fake-v1"

    def __init__(self, *, fail_paths: set[str] | None = None):
        self.calls: list[str] = []
        self.fail_paths = fail_paths or set()

    def analyze(self, audio_path: str) -> BackendOutput:
        self.calls.append(audio_path)
        if audio_path in self.fail_paths:
            raise RuntimeError("backend boom")
        seed = sum(audio_path.encode()) % 17
        return BackendOutput(
            embedding=[float(seed), float(seed + 1), float(seed + 2), 0.5],
            features={"energy_rms": 0.1 + seed / 100.0, "est_bpm": 120 + seed},
        )


class FakeObjectStore:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}

    def put(self, bucket: str, object_key: str, data: bytes) -> None:
        self.objects[(bucket, object_key)] = data

    def download(self, bucket: str, object_key: str, dest: Path) -> Path:
        data = self.objects.get((bucket, object_key))
        if data is None:
            raise FileNotFoundError(f"s3://{bucket}/{object_key}")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return dest

    def upload_bytes(
        self,
        bucket: str,
        object_key: str,
        data: bytes,
        *,
        content_type: str,
    ) -> None:
        self.put(bucket, object_key, data)


class FakeStore:
    def __init__(self) -> None:
        self.runs: dict[str, AnalysisRunRow] = {}
        self.tracks: dict[str, TrackRow] = {}
        self.audio: dict[str, AudioObjectRow] = {}
        self.features: dict[tuple[str, str], FeatureRow] = {}
        self.embeddings: dict[tuple[str, str, str], EmbeddingRow] = {}
        self.clusters: dict[str, list[ClusterWrite]] = {}
        self.members: dict[str, list[ClusterMemberWrite]] = {}
        self.run_updates: list[dict[str, Any]] = []

    def add_run(self, row: AnalysisRunRow) -> None:
        self.runs[row.id] = row

    def add_track(self, track: TrackRow, original: AudioObjectRow | None = None) -> None:
        self.tracks[track.id] = track
        if original is not None:
            self.audio[original.id] = original

    def get_analysis_run(self, analysis_run_id: str) -> AnalysisRunRow | None:
        return self.runs.get(analysis_run_id)

    def list_library_tracks(self, library_id: str) -> list[TrackBundle]:
        bundles = []
        for track in self.tracks.values():
            if track.library_id != library_id:
                continue
            original = next(
                (
                    obj
                    for obj in self.audio.values()
                    if obj.track_id == track.id and obj.kind == "original"
                ),
                None,
            )
            bundles.append(TrackBundle(track=track, original=original))
        return bundles

    def get_track_feature(
        self, track_id: str, analysis_run_id: str
    ) -> FeatureRow | None:
        return self.features.get((track_id, analysis_run_id))

    def find_reusable(
        self,
        track_id: str,
        audio_file_hash: str,
        *,
        pipeline_version: str,
        model_version: str,
        feature_schema_version: str,
        exclude_run_id: str,
    ) -> ReusableAnalysis | None:
        for (tid, run_id), feat in self.features.items():
            if tid != track_id or run_id == exclude_run_id:
                continue
            if feat.status != "ok" or feat.audio_file_hash != audio_file_hash:
                continue
            run = self.runs.get(run_id)
            if run is None:
                continue
            if (
                run.pipeline_version == pipeline_version
                and run.model_version == model_version
                and run.feature_schema_version == feature_schema_version
            ):
                embeddings = [
                    item
                    for (t, r, _m), item in self.embeddings.items()
                    if t == track_id and r == run_id
                ]
                return ReusableAnalysis(
                    features=feat.features,
                    audio_file_hash=feat.audio_file_hash,
                    embeddings=embeddings,
                )
        return None

    def mark_run_running(
        self,
        analysis_run_id: str,
        *,
        tracks_total: int,
        model_version: str,
        pipeline_version: str,
        feature_schema_version: str,
        backend_name: str,
    ) -> None:
        row = self.runs[analysis_run_id]
        row.status = "running"
        row.tracks_total = tracks_total
        row.tracks_done = 0
        row.model_version = model_version
        row.pipeline_version = pipeline_version
        row.feature_schema_version = feature_schema_version
        row.backend_name = backend_name
        self.run_updates.append({"status": "running", "tracks_total": tracks_total})

    def update_progress(self, analysis_run_id: str, tracks_done: int) -> None:
        self.runs[analysis_run_id].tracks_done = tracks_done
        self.run_updates.append({"tracks_done": tracks_done})

    def mark_run_completed(self, analysis_run_id: str, tracks_done: int) -> None:
        row = self.runs[analysis_run_id]
        row.status = "completed"
        row.tracks_done = tracks_done
        self.run_updates.append({"status": "completed", "tracks_done": tracks_done})

    def mark_run_failed(
        self, analysis_run_id: str, error: str, tracks_done: int = 0
    ) -> None:
        row = self.runs[analysis_run_id]
        row.status = "failed"
        row.tracks_done = tracks_done
        self.run_updates.append({"status": "failed", "error": error})

    def upsert_track_feature(
        self,
        analysis_run_id: str,
        track_id: str,
        *,
        status: str,
        features: dict[str, Any],
        audio_file_hash: str | None,
        failure_reason: str | None,
    ) -> None:
        self.features[(track_id, analysis_run_id)] = FeatureRow(
            track_id=track_id,
            analysis_run_id=analysis_run_id,
            status=status,
            audio_file_hash=audio_file_hash,
            features=features,
            failure_reason=failure_reason,
        )

    def upsert_track_embedding(
        self,
        analysis_run_id: str,
        track_id: str,
        *,
        model_name: str,
        vector: list[float],
    ) -> None:
        self.embeddings[(track_id, analysis_run_id, model_name)] = EmbeddingRow(
            model_name=model_name,
            vector=list(vector),
            dim=len(vector),
        )

    def upsert_audio_object(
        self,
        track_id: str,
        *,
        kind: str,
        bucket: str,
        object_key: str,
        content_type: str | None,
        byte_size: int | None,
        sha256: str | None,
    ) -> None:
        obj_id = f"{track_id}:{kind}:{object_key}"
        self.audio[obj_id] = AudioObjectRow(
            id=obj_id,
            track_id=track_id,
            kind=kind,
            bucket=bucket,
            object_key=object_key,
            content_type=content_type,
            byte_size=byte_size,
            sha256=sha256,
        )

    def update_audio_sha256(
        self, audio_object_id: str, sha256: str, byte_size: int
    ) -> None:
        obj = self.audio[audio_object_id]
        obj.sha256 = sha256
        obj.byte_size = byte_size

    def list_run_embeddings(
        self, analysis_run_id: str
    ) -> list[tuple[str, list[float], dict[str, Any]]]:
        feats = {
            tid: feat
            for (tid, run_id), feat in self.features.items()
            if run_id == analysis_run_id and feat.status in {"ok", "skipped"}
        }
        out = []
        seen: set[str] = set()
        for (tid, run_id, _model), emb in self.embeddings.items():
            if run_id != analysis_run_id or tid in seen or tid not in feats:
                continue
            seen.add(tid)
            out.append((tid, list(emb.vector), feats[tid].features))
        return out

    def replace_clusters(
        self,
        analysis_run_id: str,
        clusters: list[ClusterWrite],
        members: list[ClusterMemberWrite],
    ) -> None:
        self.clusters[analysis_run_id] = list(clusters)
        self.members[analysis_run_id] = list(members)
