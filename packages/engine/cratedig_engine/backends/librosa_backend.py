"""Librosa fast backend: classical timbral/rhythmic features. No PyTorch."""

from __future__ import annotations

import numpy as np

from cratedig_engine.audio.excerpt import core_excerpt
from cratedig_engine.schemas import BackendOutput

LIBROSA_MODEL_VERSION = "librosa-core-excerpt-v1"


class LibrosaBackend:
    name = "librosa"
    model_version = LIBROSA_MODEL_VERSION

    def __init__(self, sr: int = 22050, duration: float = 120.0):
        import librosa  # noqa: F401  — fail fast if missing

        self.sr = sr
        self.duration = duration

    def analyze(self, audio_path: str) -> BackendOutput:
        import librosa

        y, sr = librosa.load(audio_path, sr=self.sr, mono=True)
        if y.size == 0:
            raise ValueError("empty audio")
        y = core_excerpt(y, sr, max_sec=self.duration)

        feats: dict = {}
        parts: list[np.ndarray] = []

        def add(arr) -> None:
            parts.append(np.atleast_1d(np.asarray(arr, dtype=np.float32)))

        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=20)
        add(mfcc.mean(axis=1))
        add(mfcc.std(axis=1))
        try:
            chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        except Exception:
            chroma = librosa.feature.chroma_stft(y=y, sr=sr)
        add(chroma.mean(axis=1))
        cent = librosa.feature.spectral_centroid(y=y, sr=sr)
        bw = librosa.feature.spectral_bandwidth(y=y, sr=sr)
        rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)
        contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
        flat = librosa.feature.spectral_flatness(y=y)
        add(cent.mean())
        add(bw.mean())
        add(rolloff.mean())
        add(contrast.mean(axis=1))
        add(flat.mean())
        rms = librosa.feature.rms(y=y)
        zcr = librosa.feature.zero_crossing_rate(y)
        add(rms.mean())
        add(zcr.mean())
        # librosa 1.0 moved this off librosa.beat.tempo
        if hasattr(librosa.feature, "tempo"):
            tempo = float(np.atleast_1d(librosa.feature.tempo(y=y, sr=sr))[0])
        else:
            tempo = float(librosa.beat.tempo(y=y, sr=sr)[0])

        feats["est_bpm"] = round(tempo, 2)
        feats["brightness"] = round(float(cent.mean()), 2)
        feats["energy_rms"] = round(float(rms.mean()), 5)
        feats["percussiveness"] = round(float(zcr.mean()), 5)

        embedding = np.concatenate(parts).astype(np.float32)
        return BackendOutput(
            embedding=[float(x) for x in embedding.tolist()],
            features=feats,
            embedding_dim=int(embedding.shape[0]),
        )
