"""Hydrate the shared local SQLite library from Supabase Cloud Run analysis.

Used by localhost web (`NEXT_PUBLIC_APP_MODE=local`) and the desktop sidecar.
Both open `${CRATE_DIG_HOME}/crate-dig.sqlite`. This copies the demo/cloud
library metadata plus the latest completed analysis run (features, embeddings,
clusters/UMAP) into that database, then materializes `librosa-zscore-v1`
neighbors.

Secrets stay in env / `.env.local`. The Electron renderer never sees them.
"""

from __future__ import annotations

import json
import os
import sys
import uuid
from argparse import ArgumentParser
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

from cratedig_local_api import db
from cratedig_local_api.repository import Repository, _canonical_json, _embedding_bytes
from cratedig_local_api.settings import Settings

CLOUD_IMPORT_MANIFEST_NAME = "cloud-import"
CLOUD_IMPORT_MANIFEST_VERSION = "1"
RETRIEVAL_EMBEDDING_KEY = "retrieval:track"
NEIGHBOR_CHANNEL = "librosa-zscore-v1"
PAGE = 1000
ROOT = Path(__file__).resolve().parents[3]


class HydrateError(RuntimeError):
    """User-facing hydrate failure."""


class Rest:
    def __init__(self, base: str, secret: str) -> None:
        self.base = base.rstrip("/")
        self.secret = secret

    def request(
        self,
        method: str,
        path: str,
        *,
        extra: dict[str, str] | None = None,
    ) -> Any:
        headers = {
            "apikey": self.secret,
            "Authorization": f"Bearer {self.secret}",
            "Accept": "application/json",
            "Prefer": "count=exact",
        }
        if extra:
            headers.update(extra)
        req = Request(self.base + path, headers=headers, method=method)
        try:
            with urlopen(req, timeout=60) as response:
                body = response.read().decode()
                return json.loads(body) if body else None
        except HTTPError as error:
            detail = error.read().decode()
            raise HydrateError(f"{method} {path} failed {error.code}: {detail[:800]}") from error

    def get_all(self, path: str) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        start = 0
        separator = "&" if "?" in path else "?"
        while True:
            batch = self.request(
                "GET",
                f"{path}{separator}offset={start}&limit={PAGE}",
                extra={"Range": f"{start}-{start + PAGE - 1}"},
            ) or []
            if not isinstance(batch, list):
                raise HydrateError(f"expected a list from {path}")
            rows.extend(batch)
            if len(batch) < PAGE:
                break
            start += PAGE
        return rows


def load_env_file(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key] = value.strip().strip('"').strip("'")
    return env


def resolve_supabase_env(env_file: Path | None = None) -> tuple[str, str]:
    merged: dict[str, str] = {}
    for candidate in (
        ROOT / ".env",
        ROOT / "apps" / "web" / ".env.local",
        env_file,
    ):
        if candidate is not None:
            merged.update(load_env_file(candidate))
    merged.update({key: value for key, value in os.environ.items() if value})
    url = (
        merged.get("NEXT_PUBLIC_SUPABASE_URL")
        or merged.get("SUPABASE_URL")
        or merged.get("CRATE_DIG_SUPABASE_URL")
        or ""
    ).strip()
    secret = (
        merged.get("SUPABASE_SECRET_KEY")
        or merged.get("SUPABASE_SERVICE_ROLE_KEY")
        or ""
    ).strip()
    if not url or not secret:
        raise HydrateError(
            "Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY "
            "(from apps/web/.env.local, repo .env, or the process environment)."
        )
    return url, secret


def resolve_audio_location(object_key: str, audio_root: Path | None) -> str:
    if not object_key:
        return ""
    if audio_root is None:
        return object_key
    candidates = [audio_root / object_key, audio_root / Path(object_key).name]
    if "/Contents/" in object_key.replace("\\", "/"):
        suffix = object_key.replace("\\", "/").split("/Contents/", 1)[1]
        candidates.append(audio_root / suffix)
        candidates.append(audio_root / "Contents" / suffix)
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate.resolve())
    return object_key


