from __future__ import annotations

import csv
from pathlib import Path

from cratedig_local_api import db
from cratedig_local_api.csv_metadata import (
    import_rekordbox_tracks_csv,
    normalize_identity_part,
)


def write_tracks_csv(path: Path, rows: list[dict[str, object]]) -> None:
    fields = [
        "track_id",
        "title",
        "artist",
        "album",
        "genre",
        "label",
        "bpm",
        "key",
        "duration_sec",
        "location",
        "rating",
        "date_added",
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def test_csv_import_matches_normalized_title_artist_and_preserves_existing_values(
    tmp_path: Path,
):
    conn = db.connect(tmp_path / "crate-dig.sqlite")
    library_id = db.get_or_create_library(conn, "Jeff USB", "folder")
    track_id = db.upsert_track(
        conn,
        library_id=library_id,
        title="Sunday Sunset",
        artist="Josh Butler, SOHMI",
        location="/music/sunday-sunset.flac",
        bpm=124.0,
        musical_key="04A",
        bpm_source="rekordbox_usb",
        key_source="rekordbox_usb",
    )
    csv_path = tmp_path / "tracks.csv"
    write_tracks_csv(
        csv_path,
        [
            {
                "track_id": "123",
                "title": "Sunday Sunset!",
                "artist": "JOSH BUTLER, SOHMI",
                "album": "Sunset EP",
                "genre": "Deep House",
                "label": "Test Label",
                "bpm": 124,
                "key": "4A",
                "duration_sec": 365,
                "location": "file:///legacy/sunday-sunset.flac",
                "rating": 4,
                "date_added": "2026-01-01",
            }
        ],
    )

    summary = import_rekordbox_tracks_csv(
        conn,
        library_id=library_id,
        csv_path=csv_path,
        source_ref="data/reference/jeff/rekordbox_tracks.csv",
    )

    assert summary.matched == 1
    assert summary.unmatched == 0
    assert summary.ambiguous == 0
    assert summary.bpm_conflicts == 0
    assert summary.key_conflicts == 0
    assert summary.tracks_enriched == 1
    updated = db.get_track(conn, track_id)
    assert updated is not None
    assert updated.album == "Sunset EP"
    assert updated.genre == "Deep House"
    assert updated.bpm == 124.0
    assert updated.musical_key == "04A"
    assert updated.bpm_source == "rekordbox_usb"
    assert updated.key_source == "rekordbox_usb"
    source = conn.execute(
        "select * from track_metadata_sources where track_id = ?", (track_id,)
    ).fetchone()
    assert source["source_type"] == "rekordbox_csv"
    assert source["source_track_id"] == "123"
    assert source["match_method"] == "normalized_title_artist"
    assert source["musical_key"] == "4A"
    conn.close()


def test_csv_import_skips_ambiguous_and_unmatched_rows(tmp_path: Path):
    conn = db.connect(tmp_path / "crate-dig.sqlite")
    library_id = db.get_or_create_library(conn, "Library", "folder")
    for suffix in ("one", "two"):
        db.upsert_track(
            conn,
            library_id=library_id,
            title="Duplicate",
            artist="Artist",
            location=f"/music/{suffix}.wav",
        )
    csv_path = tmp_path / "tracks.csv"
    write_tracks_csv(
        csv_path,
        [
            {"track_id": "1", "title": "Duplicate", "artist": "Artist"},
            {"track_id": "2", "title": "Missing", "artist": "Elsewhere"},
        ],
    )

    summary = import_rekordbox_tracks_csv(
        conn, library_id=library_id, csv_path=csv_path
    )

    assert summary.matched == 0
    assert summary.ambiguous == 1
    assert summary.unmatched == 1
    assert conn.execute("select count(*) from track_metadata_sources").fetchone()[0] == 0
    conn.close()


def test_identity_normalization_retains_non_latin_letters():
    assert normalize_identity_part("GOING BACK TO CALI ㋡") == "goingbacktocali"
    assert normalize_identity_part("Beyoncé") == "beyonce"
    assert normalize_identity_part("東京") == "東京"
