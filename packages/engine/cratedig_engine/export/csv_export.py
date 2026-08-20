"""CSV crate/track export."""

from __future__ import annotations

import csv
import io
from pathlib import Path

from cratedig_engine.schemas import Crate, Track

COLUMNS = [
    "track_id",
    "title",
    "artist",
    "album",
    "genre",
    "label",
    "bpm",
    "key",
    "duration_sec",
    "location",
    "rating",
    "date_added",
    "crate",
    "position",
]


def export_csv(
    tracks: list[Track],
    crate: Crate | None = None,
    out_path: str | Path | None = None,
) -> str:
    by_id = {t.track_id: t for t in tracks}
    rows: list[dict] = []
    if crate is None:
        for track in tracks:
            rows.append(_row(track, crate_name="", position=""))
    else:
        for item in crate.tracks:
            track = by_id.get(item.track_id)
            if track is None:
                continue
            rows.append(_row(track, crate_name=crate.name, position=item.position))

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=COLUMNS)
    writer.writeheader()
    writer.writerows(rows)
    text = buf.getvalue()
    if out_path is not None:
        Path(out_path).write_text(text, encoding="UTF-8")
    return text


def _row(track: Track, crate_name: str, position) -> dict:
    return {
        "track_id": track.track_id,
        "title": track.title,
        "artist": track.artist,
        "album": track.album,
        "genre": track.genre,
        "label": track.label,
        "bpm": "" if track.bpm is None else track.bpm,
        "key": track.key,
        "duration_sec": "" if track.duration_sec is None else track.duration_sec,
        "location": track.location,
        "rating": track.rating,
        "date_added": track.date_added,
        "crate": crate_name,
        "position": position,
    }