def fetch_cloud_snapshot(
    rest: Rest,
    *,
    library_id: str | None = None,
    run_id: str | None = None,
    source: str = "demo",
) -> dict[str, Any]:
    if library_id:
        libraries = rest.get_all(
            f"/rest/v1/libraries?select=id,name,source,created_at,updated_at&id=eq.{quote(library_id)}"
        )
    else:
        libraries = rest.get_all(
            f"/rest/v1/libraries?select=id,name,source,created_at,updated_at&source=eq.{quote(source)}&order=created_at.asc"
        )
    if not libraries:
        raise HydrateError("No matching Supabase library found.")
    library = libraries[0]
    library_id = str(library["id"])
    tracks = rest.get_all(
        "/rest/v1/tracks?select=id,library_id,external_track_id,title,artist,album,genre,label,"
        "bpm,key,duration_sec,rating,energy_rating,date_added,original_location,created_at"
        f"&library_id=eq.{quote(library_id)}&order=artist.asc,title.asc"
    )
    audio_objects = rest.get_all(
        "/rest/v1/audio_objects?select=track_id,kind,object_key"
        "&kind=eq.original"
    )
    audio_by_track = {
        str(row["track_id"]): str(row.get("object_key") or "")
        for row in audio_objects
        if row.get("track_id")
    }
    if run_id:
        runs = rest.get_all(
            "/rest/v1/analysis_runs?select=id,library_id,mode,backend_name,status,"
            "pipeline_version,model_version,feature_schema_version,tracks_total,tracks_done,"
            "created_at,started_at,finished_at"
            f"&id=eq.{quote(run_id)}"
        )
    else:
        runs = rest.get_all(
            "/rest/v1/analysis_runs?select=id,library_id,mode,backend_name,status,"
            "pipeline_version,model_version,feature_schema_version,tracks_total,tracks_done,"
            "created_at,started_at,finished_at"
            f"&library_id=eq.{quote(library_id)}&status=eq.completed&order=created_at.desc"
        )
    analysis_run = runs[0] if runs else None
    features: list[dict[str, Any]] = []
    embeddings: list[dict[str, Any]] = []
    clusters: list[dict[str, Any]] = []
    members: list[dict[str, Any]] = []
    if analysis_run:
        run_id = str(analysis_run["id"])
        features = rest.get_all(
            "/rest/v1/track_features?select=track_id,analysis_run_id,status,features,failure_reason,audio_file_hash,created_at"
            f"&analysis_run_id=eq.{quote(run_id)}"
        )
        embeddings = rest.get_all(
            "/rest/v1/track_embeddings?select=track_id,analysis_run_id,model_name,dimensions,embedding_raw,created_at"
            f"&analysis_run_id=eq.{quote(run_id)}"
        )
        clusters = rest.get_all(
            "/rest/v1/clusters?select=id,analysis_run_id,cluster_index,name,suggested_moment,track_count,created_at"
            f"&analysis_run_id=eq.{quote(run_id)}&order=cluster_index.asc"
        )
        members = rest.get_all(
            "/rest/v1/cluster_members?select=track_id,analysis_run_id,cluster_id,umap_x,umap_y,suggested_moment,created_at"
            f"&analysis_run_id=eq.{quote(run_id)}"
        )
    for track in tracks:
        track_id = str(track.get("id") or "")
        if not track.get("original_location"):
            track["original_location"] = audio_by_track.get(track_id, "")
    return {
        "library": library,
        "tracks": tracks,
        "analysis_run": analysis_run,
        "track_features": features,
        "track_embeddings": embeddings,
        "clusters": clusters,
        "cluster_members": members,
    }


def cloud_import_manifest(pipeline_version: str) -> dict[str, Any]:
    version = pipeline_version.strip() or CLOUD_IMPORT_MANIFEST_VERSION
    return {
        "name": CLOUD_IMPORT_MANIFEST_NAME,
        "version": version,
        "extractors": [{"name": "cloud-run", "version": version}],
    }


