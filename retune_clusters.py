"""Re-tune clustering WITHOUT re-analyzing audio.

Reuses the embeddings already saved in djvibe_data/ and just re-runs the
clustering with friendlier settings, so you can dial the number of clusters and
outliers to taste. After running this, rebuild the dashboard:

    python3 retune_clusters.py                 # loosen so far fewer outliers
    python3 retune_clusters.py --absorb        # ZERO outliers (fold strays into nearest cluster)
    python3 retune_clusters.py --min-cluster-size 30   # bigger, broader clusters
    python3 -m djvibe dashboard                # rebuild the map

Tips:
  - More outliers than you like?  add --absorb, or lower --min-samples (try 1).
  - Too many tiny clusters?       raise --min-cluster-size (e.g. 25 or 40).
"""
from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

from djvibe import io
from djvibe.cluster import _standardize, _umap, _name_clusters, _suggested_moment, _pct


def cluster_loose(coords, min_cluster_size, min_samples, epsilon, absorb):
    try:
        import hdbscan
    except Exception:
        from sklearn.cluster import AgglomerativeClustering
        k = max(4, min(20, coords.shape[0] // max(min_cluster_size, 1)))
        return AgglomerativeClustering(n_clusters=k).fit_predict(coords)

    labels = hdbscan.HDBSCAN(
        min_cluster_size=min_cluster_size,
        min_samples=min_samples,            # 1 = far less eager to call things noise
        cluster_selection_epsilon=epsilon,  # >0 merges nearby micro-clusters
        metric="euclidean",
    ).fit_predict(coords)

    if absorb and (labels == -1).any():
        labels = _absorb_outliers(coords, labels)
    return labels


def _absorb_outliers(coords, labels):
    """Assign every noise point (-1) to its nearest real-cluster centroid."""
    labels = labels.copy()
    real = [c for c in sorted(set(labels)) if c != -1]
    if not real:
        return labels
    centroids = np.array([coords[labels == c].mean(axis=0) for c in real])
    noise_idx = np.where(labels == -1)[0]
    for i in noise_idx:
        d = np.linalg.norm(centroids - coords[i], axis=1)
        labels[i] = real[int(np.argmin(d))]
    return labels


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--workdir", default="./djvibe_data")
    ap.add_argument("--min-cluster-size", type=int, default=15)
    ap.add_argument("--min-samples", type=int, default=1)
    ap.add_argument("--epsilon", type=float, default=0.0)
    ap.add_argument("--absorb", action="store_true",
                    help="fold all leftover outliers into their nearest cluster")
    args = ap.parse_args()

    ws = io.Workspace(args.workdir)
    ids, emb = io.load_embeddings(ws)
    tracks = pd.read_csv(ws.tracks_csv, dtype={"track_id": str}).set_index("track_id")
    feat = (pd.read_csv(ws.features_csv, dtype={"track_id": str})
            if ws.features_csv.exists() else pd.DataFrame({"track_id": ids}))

    embz = _standardize(emb)
    viz, _ = _umap(embz, 2)
    clu_space, _ = _umap(embz, min(10, embz.shape[1]))
    labels = cluster_loose(clu_space, args.min_cluster_size, args.min_samples,
                           args.epsilon, args.absorb)

    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    n_out = int((np.array(labels) == -1).sum())
    pct = 100.0 * n_out / len(labels)
    print(f"[retune] {n_clusters} clusters, {n_out} outliers ({pct:.0f}%)  "
          f"[min_cluster_size={args.min_cluster_size}, min_samples={args.min_samples}, "
          f"absorb={args.absorb}]")

    df = pd.DataFrame({"track_id": ids})
    df["cluster"] = labels
    df["umap_x"] = viz[:, 0]
    df["umap_y"] = viz[:, 1]
    for col in ("title", "artist", "bpm", "key", "genre"):
        df[col] = df["track_id"].map(tracks[col]) if col in tracks else ""
    fmap = feat.set_index("track_id")
    for col in ("energy_rms", "brightness", "danceability", "mood_top",
                "genre_pred", "engagement", "est_bpm"):
        if col in fmap.columns:
            df[col] = df["track_id"].map(fmap[col])

    energy_series = df["energy_rms"] if "energy_rms" in df else df.get("danceability")
    val_series = df["engagement"] if "engagement" in df else df.get("brightness")
    moments = []
    for _, r in df.iterrows():
        e = _pct(energy_series, r.get("energy_rms", r.get("danceability"))) if energy_series is not None else 0.5
        v = _pct(val_series, r.get("engagement", r.get("brightness"))) if val_series is not None else 0.5
        bpm = r["bpm"] if pd.notna(r["bpm"]) else r.get("est_bpm")
        moments.append(_suggested_moment(bpm, e, v))
    df["suggested_moment"] = moments

    names = _name_clusters(df, feat)
    df["cluster_name"] = df["cluster"].map(names)
    df.to_csv(ws.clusters_csv, index=False)
    print(f"[retune] wrote {ws.clusters_csv} — now run:  python3 -m djvibe dashboard")


if __name__ == "__main__":
    main()
