"""Local-file workspace adapter for desktop/offline runs.

Generated arrays and CSVs stay on disk and out of Git. This adapter does not
write dashboard HTML.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np

from cratedig_engine.pipeline.cache import AnalysisCache


class LocalWorkspace:
    def __init__(self, workdir: str | os.PathLike):
        self.root = Path(workdir).expanduser().resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    @property
    def tracks_json(self) -> Path:
        return self.root / "tracks.json"

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
    def clusters_json(self) -> Path:
        return self.root / "clusters.json"

    @property
    def reduced_emb_npy(self) -> Path:
        return self.root / "reduced_emb.npy"

    @property
    def models_dir(self) -> Path:
        path = self.root / "models"
        path.mkdir(exist_ok=True)
        return path

    def cache(self) -> AnalysisCache:
        return AnalysisCache(self.audio_cache)

    def save_embeddings(self, ids: list[str], emb: np.ndarray) -> None:
        np.save(self.embeddings_npy, emb.astype(np.float32))
        self.embeddings_ids.write_text(json.dumps(list(ids)), encoding="utf-8")

    def load_embeddings(self) -> tuple[list[str], np.ndarray]:
        emb = np.load(self.embeddings_npy)
        ids = json.loads(self.embeddings_ids.read_text(encoding="utf-8"))
        return ids, emb
