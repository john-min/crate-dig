"""Decode-once librosa extractor with retained window evidence."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

import numpy as np

from cratedig_engine.audio.decode import DecodedAudio
from cratedig_engine.audio.windows import WindowPlan
from cratedig_engine.records import (
    ChannelPolicy,
    EmbeddingRecord,
    EmbeddingRole,
    ExtractorSpec,
    FeatureBundle,
    FeatureScope,
    FeatureSource,
    ScalarFeatureRecord,
)


LIBROSA_EXTRACTOR_VERSION = "librosa-features-v1"
LIBROSA_CONFIGURATION_VERSION = "librosa-feature-layout-v1"
LIBROSA_SAMPLE_RATE_HZ = 22_050
LIBROSA_EMBEDDING_DIMENSION = 65
LIBROSA_CONFIGURATION = {
    "sample_rate_hz": LIBROSA_SAMPLE_RATE_HZ,
    "embedding": "mfcc20-mean-std+chroma12+spectral-shape+energy-zcr",
    "embedding_dimension": LIBROSA_EMBEDDING_DIMENSION,
    "physical_features": [
        "duration_sec",
        "spectral_bandwidth_hz",
        "low_band_energy_ratio",
        "mid_band_energy_ratio",
        "high_band_energy_ratio",
        "onset_density_per_sec",
        "crest_factor",
        "tempo_confidence",
    ],
    "pooling": "arithmetic-mean-v1",
}
LIBROSA_CONFIGURATION_SHA256 = hashlib.sha256(
    json.dumps(
        LIBROSA_CONFIGURATION, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
).hexdigest()


@dataclass(frozen=True)
class _ChunkFeatures:
    embedding: np.ndarray
    scalars: dict[str, float]


class LibrosaExtractor:
    """Extract the existing 65-dimensional baseline from shared audio views.

    Each resolved window is independently queryable.  The track record is the
    arithmetic mean of the window embeddings and scalar evidence.  Under the
    ``legacy-librosa-v1`` plan (one central core excerpt), this is numerically
    equivalent to :class:`LibrosaBackend` without reopening the source file.
    """

    def __init__(self) -> None:
        import librosa  # noqa: F401 -- fail fast when the optional dep is absent

        self._spec = librosa_extractor_spec()

    @property
    def spec(self) -> ExtractorSpec:
        return self._spec

    def extract(
        self, audio: DecodedAudio, window_plan: WindowPlan
    ) -> FeatureBundle:
        samples = np.asarray(
            audio.view(
                sample_rate=LIBROSA_SAMPLE_RATE_HZ,
                channel_policy="mono",
                normalize=False,
            ),
            dtype=np.float32,
        )
        if samples.ndim == 2 and samples.shape[1] == 1:
            samples = samples[:, 0]
        if samples.ndim != 1:
            raise ValueError("librosa extractor requires a mono audio view")
        if samples.size == 0:
            raise ValueError("empty audio")

        plan_version = str(window_plan.version)
        windows = tuple(
            window_plan.windows(len(samples), LIBROSA_SAMPLE_RATE_HZ)
        )
        if not windows:
            raise ValueError(f"window plan {plan_version!r} produced no windows")

        window_embeddings: list[EmbeddingRecord] = []
        window_scalars: list[ScalarFeatureRecord] = []
        analyzed: list[_ChunkFeatures] = []
        for window in windows:
            chunk = np.asarray(window.slice(samples), dtype=np.float32)
            if chunk.size == 0:
                raise ValueError(f"window plan {plan_version!r} produced an empty window")
            result = _extract_chunk(chunk, LIBROSA_SAMPLE_RATE_HZ)
            analyzed.append(result)
            start_ms = int(round(float(window.start_sec) * 1000.0))
            end_ms = int(round(float(window.end_sec) * 1000.0))
            common = self._record_provenance(
                audio.source_hash,
                plan_version,
                scope=FeatureScope.WINDOW,
                start_ms=start_ms,
                end_ms=end_ms,
            )
            window_embeddings.append(
                EmbeddingRecord(
                    **common,
                    role=EmbeddingRole.RETRIEVAL,
                    vector=tuple(float(value) for value in result.embedding),
                    dimension=LIBROSA_EMBEDDING_DIMENSION,
                    pooling_strategy="none",
                )
            )
            window_scalars.extend(_scalar_records(common, result.scalars))

        pooled_embedding = np.mean(
            np.stack([item.embedding for item in analyzed], axis=0), axis=0
        ).astype(np.float32)
        pooled_scalars = {
            name: float(np.mean([item.scalars[name] for item in analyzed]))
            for name in analyzed[0].scalars
        }
        pooled_scalars["duration_sec"] = float(audio.duration_sec)
        track_common = self._record_provenance(
            audio.source_hash, plan_version, scope=FeatureScope.TRACK
        )
        track_embedding = EmbeddingRecord(
            **track_common,
            role=EmbeddingRole.RETRIEVAL,
            vector=tuple(float(value) for value in pooled_embedding),
            dimension=LIBROSA_EMBEDDING_DIMENSION,
            pooling_strategy="arithmetic-mean-v1",
        )

        return FeatureBundle(
            audio_content_hash=audio.source_hash,
            extractor_spec=self.spec,
            window_plan_version=plan_version,
            embeddings=(*window_embeddings, track_embedding),
            scalars=(*window_scalars, *_scalar_records(track_common, pooled_scalars)),
        )

    def _record_provenance(
        self,
        audio_content_hash: str,
        window_plan_version: str,
        *,
        scope: FeatureScope,
        start_ms: int | None = None,
        end_ms: int | None = None,
    ) -> dict[str, Any]:
        return {
            "audio_content_hash": audio_content_hash,
            "extractor_name": self.spec.name,
            "extractor_version": self.spec.version,
            "configuration_version": self.spec.configuration_version,
            "configuration_sha256": self.spec.configuration_sha256,
            "window_plan_version": window_plan_version,
            "scope": scope,
            "start_ms": start_ms,
            "end_ms": end_ms,
            "confidence": 1.0,
            "source": FeatureSource.HEURISTIC,
        }


def librosa_extractor_spec() -> ExtractorSpec:
    """Return the stable contract without importing optional audio runtime deps."""

    return ExtractorSpec(
        name="librosa",
        version=LIBROSA_EXTRACTOR_VERSION,
        required_sample_rate_hz=LIBROSA_SAMPLE_RATE_HZ,
        channel_policy=ChannelPolicy.MONO,
        supported_scopes={FeatureScope.TRACK, FeatureScope.WINDOW},
        output_roles={EmbeddingRole.RETRIEVAL},
        configuration_version=LIBROSA_CONFIGURATION_VERSION,
        configuration_sha256=LIBROSA_CONFIGURATION_SHA256,
        default_window_plan_version="legacy-librosa-v1",
        default_pooling_strategy="arithmetic-mean-v1",
    )


def _scalar_records(
    provenance: dict[str, Any], scalars: dict[str, float]
) -> list[ScalarFeatureRecord]:
    units = {
        "est_bpm": "bpm",
        "brightness": "hz",
        "duration_sec": "seconds",
        "spectral_bandwidth_hz": "hz",
        "low_band_energy_ratio": "ratio",
        "mid_band_energy_ratio": "ratio",
        "high_band_energy_ratio": "ratio",
        "onset_density_per_sec": "events_per_second",
        "crest_factor": "ratio",
        "tempo_confidence": "ratio",
    }
    physical = {
        "duration_sec",
        "spectral_bandwidth_hz",
        "low_band_energy_ratio",
        "mid_band_energy_ratio",
        "high_band_energy_ratio",
        "onset_density_per_sec",
        "crest_factor",
        "tempo_confidence",
    }
    records: list[ScalarFeatureRecord] = []
    for name, value in scalars.items():
        record_provenance = dict(provenance)
        if name == "est_bpm":
            record_provenance["confidence"] = _rounded_scalar(
                "tempo_confidence", scalars["tempo_confidence"]
            )
        records.append(
            ScalarFeatureRecord(
                **record_provenance,
                namespace="physical" if name in physical else "librosa",
                feature_name=name,
                value=_rounded_scalar(name, value),
                unit=units.get(name),
            )
        )
    return records


def _rounded_scalar(name: str, value: float) -> float:
    if name in {
        "energy_rms",
        "percussiveness",
        "low_band_energy_ratio",
        "mid_band_energy_ratio",
        "high_band_energy_ratio",
        "onset_density_per_sec",
        "crest_factor",
        "tempo_confidence",
    }:
        return round(float(value), 5)
    return round(float(value), 2)


def _extract_chunk(y: np.ndarray, sr: int) -> _ChunkFeatures:
    """Keep the v1 LibrosaBackend feature order exactly stable."""

    import librosa

    parts: list[np.ndarray] = []

    def add(arr: Any) -> None:
        parts.append(np.atleast_1d(np.asarray(arr, dtype=np.float32)))

    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=20)
    add(mfcc.mean(axis=1))
    add(mfcc.std(axis=1))
    try:
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    except Exception:
        chroma = librosa.feature.chroma_stft(y=y, sr=sr)
    add(chroma.mean(axis=1))
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)
    bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr)
    rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)
    contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
    flatness = librosa.feature.spectral_flatness(y=y)
    add(centroid.mean())
    add(bandwidth.mean())
    add(rolloff.mean())
    add(contrast.mean(axis=1))
    add(flatness.mean())
    rms = librosa.feature.rms(y=y)
    zcr = librosa.feature.zero_crossing_rate(y)
    add(rms.mean())
    add(zcr.mean())
    if hasattr(librosa.feature, "tempo"):
        tempo = float(np.atleast_1d(librosa.feature.tempo(y=y, sr=sr))[0])
    else:
        tempo = float(librosa.beat.tempo(y=y, sr=sr)[0])

    duration_sec = len(y) / sr
    spectrum = np.abs(librosa.stft(y=y)) ** 2
    frequencies = librosa.fft_frequencies(sr=sr, n_fft=2048)
    total_energy = float(np.sum(spectrum)) + np.finfo(np.float32).eps

    def band_ratio(low_hz: float, high_hz: float | None) -> float:
        mask = frequencies >= low_hz
        if high_hz is not None:
            mask &= frequencies < high_hz
        return float(np.sum(spectrum[mask])) / total_energy

    onset_envelope = librosa.onset.onset_strength(y=y, sr=sr)
    onset_frames = librosa.onset.onset_detect(
        onset_envelope=onset_envelope,
        sr=sr,
        backtrack=False,
        units="frames",
    )
    signal_rms = float(np.sqrt(np.mean(np.square(y, dtype=np.float64))))
    crest_factor = float(np.max(np.abs(y))) / max(
        signal_rms, np.finfo(np.float32).eps
    )
    tempogram = librosa.feature.tempogram(
        onset_envelope=onset_envelope,
        sr=sr,
    )
    mean_autocorrelation = np.mean(tempogram, axis=1)
    if mean_autocorrelation.size <= 1:
        tempo_confidence = 0.0
    else:
        zero_lag = max(
            float(mean_autocorrelation[0]), np.finfo(np.float32).eps
        )
        tempo_confidence = float(
            np.clip(np.max(mean_autocorrelation[1:]) / zero_lag, 0.0, 1.0)
        )

    embedding = np.concatenate(parts).astype(np.float32)
    if embedding.shape != (LIBROSA_EMBEDDING_DIMENSION,):
        raise ValueError(
            "unexpected librosa embedding dimension: "
            f"{embedding.shape[0]} (expected {LIBROSA_EMBEDDING_DIMENSION})"
        )
    return _ChunkFeatures(
        embedding=embedding,
        scalars={
            "est_bpm": tempo,
            "brightness": float(centroid.mean()),
            "energy_rms": float(rms.mean()),
            "percussiveness": float(zcr.mean()),
            "duration_sec": duration_sec,
            "spectral_bandwidth_hz": float(bandwidth.mean()),
            "low_band_energy_ratio": band_ratio(20.0, 250.0),
            "mid_band_energy_ratio": band_ratio(250.0, 4_000.0),
            "high_band_energy_ratio": band_ratio(4_000.0, None),
            "onset_density_per_sec": len(onset_frames) / max(duration_sec, 1e-9),
            "crest_factor": crest_factor,
            "tempo_confidence": tempo_confidence,
        },
    )


__all__ = [
    "LIBROSA_CONFIGURATION_SHA256",
    "LIBROSA_CONFIGURATION",
    "LIBROSA_CONFIGURATION_VERSION",
    "LIBROSA_EMBEDDING_DIMENSION",
    "LIBROSA_EXTRACTOR_VERSION",
    "LibrosaExtractor",
    "librosa_extractor_spec",
]