def import_cloud_snapshot(
    conn: Any,
    snapshot: dict[str, Any],
    *,
    audio_root: Path | None = None,
    materialize_neighbors: bool = True,
) -> dict[str, Any]:
    library_row = snapshot.get("library") or {}
    if not library_row.get("id"):
        raise HydrateError("snapshot is missing library.id")
    library_id = db.upsert_library(
        conn,
        library_id=str(library_row["id"]),
        name=str(library_row.get("name") or "Crate Dig demo"),
        source=str(library_row.get("source") or "demo"),
        created_at=library_row.get("created_at"),
    )
    imported_tracks = 0
    for track in snapshot.get("tracks") or []:
        object_key = str(track.get("original_location") or "")
        location = resolve_audio_location(object_key, audio_root)
        db.upsert_track(
            conn,
            library_id=library_id,
            track_id=str(track["id"]),
            title=str(track.get("title") or "").strip() or "Untitled",
            artist=str(track.get("artist") or "").strip() or "Unknown artist",
            album=str(track.get("album") or ""),
            genre=str(track.get("genre") or ""),
            label=str(track.get("label") or ""),
            bpm=track.get("bpm"),
            musical_key=str(track.get("key") or ""),
            duration_sec=track.get("duration_sec"),
            rating=track.get("rating"),
            date_added=str(track.get("date_added") or ""),
            rekordbox_track_id=str(track.get("rekordbox_track_id") or ""),
            energy_rating=track.get("energy_rating"),
            external_track_id=str(track.get("external_track_id") or ""),
            location=location or str(track["id"]),
            bpm_source="cloud" if track.get("bpm") is not None else "",
            key_source="cloud" if track.get("key") else "",
            created_at=track.get("created_at"),
        )
        imported_tracks += 1

    analysis_run = snapshot.get("analysis_run")
    neighbor_result: dict[str, Any] | None = None
    imported_features = 0
    imported_embeddings = 0
    imported_clusters = 0
    imported_members = 0
    repository = Repository(conn)
    if analysis_run:
        pipeline_version = str(
            analysis_run.get("pipeline_version") or analysis_run.get("model_version") or "imported"
        )
        manifest = repository.upsert_model_set_manifest(
            cloud_import_manifest(pipeline_version)
        )
        run_id, imported_features, imported_embeddings, imported_clusters, imported_members = (
            _replace_imported_run(
                conn,
                library_id=library_id,
                manifest_id=str(manifest["id"]),
                snapshot=snapshot,
            )
        )
        if materialize_neighbors and imported_embeddings:
            neighbor_result = repository.materialize_exact_neighbors(
                run_id,
                channel=NEIGHBOR_CHANNEL,
                embedding_key=RETRIEVAL_EMBEDDING_KEY,
                top_k=25,
                normalization="zscore-v1",
            )

    local_audio = 0
    if audio_root is not None:
        for row in db.list_tracks(conn, library_id):
            if Path(row.location).is_file():
                local_audio += 1
    return {
        "library_id": library_id,
        "library_name": library_row.get("name"),
        "tracks": imported_tracks,
        "analysis_run_id": (analysis_run or {}).get("id"),
        "features": imported_features,
        "embeddings": imported_embeddings,
        "clusters": imported_clusters,
        "cluster_members": imported_members,
        "neighbors": neighbor_result,
        "local_audio_files": local_audio,
    }


