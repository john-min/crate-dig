"""Run an audio backend over the whole collection, with crash-safe resume.

Every track's result is appended to ``audio_cache.jsonl`` as one JSON line:
    {"track_id": "...", "ok": true, "embedding": [...], "feats": {...}}
Re-running skips track_ids already present, so a 3000-track run can be stopped
and resumed freely. When finished, the cache is compacted into:
    embeddings.npy + embeddings_ids.json + features.csv
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd

from . import io
from .features import get_backend


def run(ws: io.Workspace, backend_name: str = "auto", limit: int | None = None):
    tracks = pd.read_csv(ws.tracks_csv, dtype={"track_id": str})
    # only count SUCCESSFUL analyses as done, so failures get retried on re-run
    done = {r["track_id"] for r in io.read_jsonl(ws.audio_cache) if r.get("ok")}
    todo = tracks[~tracks["track_id"].isin(done)]
    if limit:
        todo = todo.head(limit)

    print(f"[analyze] {len(done)} cached, {len(todo)} to do "
          f"(of {len(tracks)} total)")

    backend = get_backend(backend_name, models_dir=ws.models_dir)
    print(f"[analyze] backend = {backend.name}")

    n_ok = n_err = 0
    for i, row in enumerate(todo.itertuples(index=False), 1):
        tid = row.track_id
        path = row.location
        rec = {"track_id": tid}
        try:
            if not path or not os.path.exists(path):
                raise FileNotFoundError(f"missing file: {path}")
            emb, feats = backend.analyze(path)
            rec.update(ok=True, embedding=[round(float(x), 6) for x in emb], feats=feats)
            n_ok += 1
        except Exception as exc:
            rec.update(ok=False, error=str(exc))
            n_err += 1
        io.append_jsonl(ws.audio_cache, rec)
        if i % 25 == 0 or i == len(todo):
            print(f"  {i}/{len(todo)}  ok={n_ok} err={n_err}  "
                  f"[{row.artist} - {row.title}]")

    finalize(ws)


def finalize(ws: io.Workspace):
    """Compact the JSONL cache into aligned arrays + a features table."""
    rows = [r for r in io.read_jsonl(ws.audio_cache) if r.get("ok")]
    if not rows:
        print("[analyze] no successful analyses yet — nothing to finalize.")
        return
    ids = [r["track_id"] for r in rows]
    emb = np.array([r["embedding"] for r in rows], dtype=np.float32)
    io.save_embeddings(ws, ids, emb)

    feat_rows = []
    for r in rows:
        d = {"track_id": r["track_id"]}
        d.update(r.get("feats", {}))
        feat_rows.append(d)
    pd.DataFrame(feat_rows).to_csv(ws.features_csv, index=False)
    print(f"[analyze] finalized {len(ids)} tracks "
          f"-> embeddings {emb.shape}, features.csv")
