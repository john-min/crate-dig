"""Audio analysis backends.

Each backend turns one audio file into:
    embedding : np.ndarray[float32]   -- the high-dimensional 'vibe vector'
    feats     : dict                  -- interpretable, human-readable features

Two backends:

* ``EssentiaBackend`` (recommended) — Discogs-EffNet embeddings (1280-d) plus
  classification heads for mood/theme, danceability, genre, approachability and
  engagement. The embedding drives similarity + clustering; the heads make each
  cluster nameable ("groovy / uplifting", "dark / driving", ...).

* ``LibrosaBackend`` (fallback, installs everywhere) — a compact timbral/rhythmic
  feature vector (MFCC, chroma, spectral shape, tempo, energy). No semantic tags,
  so clusters are named from tempo/energy/brightness instead.

`get_backend("auto")` uses Essentia if importable, else librosa.
"""
from __future__ import annotations

import numpy as np


# ===========================================================================
# representative excerpt: focus on a track's CORE, not its intro/outro.
# Extended DJ edits have long mix-in / mix-out sections that don't represent
# the track. We trim the outer edges and keep a central, content-dense window.
# ===========================================================================
def core_excerpt(y: np.ndarray, sr: int, max_sec: float = 90.0,
                 edge_skip: float = 0.15) -> np.ndarray:
    """Return the central section of a track, dropping intro/outro edges.

    edge_skip: fraction trimmed from each end (0.15 -> drop first & last 15%).
    max_sec:   cap the analyzed length, centered, to bound compute.
    Falls back to the whole signal for short tracks.
    """
    n = len(y)
    if n == 0:
        return y
    a = int(n * edge_skip)
    b = n - a
    if b - a < sr * 20:          # too short after trimming -> use the whole thing
        a, b = 0, n
    core = y[a:b]
    cap = int(max_sec * sr)
    if len(core) > cap:          # center-crop to max_sec
        s = (len(core) - cap) // 2
        core = core[s:s + cap]
    return core


def _clean_genre(label: str) -> str:
    """Discogs labels look like 'Electronic---Tech House' -> 'Tech House'."""
    return label.split("---")[-1].strip()


# ===========================================================================
# helper: read the correct TensorFlow input/output node names from a model's
# metadata JSON, so we never hardcode names that drift between model versions.
# ===========================================================================
def io_nodes(meta: dict, want_purpose: str):
    """Return (input_node, output_node) for an Essentia model from its metadata.

    `want_purpose` is e.g. 'embeddings' for the backbone or 'predictions' for a
    classifier head. Falls back sensibly if the schema is shaped differently.
    """
    schema = (meta or {}).get("schema", {}) or {}
    ins = schema.get("inputs", []) or []
    outs = schema.get("outputs", []) or []
    in_name = ins[0].get("name") if ins else None

    out_name = None
    for o in outs:                                   # 1) exact purpose match
        if o.get("output_purpose") == want_purpose:
            out_name = o.get("name"); break
    if out_name is None:                             # 2) any prediction-like head
        for o in outs:
            if o.get("output_purpose") in ("predictions", "labels"):
                out_name = o.get("name"); break
    if out_name is None and outs:                    # 3) just take the first
        out_name = outs[0].get("name")
    return in_name, out_name


# ===========================================================================
# Essentia backend
# ===========================================================================
class EssentiaBackend:
    name = "essentia"

    # heads we try to attach; purpose used to pick the output node from metadata
    HEADS = ("moodtheme", "danceability", "genre400", "approachability", "engagement")

    def __init__(self, models_dir, sr: int = 16000):
        import essentia  # noqa: F401  (fail fast if missing)
        from .models import ensure_models, labels_of

        self.sr = sr
        self._labels_of = labels_of
        self.models = ensure_models(models_dir)
        self._build_graphs()

    def _build_graphs(self):
        import essentia.standard as es

        m = self.models
        # backbone: produces the embedding we cluster on
        _, emb_out = io_nodes(m["discogs-effnet"]["meta"], "embeddings")
        self.embed = es.TensorflowPredictEffnetDiscogs(
            graphFilename=str(m["discogs-effnet"]["pb"]),
            output=emb_out or "PartitionedCall:1",
        )

        # heads consume the embedding directly; node names come from metadata
        self.head = {}
        self.head_labels = {}
        for key in self.HEADS:
            if key not in m:
                continue
            in_node, out_node = io_nodes(m[key]["meta"], "predictions")
            if not out_node:
                print(f"  [warn] no output node found for head '{key}' — skipping")
                continue
            kwargs = {"graphFilename": str(m[key]["pb"]), "output": out_node}
            if in_node:
                kwargs["input"] = in_node
            try:
                self.head[key] = es.TensorflowPredict2D(**kwargs)
                self.head_labels[key] = self._labels_of(m[key]["meta"])
            except Exception as exc:
                print(f"  [warn] could not load head '{key}': {exc}")

    def _predict(self, key, emb_frames):
        """Run one head; return mean prediction vector, or None on failure."""
        try:
            return np.mean(self.head[key](emb_frames), axis=0)
        except Exception as exc:
            print(f"  [warn] head '{key}' prediction failed: {exc}")
            return None

    def analyze(self, path: str):
        import essentia.standard as es

        audio = es.MonoLoader(filename=path, sampleRate=self.sr, resampleQuality=4)()
        audio = core_excerpt(audio, self.sr)          # focus on the track's core
        emb_frames = self.embed(audio)               # [frames, 1280]
        embedding = np.mean(emb_frames, axis=0).astype(np.float32)

        feats: dict = {}

        # --- mood / theme (multi-label): kept as secondary descriptors --------
        if "moodtheme" in self.head:
            preds = self._predict("moodtheme", emb_frames)
            labels = self.head_labels.get("moodtheme", [])
            if preds is not None and len(labels) == len(preds):
                order = np.argsort(preds)[::-1]
                for i in order[:6]:
                    feats[f"mood::{labels[i]}"] = round(float(preds[i]), 4)

        # --- danceability (2-class) ------------------------------------------
        if "danceability" in self.head:
            p = self._predict("danceability", emb_frames)
            if p is not None:
                feats["danceability"] = round(float(p[0]), 4)

        # --- approachability / engagement (2-class) --------------------------
        for key in ("approachability", "engagement"):
            if key in self.head:
                p = self._predict(key, emb_frames)
                if p is not None:
                    feats[key] = round(float(p[-1]), 4)

        # --- genre (Discogs 400): PRIMARY taxonomy for electronic music -------
        # This model knows house/techno subgenres, so we keep the top several
        # as genre:: tags (they drive cluster naming) instead of just the top 1.
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
                # cluster names should read like the music, e.g. "Tech House / Deep House"
                feats["mood_top"] = " / ".join(_clean_genre(labels[i]) for i in order[:3])

        return embedding, feats


