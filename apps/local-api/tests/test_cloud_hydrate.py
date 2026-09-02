from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from cratedig_local_api.app import create_app
from cratedig_local_api.cloud_hydrate import import_cloud_snapshot, main, resolve_audio_location
from cratedig_local_api.migrations import LATEST_SCHEMA_VERSION
from cratedig_local_api.settings import Settings
from cratedig_local_api import db

FIXTURE = Path(__file__).parent / "fixtures" / "cloud-library-snapshot.json"


def test_hydrate_snapshot_writes_projection_and_neighbors(tmp_path: Path):
    snapshot = json.loads(FIXTURE.read_text())
    home = tmp_path / "home"
    conn = db.connect(home / "crate-dig.sqlite")
    try:
        summary = import_cloud_snapshot(conn, snapshot)
        assert summary["tracks"] == 3
        assert summary["cluster_members"] == 3
        assert summary["neighbors"]["neighbor_count"] > 0
        assert summary["neighbors"]["channel"] == "librosa-zscore-v1"
        assert conn.execute("pragma user_version").fetchone()[0] == LATEST_SCHEMA_VERSION
        tracks = {row.id: row for row in db.list_tracks(conn)}
        first = tracks["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"]
        assert first.title == "Don't Slip"
        assert first.genre == "G-House"
        assert first.energy_rating == 5
        assert first.umap_x == 1.25
        assert first.cluster_name == "bright & driving · 139 BPM"
        assert first.analysis_state == "completed"
        feed = db.list_projection_points(conn, library_id=summary["library_id"])
        assert feed["run_id"] == "22222222-2222-4222-8222-222222222222"
        assert len(feed["points"]) == 3
        replay = import_cloud_snapshot(conn, snapshot)
        assert replay["tracks"] == 3
        assert conn.execute("select count(*) from tracks").fetchone()[0] == 3
        assert conn.execute("select count(*) from clusters").fetchone()[0] == 2
    finally:
        conn.close()


def test_hydrate_resolves_rekordbox_usb_layout(tmp_path: Path):
    audio = tmp_path / "usb" / "Contents" / "1905" / "UnknownAlbum"
    audio.mkdir(parents=True)
    target = audio / "dont-slip.mp3"
    target.write_bytes(b"id3")
    location = resolve_audio_location(
        "demo/originals/jeff-usb-2026-08-15/Contents/1905/UnknownAlbum/dont-slip.mp3",
        tmp_path / "usb",
    )
    assert Path(location) == target.resolve()


def test_cli_without_supabase_secrets_fails_closed(tmp_path: Path, monkeypatch, capsys):
    monkeypatch.delenv("NEXT_PUBLIC_SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("CRATE_DIG_SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SECRET_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    monkeypatch.setenv("CRATE_DIG_HOME", str(tmp_path / "home"))
    monkeypatch.setattr(
        "cratedig_local_api.cloud_hydrate.load_env_file",
        lambda _path: {},
    )
    assert main([]) == 1
    captured = capsys.readouterr()
    assert "SUPABASE_SECRET_KEY" in captured.err


def test_local_api_serves_hydrated_catalog(tmp_path: Path):
    snapshot = json.loads(FIXTURE.read_text())
    home = tmp_path / "api-home"
    conn = db.connect(home / "crate-dig.sqlite")
    try:
        import_cloud_snapshot(conn, snapshot)
    finally:
        conn.close()
    settings = Settings(home=home)
    with TestClient(create_app(settings)) as client:
        tracks = client.get("/tracks").json()["tracks"]
        assert len(tracks) == 3
        first = next(row for row in tracks if row["title"] == "Don't Slip")
        assert first["umap_x"] == 1.25
        assert first["cluster_name"] == "bright & driving · 139 BPM"
        assert first["analysis_state"] == "completed"
        assert first["energy_rating"] == 5
        assert first["missing"] is True
        feed = client.get("/projection").json()
        assert feed["run_id"] == "22222222-2222-4222-8222-222222222222"
        assert len(feed["points"]) == 3
        neighbors = client.get(
            "/tracks/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/neighbors?channel=librosa-zscore-v1"
        ).json()
        assert neighbors["neighbors"]
        assert neighbors["neighbors"][0]["channel"] == "librosa-zscore-v1"
        analysis = client.get("/tracks/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/analysis").json()
        assert analysis["run_id"] == "22222222-2222-4222-8222-222222222222"
        assert analysis["features"]
        assert analysis["embeddings"]
