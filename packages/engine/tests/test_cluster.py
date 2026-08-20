from __future__ import annotations

import numpy as np

from cratedig_engine.pipeline.cluster import cluster_embeddings, reduce_embeddings
from cratedig_engine.schemas import Track, TrackFeatures


def _synthetic(n: int = 40, groups: int = 4, dim: int = 32, seed: int = 7):
    rng = np.random.default_rng(seed)
    centers = rng.normal(0, 3, size=(groups, dim))
    tracks = []
    features = []
    emb = []
    for i in range(n):
        g = i % groups
        vector = centers[g] + rng.normal(0, 0.4, size=dim)
        tid = f"T{i:03d}"
        tracks.append(
            Track(
                track_id=tid,
                title=f"Track {i}",
                artist=f"Artist {g}",
                bpm=118 + g * 3,
                key="8A",
            )
        )
        features.append(
            TrackFeatures(
                track_id=tid,
                values={
                    "energy_rms": 0.05 + 0.04 * g,
                    "brightness": 1500 + 200 * g,
                    f"mood::{'warm' if g < 2 else 'dark'}": 0.8,
                },
            )
        )
        emb.append(vector.astype(np.float32))
    return np.vstack(emb), tracks, features


def test_cluster_output_schema_and_reduced_shape():
    emb, tracks, features = _synthetic()
    assignments, reduced = cluster_embeddings(
        emb,
        tracks,
        features,
        min_cluster_size=8,
        reduced_dim=8,
    )
    assert len(assignments) == len(tracks)
    assert reduced.shape[0] == len(tracks)
    assert reduced.shape[1] <= 8
    norms = np.linalg.norm(reduced, axis=1)
    assert np.allclose(norms, 1.0, atol=1e-5)
    for item in assignments:
        dumped = item.model_dump()
        assert dumped["track_id"]
        assert isinstance(dumped["cluster_id"], int)
        assert dumped["cluster_name"]
        assert isinstance(dumped["umap_x"], float)
        assert isinstance(dumped["umap_y"], float)
        assert dumped["suggested_moment"]
        assert len(dumped["reduced_embedding"]) == reduced.shape[1]


def test_reduce_embeddings_l2_normalized():
    rng = np.random.default_rng(0)
    emb = rng.normal(size=(20, 16)).astype(np.float32)
    reduced = reduce_embeddings(emb, dim=6)
    assert reduced.shape == (20, 6)
    assert np.allclose(np.linalg.norm(reduced, axis=1), 1.0, atol=1e-5)
