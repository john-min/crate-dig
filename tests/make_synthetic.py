"""Generate a synthetic collection so the cluster+dashboard stages can be tested
without any real audio. Creates tracks.csv, embeddings.npy/ids, features.csv
shaped exactly like the real pipeline's output.

    python tests/make_synthetic.py --workdir ./demo_data --n 600 --groups 6
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from djvibe import io  # noqa: E402

MOODS = ["groovy", "uplifting", "warm", "dark", "hypnotic", "dreamy",
         "energetic", "deep", "melancholic", "euphoric", "raw", "soulful"]
GENRES = ["Deep House", "Tech House", "Melodic House", "Progressive House",
          "Afro House", "Minimal / Deep Tech"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workdir", default="./demo_data")
    ap.add_argument("--n", type=int, default=600)
    ap.add_argument("--groups", type=int, default=6)
    ap.add_argument("--dim", type=int, default=128)
    args = ap.parse_args()

    rng = np.random.default_rng(7)
    ws = io.Workspace(args.workdir)

    # latent group centers -> embeddings cluster into `groups` blobs
    centers = rng.normal(0, 3, size=(args.groups, args.dim))
    grp_bpm = rng.uniform(118, 130, size=args.groups)
    grp_mood = rng.integers(0, len(MOODS), size=(args.groups, 2))

    ids, emb, trows, frows = [], [], [], []
    for i in range(args.n):
        g = rng.integers(0, args.groups)
        v = centers[g] + rng.normal(0, 1.0, size=args.dim)
        tid = f"T{i:04d}"
        bpm = float(np.clip(grp_bpm[g] + rng.normal(0, 2.0), 110, 134))
        ids.append(tid); emb.append(v.astype(np.float32))
        trows.append({"track_id": tid, "title": f"Track {i}",
                      "artist": f"Artist {chr(65 + g)}{i % 30}",
                      "album": "", "genre": GENRES[g % len(GENRES)],
                      "bpm": round(bpm, 2), "key": f"{rng.integers(1,13)}{rng.choice(['A','B'])}",
                      "duration_sec": float(rng.integers(300, 480)),
                      "location": f"/Music/{tid}.aiff", "rating": int(rng.integers(0, 6)),
                      "date_added": "2025-01-01"})
        f = {"track_id": tid,
             "mood_top": ", ".join(MOODS[j] for j in grp_mood[g]),
             "danceability": round(float(np.clip(rng.normal(0.7, 0.15), 0, 1)), 3),
             "engagement": round(float(np.clip(rng.normal(0.5 + 0.05 * g, 0.15), 0, 1)), 3),
             "energy_rms": round(float(np.clip(rng.normal(0.1 + 0.02 * g, 0.03), 0, 1)), 4),
             "brightness": round(float(rng.normal(2000 + 200 * g, 300)), 1),
             "genre_pred": GENRES[g % len(GENRES)]}
        for j in grp_mood[g]:
            f[f"mood::{MOODS[j]}"] = round(float(np.clip(rng.normal(0.7, 0.1), 0, 1)), 4)
        frows.append(f)

    pd.DataFrame(trows).to_csv(ws.tracks_csv, index=False)
    io.save_embeddings(ws, ids, np.array(emb))
    pd.DataFrame(frows).to_csv(ws.features_csv, index=False)
    print(f"synthetic: {args.n} tracks, {args.groups} latent groups -> {ws.root}")


if __name__ == "__main__":
    main()