def _replace_imported_run(
    conn: Any,
    *,
    library_id: str,
    manifest_id: str,
    snapshot: dict[str, Any],
) -> tuple[str, int, int, int, int]:
    run = snapshot["analysis_run"]
    run_id = str(run["id"])
    now = db.utc_now()
    mode = run.get("mode") if run.get("mode") in {"fast", "deep"} else "fast"
    created_at = str(run.get("created_at") or now)
    finished_at = str(run.get("finished_at") or now)
    backend = str(run.get("backend_name") or "cloud-run")
    pipeline_version = str(run.get("pipeline_version") or "imported")
    tracks = snapshot.get("tracks") or []
    features_by_track = {
        str(row["track_id"]): row for row in snapshot.get("track_features") or [] if row.get("track_id")
    }
    embeddings = [row for row in snapshot.get("track_embeddings") or [] if row.get("track_id")]
    clusters = snapshot.get("clusters") or []
    members = snapshot.get("cluster_members") or []

    conn.execute("begin immediate")
    try:
        conn.execute("delete from similarity_neighbors where analysis_run_id = ?", (run_id,))
        conn.execute("delete from cluster_members where analysis_run_id = ?", (run_id,))
        conn.execute("delete from clusters where analysis_run_id = ?", (run_id,))
        conn.execute("delete from track_features where analysis_run_id = ?", (run_id,))
        conn.execute("delete from track_embeddings where analysis_run_id = ?", (run_id,))
        conn.execute("delete from analysis_stages where run_id = ?", (run_id,))
        conn.execute("delete from analysis_runs where id = ?", (run_id,))
        conn.execute(
            """
            insert into analysis_runs (
              id, library_id, manifest_id, mode, idempotency_key, status,
              tracks_total, stages_total, stages_done, created_at, started_at,
              finished_at, updated_at
            ) values (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                library_id,
                manifest_id,
                mode,
                f"cloud-import:{run_id}",
                len(tracks),
                len(tracks),
                len(tracks),
                created_at,
                run.get("started_at") or created_at,
                finished_at,
                now,
            ),
        )
        feature_count = 0
        for track in tracks:
            track_id = str(track["id"])
            feature = features_by_track.get(track_id) or {}
            status = str(feature.get("status") or "ok")
            stage_status = "succeeded" if status == "ok" else "failed" if status == "failed" else "skipped"
            stage_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"cloud-import:{run_id}:{track_id}"))
            conn.execute(
                """
                insert into analysis_stages (
                  id, run_id, track_id, stage_name, extractor_name, extractor_version,
                  status, attempt_count, max_attempts, retryable, progress,
                  created_at, started_at, finished_at, updated_at
                ) values (?, ?, ?, 'extract', ?, ?, ?, 1, 1, 0, 1, ?, ?, ?, ?)
                """,
                (
                    stage_id,
                    run_id,
                    track_id,
                    backend,
                    pipeline_version,
                    stage_status,
                    created_at,
                    created_at,
                    finished_at,
                    now,
                ),
            )
            values = feature.get("features") or {}
            conn.execute(
                """
                insert into track_features (
                  id, track_id, analysis_run_id, stage_id, feature_key, evidence_key,
                  extractor_name, extractor_version, scope, value_json, provenance_json, created_at
                ) values (?, ?, ?, ?, 'cloud.features:track', ?, ?, ?, 'track', ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    track_id,
                    run_id,
                    stage_id,
                    _canonical_json(("cloud.features:track", "track", None, None, None)),
                    backend,
                    pipeline_version,
                    _canonical_json(values),
                    _canonical_json(
                        {
                            "imported_from": "supabase",
                            "audio_file_hash": feature.get("audio_file_hash"),
                            "status": status,
                        }
                    ),
                    str(feature.get("created_at") or now),
                ),
            )
            feature_count += 1
        embedding_count = 0
        for row in embeddings:
            vector = row.get("embedding_raw") or []
            if not vector:
                continue
            payload, dimensions = _embedding_bytes(vector, row.get("dimensions"))
            track_id = str(row["track_id"])
            stage_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"cloud-import:{run_id}:{track_id}"))
            model_name = str(row.get("model_name") or backend)
            conn.execute(
                """
                insert into track_embeddings (
                  id, track_id, analysis_run_id, stage_id, embedding_key, evidence_key,
                  model_name, model_version, scope, pooling_strategy, dimensions, dtype,
                  embedding_blob, provenance_json, created_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?, 'track', 'cloud-import', ?, 'float32-le', ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    track_id,
                    run_id,
                    stage_id,
                    RETRIEVAL_EMBEDDING_KEY,
                    _canonical_json((RETRIEVAL_EMBEDDING_KEY, "track", None, None, None)),
                    model_name,
                    pipeline_version,
                    dimensions,
                    payload,
                    _canonical_json({"imported_from": "supabase", "model_name": model_name}),
                    str(row.get("created_at") or now),
                ),
            )
            embedding_count += 1
        cluster_count = 0
        for cluster in clusters:
            conn.execute(
                """
                insert into clusters (
                  id, analysis_run_id, cluster_index, name, suggested_moment, track_count, created_at
                ) values (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(cluster["id"]),
                    run_id,
                    int(cluster.get("cluster_index") or 0),
                    str(cluster.get("name") or ""),
                    str(cluster.get("suggested_moment") or ""),
                    int(cluster.get("track_count") or 0),
                    str(cluster.get("created_at") or now),
                ),
            )
            cluster_count += 1
        member_count = 0
        for member in members:
            conn.execute(
                """
                insert into cluster_members (
                  analysis_run_id, track_id, cluster_id, umap_x, umap_y, suggested_moment, created_at
                ) values (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    str(member["track_id"]),
                    member.get("cluster_id"),
                    float(member["umap_x"]),
                    float(member["umap_y"]),
                    str(member.get("suggested_moment") or ""),
                    str(member.get("created_at") or now),
                ),
            )
            member_count += 1
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return run_id, feature_count, embedding_count, cluster_count, member_count


def main(argv: list[str] | None = None) -> int:
    parser = ArgumentParser(
        description="Copy the Supabase demo library and Cloud Run analysis into local SQLite"
    )
    parser.add_argument("--from-snapshot", type=Path, help="Hydrate from a JSON snapshot instead of Supabase")
    parser.add_argument("--dump-snapshot", type=Path, help="Write the fetched Supabase snapshot to this path")
    parser.add_argument("--library-id", help="Supabase library id (default: first source=demo library)")
    parser.add_argument("--run-id", help="Completed analysis_runs.id (default: latest completed for the library)")
    parser.add_argument("--audio-root", type=Path, help="Optional local folder to resolve original_location against")
    parser.add_argument("--env-file", type=Path, help="Extra env file with NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY")
    parser.add_argument("--skip-neighbors", action="store_true")
    args = parser.parse_args(argv)

    try:
        if args.from_snapshot:
            snapshot = json.loads(args.from_snapshot.read_text())
        else:
            url, secret = resolve_supabase_env(args.env_file)
            snapshot = fetch_cloud_snapshot(
                Rest(url, secret),
                library_id=args.library_id,
                run_id=args.run_id,
            )
            if args.dump_snapshot:
                args.dump_snapshot.parent.mkdir(parents=True, exist_ok=True)
                args.dump_snapshot.write_text(json.dumps(snapshot, indent=2, sort_keys=True) + "\n")

        settings = Settings.from_env()
        conn = db.connect(settings.sqlite_path)
        try:
            summary = import_cloud_snapshot(
                conn,
                snapshot,
                audio_root=args.audio_root.expanduser() if args.audio_root else None,
                materialize_neighbors=not args.skip_neighbors,
            )
        finally:
            conn.close()
        print(json.dumps(summary, sort_keys=True, default=str))
        return 0
    except HydrateError as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
