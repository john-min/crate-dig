from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from fastapi import HTTPException, Request
from fastapi.responses import Response, StreamingResponse

CONTENT_TYPES = {
    ".mp3": "audio/mpeg",
    ".mp4": "audio/mp4",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".wav": "audio/wav",
    ".flac": "audio/flac",
    ".ogg": "audio/ogg",
    ".oga": "audio/ogg",
    ".aif": "audio/aiff",
    ".aiff": "audio/aiff",
    ".webm": "audio/webm",
}

# Chrome/Firefox can decode these without transcoding. AIFF usually cannot.
NATIVE = {
    ".mp3",
    ".mp4",
    ".m4a",
    ".aac",
    ".wav",
    ".flac",
    ".ogg",
    ".oga",
    ".webm",
}
TRANSCODE = {".aif", ".aiff"}


def content_type_for(path: Path) -> str:
    return CONTENT_TYPES.get(path.suffix.lower(), "application/octet-stream")


def needs_transcode(path: Path) -> bool:
    return path.suffix.lower() in TRANSCODE


def have_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None


def parse_range(header: str | None, size: int) -> tuple[int, int, bool]:
    start, end = 0, size - 1
    if not header or not header.startswith("bytes="):
        return start, end, False
    spec = header[6:].split(",")[0].strip()
    left, _, right = spec.partition("-")
    try:
        if left:
            start = int(left)
        if right:
            end = int(right)
    except ValueError as exc:
        raise HTTPException(status_code=416, detail="Invalid Range") from exc
    if start < 0 or end < start or start >= size:
        raise HTTPException(status_code=416, detail="Range Not Satisfiable")
    return start, min(end, size - 1), True


def file_range_response(path: Path, request: Request, content_type: str) -> Response:
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File missing on disk")
    size = path.stat().st_size
    start, end, partial = parse_range(request.headers.get("range"), size)
    length = end - start + 1

    def chunks():
        with path.open("rb") as fh:
            fh.seek(start)
            remaining = length
            while remaining > 0:
                chunk = fh.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(length),
        "Content-Type": content_type,
    }
    if partial:
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    return StreamingResponse(
        chunks(),
        status_code=206 if partial else 200,
        headers=headers,
        media_type=content_type,
    )


def transcode_to_mp3(source: Path, dest: Path) -> Path:
    if dest.is_file() and dest.stat().st_mtime >= source.stat().st_mtime:
        return dest
    if not have_ffmpeg():
        raise HTTPException(
            status_code=415,
            detail="AIFF needs ffmpeg on this machine for browser playback",
        )
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".part.mp3")
    result = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(source),
            "-f",
            "mp3",
            "-b:a",
            "192k",
            "-vn",
            "-loglevel",
            "error",
            str(tmp),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0 or not tmp.is_file():
        tmp.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="ffmpeg could not transcode this file")
    tmp.replace(dest)
    return dest
