"""Refresh everything after you've added or removed tracks in rekordbox.

Run this whenever your collection changes. It:
  1. re-reads your rekordbox library (picks up additions AND removals),
  2. forgets the analysis of any track you deleted,
  3. analyzes ONLY the newly added tracks (everything already analyzed is reused,
     so this is fast — usually seconds to a couple minutes),
  4. rebuilds the dashboard and opens it with the player.

    # quit rekordbox first, then:
    python3 update_library.py                  # live database
    python3 update_library.py --xml my.xml     # if you use the XML export route
    python3 update_library.py --no-serve       # just refresh, don't open the player

Day-to-day (no library changes) you can still just run `python3 player_server.py`.
"""
from __future__ import annotations

import argparse
import json
import os

import pandas as pd

from djvibe import io, library
from djvibe import analyze as analyze_mod


def prune_cache(ws: io.Workspace, valid_ids: set[str]) -> int:
    """Drop cached analyses for tracks no longer in the library."""
    rows = io.read_jsonl(ws.audio_cache)
    kept = [r for r in rows if r.get("track_id") in valid_ids]
    removed = len(rows) - len(kept)
    with open(ws.audio_cache, "w", encoding="utf-8") as fh:
        for r in kept:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")
    return removed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workdir", default="./djvibe_data")
    ap.add_argument("--xml", default=None, help="path to a fresh rekordbox XML export")
    ap.add_argument("--db-dir", default=None)
    ap.add_argument("--backend", default="librosa",
                    help="must match what you analyzed with originally")
    ap.add_argument("--no-serve", action="store_true")
    args = ap.parse_args()
    ws = io.Workspace(args.workdir)

    # 1. what did we have before?
    old_ids = set()
    if ws.tracks_csv.exists():
        old_ids = set(pd.read_csv(ws.tracks_csv, dtype={"track_id": str})["track_id"])

    # 2. re-extract fresh (overwrite tracks.csv)
    print("[update] reading rekordbox library…")
    if args.xml:
        df = library.from_xml(args.xml)
    else:
        df = library.from_pyrekordbox(args.db_dir)
    df.to_csv(ws.tracks_csv, index=False)
    new_ids = set(df["track_id"])

    added = new_ids - old_ids
    removed = old_ids - new_ids
    print(f"[update] library now {len(new_ids)} tracks  "
          f"(+{len(added)} added, -{len(removed)} removed)")

    # 3. forget deleted tracks
    dropped = prune_cache(ws, new_ids)
    if dropped:
        print(f"[update] removed {dropped} stale analyses from the cache")

    # 4. analyze only the new tracks (resumable run skips everything already cached)
    analyze_mod.run(ws, backend_name=args.backend)

    # 5. rebuild (+ optionally serve)
    os.environ["DJVIBE_WORKDIR"] = args.workdir
    if args.no_serve:
        import dashboard_studio
        dashboard_studio.build(args.workdir)
        print("[update] done — run `python3 player_server.py` to open it.")
    else:
        import player_server
        player_server.main()


if __name__ == "__main__":
    main()
