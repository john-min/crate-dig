"""Cloud Run Job: process one analysis_run_id end-to-end.

Adapters (Supabase, R2) are injected so pytest can run offline with fakes.
This module does not import supabase, boto3, torch, or CLAP.
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol

from cratedig_engine.backends.factory import get_backend
from cratedig_engine.pipeline.analyze import analyze_track
from cratedig_engine.pipeline.cluster import cluster_embeddings
from cratedig_engine.schemas import (
    ANALYSIS_PIPELINE_VERSION,
    FEATURE_SCHEMA_VERSION,
    AnalysisMode,
    AnalysisStatus,
    Track,
    TrackFeatures,
)

log = logging.getLogger("cratedig_engine.job")

VECTOR_SEARCH_DIM = 512
REDUCED_DIM = 64

WAVEFORM_STUB_REASON = (
    "Phase 4 MVP stubs waveform JSON; real peak/RMS waveforms are a later phase."
)
PREVIEW_STUB_REASON = (
    "Phase 4 MVP stubs preview metadata; real normalized audio previews are a later phase."
)


class JobConfigError(RuntimeError):
    """Missing or invalid environment for the analyze-run job."""


class AnalyzeRunError(RuntimeError):
    """The analysis run cannot proceed (missing row, fatal backend, etc.)."""


@dataclass(frozen=True)
class JobSettings:
    supabase_url: str
    supabase_secret_key: str
    r2_endpoint: str
    r2_access_key_id: str
    r2_secret_access_key: str
    r2_bucket_audio: str
    r2_account_id: str = ""
    workdir: str = "/tmp/cratedig-analyze"

    @classmethod
    def from_env(cls, environ: dict[str, str] | None = None) -> JobSettings:
        env = environ if environ is not None else os.environ
        url = (env.get("NEXT_PUBLIC_SUPABASE_URL") or env.get("SUPABASE_URL") or "").strip()
        key = (
            env.get("SUPABASE_SECRET_KEY")
            or env.get("SUPABASE_SERVICE_ROLE_KEY")
            or ""
        ).strip()
        account_id = (env.get("R2_ACCOUNT_ID") or "").strip()
        endpoint = (env.get("R2_ENDPOINT") or "").strip()
        if not endpoint and account_id:
            endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
        access = (env.get("R2_ACCESS_KEY_ID") or "").strip()
        secret = (env.get("R2_SECRET_ACCESS_KEY") or "").strip()
        bucket = (env.get("R2_BUCKET_AUDIO") or "").strip()
        workdir = (env.get("CRATEDIG_JOB_WORKDIR") or "/tmp/cratedig-analyze").strip()

        missing: list[str] = []
        if not url:
            missing.append("NEXT_PUBLIC_SUPABASE_URL")
        if not key:
            missing.append("SUPABASE_SECRET_KEY")
        if not endpoint:
            missing.append("R2_ENDPOINT (or R2_ACCOUNT_ID)")
        if not access:
            missing.append("R2_ACCESS_KEY_ID")
        if not secret:
            missing.append("R2_SECRET_ACCESS_KEY")
        if not bucket:
            missing.append("R2_BUCKET_AUDIO")
        if missing:
            raise JobConfigError("missing required env: " + ", ".join(missing))
        return cls(
            supabase_url=url,
            supabase_secret_key=key,
            r2_endpoint=endpoint,
            r2_access_key_id=access,
            r2_secret_access_key=secret,
            r2_bucket_audio=bucket,
            r2_account_id=account_id,
            workdir=workdir,
        )


@dataclass
class AnalysisRunRow:
    id: str
    library_id: str
    mode: str = "fast"
    backend_name: str = "librosa"
    status: str = "pending"
    pipeline_version: str = ANALYSIS_PIPELINE_VERSION
    model_version: str = ""
    feature_schema_version: str = FEATURE_SCHEMA_VERSION
    tracks_total: int = 0
    tracks_done: int = 0


@dataclass
class TrackRow:
    id: str
    library_id: str
    title: str = ""
    artist: str = ""
    album: str = ""
    genre: str = ""
    label: str = ""
    bpm: float | None = None
    key: str = ""
    duration_sec: float | None = None
    rating: int = 0
    date_added: str = ""


@dataclass
class AudioObjectRow:
    id: str
    track_id: str
    kind: str
    bucket: str
    object_key: str
    content_type: str | None = None
    byte_size: int | None = None
    sha256: str | None = None


@dataclass
class TrackBundle:
    track: TrackRow
    original: AudioObjectRow | None


@dataclass
class FeatureRow:
    track_id: str
    analysis_run_id: str
    status: str
    audio_file_hash: str | None = None
    features: dict[str, Any] = field(default_factory=dict)
    failure_reason: str | None = None


@dataclass
class EmbeddingRow:
    model_name: str
    vector: list[float]
    dim: int = 0

    def __post_init__(self) -> None:
        if not self.dim:
            self.dim = len(self.vector)


@dataclass
class ReusableAnalysis:
    features: dict[str, Any]
    audio_file_hash: str | None
    embeddings: list[EmbeddingRow] = field(default_factory=list)


@dataclass
class ClusterWrite:
    cluster_index: int
    name: str
    suggested_moment: str
    track_count: int
    id: str = field(default_factory=lambda: str(uuid.uuid4()))


@dataclass
class ClusterMemberWrite:
    track_id: str
    cluster_id: str | None
    umap_x: float
    umap_y: float
    suggested_moment: str
    reduced_embedding: list[float]


class AnalysisRepository(Protocol):
    def get_analysis_run(self, analysis_run_id: str) -> AnalysisRunRow | None: ...

    def list_library_tracks(self, library_id: str) -> list[TrackBundle]: ...

    def get_track_feature(
        self, track_id: str, analysis_run_id: str
    ) -> FeatureRow | None: ...

    def find_reusable(
        self,
        track_id: str,
        audio_file_hash: str,
        *,
        pipeline_version: str,
        model_version: str,
        feature_schema_version: str,
        exclude_run_id: str,
    ) -> ReusableAnalysis | None: ...

    def mark_run_running(
        self,
        analysis_run_id: str,
        *,
        tracks_total: int,
        model_version: str,
        pipeline_version: str,
        feature_schema_version: str,
        backend_name: str,
    ) -> None: ...

    def update_progress(self, analysis_run_id: str, tracks_done: int) -> None: ...

    def mark_run_completed(self, analysis_run_id: str, tracks_done: int) -> None: ...

    def mark_run_failed(
        self, analysis_run_id: str, error: str, tracks_done: int = 0
    ) -> None: ...

    def upsert_track_feature(
        self,
        analysis_run_id: str,
        track_id: str,
        *,
        status: str,
        features: dict[str, Any],
        audio_file_hash: str | None,
        failure_reason: str | None,
    ) -> None: ...

    def upsert_track_embedding(
        self,
        analysis_run_id: str,
        track_id: str,
        *,
        model_name: str,
        vector: list[float],
    ) -> None: ...

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
    ) -> None: ...

    def update_audio_sha256(
        self, audio_object_id: str, sha256: str, byte_size: int
    ) -> None: ...

    def list_run_embeddings(
        self, analysis_run_id: str
    ) -> list[tuple[str, list[float], dict[str, Any]]]:
        """Return (track_id, embedding, features) for rows usable in clustering."""
        ...

    def replace_clusters(
        self,
        analysis_run_id: str,
        clusters: list[ClusterWrite],
        members: list[ClusterMemberWrite],
    ) -> None: ...


class ObjectStore(Protocol):
    def download(self, bucket: str, object_key: str, dest: Path) -> Path: ...

    def upload_bytes(
        self,
        bucket: str,
        object_key: str,
        data: bytes,
        *,
        content_type: str,
    ) -> None: ...


class AnalyzeRunJob:
    def __init__(
        self,
        store: AnalysisRepository,
        objects: ObjectStore,
        *,
        workdir: str | Path,
        backend=None,
        backend_factory=get_backend,
        artifact_bucket: str | None = None,
    ):
        self.store = store
        self.objects = objects
        self.workdir = Path(workdir)
        self.backend = backend
        self.backend_factory = backend_factory
        self.artifact_bucket = artifact_bucket

    def run(self, analysis_run_id: str) -> None:
        row = self.store.get_analysis_run(analysis_run_id)
        if row is None:
            raise AnalyzeRunError(f"analysis_run not found: {analysis_run_id}")

        bundles = self.store.list_library_tracks(row.library_id)
        try:
            backend = self.backend or self.backend_factory(
                row.backend_name or "auto",
                mode=AnalysisMode(row.mode) if row.mode else AnalysisMode.fast,
            )
        except Exception as exc:
            self.store.mark_run_failed(analysis_run_id, f"backend init failed: {exc}")
            raise AnalyzeRunError(f"backend init failed: {exc}") from exc

        pipeline_version = row.pipeline_version or ANALYSIS_PIPELINE_VERSION
        feature_schema_version = row.feature_schema_version or FEATURE_SCHEMA_VERSION
        self.store.mark_run_running(
            analysis_run_id,
            tracks_total=len(bundles),
            model_version=backend.model_version,
            pipeline_version=pipeline_version,
            feature_schema_version=feature_schema_version,
            backend_name=backend.name,
        )
        self.workdir.mkdir(parents=True, exist_ok=True)

        done = 0
        try:
            for bundle in bundles:
                self._process_track(
                    analysis_run_id,
                    bundle,
                    backend=backend,
                    pipeline_version=pipeline_version,
                    feature_schema_version=feature_schema_version,
                )
                done += 1
                self.store.update_progress(analysis_run_id, done)

            by_id = {b.track.id: b.track for b in bundles}
            self._write_clusters(analysis_run_id, by_id)
            self.store.mark_run_completed(analysis_run_id, done)
        except Exception as exc:
            self.store.mark_run_failed(analysis_run_id, str(exc), tracks_done=done)
            raise

    def _process_track(
        self,
        analysis_run_id: str,
        bundle: TrackBundle,
        *,
        backend,
        pipeline_version: str,
        feature_schema_version: str,
    ) -> None:
        track_id = bundle.track.id
        existing = self.store.get_track_feature(track_id, analysis_run_id)
        if existing is not None and existing.status in {"ok", "failed", "skipped"}:
            log.info("resume skip %s status=%s", track_id, existing.status)
            return

        original = bundle.original
        if original is None:
            self.store.upsert_track_feature(
                analysis_run_id,
                track_id,
                status=AnalysisStatus.failed.value,
                features={},
                audio_file_hash=None,
                failure_reason="no original audio object",
            )
            return

        audio_hash = original.sha256
        reused = None
        if audio_hash:
            reused = self.store.find_reusable(
                track_id,
                audio_hash,
                pipeline_version=pipeline_version,
                model_version=backend.model_version,
                feature_schema_version=feature_schema_version,
                exclude_run_id=analysis_run_id,
            )
        if reused is not None:
            self._persist_reusable(analysis_run_id, bundle, reused, backend.name)
            self._write_artifact_stubs(analysis_run_id, bundle, original.bucket)
            return

        local_path = self._download_original(analysis_run_id, bundle, original)
        if local_path is None:
            return
        try:
            from cratedig_engine.audio.hash import hash_audio_file

            audio_hash = hash_audio_file(local_path)
            byte_size = local_path.stat().st_size
            if audio_hash != original.sha256:
                self.store.update_audio_sha256(original.id, audio_hash, byte_size)

            reused = self.store.find_reusable(
                track_id,
                audio_hash,
                pipeline_version=pipeline_version,
                model_version=backend.model_version,
                feature_schema_version=feature_schema_version,
                exclude_run_id=analysis_run_id,
            )
            if reused is not None:
                self._persist_reusable(analysis_run_id, bundle, reused, backend.name)
                self._write_artifact_stubs(analysis_run_id, bundle, original.bucket)
                return

            engine_track = _to_engine_track(bundle.track, str(local_path))
            result = analyze_track(
                engine_track,
                backend,
                pipeline_version=pipeline_version,
                feature_schema_version=feature_schema_version,
            )
            self.store.upsert_track_feature(
                analysis_run_id,
                track_id,
                status=result.status.value,
                features=result.features,
                audio_file_hash=result.audio_file_hash or audio_hash,
                failure_reason=result.failure_reason,
            )
            if result.status is AnalysisStatus.ok and result.embedding:
                self.store.upsert_track_embedding(
                    analysis_run_id,
                    track_id,
                    model_name=backend.name,
                    vector=result.embedding,
                )
                self._write_artifact_stubs(analysis_run_id, bundle, original.bucket)
        finally:
            try:
                local_path.unlink(missing_ok=True)
            except OSError:
                pass

    def _download_original(
        self,
        analysis_run_id: str,
        bundle: TrackBundle,
        original: AudioObjectRow,
    ) -> Path | None:
        suffix = Path(original.object_key).suffix or ".bin"
        dest = self.workdir / f"{bundle.track.id}{suffix}"
        try:
            return self.objects.download(original.bucket, original.object_key, dest)
        except Exception as exc:
            self.store.upsert_track_feature(
                analysis_run_id,
                bundle.track.id,
                status=AnalysisStatus.failed.value,
                features={},
                audio_file_hash=None,
                failure_reason=f"r2 download failed: {exc}",
            )
            return None

    def _persist_reusable(
        self,
        analysis_run_id: str,
        bundle: TrackBundle,
        reused: ReusableAnalysis,
        fallback_model: str,
    ) -> None:
        self.store.upsert_track_feature(
            analysis_run_id,
            bundle.track.id,
            status=AnalysisStatus.skipped.value,
            features=reused.features,
            audio_file_hash=reused.audio_file_hash,
            failure_reason=None,
        )
        if reused.embeddings:
            for item in reused.embeddings:
                self.store.upsert_track_embedding(
                    analysis_run_id,
                    bundle.track.id,
                    model_name=item.model_name or fallback_model,
                    vector=item.vector,
                )

    def _write_artifact_stubs(
        self, analysis_run_id: str, bundle: TrackBundle, bucket: str
    ) -> None:
        dest_bucket = self.artifact_bucket or bucket
        library_id = bundle.track.library_id
        track_id = bundle.track.id
        for kind, reason in (
            ("waveform", WAVEFORM_STUB_REASON),
            ("preview", PREVIEW_STUB_REASON),
        ):
            key = f"{library_id}/{track_id}/{analysis_run_id}/{kind}.stub.json"
            payload = json.dumps(
                {
                    "stub": True,
                    "kind": kind,
                    "track_id": track_id,
                    "analysis_run_id": analysis_run_id,
                    "reason": reason,
                }
            ).encode("utf-8")
            self.objects.upload_bytes(
                dest_bucket, key, payload, content_type="application/json"
            )
            self.store.upsert_audio_object(
                track_id,
                kind=kind,
                bucket=dest_bucket,
                object_key=key,
                content_type="application/json",
                byte_size=len(payload),
                sha256=None,
            )

    def _write_clusters(
        self,
        analysis_run_id: str,
        tracks_by_id: dict[str, TrackRow],
    ) -> None:
        rows = self.store.list_run_embeddings(analysis_run_id)
        tracks: list[Track] = []
        features: list[TrackFeatures] = []
        embeddings: list[list[float]] = []
        for track_id, vector, feat in rows:
            row = tracks_by_id.get(track_id)
            if row is None or not vector:
                continue
            tracks.append(_to_engine_track(row, ""))
            features.append(TrackFeatures(track_id=track_id, values=feat))
            embeddings.append(vector)

        if not tracks:
            self.store.replace_clusters(analysis_run_id, [], [])
            return

        import numpy as np

        if len(tracks) == 1:
            reduced = pad_or_trim(embeddings[0], REDUCED_DIM)
            cluster = ClusterWrite(
                cluster_index=0,
                name="solo",
                suggested_moment="Main floor",
                track_count=1,
            )
            member = ClusterMemberWrite(
                track_id=tracks[0].track_id,
                cluster_id=cluster.id,
                umap_x=0.0,
                umap_y=0.0,
                suggested_moment="Main floor",
                reduced_embedding=reduced,
            )
            self.store.replace_clusters(analysis_run_id, [cluster], [member])
            return

        matrix = np.asarray(embeddings, dtype=np.float32)
        min_cluster_size = max(2, min(25, len(tracks) // 4 or 2))
        assignments, reduced = cluster_embeddings(
            matrix,
            tracks,
            features,
            min_cluster_size=min_cluster_size,
            reduced_dim=REDUCED_DIM,
        )
        clusters_by_index: dict[int, ClusterWrite] = {}
        members: list[ClusterMemberWrite] = []
        for i, item in enumerate(assignments):
            if item.cluster_id not in clusters_by_index:
                clusters_by_index[item.cluster_id] = ClusterWrite(
                    cluster_index=item.cluster_id,
                    name=item.cluster_name,
                    suggested_moment=item.suggested_moment,
                    track_count=0,
                )
            cluster = clusters_by_index[item.cluster_id]
            cluster.track_count += 1
            vec = item.reduced_embedding or reduced[i].tolist()
            members.append(
                ClusterMemberWrite(
                    track_id=item.track_id,
                    cluster_id=cluster.id,
                    umap_x=item.umap_x,
                    umap_y=item.umap_y,
                    suggested_moment=item.suggested_moment,
                    reduced_embedding=pad_or_trim(list(vec), REDUCED_DIM),
                )
            )
        self.store.replace_clusters(
            analysis_run_id, list(clusters_by_index.values()), members
        )


def _to_engine_track(row: TrackRow, location: str) -> Track:
    return Track(
        track_id=row.id,
        title=row.title,
        artist=row.artist,
        album=row.album,
        genre=row.genre,
        label=row.label,
        bpm=row.bpm,
        key=row.key,
        duration_sec=row.duration_sec,
        location=location,
        rating=row.rating,
        date_added=row.date_added,
    )


def pad_or_trim(vector: list[float], dim: int) -> list[float]:
    values = [float(x) for x in vector]
    if len(values) == dim:
        return values
    if len(values) > dim:
        return values[:dim]
    return values + [0.0] * (dim - len(values))


def search_embedding(vector: list[float]) -> list[float] | None:
    """pgvector(512) column is only filled when the model already emits 512-d."""
    if len(vector) == VECTOR_SEARCH_DIM:
        return [float(x) for x in vector]
    return None


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def run_analyze_run(analysis_run_id: str, *, settings: JobSettings | None = None) -> int:
    from cratedig_engine.storage.r2 import R2Store
    from cratedig_engine.storage.supabase import SupabaseStore

    cfg = settings or JobSettings.from_env()
    store = SupabaseStore.from_settings(cfg)
    objects = R2Store.from_settings(cfg)
    job = AnalyzeRunJob(
        store,
        objects,
        workdir=cfg.workdir,
        artifact_bucket=cfg.r2_bucket_audio,
    )
    job.run(analysis_run_id)
    return 0
