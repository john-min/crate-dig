"""Projection, clustering, reduced embeddings, and DJ-moment heuristic."""

from __future__ import annotations

from typing import Iterable

import numpy as np
import pandas as pd

from cratedig_engine.schemas import ClusterAssignment, Track, TrackFeatures


def cluster_embeddings(
    embeddings: np.ndarray,
    tracks: list[Track],
    features: list[TrackFeatures] | None = None,
    *,
    min_cluster_size: int = 25,
    reduced_dim: int = 64,
    seed: int = 42,
) -> tuple[list[ClusterAssignment], np.ndarray]:
    if embeddings.ndim != 2:
        raise ValueError("embeddings must be 2-D [N, D]")
    if len(tracks) != embeddings.shape[0]:
        raise ValueError("tracks and embeddings are misaligned")

    ids = [t.track_id for t in tracks]
    embz = _standardize(embeddings)
    viz, _ = _reduce(embz, 2, seed=seed)
    # PCA/UMAP can return only N-1 components for a two-track corpus. The map
    # contract always requires x/y, so retain the informative axis and fill the
    # unavailable axis deterministically instead of failing the entire run.
    if viz.shape[1] < 2:
        viz = np.pad(viz, ((0, 0), (0, 2 - viz.shape[1])), mode="constant")
    cluster_space, _ = _reduce(embz, min(10, embz.shape[1]), seed=seed)
    labels, _ = _cluster(cluster_space, min_cluster_size)
    reduced = reduce_embeddings(embeddings, dim=reduced_dim, seed=seed)

    feat_df = _features_frame(ids, features)
    df = pd.DataFrame({"track_id": ids, "cluster": labels, "umap_x": viz[:, 0], "umap_y": viz[:, 1]})
    by_id = {t.track_id: t for t in tracks}
    df["bpm"] = [by_id[tid].bpm for tid in ids]
    fmap = feat_df.set_index("track_id") if not feat_df.empty else pd.DataFrame()
    for col in ("energy_rms", "brightness", "danceability", "engagement", "est_bpm"):
        if col in fmap.columns:
            df[col] = df["track_id"].map(fmap[col])

    energy_series = df["energy_rms"] if "energy_rms" in df else df.get("danceability")
    val_series = df["engagement"] if "engagement" in df else df.get("brightness")
    moments = []
    for _, row in df.iterrows():
        e = (
            _pct(energy_series, row.get("energy_rms", row.get("danceability")))
            if energy_series is not None
            else 0.5
        )
        v = (
            _pct(val_series, row.get("engagement", row.get("brightness")))
            if val_series is not None
            else 0.5
        )
        bpm = row["bpm"] if pd.notna(row["bpm"]) else row.get("est_bpm")
        moments.append(suggested_moment(bpm, e, v))
    df["suggested_moment"] = moments
    names = _name_clusters(df, feat_df)
    df["cluster_name"] = df["cluster"].map(names)

    assignments = []
    for i, row in df.iterrows():
        assignments.append(
            ClusterAssignment(
                track_id=row["track_id"],
                cluster_id=int(row["cluster"]),
                cluster_name=str(row["cluster_name"]),
                umap_x=float(row["umap_x"]),
                umap_y=float(row["umap_y"]),
                suggested_moment=str(row["suggested_moment"]),
                reduced_embedding=[float(x) for x in reduced[i].tolist()],
            )
        )
    return assignments, reduced


def reduce_embeddings(emb: np.ndarray, dim: int = 64, seed: int = 42) -> np.ndarray:
    from sklearn.decomposition import PCA

    if emb.shape[0] == 0:
        return emb
    z = _standardize(emb)
    d = min(dim, emb.shape[1], max(emb.shape[0] - 1, 1))
    if emb.shape[0] < 2 or d >= emb.shape[1]:
        reduced = z
    else:
        reduced = PCA(n_components=d, whiten=True, random_state=seed).fit_transform(z)
    norms = np.linalg.norm(reduced, axis=1, keepdims=True) + 1e-9
    return (reduced / norms).astype(np.float32)


