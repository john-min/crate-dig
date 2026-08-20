"""M3U playlist export."""

from __future__ import annotations

from pathlib import Path

from cratedig_engine.schemas import Crate, Track


def export_m3u(
    tracks: list[Track],
    crate: Crate | None = None,
    out_path: str | Path | None = None,
) -> str:
    by_id = {t.track_id: t for t in tracks}
    ordered = (
        [by_id[ct.track_id] for ct in crate.tracks if ct.track_id in by_id]
        if crate is not None
        else tracks
    )
    lines = ["#EXTM3U"]
    if crate is not None:
        lines.append(f"#PLAYLIST:{crate.name}")
    for track in ordered:
        duration = int(track.duration_sec) if track.duration_sec is not None else -1
        display = " - ".join(part for part in (track.artist, track.title) if part) or track.track_id
        lines.append(f"#EXTINF:{duration},{display}")
        lines.append(track.location or track.track_id)
    text = "\n".join(lines) + "\n"
    if out_path is not None:
        Path(out_path).write_text(text, encoding="UTF-8")
    return text
