from __future__ import annotations

import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from cratedig_local_api.migrations import migrate


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(
        path,
        check_same_thread=False,
        isolation_level=None,
        timeout=5.0,
    )
    conn.row_factory = sqlite3.Row
    conn.execute("pragma foreign_keys = on")
    conn.execute("pragma busy_timeout = 5000")
    conn.execute("pragma journal_mode = wal")
    conn.execute("pragma synchronous = normal")
    migrate(conn)
    return conn


@dataclass(frozen=True)
class TrackRow:
    id: str
    library_id: str
    title: str
    artist: str
    album: str
    genre: str
    label: str
    bpm: float | None
    musical_key: str
    duration_sec: float | None
    location: str
    location_kind: str
    audio_content_hash: str | None
    file_size_bytes: int | None
    file_mtime_ns: int | None
    rating: int | None
    date_added: str
    rekordbox_track_id: str
    bpm_source: str
    key_source: str
    energy_rating: int | None
    external_track_id: str
    created_at: str
    umap_x: float | None = None
    umap_y: float | None = None
    cluster_index: int | None = None
    cluster_name: str | None = None
    suggested_moment: str | None = None
    analysis_state: str | None = None

    def as_dict(self, *, missing: bool, preview_path: str) -> dict:
        return {
            "id": self.id,
            "library_id": self.library_id,
            "title": self.title,
            "artist": self.artist,
            "album": self.album,
            "genre": self.genre,
            "label": self.label,
            "bpm": self.bpm,
            "key": self.musical_key or None,
            "duration_sec": self.duration_sec,
            "location": self.location,
            "location_kind": self.location_kind,
            "audio_content_hash": self.audio_content_hash,
            "rating": self.rating,
            "date_added": self.date_added,
            "rekordbox_track_id": self.rekordbox_track_id or None,
            "bpm_source": self.bpm_source or None,
            "key_source": self.key_source or None,
            "energy_rating": self.energy_rating,
            "external_track_id": self.external_track_id or None,
            "created_at": self.created_at,
            "missing": missing,
            "preview_url": None if missing else preview_path,
            "umap_x": self.umap_x,
            "umap_y": self.umap_y,
            "cluster_index": self.cluster_index,
            "cluster_name": self.cluster_name or None,
            "suggested_moment": self.suggested_moment or None,
            "analysis_state": self.analysis_state,
        }


def _optional_int(value: object) -> int | None:
    if value is None:
        return None
    return int(value)


def _optional_float(value: object) -> float | None:
    if value is None:
        return None
    return float(value)


def _track(row: sqlite3.Row) -> TrackRow:
    keys = row.keys()
    duration = row["duration_sec"]
    return TrackRow(
        id=row["id"],
        library_id=row["library_id"],
        title=row["title"],
        artist=row["artist"],
        album=row["album"],
        genre=row["genre"],
        label=row["label"],
        bpm=float(row["bpm"]) if row["bpm"] is not None else None,
        musical_key=row["musical_key"],
        duration_sec=float(duration) if duration is not None else None,
        location=row["location"],
        location_kind=row["location_kind"],
        audio_content_hash=row["audio_content_hash"],
        file_size_bytes=row["file_size_bytes"],
        file_mtime_ns=row["file_mtime_ns"],
        rating=int(row["rating"]) if row["rating"] is not None else None,
        date_added=row["date_added"],
        rekordbox_track_id=row["rekordbox_track_id"],
        bpm_source=row["bpm_source"],
        key_source=row["key_source"],
        energy_rating=_optional_int(row["energy_rating"]) if "energy_rating" in keys else None,
        external_track_id=str(row["external_track_id"] or "") if "external_track_id" in keys else "",
        created_at=row["created_at"],
        umap_x=_optional_float(row["umap_x"]) if "umap_x" in keys else None,
        umap_y=_optional_float(row["umap_y"]) if "umap_y" in keys else None,
        cluster_index=_optional_int(row["cluster_index"]) if "cluster_index" in keys else None,
        cluster_name=(str(row["cluster_name"]) if "cluster_name" in keys and row["cluster_name"] else None),
        suggested_moment=(
            str(row["member_suggested_moment"])
            if "member_suggested_moment" in keys and row["member_suggested_moment"]
            else None
        ),
        analysis_state=(
            str(row["analysis_state"]) if "analysis_state" in keys and row["analysis_state"] else None
        ),
    )