def suggested_moment(bpm, energy_pct, valence_pct) -> str:
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


def _standardize(emb: np.ndarray) -> np.ndarray:
    mu = emb.mean(axis=0, keepdims=True)
    sd = emb.std(axis=0, keepdims=True) + 1e-8
    return (emb - mu) / sd


def _reduce(emb: np.ndarray, n_components: int, seed: int = 42):
    n = min(n_components, emb.shape[1], max(emb.shape[0] - 1, 1))
    try:
        import umap

        reducer = umap.UMAP(
            n_components=n,
            n_neighbors=min(15, max(2, emb.shape[0] - 1)),
            min_dist=0.1,
            metric="cosine",
            random_state=seed,
        )
        return reducer.fit_transform(emb), "umap"
    except Exception:
        from sklearn.decomposition import PCA

        return PCA(n_components=n, random_state=seed).fit_transform(emb), "pca"


def _cluster(coords: np.ndarray, min_cluster_size: int):
    try:
        import hdbscan

        labels = hdbscan.HDBSCAN(
            min_cluster_size=min_cluster_size,
            min_samples=5,
            metric="euclidean",
        ).fit_predict(coords)
        return labels, "hdbscan"
    except Exception:
        from sklearn.cluster import AgglomerativeClustering

        k = max(2, min(16, coords.shape[0] // max(min_cluster_size, 1)))
        k = min(k, coords.shape[0])
        labels = AgglomerativeClustering(n_clusters=k).fit_predict(coords)
        return labels, "agglomerative"


def _pct(series: pd.Series, value) -> float:
    series = series.dropna()
    if len(series) == 0 or value is None or (isinstance(value, float) and np.isnan(value)):
        return 0.5
    return float((series < value).mean())


def _features_frame(ids: list[str], features: list[TrackFeatures] | None) -> pd.DataFrame:
    if not features:
        return pd.DataFrame({"track_id": ids})
    rows = []
    for item in features:
        row = {"track_id": item.track_id}
        row.update(item.values)
        rows.append(row)
    return pd.DataFrame(rows)


def _name_clusters(df: pd.DataFrame, feat: pd.DataFrame) -> dict[int, str]:
    genre_cols = [c for c in feat.columns if c.startswith("genre::")]
    vibe_cols: list[str] = []
    for prefix in ("vibe::", "clap::", "mood::"):
        cols = [c for c in feat.columns if c.startswith(prefix)]
        if cols:
            vibe_cols = cols
            break
    has_tags = bool(genre_cols or vibe_cols)

    def top(sub: pd.DataFrame, cols: Iterable[str], k: int) -> list[str]:
        means = sub[list(cols)].mean(numeric_only=True).sort_values(ascending=False)
        return [c.split("::", 1)[1] for c in means.index[:k]]

    names: dict[int, str] = {}
    for cid, grp in df.groupby("cluster"):
        cid = int(cid)
        if cid == -1:
            names[cid] = "Outliers / one-offs"
            continue
        med_bpm = grp["bpm"].median()
        bpm_txt = f"{med_bpm:.0f} BPM" if pd.notna(med_bpm) else "mixed tempo"
        if has_tags:
            sub = feat[feat["track_id"].isin(grp["track_id"])]
            parts = []
            if genre_cols:
                parts.append(" / ".join(top(sub, genre_cols, 2)))
            if vibe_cols:
                parts.append(" / ".join(top(sub, vibe_cols, 2 if genre_cols else 4)))
            names[cid] = " · ".join(p for p in parts if p) or bpm_txt
        else:
            e = _pct(df["energy_rms"], grp["energy_rms"].median()) if "energy_rms" in df else 0.5
            br = _pct(df["brightness"], grp["brightness"].median()) if "brightness" in df else 0.5
            energy_word = ("mellow", "warm", "driving", "intense")[min(int(e * 4), 3)]
            bright_word = ("deep", "round", "bright", "crisp")[min(int(br * 4), 3)]
            names[cid] = f"{bright_word} & {energy_word} · {bpm_txt}"
    return names