# ===========================================================================
# Librosa fallback backend
# ===========================================================================
class LibrosaBackend:
    name = "librosa"

    def __init__(self, sr: int = 22050, duration: float = 120.0):
        import librosa  # noqa: F401
        self.sr = sr
        self.duration = duration  # analyze up to N seconds (skip long tails)

    def analyze(self, path: str):
        import librosa

        y, sr = librosa.load(path, sr=self.sr, mono=True)
        if y.size == 0:
            raise ValueError("empty audio")
        y = core_excerpt(y, sr, max_sec=self.duration)   # skip intro/outro

        feats: dict = {}
        parts: list[np.ndarray] = []

        def add(arr):
            parts.append(np.atleast_1d(np.asarray(arr, dtype=np.float32)))

        # timbre
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=20)
        add(mfcc.mean(axis=1)); add(mfcc.std(axis=1))
        # harmony
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        add(chroma.mean(axis=1))
        # spectral shape (brightness / texture)
        cent = librosa.feature.spectral_centroid(y=y, sr=sr)
        bw = librosa.feature.spectral_bandwidth(y=y, sr=sr)
        rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)
        contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
        flat = librosa.feature.spectral_flatness(y=y)
        add(cent.mean()); add(bw.mean()); add(rolloff.mean())
        add(contrast.mean(axis=1)); add(flat.mean())
        # energy / dynamics
        rms = librosa.feature.rms(y=y)
        zcr = librosa.feature.zero_crossing_rate(y)
        add(rms.mean()); add(zcr.mean())
        # rhythm
        tempo = float(librosa.beat.tempo(y=y, sr=sr)[0])

        feats["est_bpm"] = round(tempo, 2)
        feats["brightness"] = round(float(cent.mean()), 2)
        feats["energy_rms"] = round(float(rms.mean()), 5)
        feats["percussiveness"] = round(float(zcr.mean()), 5)

        embedding = np.concatenate(parts).astype(np.float32)
        return embedding, feats