def get_or_create_library(conn: sqlite3.Connection, name: str, source: str) -> str:
    row = conn.execute(
        "select id from libraries where name = ? and source = ?",
        (name, source),
    ).fetchone()
    if row:
        conn.execute(
            "update libraries set updated_at = ? where id = ?",
            (utc_now(), row["id"]),
        )
        conn.commit()
        return str(row["id"])
    library_id = str(uuid.uuid4())
    now = utc_now()
    conn.execute(
        "insert into libraries (id, name, source, created_at, updated_at) values (?, ?, ?, ?, ?)",
        (library_id, name, source, now, now),
    )
    conn.commit()
    return library_id


def upsert_library(
    conn: sqlite3.Connection,
    *,
    name: str,
    source: str,
    library_id: str | None = None,
    created_at: str | None = None,
) -> str:
    now = created_at or utc_now()
    if library_id:
        existing = conn.execute(
            "select id from libraries where id = ?",
            (library_id,),
        ).fetchone()
        if existing:
            conn.execute(
                "update libraries set name = ?, source = ?, updated_at = ? where id = ?",
                (name, source, utc_now(), library_id),
            )
            conn.commit()
            return library_id
        conn.execute(
            "insert into libraries (id, name, source, created_at, updated_at) values (?, ?, ?, ?, ?)",
            (library_id, name, source, now, now),
        )
        conn.commit()
        return library_id
    return get_or_create_library(conn, name, source)


def list_libraries(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        "select id, name, source, created_at, updated_at from libraries order by created_at"
    ).fetchall()
    return [dict(row) for row in rows]


