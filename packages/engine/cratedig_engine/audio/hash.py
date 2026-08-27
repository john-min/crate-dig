"""Audio file hashing and location classification."""

from __future__ import annotations

import hashlib
from pathlib import Path

PSEUDO_SCHEMES = (
    "spotify:",
    "soundcloud:",
    "itunes:",
    "tidal:",
    "youtube:",
    "http://",
    "https://",
)


def location_kind(location: str | None) -> str:
    loc = (location or "").strip()
    if not loc:
        return "empty"
    lower = loc.lower()
    if any(lower.startswith(scheme) for scheme in PSEUDO_SCHEMES):
        return "pseudo"
    return "file"


def hash_audio_file(path: str | Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        while True:
            chunk = fh.read(chunk_size)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()
