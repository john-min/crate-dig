from __future__ import annotations

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


def parse_filename(path: Path) -> tuple[str, str]:
    stem = path.stem.strip()
    if " - " in stem:
        artist, title = stem.split(" - ", 1)
        artist, title = artist.strip(), title.strip()
        if artist and title:
            return artist, title
    return "", stem or path.name


def scan_folder(folder: Path) -> list[Path]:
    root = folder.expanduser().resolve()
    if not root.is_dir():
        raise NotADirectoryError(str(root))
    found: list[Path] = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() in AUDIO_EXTENSIONS:
            found.append(path)
    found.sort()
    return found
