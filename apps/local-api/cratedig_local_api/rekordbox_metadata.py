from __future__ import annotations

import base64
import json
import shutil
import subprocess
import unicodedata
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any


REKORDBOX_USB_SOURCE = "rekordbox_usb"
AUDIO_TAG_SOURCE = "audio_tag"


@dataclass(frozen=True)
class ImportedTrackMetadata:
    """Curated metadata imported from a DJ library or the audio container."""

    title: str = ""
    artist: str = ""
    album: str = ""
    genre: str = ""
    label: str = ""
    bpm: float | None = None
    musical_key: str = ""
    duration_sec: float | None = None
    rating: int | None = None
    date_added: str = ""
    rekordbox_track_id: str = ""
    bpm_source: str = ""
    key_source: str = ""


@dataclass(frozen=True)
class RekordboxUsbIndex:
    usb_root: Path
    tracks_by_path: dict[str, ImportedTrackMetadata]

    def metadata_for(self, audio_path: Path) -> ImportedTrackMetadata | None:
        try:
            relative = audio_path.resolve().relative_to(self.usb_root.resolve())
        except (OSError, ValueError):
            return None
        return self.tracks_by_path.get(_canonical_device_path(relative.as_posix()))


def find_rekordbox_usb_root(library_root: Path) -> Path | None:
    """Return the USB root when a legacy Rekordbox export sits beside the audio."""

    root = library_root.expanduser().resolve()
    candidates = [root]
    if root.name.casefold() == "contents":
        candidates.insert(0, root.parent)
    for candidate in candidates:
        if (candidate / "PIONEER" / "rekordbox" / "export.pdb").is_file():
            return candidate
    return None


def load_rekordbox_usb_index(library_root: Path) -> RekordboxUsbIndex | None:
    """Read Rekordbox's legacy DeviceSQL export without mutating the USB."""

    usb_root = find_rekordbox_usb_root(library_root)
    if usb_root is None:
        return None

    # Imported lazily so a normal folder library can still run without the
    # optional Rekordbox interoperability dependency.
    try:
        from rekordbox_pdb import Database
    except ImportError as exc:  # pragma: no cover - dependency guard
        raise RuntimeError(
            "A Rekordbox USB was found, but rekordbox-pdb is not installed"
        ) from exc

    database = Database.from_file(
        usb_root / "PIONEER" / "rekordbox" / "export.pdb"
    )
    artists = {row.id: row.name for row in database.artists}
    albums = {row.id: row.name for row in database.albums}
    genres = {row.id: row.name for row in database.genres}
    labels = {row.id: row.name for row in database.labels}
    keys = {row.id: row.name for row in database.keys}

    tracks: dict[str, ImportedTrackMetadata] = {}
    for row in database.tracks:
        path_key = _canonical_device_path(row.file_path)
        bpm = float(row.tempo) / 100.0 if row.tempo else None
        musical_key = (keys.get(row.key_id) or "").strip()
        tracks[path_key] = ImportedTrackMetadata(
            title=(row.title or "").strip(),
            artist=(artists.get(row.artist_id) or "").strip(),
            album=(albums.get(row.album_id) or "").strip(),
            genre=(genres.get(row.genre_id) or "").strip(),
            label=(labels.get(row.label_id) or "").strip(),
            bpm=bpm,
            musical_key=musical_key,
            duration_sec=float(row.duration) if row.duration else None,
            rating=int(row.rating) if row.rating is not None else None,
            date_added=(row.date_added or "").strip(),
            rekordbox_track_id=str(row.id),
            bpm_source=REKORDBOX_USB_SOURCE if bpm is not None else "",
            key_source=REKORDBOX_USB_SOURCE if musical_key else "",
        )
    return RekordboxUsbIndex(usb_root=usb_root, tracks_by_path=tracks)


def probe_audio_tags(path: Path) -> ImportedTrackMetadata | None:
    """Read portable container tags as a fallback when no DJ record matches."""

    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return None
    try:
        completed = subprocess.run(
            [
                ffprobe,
                "-v",
                "error",
                "-show_entries",
                "format=duration:format_tags",
                "-of",
                "json",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=15,
        )
        payload = json.loads(completed.stdout)
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError):
        return None

    format_data = payload.get("format") or {}
    raw_tags = format_data.get("tags") or {}
    tags = {str(key).casefold(): str(value).strip() for key, value in raw_tags.items()}
    bpm = _first_float(tags, "bpm", "tbpm")
    musical_key = _first_key(tags, "initialkey", "tkey", "key")
    duration = _to_float(format_data.get("duration"))
    return ImportedTrackMetadata(
        title=tags.get("title", ""),
        artist=tags.get("artist", ""),
        album=tags.get("album", ""),
        genre=tags.get("genre", ""),
        label=tags.get("label", "") or tags.get("publisher", ""),
        bpm=bpm,
        musical_key=musical_key,
        duration_sec=duration,
        bpm_source=AUDIO_TAG_SOURCE if bpm is not None else "",
        key_source=AUDIO_TAG_SOURCE if musical_key else "",
    )


def _canonical_device_path(value: str) -> str:
    normalized = unicodedata.normalize("NFC", value.replace("\\", "/").strip())
    path = PurePosixPath(normalized.lstrip("/"))
    return path.as_posix().casefold()


def _first_float(tags: dict[str, str], *names: str) -> float | None:
    for name in names:
        value = _to_float(tags.get(name))
        if value is not None and value > 0:
            return value
    return None


def _first_key(tags: dict[str, str], *names: str) -> str:
    for name in names:
        value = tags.get(name, "").strip()
        if not value:
            continue
        decoded = _decode_json_tag(value)
        if decoded and isinstance(decoded.get("key"), str):
            return decoded["key"].strip()
        # Camelot and conventional musical-key values are both preserved.
        if len(value) <= 16:
            return value
    return ""


def _decode_json_tag(value: str) -> dict[str, Any] | None:
    try:
        padding = "=" * (-len(value) % 4)
        decoded = base64.b64decode(value + padding).decode("utf-8")
        payload = json.loads(decoded)
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _to_float(value: object) -> float | None:
    try:
        return float(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None
