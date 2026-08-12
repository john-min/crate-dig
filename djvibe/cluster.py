"""Discover 'vibe' clusters from the analysis embeddings.

Pipeline
--------
1. Standardize embeddings (z-score).
2. UMAP -> 2 dims for the dashboard scatter, and -> ~10 dims as the space
   HDBSCAN actually clusters in (clustering in a low-D UMAP space is far more
   reliable than clustering raw high-D embeddings).
3. HDBSCAN finds clusters of varying density and marks outliers as -1.
4. Name each cluster from whatever signal we have (mood/genre tags if Essentia,
   else tempo/energy/brightness), and attach a heuristic "suggested moment"
   (sunrise / beach / sunset / peak / afterhours) for DJ context.
5. Produce reduced_emb.npy: a small, L2-normalized embedding used by the
   dashboard for fast in-browser cosine similarity ("find tracks like these").

If umap-learn / hdbscan aren't installed, it degrades to PCA + KMeans/Agglo so
the pipeline always completes.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import io


# --------------------------------------------------------------------------
# dimensionality reduction + clustering (with graceful fallbacks)
# --------------------------------------------------------------------------
def _standardize(emb: np.ndarray) -> np.ndarray:
    mu = emb.mean(axis=0, keepdims=True)
    sd = emb.std(axis=0, keepdims=True) + 1e-8
    return (emb - mu) / sd


def _umap(emb: np.ndarray, n_components: int, seed: int = 42):
    try:
        import umap
        reducer = umap.UMAP(
            n_components=n_components, n_neighbors=15, min_dist=0.1,
            metric="cosine", random_state=seed,
        )
        return reducer.fit_transform(emb), "umap"
    except Exception:
        from sklearn.decomposition import PCA
        n = min(n_components, emb.shape[1])
        return PCA(n_components=n, random_state=seed).fit_transform(emb), "pca"


def _cluster(coords: np.ndarray, min_cluster_size: int):
    try:
        import hdbscan
        labels = hdbscan.HDBSCAN(
            min_cluster_size=min_cluster_size,
            min_samples=5, metric="euclidean",
        ).fit_predict(coords)
        return labels, "hdbscan"
    except Exception:
        from sklearn.cluster import AgglomerativeClustering
        k = max(4, min(16, coords.shape[0] // max(min_cluster_size, 1)))
        labels = AgglomerativeClustering(n_clusters=k).fit_predict(coords)
        return labels, "agglomerative"


# --------------------------------------------------------------------------
# naming + DJ-moment heuristic
# --------------------------------------------------------------------------
def _pct(s: pd.Series, v) -> float:
    s = s.dropna()
    if len(s) == 0 or v is None or (isinstance(v, float) and np.isnan(v)):
        return 0.5
    return float((s < v).mean())


def _suggested_moment(bpm, energy_pct, valence_pct) -> str:
    """Very rough DJ-set placement from tempo + energy + brightness/positivity.

    These are *starting suggestions* for set-building, not ground truth.
    """
    b = bpm or 122
    if b < 116 and energy_pct < 0.45:
        return "Sunrise / ambient open"
    if b < 122 and valence_pct >= 0.5 and energy_pct < 0.6:
        return "Daytime beach club"
    if b < 124 and energy_pct < 0.55:
        return "Sunset / golden hour"
    if energy_pct >= 0.7 or b >= 126:
        return "Peak time"
    if valence_pct < 0.4 and energy_pct >= 0.5:
        return "Deep / afterhours"
    return "Main floor"


def _name_clusters(df: pd.DataFrame, feat: pd.DataFrame) -> dict:
    """Return {cluster_id: human-readable name}.

    Composes a name from a GENRE group and a VIBE group when both exist, so a
    cluster reads like "Deep House · hypnotic / warm · 122 BPM":
      genre group : genre::   (Essentia Discogs, or CLAP subgenres)
      vibe  group : vibe:: / clap:: / mood::   (CLAP characters or Essentia moods)
    """
    genre_cols = [c for c in feat.columns if c.startswith("genre::")]
    vibe_cols = []
    for prefix in ("vibe::", "clap::", "mood::"):
        cols = [c for c in feat.columns if c.startswith(prefix)]
        if cols:
            vibe_cols = cols
            break
    has_tags = bool(genre_cols or vibe_cols)

    def _top(sub, cols, k):
        means = sub[cols].mean(numeric_only=True).sort_values(ascending=False)
        return [c.split("::", 1)[1] for c in means.index[:k]]

    names = {}
    for cid, grp in df.groupby("cluster"):
        if cid == -1:
            names[cid] = "Outliers / one-offs"
            continue
        med_bpm = grp["bpm"].median()
        bpm_txt = f"{med_bpm:.0f} BPM" if pd.notna(med_bpm) else "mixed tempo"
        if has_tags:
            sub = feat[feat["track_id"].isin(grp["track_id"])]
            parts = []
            if genre_cols:
                parts.append(" / ".join(_top(sub, genre_cols, 2)))
            if vibe_cols:
                parts.append(" / ".join(_top(sub, vibe_cols, 2 if genre_cols else 4)))
            names[cid] = " · ".join(p for p in parts if p) or bpm_txt
        else:
            # describe by energy + brightness percentile within the collection
            e = _pct(df["energy_rms"], grp["energy_rms"].median()) if "energy_rms" in df else 0.5
            br = _pct(df["brightness"], grp["brightness"].median()) if "brightness" in df else 0.5
            energy_word = ("mellow", "warm", "driving", "intense")[min(int(e * 4), 3)]
            bright_word = ("deep", "round", "bright", "crisp")[min(int(br * 4), 3)]
            names[cid] = f"{bright_word} & {energy_word} · {bpm_txt}"
    return names


# --------------------------------------------------------------------------
# main entry
# --------------------------------------------------------------------------
def run(ws: io.Workspace, min_cluster_size: int = 25, reduced_dim: int = 64):
    import pandas as pd

    ids, emb = io.load_embeddings(ws)
    tracks = pd.read_csv(ws.tracks_csv, dtype={"track_id": str}).set_index("track_id")
    feat = (pd.read_csv(ws.features_csv, dtype={"track_id": str})
            if ws.features_csv.exists() else pd.DataFrame({"track_id": ids}))

    embz = _standardize(emb)
    viz, viz_algo = _umap(embz, 2)
    clu_space, _ = _umap(embz, min(10, embz.shape[1]))
    labels, clu_algo = _cluster(clu_space, min_cluster_size)
    print(f"[cluster] reduction={viz_algo}, clustering={clu_algo}, "
          f"{len(set(labels)) - (1 if -1 in labels else 0)} clusters, "
          f"{int((labels == -1).sum())} outliers")

    df = pd.DataFrame({"track_id": ids})
    df["cluster"] = labels
    df["umap_x"] = viz[:, 0]
    df["umap_y"] = viz[:, 1]
    # bring across the bits the dashboard / naming need
    for col in ("title", "artist", "bpm", "key", "genre"):
        df[col] = df["track_id"].map(tracks[col]) if col in tracks else ""
    # energy / brightness for librosa naming + moment heuristic
    fmap = feat.set_index("track_id")
    for col in ("energy_rms", "brightness", "danceability", "mood_top",
                "genre_pred", "engagement", "est_bpm"):
        if col in fmap.columns:
            df[col] = df["track_id"].map(fmap[col])

    # suggested DJ moment per track
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

    # reduced, L2-normalized embedding for the dashboard's cosine search
    reduced = _reduce_for_browser(emb, reduced_dim)
    np.save(ws.reduced_emb_npy, reduced.astype(np.float32))
    print(f"[cluster] wrote clusters.csv and reduced_emb {reduced.shape}")
    return df


def _reduce_for_browser(emb: np.ndarray, dim: int) -> np.ndarray:
    from sklearn.decomposition import PCA
    d = min(dim, emb.shape[1], emb.shape[0])
    z = _standardize(emb)
    r = PCA(n_components=d, whiten=True, random_state=42).fit_transform(z) if d < emb.shape[1] else z
    # L2 normalize so an in-browser dot product == cosine similarity
    norms = np.linalg.norm(r, axis=1, keepdims=True) + 1e-9
    return r / norms
