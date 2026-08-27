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
    created_at: str

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
            "created_at": self.created_at,
            "missing": missing,
            "preview_url": None if missing else preview_path,
        }


def _track(row: sqlite3.Row) -> TrackRow:
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
        created_at=row["created_at"],
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
    audio_content_hash: str | None = None,
    file_size_bytes: int | None = None,
    file_mtime_ns: int | None = None,
) -> str:
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
                location_kind = 'file', audio_content_hash = ?,
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
                audio_content_hash,
                file_size_bytes,
                file_mtime_ns,
                existing["id"],
            ),
        )
        conn.commit()
        return str(existing["id"])
    track_id = str(uuid.uuid4())
    conn.execute(
        """
        insert into tracks (
          id, library_id, title, artist, album, genre, label, bpm, musical_key,
          duration_sec, location, location_kind, rating, date_added,
          rekordbox_track_id, bpm_source, key_source, audio_content_hash,
          file_size_bytes, file_mtime_ns, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'file', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            track_id,
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
            audio_content_hash,
            file_size_bytes,
            file_mtime_ns,
            utc_now(),
        ),
    )
    conn.commit()
    return track_id


def list_tracks(conn: sqlite3.Connection, library_id: str | None = None) -> list[TrackRow]:
    if library_id:
        rows = conn.execute(
            "select * from tracks where library_id = ? order by artist, title",
            (library_id,),
        ).fetchall()
    else:
        rows = conn.execute("select * from tracks order by artist, title").fetchall()
    return [_track(row) for row in rows]


def get_track(conn: sqlite3.Connection, track_id: str) -> TrackRow | None:
    row = conn.execute("select * from tracks where id = ?", (track_id,)).fetchone()
    return _track(row) if row else None


def find_tracks_by_content_hash(
    conn: sqlite3.Connection, audio_content_hash: str
) -> list[TrackRow]:
    rows = conn.execute(
        "select * from tracks where audio_content_hash = ? order by created_at, id",
        (audio_content_hash,),
    ).fetchall()
    return [_track(row) for row in rows]