# ===========================================================================
# CLAP backend (PyTorch + Hugging Face transformers; runs natively, incl. MPS)
# ===========================================================================
class ClapBackend:
    """Contrastive Language-Audio Pretraining embeddings.

    Produces a 512-d audio embedding per track AND zero-shot 'vibe' scores by
    comparing each track to a curated set of mood prompts in CLAP's shared
    text/audio space. Those scores name the clusters (stored as ``clap::`` tags)
    and double as energy/valence proxies for the suggested-moment heuristic.
    """
    name = "clap"

    # Genre-AGNOSTIC vibe vocabulary. CLAP describes how a track FEELS, not its
    # subgenre — zero-shot genre labels proved unreliable on electronic music
    # (everything collapsed into one or two catch-all genres). EDIT THIS LIST to
    # the descriptors you actually think in; clusters are named from these + BPM.
    VIBES = [
        "driving", "punchy", "intense", "percussive", "hypnotic",
        "dark", "warm", "euphoric", "dreamy", "atmospheric",
        "minimal", "deep", "raw", "vocal", "instrumental", "piano",
    ]
    PROMPTS = VIBES
    # subsets used as energy / positivity proxies for the moment heuristic
    ENERGY = {"driving", "punchy", "intense", "percussive"}
    VALENCE = {"euphoric", "warm", "dreamy"}

    # precise CLAP prompts for ambiguous tags (chip label stays short)
    PROMPT_TEXT = {
        "acid": "squelchy acid 303 synth line",
        "vocal": "a song with clear vocals or singing",
        "instrumental": "purely instrumental music with no vocals",
        "sub-heavy bass": "deep heavy sub bass",
        "arpeggiated": "an arpeggiated synth melody",
        "piano": "prominent piano",
    }

    def _prompt_for(self, tag):
        return self.PROMPT_TEXT.get(tag, tag + " music")

    def __init__(self, model_id="laion/clap-htsat-unfused", sr=48000,
                 n_windows=3, win_sec=10):
        import torch
        from transformers import ClapModel, ClapProcessor

        self.torch = torch
        self.sr = sr
        self.n_windows = n_windows
        self.win = sr * win_sec
        self.device = ("mps" if torch.backends.mps.is_available()
                       else "cuda" if torch.cuda.is_available() else "cpu")
        print(f"[clap] loading {model_id} on {self.device} …")
        self.model = ClapModel.from_pretrained(model_id).to(self.device).eval()
        self.processor = ClapProcessor.from_pretrained(model_id)

        tin = self.processor(text=[self._prompt_for(p) for p in self.PROMPTS],
                             return_tensors="pt", padding=True).to(self.device)
        with torch.no_grad():
            out = self.model.get_text_features(**tin)
        t = self._as_embeds(out)
        self.text_emb = torch.nn.functional.normalize(t, dim=-1)  # [P, 512]

    def _as_embeds(self, out):
        """Return the embedding TENSOR, across transformers versions.

        Older CLAP returns the (already projected) feature tensor directly; newer
        versions wrap it in a model-output object whose pooler_output / *_embeds
        attribute IS the final embedding. Either way we just pull out the tensor —
        no further projection.
        """
        if self.torch.is_tensor(out):
            return out
        for attr in ("text_embeds", "audio_embeds", "pooler_output"):
            v = getattr(out, attr, None)
            if self.torch.is_tensor(v):
                return v
        if isinstance(out, (tuple, list)) and self.torch.is_tensor(out[0]):
            return out[0]
        raise TypeError(f"cannot extract embedding tensor from {type(out)}")

    def analyze(self, path: str):
        import librosa
        import numpy as np

        y, _ = librosa.load(path, sr=self.sr, mono=True)
        if y.size == 0:
            raise ValueError("empty audio")
        y = core_excerpt(y, self.sr, max_sec=120)     # focus on the track's core

        # a few evenly spaced windows -> a stable, representative track vector
        if len(y) <= self.win:
            chunks = [y]
        else:
            n = min(self.n_windows, max(1, len(y) // self.win))
            starts = np.linspace(0, len(y) - self.win, num=n).astype(int)
            chunks = [y[s:s + self.win] for s in starts]

        # transformers renamed this kwarg from `audios` to `audio`; support both
        try:
            ain = self.processor(audio=chunks, sampling_rate=self.sr,
                                 return_tensors="pt", padding=True)
        except TypeError:
            ain = self.processor(audios=chunks, sampling_rate=self.sr,
                                 return_tensors="pt", padding=True)
        ain = ain.to(self.device)
        with self.torch.no_grad():
            out = self.model.get_audio_features(**ain)
        a = self._as_embeds(out)                               # [n, 512]
        a_mean = a.mean(dim=0, keepdim=True)
        embedding = a_mean.squeeze(0).cpu().numpy().astype(np.float32)

        a_n = self.torch.nn.functional.normalize(a_mean, dim=-1)
        sims = (a_n @ self.text_emb.T).squeeze(0).cpu().numpy()  # cosine per prompt

        return embedding, self._feats_from_sims(sims)

    def _feats_from_sims(self, sims):
        """Build genre-agnostic vibe:: tags + energy/valence proxies from the
        prompt-similarity scores. Shared by analyze() and the retag tool."""
        feats: dict = {}
        order = sorted(range(len(self.VIBES)), key=lambda i: sims[i], reverse=True)
        for i in order[:6]:
            feats[f"vibe::{self.VIBES[i]}"] = round(float(sims[i]), 4)
        feats["mood_top"] = " / ".join(self.VIBES[i] for i in order[:3])
        feats["genre_pred"] = self.VIBES[order[0]]    # dominant vibe (kept for tooling)
        feats["energy_rms"] = round(float(sum(
            sims[self.VIBES.index(p)] for p in self.ENERGY) / len(self.ENERGY)), 5)
        feats["engagement"] = round(float(sum(
            sims[self.VIBES.index(p)] for p in self.VALENCE) / len(self.VALENCE)), 5)
        return feats


# ===========================================================================
# factory
# ===========================================================================
def get_backend(name: str, models_dir=None):
    name = (name or "auto").lower()
    if name == "auto":
        try:
            import essentia  # noqa: F401
            name = "essentia"
        except Exception:
            name = "librosa"
            print("[info] Essentia not available — using librosa fallback backend.")
    if name == "essentia":
        return EssentiaBackend(models_dir)
    if name == "librosa":
        return LibrosaBackend()
    if name == "clap":
        return ClapBackend()
    raise ValueError(f"unknown backend: {name}")
