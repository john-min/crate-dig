from __future__ import annotations

import wave
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from cratedig_local_api.app import create_app
from cratedig_local_api.settings import Settings


def write_silence_wav(path: Path, frames: int = 800) -> None:
    with wave.open(str(path), "w") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(8000)
        wav.writeframes(b"\x00\x00" * frames)


@pytest.fixture
def client(tmp_path: Path):
    settings = Settings(home=tmp_path)
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def test_health(client: TestClient):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["ok"] is True


def test_folder_import_and_range_playback(client: TestClient, tmp_path: Path):
    folder = tmp_path / "music"
    folder.mkdir()
    write_silence_wav(folder / "Anais Kerr - Salt Flats.wav")
    (folder / "notes.txt").write_text("ignore")
    nested = folder / "deep"
    nested.mkdir()
    write_silence_wav(nested / "Nocturne.wav")
    write_silence_wav(folder / "clip.mp4")

    imported = client.post(
        "/imports/folder",
        json={"folder_path": str(folder), "library_name": "Local Music"},
    )
    assert imported.status_code == 200
    body = imported.json()
    assert body["scanned"] == 3
    assert body["examined"] == 4
    assert body["tracks"] == 3
    assert any(item["status"] == "unsupported" for item in body["outcomes"])
    assert any(item["status"] == "duplicate" for item in body["outcomes"])

    tracks = client.get("/tracks").json()["tracks"]
    titles = {row["title"] for row in tracks}
    assert "Salt Flats" in titles
    salt = next(row for row in tracks if row["title"] == "Salt Flats")
    assert salt["artist"] == "Anais Kerr"
    assert salt["bpm"] is None
    assert salt["key"] is None
    assert salt["bpm_source"] is None
    assert salt["key_source"] is None
    assert salt["missing"] is False
    assert salt["preview_url"] == f"/audio/{salt['id']}"
    assert len(salt["audio_content_hash"]) == 64

    full = client.get(salt["preview_url"])
    assert full.status_code == 200
    assert full.headers["content-type"].startswith("audio/")
    assert full.headers["accept-ranges"] == "bytes"
    payload = full.content
    assert len(payload) > 44

    ranged = client.get(salt["preview_url"], headers={"Range": "bytes=0-31"})
    assert ranged.status_code == 206
    assert ranged.content == payload[:32]
    assert ranged.headers["content-range"].startswith("bytes 0-31/")

    unknown = client.get("/audio/not-a-track")
    assert unknown.status_code == 404


def test_folder_import_infers_artist_from_dj_export_hierarchy(
    client: TestClient, tmp_path: Path
):
    folder = tmp_path / "Jeff USB"
    album = folder / "Contents" / "Massiande" / "Live Cuts"
    album.mkdir(parents=True)
    write_silence_wav(album / "Dancing Stuff.wav")
    write_silence_wav(album / "Blake.08- The Change Of Love.wav")

    imported = client.post(
        "/imports/folder",
        json={"folder_path": str(folder), "library_name": "Jeff USB"},
    )

    assert imported.status_code == 200
    tracks = client.get(f"/libraries/{imported.json()['library_id']}/tracks").json()[
        "tracks"
    ]
    by_title = {row["title"]: row for row in tracks}
    assert by_title["Dancing Stuff"]["artist"] == "Massiande"
    assert by_title["The Change Of Love"]["artist"] == "Blake.08"
    assert by_title["Dancing Stuff"]["created_at"]


def test_imports_legacy_csv_metadata_for_one_library(client: TestClient, tmp_path: Path):
    folder = tmp_path / "music"
    folder.mkdir()
    write_silence_wav(folder / "Anais Kerr - Salt Flats.wav")
    imported = client.post(
        "/imports/folder",
        json={"folder_path": str(folder), "library_name": "CSV library"},
    ).json()
    csv_path = tmp_path / "tracks.csv"
    csv_path.write_text(
        "track_id,title,artist,album,genre,bpm,key,duration_sec,location,rating,date_added\n"
        "42,Salt Flats,Anais Kerr,Low Water,Dub Techno,118,5A,240,legacy,4,2026-08-01\n"
    )

    response = client.post(
        f"/libraries/{imported['library_id']}/metadata/import-csv",
        json={"csv_path": str(csv_path), "source_ref": "test/tracks.csv"},
    )

    assert response.status_code == 200
    assert response.json()["matched"] == 1
    track = client.get(
        f"/libraries/{imported['library_id']}/tracks"
    ).json()["tracks"][0]
    assert track["bpm"] == 118.0
    assert track["key"] == "5A"
    assert track["genre"] == "Dub Techno"
    assert track["bpm_source"] == "rekordbox_csv"
    assert track["key_source"] == "rekordbox_csv"


def test_rejects_arbitrary_paths(client: TestClient, tmp_path: Path):
    sneaky = tmp_path / "outside.wav"
    write_silence_wav(sneaky)
    res = client.get("/audio/" + str(sneaky))
    assert res.status_code == 404


def test_app_registers_local_fast_manifest_and_queues_idempotent_analysis(
    client: TestClient, tmp_path: Path
):
    folder = tmp_path / "analysis-music"
    folder.mkdir()
    write_silence_wav(folder / "Kaito Bloom - Nocturne Transit.wav")
    imported = client.post(
        "/imports/folder",
        json={"folder_path": str(folder), "library_name": "Analysis library"},
    ).json()
    payload = {
        "manifest_name": "local-fast",
        "manifest_version": "1",
        "mode": "fast",
        "idempotency_key": "analysis-library-001",
    }

    first = client.post(
        f"/libraries/{imported['library_id']}/analysis-runs", json=payload
    )
    replay = client.post(
        f"/libraries/{imported['library_id']}/analysis-runs", json=payload
    )

    assert first.status_code == 202
    assert replay.status_code == 202
    assert replay.json()["id"] == first.json()["id"]
    assert first.json()["manifest_name"] == "local-fast"
    assert first.json()["stages_total"] == 1
    progress = client.get(
        f"/analysis-runs/{first.json()['id']}/tracks"
    ).json()
    assert progress["tracks"][0]["stages_total"] == 1
