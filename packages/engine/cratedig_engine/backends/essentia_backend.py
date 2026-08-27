"""Essentia experimental backend. Optional; models download into models_dir."""

from __future__ import annotations

import json
import urllib.request
from pathlib import Path

import numpy as np

from cratedig_engine.audio.excerpt import core_excerpt
from cratedig_engine.schemas import BackendOutput

ESSENTIA_MODEL_VERSION = "discogs-effnet-bs64-1"
BASE = "https://essentia.upf.edu/models"

MODELS = {
    "discogs-effnet": (
        f"{BASE}/feature-extractors/discogs-effnet/discogs-effnet-bs64-1.pb",
        f"{BASE}/feature-extractors/discogs-effnet/discogs-effnet-bs64-1.json",
    ),
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


def _clean_genre(label: str) -> str:
    return label.split("---")[-1].strip()


def io_nodes(meta: dict, want_purpose: str):
    schema = (meta or {}).get("schema", {}) or {}
    ins = schema.get("inputs", []) or []
    outs = schema.get("outputs", []) or []
    in_name = ins[0].get("name") if ins else None
    out_name = None
    for o in outs:
        if o.get("output_purpose") == want_purpose:
            out_name = o.get("name")
            break
    if out_name is None:
        for o in outs:
            if o.get("output_purpose") in ("predictions", "labels"):
                out_name = o.get("name")
                break
    if out_name is None and outs:
        out_name = outs[0].get("name")
    return in_name, out_name


def labels_of(meta: dict) -> list[str]:
    if not meta:
        return []
    return meta.get("classes") or meta.get("outputs", [{}])[0].get("labels", []) or []


def _download(url: str, dest: Path) -> None:
    if dest.exists():
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(url, dest)


def ensure_models(models_dir: Path, names=None) -> dict:
    names = names or list(MODELS)
    out = {}
    for name in names:
        pb_url, meta_url = MODELS[name]
        pb_path = Path(models_dir) / Path(pb_url).name
        _download(pb_url, pb_path)
        meta = None
        if meta_url:
            meta_path = Path(models_dir) / Path(meta_url).name
            _download(meta_url, meta_path)
            with open(meta_path, "r", encoding="utf-8") as fh:
                meta = json.load(fh)
        out[name] = {"pb": pb_path, "meta": meta}
    return out


class EssentiaBackend:
    name = "essentia"
    model_version = ESSENTIA_MODEL_VERSION
    HEADS = ("moodtheme", "danceability", "genre400", "approachability", "engagement")

    def __init__(self, models_dir, sr: int = 16000):
        import essentia  # noqa: F401

        self.sr = sr
        self.models = ensure_models(Path(models_dir))
        self._build_graphs()

    def _build_graphs(self) -> None:
        import essentia.standard as es

        m = self.models
        _, emb_out = io_nodes(m["discogs-effnet"]["meta"], "embeddings")
        self.embed = es.TensorflowPredictEffnetDiscogs(
            graphFilename=str(m["discogs-effnet"]["pb"]),
            output=emb_out or "PartitionedCall:1",
        )
        self.head = {}
        self.head_labels = {}
        for key in self.HEADS:
            if key not in m:
                continue
            in_node, out_node = io_nodes(m[key]["meta"], "predictions")
            if not out_node:
                continue
            kwargs = {"graphFilename": str(m[key]["pb"]), "output": out_node}
            if in_node:
                kwargs["input"] = in_node
            try:
                self.head[key] = es.TensorflowPredict2D(**kwargs)
                self.head_labels[key] = labels_of(m[key]["meta"])
            except Exception:
                continue

    def _predict(self, key, emb_frames):
        try:
            return np.mean(self.head[key](emb_frames), axis=0)
        except Exception:
            return None

    def analyze(self, audio_path: str) -> BackendOutput:
        import essentia.standard as es

        audio = es.MonoLoader(filename=audio_path, sampleRate=self.sr, resampleQuality=4)()
        audio = core_excerpt(audio, self.sr)
        emb_frames = self.embed(audio)
        embedding = np.mean(emb_frames, axis=0).astype(np.float32)
        feats: dict = {}

        if "moodtheme" in self.head:
            preds = self._predict("moodtheme", emb_frames)
            labels = self.head_labels.get("moodtheme", [])
            if preds is not None and len(labels) == len(preds):
                order = np.argsort(preds)[::-1]
                for i in order[:6]:
                    feats[f"mood::{labels[i]}"] = round(float(preds[i]), 4)

        if "danceability" in self.head:
            p = self._predict("danceability", emb_frames)
            if p is not None:
                feats["danceability"] = round(float(p[0]), 4)

        for key in ("approachability", "engagement"):
            if key in self.head:
                p = self._predict(key, emb_frames)
                if p is not None:
                    feats[key] = round(float(p[-1]), 4)

        if "genre400" in self.head:
            preds = self._predict("genre400", emb_frames)
            labels = self.head_labels.get("genre400", [])
            if preds is not None and len(labels) == len(preds):
                order = np.argsort(preds)[::-1]
                top = int(order[0])
                feats["genre_pred"] = _clean_genre(labels[top])
                feats["genre_conf"] = round(float(preds[top]), 4)
                for i in order[:6]:
                    feats[f"genre::{_clean_genre(labels[i])}"] = round(float(preds[i]), 4)
                feats["mood_top"] = " / ".join(_clean_genre(labels[i]) for i in order[:3])

        return BackendOutput(
            embedding=[float(x) for x in embedding.tolist()],
            features=feats,
            embedding_dim=int(embedding.shape[0]),
        )