def upsert_track(
    conn: sqlite3.Connection,
    *,
    library_id: str,
    title: str,
    artist: str,
    location: str,
    album: str = "",
    genre: str = "",
    label: str = "",
    bpm: float | None = None,
    musical_key: str = "",
    duration_sec: float | None = None,
    rating: int | None = None,
    date_added: str = "",
    rekordbox_track_id: str = "",
    bpm_source: str = "",
    key_source: str = "",
    energy_rating: int | None = None,
    external_track_id: str = "",
    audio_content_hash: str | None = None,
    file_size_bytes: int | None = None,
    file_mtime_ns: int | None = None,
    track_id: str | None = None,
    created_at: str | None = None,
) -> str:
    existing = None
    if track_id:
        existing = conn.execute("select id from tracks where id = ?", (track_id,)).fetchone()
    if existing is None:
        existing = conn.execute(
            "select id from tracks where library_id = ? and location = ?",
            (library_id, location),
        ).fetchone()
    if existing:
        conn.execute(
            """
            update tracks
            set title = ?, artist = ?, album = ?, genre = ?, label = ?,
                bpm = coalesce(?, bpm),
                musical_key = case when ? <> '' then ? else musical_key end,
                duration_sec = coalesce(?, duration_sec),
                rating = coalesce(?, rating),
                date_added = case when ? <> '' then ? else date_added end,
                rekordbox_track_id = case when ? <> '' then ? else rekordbox_track_id end,
                bpm_source = case when ? <> '' then ? else bpm_source end,
                key_source = case when ? <> '' then ? else key_source end,
                energy_rating = coalesce(?, energy_rating),
                external_track_id = case when ? <> '' then ? else external_track_id end,
                location = ?, location_kind = 'file', audio_content_hash = ?,
                file_size_bytes = ?, file_mtime_ns = ?
            where id = ?
            """,
            (
                title,
                artist,
                album,
                genre,
                label,
                bpm,
                musical_key,
                musical_key,
                duration_sec,
                rating,
                date_added,
                date_added,
                rekordbox_track_id,
                rekordbox_track_id,
                bpm_source,
                bpm_source,
                key_source,
                key_source,
                energy_rating,
                external_track_id,
                external_track_id,
                location,
                audio_content_hash,
                file_size_bytes,
                file_mtime_ns,
                existing["id"],
            ),
        )
        conn.commit()
        return str(existing["id"])
    inserted_id = track_id or str(uuid.uuid4())
    conn.execute(
        """
        insert into tracks (
          id, library_id, title, artist, album, genre, label, bpm, musical_key,
          duration_sec, location, location_kind, rating, date_added,
          rekordbox_track_id, bpm_source, key_source, energy_rating, external_track_id,
          audio_content_hash, file_size_bytes, file_mtime_ns, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'file', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            inserted_id,
            library_id,
            title,
            artist,
            album,
            genre,
            label,
            bpm,
            musical_key,
            duration_sec,
            location,
            rating,
            date_added,
            rekordbox_track_id,
            bpm_source,
            key_source,
            energy_rating,
            external_track_id,
            audio_content_hash,
            file_size_bytes,
            file_mtime_ns,
            created_at or utc_now(),
        ),
    )
    conn.commit()
    return inserted_id


TRACK_PROJECTION_SQL = """
select t.*,
       cm.umap_x,
       cm.umap_y,
       cm.suggested_moment as member_suggested_moment,
       c.cluster_index,
       c.name as cluster_name,
       case
         when s.any_failed = 1 and s.any_done = 0 then 'failed'
         when s.any_done = 1 or cm.track_id is not null then 'completed'
         else null
       end as analysis_state
from tracks t
left join (
  select r.library_id, r.id
  from analysis_runs r
  where r.status = 'completed'
    and r.created_at = (
      select max(r2.created_at)
      from analysis_runs r2
      where r2.library_id = r.library_id and r2.status = 'completed'
    )
) latest on latest.library_id = t.library_id
left join cluster_members cm
  on cm.track_id = t.id and cm.analysis_run_id = latest.id
left join clusters c on c.id = cm.cluster_id
left join (
  select track_id, run_id,
         max(case when status = 'failed' then 1 else 0 end) as any_failed,
         max(case when status in ('succeeded', 'skipped') then 1 else 0 end) as any_done
  from analysis_stages
  group by track_id, run_id
) s on s.track_id = t.id and s.run_id = latest.id
"""


def list_tracks(conn: sqlite3.Connection, library_id: str | None = None) -> list[TrackRow]:
    if library_id:
        rows = conn.execute(
            TRACK_PROJECTION_SQL + " where t.library_id = ? order by t.artist, t.title",
            (library_id,),
        ).fetchall()
    else:
        rows = conn.execute(TRACK_PROJECTION_SQL + " order by t.artist, t.title").fetchall()
    return [_track(row) for row in rows]


def get_track(conn: sqlite3.Connection, track_id: str) -> TrackRow | None:
    row = conn.execute(
        TRACK_PROJECTION_SQL + " where t.id = ?",
        (track_id,),
    ).fetchone()
    return _track(row) if row else None


def list_projection_points(
    conn: sqlite3.Connection,
    *,
    library_id: str | None = None,
    run_id: str | None = None,
) -> dict[str, object]:
    params: list[object] = []
    run_filter = ""
    if run_id:
        run_filter = "and r.id = ?"
        params.append(run_id)
    if library_id:
        run_filter += " and r.library_id = ?"
        params.append(library_id)
    run = conn.execute(
        f"""
        select r.id, r.library_id, r.created_at, m.name as manifest_name, m.version as manifest_version
        from analysis_runs r
        join model_set_manifests m on m.id = r.manifest_id
        where r.status = 'completed' {run_filter}
        order by r.created_at desc
        limit 1
        """,
        params,
    ).fetchone()
    if run is None:
        return {
            "run_id": None,
            "library_id": library_id,
            "projection_version": "none",
            "model_set_version": "none",
            "points": [],
        }
    members = conn.execute(
        """
        select cm.track_id, cm.umap_x, cm.umap_y, c.cluster_index, c.name as cluster_name
        from cluster_members cm
        left join clusters c on c.id = cm.cluster_id
        where cm.analysis_run_id = ?
        order by cm.track_id
        """,
        (run["id"],),
    ).fetchall()
    return {
        "run_id": run["id"],
        "library_id": run["library_id"],
        "projection_version": f"cloud-import:{run['id']}",
        "model_set_version": f"{run['manifest_name']}@{run['manifest_version']}",
        "points": [
            {
                "track_id": row["track_id"],
                "x": row["umap_x"],
                "y": row["umap_y"],
                "cluster_id": None if row["cluster_index"] is None else str(row["cluster_index"]),
                "cluster_name": row["cluster_name"] or None,
                "readiness": "ready_fast",
            }
            for row in members
        ],
    }


def find_tracks_by_content_hash(
    conn: sqlite3.Connection, audio_content_hash: str
) -> list[TrackRow]:
    rows = conn.execute(
        "select * from tracks where audio_content_hash = ? order by created_at, id",
        (audio_content_hash,),
    ).fetchall()
    return [_track(row) for row in rows]
