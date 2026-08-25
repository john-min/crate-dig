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
    assert body["tracks"] == 3

    tracks = client.get("/tracks").json()["tracks"]
    titles = {row["title"] for row in tracks}
    assert "Salt Flats" in titles
    salt = next(row for row in tracks if row["title"] == "Salt Flats")
    assert salt["artist"] == "Anais Kerr"
    assert salt["missing"] is False
    assert salt["preview_url"] == f"/audio/{salt['id']}"

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


def test_rejects_arbitrary_paths(client: TestClient, tmp_path: Path):
    sneaky = tmp_path / "outside.wav"
    write_silence_wav(sneaky)
    res = client.get("/audio/" + str(sneaky))
    assert res.status_code == 404
