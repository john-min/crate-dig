from __future__ import annotations

import csv
import re
import sqlite3
import unicodedata
import uuid
from collections import defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path

from cratedig_local_api import db
from cratedig_local_api.rekordbox_metadata import ImportedTrackMetadata


REKORDBOX_CSV_SOURCE = "rekordbox_csv"
TITLE_ARTIST_MATCH = "normalized_title_artist"
_CAMELOT_KEY = re.compile(r"^0*(1[0-2]|[1-9])([AB])$", re.IGNORECASE)


@dataclass(frozen=True)
class CsvMetadataImportSummary:
    source_ref: str
    csv_rows: int
    library_tracks: int
    matched: int
    unmatched: int
    ambiguous: int
    source_records_written: int
    tracks_enriched: int
    fields_enriched: int
    bpm_conflicts: int
    key_conflicts: int

    def as_dict(self) -> dict[str, object]:
        return asdict(self)


def normalize_identity_part(value: str) -> str:
    """Normalize punctuation/case while retaining Unicode letters and digits."""

    composed = unicodedata.normalize("NFC", value)
    normalized_characters: list[str] = []
    for character in composed:
        if unicodedata.category(character)[0] not in {"L", "N"}:
            continue
        normalized_characters.extend(
            normalized
            for normalized in unicodedata.normalize("NFKD", character).casefold()
            if unicodedata.category(normalized)[0] in {"L", "N"}
        )
    return "".join(normalized_characters)


def track_identity(title: str, artist: str) -> tuple[str, str]:
    return normalize_identity_part(title), normalize_identity_part(artist)


def load_rekordbox_tracks_csv(path: Path) -> list[ImportedTrackMetadata]:
    source = path.expanduser().resolve()
    with source.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fields = set(reader.fieldnames or ())
        missing = {"track_id", "title", "artist"} - fields
        if missing:
            names = ", ".join(sorted(missing))
            raise ValueError(f"Rekordbox tracks CSV is missing columns: {names}")
        return [_metadata_from_row(row) for row in reader]


