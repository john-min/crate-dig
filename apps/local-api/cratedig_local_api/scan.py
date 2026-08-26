from __future__ import annotations

import re
from pathlib import Path

AUDIO_EXTENSIONS = {
    ".mp3",
    ".mp4",
    ".m4a",
    ".aac",
    ".wav",
    ".flac",
    ".ogg",
    ".oga",
    ".aif",
    ".aiff",
    ".webm",
}


_ARTIST_TITLE_SEPARATOR = re.compile(r"(?:\s+-\s*|\s*-\s+)")


def parse_filename(path: Path, *, library_root: Path | None = None) -> tuple[str, str]:
    """Read conservative metadata from a filename or DJ export hierarchy."""
    stem = path.stem.strip()
    parts = _ARTIST_TITLE_SEPARATOR.split(stem, maxsplit=1)
    if len(parts) == 2:
        artist, title = parts
        artist, title = artist.strip(), title.strip()
        if artist and title:
            return artist, title

    if library_root is not None:
        try:
            relative = path.resolve().relative_to(library_root.expanduser().resolve())
        except (OSError, ValueError):
            relative = None
        # Rekordbox-style exports commonly retain Contents/Artist/Album/File.
        if relative is not None and len(relative.parts) >= 3:
            artist = relative.parts[-3].strip()
            if artist and artist.casefold() not in {"contents", "music", "unknown artist"}:
                return artist, stem or path.name
    return "", stem or path.name


def scan_folder_entries(folder: Path) -> list[Path]:
    root = folder.expanduser().resolve()
    if not root.is_dir():
        raise NotADirectoryError(str(root))
    found: list[Path] = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        found.append(path)
    found.sort()
    return found


def scan_folder(folder: Path) -> list[Path]:
    return [
        path
        for path in scan_folder_entries(folder)
        if path.suffix.lower() in AUDIO_EXTENSIONS
    ]
