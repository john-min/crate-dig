"""Filesystem layout and small load/save helpers.

Everything the pipeline produces lives in a single working directory (default
``./djvibe_data``) so the stages can hand off to each other by file:

    tracks.csv          normalized rekordbox collection (one row per track)
    audio_cache.jsonl   per-track analysis cache (resumable; one JSON per line)
    embeddings.npy      float32 [N, D]  analysis embeddings (the 'vibe vector')
    embeddings_ids.json track_id order aligned to embeddings.npy rows
    features.csv        interpretable per-track features (mood/genre/danceability)
    clusters.csv        track_id + cluster, cluster_name, umap_x/y, suggested_moment
    reduced_emb.npy     float32 [N, k] L2-normalized embedding for in-browser search
    dashboard.html      the interactive explorer
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import numpy as np


class Workspace:
    """Resolves and creates the on-disk paths for one run."""

    def __init__(self, workdir: str | os.PathLike):
        self.root = Path(workdir).expanduser().resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    # table / array paths -------------------------------------------------
    @property
    def tracks_csv(self) -> Path:
        return self.root / "tracks.csv"

    @property
    def audio_cache(self) -> Path:
        return self.root / "audio_cache.jsonl"

    @property
    def embeddings_npy(self) -> Path:
        return self.root / "embeddings.npy"

    @property
    def embeddings_ids(self) -> Path:
        return self.root / "embeddings_ids.json"

    @property
    def features_csv(self) -> Path:
        return self.root / "features.csv"

    @property
    def chords_csv(self) -> Path:
        """Per-track chord progressions (track_id, chords, key_est, tempo)."""
        return self.root / "chords.csv"

    @property
    def clusters_csv(self) -> Path:
        return self.root / "clusters.csv"

    @property
    def reduced_emb_npy(self) -> Path:
        return self.root / "reduced_emb.npy"

    @property
    def dashboard_html(self) -> Path:
        return self.root / "dashboard.html"

    @property
    def models_dir(self) -> Path:
        d = self.root / "models"
        d.mkdir(exist_ok=True)
        return d


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not Path(path).exists():
        return []
    rows = []
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def append_jsonl(path: Path, record: dict[str, Any]) -> None:
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")


def save_embeddings(ws: Workspace, ids: list[str], emb: np.ndarray) -> None:
    np.save(ws.embeddings_npy, emb.astype(np.float32))
    with open(ws.embeddings_ids, "w", encoding="utf-8") as fh:
        json.dump(list(ids), fh)


def load_embeddings(ws: Workspace) -> tuple[list[str], np.ndarray]:
    emb = np.load(ws.embeddings_npy)
    with open(ws.embeddings_ids, "r", encoding="utf-8") as fh:
        ids = json.load(fh)
    return ids, emb