def import_rekordbox_tracks_csv(
    conn: sqlite3.Connection,
    *,
    library_id: str,
    csv_path: Path,
    source_ref: str | None = None,
) -> CsvMetadataImportSummary:
    """Join legacy Rekordbox CSV rows to a library by normalized title + artist.

    Every unambiguous match is retained in ``track_metadata_sources``. The
    canonical ``tracks`` row is enriched only where it has no existing value.
    """

    source = csv_path.expanduser().resolve()
    rows = load_rekordbox_tracks_csv(source)
    tracks = db.list_tracks(conn, library_id)
    if not tracks and library_id not in {row["id"] for row in db.list_libraries(conn)}:
        raise LookupError(f"Library not found: {library_id}")

    source_name = source_ref or str(source)
    tracks_by_identity: dict[tuple[str, str], list[db.TrackRow]] = defaultdict(list)
    rows_by_identity: dict[
        tuple[str, str], list[ImportedTrackMetadata]
    ] = defaultdict(list)
    for track in tracks:
        tracks_by_identity[track_identity(track.title, track.artist)].append(track)
    for row in rows:
        rows_by_identity[track_identity(row.title, row.artist)].append(row)

    matched: list[tuple[db.TrackRow, ImportedTrackMetadata]] = []
    ambiguous = 0
    unmatched = 0
    for identity, source_rows in rows_by_identity.items():
        candidates = tracks_by_identity.get(identity, [])
        if len(source_rows) == 1 and len(candidates) == 1:
            matched.append((candidates[0], source_rows[0]))
        elif candidates:
            ambiguous += len(source_rows)
        else:
            unmatched += len(source_rows)

    bpm_conflicts = 0
    key_conflicts = 0
    tracks_enriched = 0
    fields_enriched = 0
    now = db.utc_now()

    conn.execute("begin immediate")
    try:
        for track, metadata in matched:
            if (
                track.bpm is not None
                and metadata.bpm is not None
                and abs(track.bpm - metadata.bpm) > 0.05
            ):
                bpm_conflicts += 1
            if (
                track.musical_key
                and metadata.musical_key
                and _canonical_key(track.musical_key)
                != _canonical_key(metadata.musical_key)
            ):
                key_conflicts += 1

            enrichment_count = _enrichment_count(track, metadata)
            if enrichment_count:
                tracks_enriched += 1
                fields_enriched += enrichment_count
            _enrich_track(conn, track, metadata)
            _upsert_source_record(
                conn,
                track_id=track.id,
                metadata=metadata,
                source_ref=source_name,
                now=now,
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise

    return CsvMetadataImportSummary(
        source_ref=source_name,
        csv_rows=len(rows),
        library_tracks=len(tracks),
        matched=len(matched),
        unmatched=unmatched,
        ambiguous=ambiguous,
        source_records_written=len(matched),
        tracks_enriched=tracks_enriched,
        fields_enriched=fields_enriched,
        bpm_conflicts=bpm_conflicts,
        key_conflicts=key_conflicts,
    )


def _metadata_from_row(row: dict[str, str | None]) -> ImportedTrackMetadata:
    bpm = _optional_float(row.get("bpm"))
    musical_key = (row.get("key") or "").strip()
    return ImportedTrackMetadata(
        title=(row.get("title") or "").strip(),
        artist=(row.get("artist") or "").strip(),
        album=(row.get("album") or "").strip(),
        genre=(row.get("genre") or "").strip(),
        label=(row.get("label") or "").strip(),
        bpm=bpm,
        musical_key=musical_key,
        duration_sec=_optional_float(row.get("duration_sec")),
        rating=_optional_int(row.get("rating")),
        date_added=(row.get("date_added") or "").strip(),
        rekordbox_track_id=(row.get("track_id") or "").strip(),
        bpm_source=REKORDBOX_CSV_SOURCE if bpm is not None else "",
        key_source=REKORDBOX_CSV_SOURCE if musical_key else "",
    )


def _enrichment_count(
    track: db.TrackRow, metadata: ImportedTrackMetadata
) -> int:
    pairs = (
        (track.album, metadata.album),
        (track.genre, metadata.genre),
        (track.label, metadata.label),
        (track.bpm, metadata.bpm),
        (track.musical_key, metadata.musical_key),
        (track.duration_sec, metadata.duration_sec),
        (track.rating, metadata.rating),
        (track.date_added, metadata.date_added),
        (track.rekordbox_track_id, metadata.rekordbox_track_id),
    )
    return sum(current in (None, "") and incoming not in (None, "") for current, incoming in pairs)


def _enrich_track(
    conn: sqlite3.Connection,
    track: db.TrackRow,
    metadata: ImportedTrackMetadata,
) -> None:
    conn.execute(
        """
        update tracks
        set album = case when album = '' then ? else album end,
            genre = case when genre = '' then ? else genre end,
            label = case when label = '' then ? else label end,
            bpm = coalesce(bpm, ?),
            musical_key = case when musical_key = '' then ? else musical_key end,
            duration_sec = coalesce(duration_sec, ?),
            rating = coalesce(rating, ?),
            date_added = case when date_added = '' then ? else date_added end,
            rekordbox_track_id = case when rekordbox_track_id = '' then ? else rekordbox_track_id end,
            bpm_source = case when bpm is null and ? is not null then ? else bpm_source end,
            key_source = case when musical_key = '' and ? <> '' then ? else key_source end
        where id = ?
        """,
        (
            metadata.album,
            metadata.genre,
            metadata.label,
            metadata.bpm,
            metadata.musical_key,
            metadata.duration_sec,
            metadata.rating,
            metadata.date_added,
            metadata.rekordbox_track_id,
            metadata.bpm,
            REKORDBOX_CSV_SOURCE,
            metadata.musical_key,
            REKORDBOX_CSV_SOURCE,
            track.id,
        ),
    )


def _upsert_source_record(
    conn: sqlite3.Connection,
    *,
    track_id: str,
    metadata: ImportedTrackMetadata,
    source_ref: str,
    now: str,
) -> None:
    identity = "|".join(
        (track_id, REKORDBOX_CSV_SOURCE, source_ref, metadata.rekordbox_track_id)
    )
    source_id = str(uuid.uuid5(uuid.NAMESPACE_URL, identity))
    conn.execute(
        """
        insert into track_metadata_sources (
          id, track_id, source_type, source_ref, source_track_id, match_method,
          title, artist, album, genre, label, bpm, musical_key, duration_sec,
          rating, date_added, imported_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict (track_id, source_type, source_ref, source_track_id) do update set
          match_method = excluded.match_method,
          title = excluded.title,
          artist = excluded.artist,
          album = excluded.album,
          genre = excluded.genre,
          label = excluded.label,
          bpm = excluded.bpm,
          musical_key = excluded.musical_key,
          duration_sec = excluded.duration_sec,
          rating = excluded.rating,
          date_added = excluded.date_added,
          updated_at = excluded.updated_at
        """,
        (
            source_id,
            track_id,
            REKORDBOX_CSV_SOURCE,
            source_ref,
            metadata.rekordbox_track_id,
            TITLE_ARTIST_MATCH,
            metadata.title,
            metadata.artist,
            metadata.album,
            metadata.genre,
            metadata.label,
            metadata.bpm,
            metadata.musical_key,
            metadata.duration_sec,
            metadata.rating,
            metadata.date_added,
            now,
            now,
        ),
    )


def _canonical_key(value: str) -> str:
    compact = "".join(value.split()).upper()
    match = _CAMELOT_KEY.fullmatch(compact)
    return f"{int(match.group(1))}{match.group(2).upper()}" if match else compact


def _optional_float(value: object) -> float | None:
    try:
        return float(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _optional_int(value: object) -> int | None:
    try:
        return int(float(value)) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None
