"""Essentia model registry + downloader.

The Essentia TensorFlow models are not bundled (they're ~100s of MB). Each entry
points at the official weights (.pb) and its metadata (.json, which lists the
class labels). `ensure_models()` downloads anything missing into the workspace
`models/` directory.

Model card: https://essentia.upf.edu/models.html
"""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path

BASE = "https://essentia.upf.edu/models"

# name -> (weights_url, metadata_url or None)
MODELS = {
    # Backbone embedding model. Its penultimate layer is our 'vibe vector'.
    "discogs-effnet": (
        f"{BASE}/feature-extractors/discogs-effnet/discogs-effnet-bs64-1.pb",
        f"{BASE}/feature-extractors/discogs-effnet/discogs-effnet-bs64-1.json",
    ),
    # Classification heads that run ON TOP of the effnet embedding -----------
    "moodtheme": (
        f"{BASE}/classification-heads/mtg_jamendo_moodtheme/mtg_jamendo_moodtheme-discogs-effnet-1.pb",
        f"{BASE}/classification-heads/mtg_jamendo_moodtheme/mtg_jamendo_moodtheme-discogs-effnet-1.json",
    ),
    "danceability": (
        f"{BASE}/classification-heads/danceability/danceability-discogs-effnet-1.pb",
        f"{BASE}/classification-heads/danceability/danceability-discogs-effnet-1.json",
    ),
    "genre400": (
        f"{BASE}/classification-heads/genre_discogs400/genre_discogs400-discogs-effnet-1.pb",
        f"{BASE}/classification-heads/genre_discogs400/genre_discogs400-discogs-effnet-1.json",
    ),
    "approachability": (
        f"{BASE}/classification-heads/approachability/approachability_2c-discogs-effnet-1.pb",
        f"{BASE}/classification-heads/approachability/approachability_2c-discogs-effnet-1.json",
    ),
    "engagement": (
        f"{BASE}/classification-heads/engagement/engagement_2c-discogs-effnet-1.pb",
        f"{BASE}/classification-heads/engagement/engagement_2c-discogs-effnet-1.json",
    ),
}


def _download(url: str, dest: Path) -> None:
    if dest.exists():
        return
    print(f"  downloading {url} -> {dest.name}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(url, dest)


def ensure_models(models_dir: Path, names=None) -> dict:
    """Download requested models if absent. Returns {name: {'pb':path,'meta':dict}}."""
    names = names or list(MODELS)
    out = {}
    for name in names:
        pb_url, meta_url = MODELS[name]
        pb_path = models_dir / Path(pb_url).name
        _download(pb_url, pb_path)
        meta = None
        if meta_url:
            meta_path = models_dir / Path(meta_url).name
            _download(meta_url, meta_path)
            with open(meta_path, "r", encoding="utf-8") as fh:
                meta = json.load(fh)
        out[name] = {"pb": pb_path, "meta": meta}
    return out


def labels_of(meta: dict) -> list[str]:
    """Pull the class-label list out of an Essentia model metadata JSON."""
    if not meta:
        return []
    return meta.get("classes") or meta.get("outputs", [{}])[0].get("labels", []) or []
