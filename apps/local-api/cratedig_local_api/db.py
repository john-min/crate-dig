from __future__ import annotations

import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = """
create table if not exists libraries (
  id text primary key,
  name text not null,
  source text not null,
  created_at text not null,
  updated_at text not null
);

create table if not exists tracks (
  id text primary key,
  library_id text not null references libraries (id) on delete cascade,
  title text not null default '',
  artist text not null default '',
  album text not null default '',
  duration_sec real,
  location text not null default '',
  location_kind text not null default 'file',
  created_at text not null,
  unique (library_id, location)
);

create index if not exists tracks_library_id_idx on tracks (library_id);
"""


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("pragma foreign_keys = on")
    conn.executescript(SCHEMA)
    conn.commit()
    return conn


@dataclass(frozen=True)
class TrackRow:
    id: str
    library_id: str
    title: str
    artist: str
    album: str
    duration_sec: float | None
    location: str
    location_kind: str
    created_at: str

    def as_dict(self, *, missing: bool, preview_path: str) -> dict:
        return {
            "id": self.id,
            "library_id": self.library_id,
            "title": self.title,
            "artist": self.artist,
            "album": self.album,
            "duration_sec": self.duration_sec,
            "location": self.location,
            "location_kind": self.location_kind,
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
        duration_sec=float(duration) if duration is not None else None,
        location=row["location"],
        location_kind=row["location_kind"],
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
) -> str:
    existing = conn.execute(
        "select id from tracks where library_id = ? and location = ?",
        (library_id, location),
    ).fetchone()
    if existing:
        conn.execute(
            "update tracks set title = ?, artist = ?, location_kind = 'file' where id = ?",
            (title, artist, existing["id"]),
        )
        conn.commit()
        return str(existing["id"])
    track_id = str(uuid.uuid4())
    conn.execute(
        """
        insert into tracks (
          id, library_id, title, artist, album, duration_sec, location, location_kind, created_at
        ) values (?, ?, ?, ?, '', null, ?, 'file', ?)
        """,
        (track_id, library_id, title, artist, location, utc_now()),
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
