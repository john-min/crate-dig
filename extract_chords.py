"""Detect a chord progression for every track — a resumable, non-destructive pass.

This runs SEPARATELY from `python -m djvibe analyze`, so it does NOT touch your
embeddings or force a re-analysis of the collection. It reads the same
``tracks.csv`` produced by `extract`, computes a beat-synced chord progression per
track with librosa, and appends results to ``djvibe_data/chords.csv``.

Re-running skips track_ids already in chords.csv, so a long run can be stopped
and resumed freely (Ctrl-C safe). The dashboard picks up chords.csv automatically
the next time you build it.

    python3 extract_chords.py                 # analyze all un-done tracks
    python3 extract_chords.py --limit 50      # try a batch first
    python3 extract_chords.py --workdir ./djvibe_data
    python3 extract_chords.py --rebuild       # also rebuild dashboard.html when done

Requires librosa (the same fallback backend djvibe already documents):
    pip install librosa soundfile
"""
from __future__ import annotations

import argparse
import csv
import os

import pandas as pd

from djvibe import io
from djvibe.chords import detect_chords

_FIELDS = ["track_id", "chords", "key_est", "tempo", "n_beats"]


def _done_ids(path) -> set[str]:
    if not path.exists():
        return set()
    try:
        df = pd.read_csv(path, dtype={"track_id": str})
        return set(df["track_id"].astype(str))
    except Exception:
        return set()


def run(ws: io.Workspace, limit: int | None = None, max_sec: float = 90.0) -> None:
    tracks = pd.read_csv(ws.tracks_csv, dtype={"track_id": str})
    done = _done_ids(ws.chords_csv)
    todo = tracks[~tracks["track_id"].isin(done)]
    if limit:
        todo = todo.head(limit)

    print(f"[chords] {len(done)} cached, {len(todo)} to do "
          f"(of {len(tracks)} total)")
    if todo.empty:
        return

    new_file = not ws.chords_csv.exists()
    fh = open(ws.chords_csv, "a", newline="", encoding="utf-8")
    writer = csv.DictWriter(fh, fieldnames=_FIELDS)
    if new_file:
        writer.writeheader()

    n_ok = n_err = 0
    try:
        for i, row in enumerate(todo.itertuples(index=False), 1):
            tid = row.track_id
            path = getattr(row, "location", "")
            try:
                if not path or not os.path.exists(path):
                    raise FileNotFoundError(f"missing file: {path}")
                res = detect_chords(path, max_sec=max_sec)
                writer.writerow({
                    "track_id": tid,
                    "chords": " ".join(res["chords"]),
                    "key_est": res["key_est"],
                    "tempo": res["tempo"],
                    "n_beats": res["n_beats"],
                })
                n_ok += 1
            except Exception as exc:
                # write an empty row so we don't retry a broken/missing file forever
                writer.writerow({"track_id": tid, "chords": "", "key_est": "",
                                 "tempo": "", "n_beats": 0})
                n_err += 1
                if n_err <= 10:
                    print(f"  [warn] {tid}: {exc}")
            fh.flush()
            if i % 25 == 0 or i == len(todo):
                print(f"  {i}/{len(todo)}  ok={n_ok} err={n_err}  "
                      f"[{getattr(row, 'artist', '')} - {getattr(row, 'title', '')}]")
    finally:
        fh.close()
    print(f"[chords] wrote {ws.chords_csv}  (+{n_ok} ok, {n_err} failed)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workdir", default="./djvibe_data")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--max-sec", type=float, default=90.0,
                    help="seconds of the track's core section to analyze")
    ap.add_argument("--rebuild", action="store_true",
                    help="rebuild dashboard.html after extracting")
    args = ap.parse_args()
    ws = io.Workspace(args.workdir)

    run(ws, limit=args.limit, max_sec=args.max_sec)

    if args.rebuild:
        import dashboard_studio
        dashboard_studio.build(args.workdir)
        print("[chords] dashboard rebuilt — open it with `python3 player_server.py`.")


if __name__ == "__main__":
    main()
