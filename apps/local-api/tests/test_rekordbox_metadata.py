from __future__ import annotations

import json
import sys
from pathlib import Path
from types import SimpleNamespace

from cratedig_local_api import rekordbox_metadata


def test_rekordbox_usb_index_joins_by_device_path_and_preserves_provenance(
    tmp_path: Path, monkeypatch
):
    usb = tmp_path / "Jeff USB"
    audio = usb / "Contents" / "Artist" / "Album" / "Artist - Track.flac"
    audio.parent.mkdir(parents=True)
    audio.touch()
    database_path = usb / "PIONEER" / "rekordbox" / "export.pdb"
    database_path.parent.mkdir(parents=True)
    database_path.touch()

    database = SimpleNamespace(
        artists=[SimpleNamespace(id=1, name="Artist")],
        albums=[SimpleNamespace(id=2, name="Album")],
        genres=[SimpleNamespace(id=3, name="Deep House")],
        labels=[SimpleNamespace(id=4, name="Test Label")],
        keys=[SimpleNamespace(id=5, name="8A")],
        tracks=[
            SimpleNamespace(
                id=99,
                title="Track",
                artist_id=1,
                album_id=2,
                genre_id=3,
                label_id=4,
                key_id=5,
                tempo=12345,
                duration=301,
                rating=4,
                date_added="2026-08-01",
                file_path="/Contents/Artist/Album/Artist - Track.flac",
            )
        ],
    )

    class FakeDatabase:
        @staticmethod
        def from_file(path):
            assert Path(path) == database_path
            return database

    monkeypatch.setitem(
        sys.modules, "rekordbox_pdb", SimpleNamespace(Database=FakeDatabase)
    )

    index = rekordbox_metadata.load_rekordbox_usb_index(usb / "Contents")
    assert index is not None
    metadata = index.metadata_for(audio)
    assert metadata is not None
    assert metadata.bpm == 123.45
    assert metadata.musical_key == "8A"
    assert metadata.bpm_source == "rekordbox_usb"
    assert metadata.key_source == "rekordbox_usb"
    assert metadata.rekordbox_track_id == "99"


def test_audio_tag_fallback_reads_bpm_key_and_mixed_in_key_json(
    tmp_path: Path, monkeypatch
):
    audio = tmp_path / "track.flac"
    audio.touch()
    mixed_in_key = "eyJrZXkiOiI3QSIsInNvdXJjZSI6Im1peGVkaW5rZXkifQ=="
    payload = {
        "format": {
            "duration": "240.25",
            "tags": {
                "ARTIST": "Artist",
                "TITLE": "Track",
                "BPM": "124",
                "KEY": mixed_in_key,
            },
        }
    }
    monkeypatch.setattr(rekordbox_metadata.shutil, "which", lambda _: "/ffprobe")
    monkeypatch.setattr(
        rekordbox_metadata.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(stdout=json.dumps(payload)),
    )

    metadata = rekordbox_metadata.probe_audio_tags(audio)
    assert metadata is not None
    assert metadata.bpm == 124.0
    assert metadata.musical_key == "7A"
    assert metadata.duration_sec == 240.25
    assert metadata.bpm_source == "audio_tag"
    assert metadata.key_source == "audio_tag"
