"""Assemble the self-contained interactive dashboard (dashboard.html).

Reads clusters.csv + reduced_emb.npy (same row order as embeddings_ids.json),
embeds the data as JSON into the HTML template, and writes a single file you can
double-click to open. No server, no internet needed except the Plotly CDN.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from . import io

TEMPLATE = Path(__file__).with_name("dashboard_template.html")


def _clean(v, default=""):
    if v is None:
        return default
    if isinstance(v, float) and (np.isnan(v)):
        return default
    return v


def run(ws: io.Workspace, backend_label: str = "essentia"):
    ids, _ = io.load_embeddings(ws)
    reduced = np.load(ws.reduced_emb_npy)
    clusters = pd.read_csv(ws.clusters_csv, dtype={"track_id": str}).set_index("track_id")

    # align reduced rows (embeddings order) to cluster metadata
    tracks = []
    emb = []
    for i, tid in enumerate(ids):
        if tid not in clusters.index:
            continue
        r = clusters.loc[tid]
        tracks.append({
            "id": tid,
            "t": str(_clean(r.get("title"))),
            "a": str(_clean(r.get("artist"))),
            "bpm": (float(r["bpm"]) if pd.notna(r.get("bpm")) else None),
            "key": str(_clean(r.get("key"))),
            "c": int(r["cluster"]),
            "cn": str(_clean(r.get("cluster_name"))),
            "m": str(_clean(r.get("suggested_moment"))),
            "x": round(float(r["umap_x"]), 4),
            "y": round(float(r["umap_y"]), 4),
        })
        emb.append([round(float(x), 4) for x in reduced[i]])

    # cluster summary for the legend
    cl = (clusters.reset_index()
          .groupby(["cluster", "cluster_name"]).size()
          .reset_index(name="count").sort_values("cluster"))
    clusters_meta = [{"id": int(a), "name": str(b), "count": int(c)}
                     for a, b, c in cl.itertuples(index=False)]

    data = {"tracks": tracks, "emb": emb,
            "clusters": clusters_meta, "backend": backend_label}

    html = TEMPLATE.read_text(encoding="utf-8")
    blob = "const DATA = " + json.dumps(data, ensure_ascii=False) + ";"
    html = html.replace("/*__DATA__*/", blob)
    ws.dashboard_html.write_text(html, encoding="utf-8")
    size_mb = ws.dashboard_html.stat().st_size / 1e6
    print(f"[dashboard] wrote {ws.dashboard_html}  ({len(tracks)} tracks, {size_mb:.1f} MB)")
    return ws.dashboard_html
