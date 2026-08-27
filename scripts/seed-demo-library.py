#!/usr/bin/env python3
"""Seed the shared demo library from Rekordbox ID3 tags into the existing Supabase project.

Reads apps/web/.env.local (same project as production). Does not print secrets.
Re-running updates curated Rekordbox metadata, separate energy/rating values,
and audio object keys.
"""

from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TAGS_PATH = ROOT / "apps/web/src/data/preview-track-studio.json"
WEB_ENV = ROOT / "apps/web/.env.local"
LIBRARY_NAME = "Crate Dig demo"
CAMELT = re.compile(r"^0?(\d{1,2})([AB])$")


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key] = value.strip().strip('"').strip("'")
    return env


def normalize_key(value: str | None) -> str:
    if not value:
        return ""
    match = CAMELT.match(value.strip().upper())
    if not match:
        return value.strip()
    return f"{int(match.group(1))}{match.group(2)}"


def content_type_for(object_key: str) -> str:
    lower = object_key.lower()
    if lower.endswith(".mp3"):
        return "audio/mpeg"
    if lower.endswith(".wav"):
        return "audio/wav"
    if lower.endswith(".flac"):
        return "audio/flac"
    if lower.endswith(".m4a") or lower.endswith(".aac"):
        return "audio/mp4"
    if lower.endswith(".aiff") or lower.endswith(".aif"):
        return "audio/aiff"
    if lower.endswith(".ogg"):
        return "audio/ogg"
    return "application/octet-stream"


class Rest:
    def __init__(self, base: str, secret: str) -> None:
        self.base = base.rstrip("/")
        self.secret = secret

    def request(
        self,
        method: str,
        path: str,
        *,
        payload: object | None = None,
        prefer: str = "return=representation",
        extra: dict[str, str] | None = None,
    ):
        data = None if payload is None else json.dumps(payload).encode()
        headers = {
            "apikey": self.secret,
            "Authorization": f"Bearer {self.secret}",
            "Accept": "application/json",
            "Prefer": prefer,
        }
        if extra:
            headers.update(extra)
        if data is not None:
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(self.base + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                body = response.read().decode()
                return response.status, json.loads(body) if body else None
        except urllib.error.HTTPError as error:
            detail = error.read().decode()
            raise SystemExit(f"{method} {path} failed {error.code}: {detail[:800]}") from error

    def get(self, path: str):
        _, body = self.request("GET", path, prefer="return=representation")
        return body

    def post(self, path: str, payload: object, prefer: str = "return=representation"):
        _, body = self.request("POST", path, payload=payload, prefer=prefer)
        return body

    def patch(self, path: str, payload: object):
        _, body = self.request("PATCH", path, payload=payload)
        return body


def chunks(items: list, size: int):
    for index in range(0, len(items), size):
        yield items[index : index + size]


def main() -> int:
    if not WEB_ENV.exists():
        print("Missing apps/web/.env.local", file=sys.stderr)
        return 1
    env = load_env(WEB_ENV)
    url = env.get("NEXT_PUBLIC_SUPABASE_URL", "").strip()
    secret = env.get("SUPABASE_SECRET_KEY", "").strip()
    bucket = env.get("R2_BUCKET_AUDIO", "crate-dig-audio-dev").strip() or "crate-dig-audio-dev"
    if not url or not secret:
        print("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY", file=sys.stderr)
        return 1

    tags = json.loads(TAGS_PATH.read_text())
    rest = Rest(url, secret)
    profiles = rest.get("/rest/v1/profiles?select=id,created_at&order=created_at.asc&limit=1")
    if not profiles:
        print("No profiles row exists. Sign in once so the demo library has an owner.", file=sys.stderr)
        return 1
    owner_id = profiles[0]["id"]

    libraries = rest.get(
        "/rest/v1/libraries?select=id,name,source&source=eq.demo&name=eq." + urllib.request.quote(LIBRARY_NAME)
    )
    if libraries:
        library_id = libraries[0]["id"]
    else:
        created = rest.post(
            "/rest/v1/libraries",
            {"user_id": owner_id, "name": LIBRARY_NAME, "source": "demo"},
        )
        library_id = created[0]["id"]

    existing_rows = rest.get(
        f"/rest/v1/tracks?select=id,external_track_id&library_id=eq.{library_id}&external_track_id=not.is.null"
    ) or []
    by_external = {row["external_track_id"]: row["id"] for row in existing_rows if row.get("external_track_id")}

    inserts: list[dict] = []
    updates: list[tuple[str, dict]] = []
    planned: list[tuple[str, str]] = []
    for external_id, record in tags.items():
        object_key = (record.get("objectKey") or "").strip()
        if not object_key:
            continue
        row = {
            "library_id": library_id,
            "external_track_id": external_id,
            "title": (record.get("title") or "").strip() or "Untitled",
            "artist": (record.get("artist") or "").strip() or "Unknown artist",
            "album": (record.get("album") or "").strip(),
            "genre": (record.get("genre") or "").strip(),
            "label": (record.get("label") or "").strip(),
            "bpm": record.get("bpm"),
            "key": normalize_key(record.get("key")),
            "duration_sec": record.get("durationSec"),
            "rating": record.get("rating"),
            "energy_rating": record.get("energyLevel"),
            "date_added": (record.get("dateAdded") or "").strip(),
            "original_location": object_key,
            "location_kind": "file",
        }
        planned.append((external_id, object_key))
        track_id = by_external.get(external_id)
        if track_id:
            updates.append((track_id, row))
        else:
            inserts.append(row)

    for batch in chunks(inserts, 80):
        created = rest.post("/rest/v1/tracks", batch) or []
        for row in created:
            by_external[row["external_track_id"]] = row["id"]

    for track_id, row in updates:
        rest.patch(f"/rest/v1/tracks?id=eq.{track_id}", row)

    audio_rows = []
    for external_id, object_key in planned:
        track_id = by_external.get(external_id)
        if not track_id:
            continue
        audio_rows.append(
            {
                "track_id": track_id,
                "kind": "original",
                "bucket": bucket,
                "object_key": object_key,
                "content_type": content_type_for(object_key),
            }
        )

    existing_audio = rest.get(
        f"/rest/v1/audio_objects?select=track_id,object_key&kind=eq.original"
    ) or []
    have = {(row["track_id"], row["object_key"]) for row in existing_audio}
    missing_audio = [row for row in audio_rows if (row["track_id"], row["object_key"]) not in have]
    for batch in chunks(missing_audio, 80):
        rest.post("/rest/v1/audio_objects", batch, prefer="return=minimal")

    with_bpm = sum(1 for record in tags.values() if record.get("bpm"))
    with_key = sum(1 for record in tags.values() if record.get("key"))
    with_energy = sum(1 for record in tags.values() if record.get("energyLevel") is not None)
    print(
        f"Demo library {library_id}: {len(planned)} tracks "
        f"({len(inserts)} inserted, {len(updates)} updated, {len(missing_audio)} audio objects). "
        f"Metadata coverage bpm={with_bpm} key={with_key} energy_rating={with_energy}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
