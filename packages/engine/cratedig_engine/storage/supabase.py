"""Supabase persistence for the analyze-run Cloud Run Job.

Uses the service-role key so RLS does not block writes. Optional dependency:
install the `job` extra (`pip install -e ".[job]"`).
"""

from __future__ import annotations

from typing import Any

from cratedig_engine.job import (
    REDUCED_DIM,
    AnalysisRunRow,
    AudioObjectRow,
    ClusterMemberWrite,
    ClusterWrite,
    EmbeddingRow,
    FeatureRow,
    JobSettings,
    ReusableAnalysis,
    TrackBundle,
    TrackRow,
    pad_or_trim,
    search_embedding,
    utcnow_iso,
)

PAGE = 1000


class SupabaseStore:
    def __init__(self, client: Any):
        self.client = client

    @classmethod
    def from_settings(cls, settings: JobSettings) -> SupabaseStore:
        try:
            from supabase import create_client
        except ImportError as exc:
            raise RuntimeError(
                "supabase is required for analyze-run; install cratedig-engine[job]"
            ) from exc
        return cls(create_client(settings.supabase_url, settings.supabase_secret_key))

    def get_analysis_run(self, analysis_run_id: str) -> AnalysisRunRow | None:
        resp = (
            self.client.table("analysis_runs")
            .select("*")
            .eq("id", analysis_run_id)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            return None
        return _run_from_row(rows[0])

    def list_library_tracks(self, library_id: str) -> list[TrackBundle]:
        rows = self._fetch_all(
            lambda: self.client.table("tracks")
            .select(
                "id,library_id,title,artist,album,genre,label,bpm,key,"
                "duration_sec,rating,date_added,audio_objects(*)"
            )
            .eq("library_id", library_id)
        )
        bundles: list[TrackBundle] = []
        for row in rows:
            track = _track_from_row(row)
            original = None
            for obj in row.get("audio_objects") or []:
                if obj.get("kind") == "original":
                    original = _audio_from_row(obj)
                    break
            bundles.append(TrackBundle(track=track, original=original))
        return bundles

    def get_track_feature(
        self, track_id: str, analysis_run_id: str
    ) -> FeatureRow | None:
        resp = (
            self.client.table("track_features")
            .select("*")
            .eq("track_id", track_id)
            .eq("analysis_run_id", analysis_run_id)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            return None
        return _feature_from_row(rows[0])

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
        resp = (
            self.client.table("track_features")
            .select("*")
            .eq("track_id", track_id)
            .eq("audio_file_hash", audio_file_hash)
            .eq("status", "ok")
            .execute()
        )
        for feat in resp.data or []:
            if feat.get("analysis_run_id") == exclude_run_id:
                continue
            run = self.get_analysis_run(feat["analysis_run_id"])
            if run is None:
                continue
            if (
                run.pipeline_version == pipeline_version
                and run.model_version == model_version
                and run.feature_schema_version == feature_schema_version
            ):
                emb_resp = (
                    self.client.table("track_embeddings")
                    .select("*")
                    .eq("track_id", track_id)
                    .eq("analysis_run_id", feat["analysis_run_id"])
                    .execute()
                )
                embeddings = [_embedding_from_row(item) for item in emb_resp.data or []]
                return ReusableAnalysis(
                    features=feat.get("features") or {},
                    audio_file_hash=feat.get("audio_file_hash"),
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
        self.client.table("analysis_runs").update(
            {
                "status": "running",
                "tracks_total": tracks_total,
                "tracks_done": 0,
                "model_version": model_version,
                "pipeline_version": pipeline_version,
                "feature_schema_version": feature_schema_version,
                "backend_name": backend_name,
                "started_at": utcnow_iso(),
                "finished_at": None,
                "error": None,
            }
        ).eq("id", analysis_run_id).execute()

    def update_progress(self, analysis_run_id: str, tracks_done: int) -> None:
        self.client.table("analysis_runs").update(
            {"tracks_done": tracks_done}
        ).eq("id", analysis_run_id).execute()

    def mark_run_completed(self, analysis_run_id: str, tracks_done: int) -> None:
        self.client.table("analysis_runs").update(
            {
                "status": "completed",
                "tracks_done": tracks_done,
                "finished_at": utcnow_iso(),
                "error": None,
            }
        ).eq("id", analysis_run_id).execute()

    def mark_run_failed(
        self, analysis_run_id: str, error: str, tracks_done: int = 0
    ) -> None:
        self.client.table("analysis_runs").update(
            {
                "status": "failed",
                "tracks_done": tracks_done,
                "finished_at": utcnow_iso(),
                "error": error[:8000],
            }
        ).eq("id", analysis_run_id).execute()

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
        self.client.table("track_features").upsert(
            {
                "track_id": track_id,
                "analysis_run_id": analysis_run_id,
                "audio_file_hash": audio_file_hash,
                "status": status,
                "failure_reason": failure_reason,
                "features": features or {},
            },
            on_conflict="track_id,analysis_run_id",
        ).execute()

    def upsert_track_embedding(
        self,
        analysis_run_id: str,
        track_id: str,
        *,
        model_name: str,
        vector: list[float],
    ) -> None:
        values = [float(x) for x in vector]
        payload: dict[str, Any] = {
            "track_id": track_id,
            "analysis_run_id": analysis_run_id,
            "model_name": model_name,
            "dimensions": len(values),
            "embedding_raw": values,
            "embedding": _vector_literal(search_embedding(values)),
        }
        self.client.table("track_embeddings").upsert(
            payload, on_conflict="track_id,analysis_run_id,model_name"
        ).execute()

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
        self.client.table("audio_objects").upsert(
            {
                "track_id": track_id,
                "kind": kind,
                "bucket": bucket,
                "object_key": object_key,
                "content_type": content_type,
                "byte_size": byte_size,
                "sha256": sha256,
            },
            on_conflict="track_id,kind,object_key",
        ).execute()

    def update_audio_sha256(
        self, audio_object_id: str, sha256: str, byte_size: int
    ) -> None:
        self.client.table("audio_objects").update(
            {"sha256": sha256, "byte_size": byte_size}
        ).eq("id", audio_object_id).execute()

    def list_run_embeddings(
        self, analysis_run_id: str
    ) -> list[tuple[str, list[float], dict[str, Any]]]:
        feats = {
            row["track_id"]: row
            for row in self._fetch_all(
                lambda: self.client.table("track_features")
                .select("*")
                .eq("analysis_run_id", analysis_run_id)
            )
            if row.get("status") in {"ok", "skipped"}
        }
        embeddings = self._fetch_all(
            lambda: self.client.table("track_embeddings")
            .select("*")
            .eq("analysis_run_id", analysis_run_id)
        )
        out: list[tuple[str, list[float], dict[str, Any]]] = []
        seen: set[str] = set()
        for row in embeddings:
            track_id = row["track_id"]
            if track_id in seen or track_id not in feats:
                continue
            vector = list(row.get("embedding_raw") or [])
            if not vector:
                continue
            seen.add(track_id)
            out.append((track_id, vector, feats[track_id].get("features") or {}))
        return out

    def replace_clusters(
        self,
        analysis_run_id: str,
        clusters: list[ClusterWrite],
        members: list[ClusterMemberWrite],
    ) -> None:
        self.client.table("cluster_members").delete().eq(
            "analysis_run_id", analysis_run_id
        ).execute()
        self.client.table("clusters").delete().eq(
            "analysis_run_id", analysis_run_id
        ).execute()
        if clusters:
            self.client.table("clusters").insert(
                [
                    {
                        "id": item.id,
                        "analysis_run_id": analysis_run_id,
                        "cluster_index": item.cluster_index,
                        "name": item.name,
                        "suggested_moment": item.suggested_moment,
                        "track_count": item.track_count,
                    }
                    for item in clusters
                ]
            ).execute()
        if members:
            self.client.table("cluster_members").insert(
                [
                    {
                        "analysis_run_id": analysis_run_id,
                        "track_id": item.track_id,
                        "cluster_id": item.cluster_id,
                        "umap_x": item.umap_x,
                        "umap_y": item.umap_y,
                        "suggested_moment": item.suggested_moment,
                        "reduced_embedding": _vector_literal(
                            pad_or_trim(item.reduced_embedding, REDUCED_DIM)
                        ),
                    }
                    for item in members
                ]
            ).execute()

    def _fetch_all(self, build, page_size: int = PAGE) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        start = 0
        while True:
            resp = build().range(start, start + page_size - 1).execute()
            batch = resp.data or []
            rows.extend(batch)
            if len(batch) < page_size:
                break
            start += page_size
        return rows


def _vector_literal(values: list[float] | None) -> str | None:
    if values is None:
        return None
    return "[" + ",".join(str(float(x)) for x in values) + "]"


def _run_from_row(row: dict[str, Any]) -> AnalysisRunRow:
    return AnalysisRunRow(
        id=str(row["id"]),
        library_id=str(row["library_id"]),
        mode=row.get("mode") or "fast",
        backend_name=row.get("backend_name") or "librosa",
        status=row.get("status") or "pending",
        pipeline_version=row.get("pipeline_version") or "",
        model_version=row.get("model_version") or "",
        feature_schema_version=row.get("feature_schema_version") or "",
        tracks_total=int(row.get("tracks_total") or 0),
        tracks_done=int(row.get("tracks_done") or 0),
    )


def _track_from_row(row: dict[str, Any]) -> TrackRow:
    return TrackRow(
        id=str(row["id"]),
        library_id=str(row["library_id"]),
        title=row.get("title") or "",
        artist=row.get("artist") or "",
        album=row.get("album") or "",
        genre=row.get("genre") or "",
        label=row.get("label") or "",
        bpm=row.get("bpm"),
        key=row.get("key") or "",
        duration_sec=row.get("duration_sec"),
        rating=int(row.get("rating") or 0),
        date_added=row.get("date_added") or "",
    )


def _audio_from_row(row: dict[str, Any]) -> AudioObjectRow:
    return AudioObjectRow(
        id=str(row["id"]),
        track_id=str(row["track_id"]),
        kind=row["kind"],
        bucket=row["bucket"],
        object_key=row["object_key"],
        content_type=row.get("content_type"),
        byte_size=row.get("byte_size"),
        sha256=row.get("sha256"),
    )


def _feature_from_row(row: dict[str, Any]) -> FeatureRow:
    return FeatureRow(
        track_id=str(row["track_id"]),
        analysis_run_id=str(row["analysis_run_id"]),
        status=row["status"],
        audio_file_hash=row.get("audio_file_hash"),
        features=row.get("features") or {},
        failure_reason=row.get("failure_reason"),
    )


def _embedding_from_row(row: dict[str, Any]) -> EmbeddingRow:
    vector = [float(x) for x in (row.get("embedding_raw") or [])]
    return EmbeddingRow(
        model_name=row.get("model_name") or "",
        vector=vector,
        dim=int(row.get("dimensions") or len(vector)),
    )
