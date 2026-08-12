"""Export a readable report of the tags assigned to every song, plus a summary
of how the genre tags are distributed (to spot over-represented labels).

    python3 tag_report.py --workdir djvibe_clap

Writes <workdir>/tag_report.csv (one row per song, with scores) and prints a
genre-distribution summary to the screen. Runs on your normal python3 (no venv).
"""
from __future__ import annotations

import argparse

import pandas as pd

from djvibe import io


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workdir", default="djvibe_clap")
    ap.add_argument("--top", type=int, default=20, help="genres to show in summary")
    args = ap.parse_args()
    ws = io.Workspace(args.workdir)

    feat = pd.read_csv(ws.features_csv, dtype={"track_id": str})
    tracks = pd.read_csv(ws.tracks_csv, dtype={"track_id": str}).set_index("track_id")

    genre_cols = [c for c in feat.columns if c.startswith("genre::")]
    vibe_cols = [c for c in feat.columns if c.startswith("vibe::")]
    if not genre_cols and not vibe_cols:        # older run (mixed clap:: / mood::)
        genre_cols = [c for c in feat.columns if c.startswith(("clap::", "mood::"))]

    def ranked(row, cols):
        pairs = [(c.split("::", 1)[1], row[c]) for c in cols if pd.notna(row[c])]
        return sorted(pairs, key=lambda x: -x[1])

    rows = []
    for _, r in feat.iterrows():
        tid = r["track_id"]
        t = tracks.loc[tid] if tid in tracks.index else {}
        gs = ranked(r, genre_cols)
        vs = ranked(r, vibe_cols)
        rows.append({
            "artist": (t.get("artist", "") if hasattr(t, "get") else t["artist"]) if len(t) else "",
            "title": (t.get("title", "") if hasattr(t, "get") else t["title"]) if len(t) else "",
            "bpm": (t["bpm"] if len(t) and "bpm" in t else ""),
            "top_genre": gs[0][0] if gs else "",
            "top_vibe": vs[0][0] if vs else "",
            "genres (score)": "; ".join(f"{g} {s:.2f}" for g, s in gs),
            "vibes (score)": "; ".join(f"{g} {s:.2f}" for g, s in vs),
        })

    out = pd.DataFrame(rows).sort_values(["top_genre", "artist"])
    dest = ws.root / "tag_report.csv"
    out.to_csv(dest, index=False)

    print(f"\nWrote {dest}  ({len(out)} songs)\n")
    print("=== how many songs have each genre as their #1 ===")
    vc = out["top_genre"].value_counts()
    total = len(out)
    for g, n in vc.head(args.top).items():
        bar = "#" * int(40 * n / vc.iloc[0])
        print(f"  {g:22s} {n:5d}  {100*n/total:4.0f}%  {bar}")


if __name__ == "__main__":
    main()
