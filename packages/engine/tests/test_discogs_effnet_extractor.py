from __future__ import annotations

import hashlib

import numpy as np
import pytest

from cratedig_engine.audio.windows import SAMPLED_V1
from cratedig_engine.extractors import Extractor
from cratedig_engine.extractors.discogs_effnet import (
    ArtifactIntegrityError,
    DISCOGS_EFFNET_EMBEDDING_DIMENSION,
    DISCOGS_EFFNET_SAMPLE_RATE_HZ,
    DISCOGS_EFFNET_SHA256_POLICY,
    DiscogsEffnetArtifactConfig,
    DiscogsEffnetExtractor,
    discogs_effnet_extractor_spec,
)
from cratedig_engine.records import EmbeddingRole, FeatureScope, FeatureSource


SOURCE_HASH = "d" * 64


def _artifact_config(tmp_path, payload: bytes = b"fake-frozen-graph"):
    tmp_path.mkdir(parents=True, exist_ok=True)
    checkpoint = tmp_path / "discogs-effnet-bs64-1.pb"
    checkpoint.write_bytes(payload)
    return DiscogsEffnetArtifactConfig(
        checkpoint_path=checkpoint,
        expected_sha256=hashlib.sha256(payload).hexdigest(),
    )


class SharedAudio:
    def __init__(self, samples: np.ndarray) -> None:
        self.source_hash = SOURCE_HASH
        self._samples = samples
        self.view_calls: list[dict[str, object]] = []

    def view(self, **kwargs):
        self.view_calls.append(kwargs)
        return self._samples


class GoldenRuntime:
    def __init__(self) -> None:
        self.calls: list[np.ndarray] = []

    def embed(self, mono_samples: np.ndarray) -> np.ndarray:
        self.calls.append(mono_samples.copy())
        # Two frame embeddings make the frame-level pooling contract visible.
        mean = float(np.mean(mono_samples))
        first = np.full(DISCOGS_EFFNET_EMBEDDING_DIMENSION, mean, dtype=np.float32)
        second = first + np.float32(2.0)
        return np.stack((first, second))


def test_artifact_contract_is_explicit_noncommercial_and_remote_code_free(tmp_path):
    config = _artifact_config(tmp_path)
    spec = discogs_effnet_extractor_spec(config)
    artifact = spec.model_artifact

    assert artifact is not None
    assert artifact.checkpoint_id == "discogs-effnet-bs64-1.pb"
    assert str(artifact.source_url).endswith("discogs-effnet-bs64-1.pb")
    assert artifact.sha256 == config.expected_sha256
    assert config.sha256_policy == DISCOGS_EFFNET_SHA256_POLICY
    assert artifact.code_license == "AGPL-3.0-only"
    assert artifact.weights_license == "CC-BY-NC-SA-4.0"
    assert artifact.commercial_use is False
    assert artifact.evaluation_only is True
    assert artifact.production_eligible is False
    assert artifact.bundle_eligible is False
    assert artifact.trusted_loading is False
    assert config.allow_remote_code is False
    assert artifact.sample_rate_hz == DISCOGS_EFFNET_SAMPLE_RATE_HZ
    assert artifact.dimensions == DISCOGS_EFFNET_EMBEDDING_DIMENSION
    assert artifact.runtime and "TensorflowPredictEffnetDiscogs" in artifact.runtime
    assert "cpu" in artifact.supported_devices
    assert spec.default_window_plan_version == "legacy-essentia-v1"
    assert spec.output_roles == {EmbeddingRole.RETRIEVAL}


def test_artifact_verification_fails_closed_before_runtime_construction(tmp_path):
    config = _artifact_config(tmp_path)
    config.checkpoint_path.write_bytes(b"upstream bytes changed")

    with pytest.raises(ArtifactIntegrityError, match="SHA-256 mismatch"):
        DiscogsEffnetExtractor(config, GoldenRuntime())

    missing = DiscogsEffnetArtifactConfig(
        checkpoint_path=tmp_path / "missing.pb",
        expected_sha256="a" * 64,
    )
    with pytest.raises(FileNotFoundError, match="provisioned locally"):
        DiscogsEffnetExtractor(missing, GoldenRuntime())


def test_configuration_identity_excludes_local_path_and_tracks_runtime_knobs(tmp_path):
    payload = b"same-reviewed-checkpoint"
    first = _artifact_config(tmp_path / "first", payload)
    second = _artifact_config(tmp_path / "second", payload)
    changed = DiscogsEffnetArtifactConfig(
        checkpoint_path=second.checkpoint_path,
        expected_sha256=second.expected_sha256,
        batch_size=32,
    )

    assert (
        discogs_effnet_extractor_spec(first).configuration_sha256
        == discogs_effnet_extractor_spec(second).configuration_sha256
    )
    assert (
        discogs_effnet_extractor_spec(changed).configuration_sha256
        != discogs_effnet_extractor_spec(first).configuration_sha256
    )


def test_fake_runtime_golden_contract_uses_shared_windows_and_pools(tmp_path):
    # Twenty seconds yields three 10-second sampled-v1 windows, with the middle
    # window overlapping both edges.  Each region has a stable, obvious mean.
    samples = np.concatenate(
        (
            np.zeros(10 * DISCOGS_EFFNET_SAMPLE_RATE_HZ, dtype=np.float32),
            np.full(10 * DISCOGS_EFFNET_SAMPLE_RATE_HZ, 2.0, dtype=np.float32),
        )
    )
    audio = SharedAudio(samples)
    runtime = GoldenRuntime()
    extractor = DiscogsEffnetExtractor(_artifact_config(tmp_path), runtime)

    bundle = extractor.extract(audio, SAMPLED_V1)

    assert isinstance(extractor, Extractor)
    assert audio.view_calls == [
        {
            "sample_rate": DISCOGS_EFFNET_SAMPLE_RATE_HZ,
            "channel_policy": "mono",
            "normalize": False,
        }
    ]
    assert len(runtime.calls) == 3
    assert all(call.flags.c_contiguous for call in runtime.calls)
    windows = [item for item in bundle.embeddings if item.scope is FeatureScope.WINDOW]
    [track] = [item for item in bundle.embeddings if item.scope is FeatureScope.TRACK]
    assert [(item.start_ms, item.end_ms) for item in windows] == [
        (0, 10_000),
        (5_000, 15_000),
        (10_000, 20_000),
    ]
    # Runtime frame mean adds one; input window means are 0, 1, and 2.
    assert [item.vector[0] for item in windows] == [1.0, 2.0, 3.0]
    assert track.vector[0] == 2.0
    assert all(item.dimension == DISCOGS_EFFNET_EMBEDDING_DIMENSION for item in windows)
    assert track.dimension == DISCOGS_EFFNET_EMBEDDING_DIMENSION
    assert track.pooling_strategy == "window-arithmetic-mean-v1"
    assert all(item.source is FeatureSource.MODEL for item in bundle.embeddings)
    assert all(item.weights_sha256 == extractor.artifact_config.expected_sha256 for item in bundle.embeddings)


@pytest.mark.parametrize(
    "invalid, message",
    [
        (np.zeros((2, 12), dtype=np.float32), "embedding dimension"),
        (
            np.full(
                (1, DISCOGS_EFFNET_EMBEDDING_DIMENSION),
                np.nan,
                dtype=np.float32,
            ),
            "non-finite",
        ),
        (
            np.empty((0, DISCOGS_EFFNET_EMBEDDING_DIMENSION), dtype=np.float32),
            "no embedding frames",
        ),
    ],
)
def test_runtime_output_contract_rejects_invalid_embeddings(
    tmp_path, invalid, message
):
    class InvalidRuntime:
        def embed(self, mono_samples):
            return invalid

    samples = np.zeros(10 * DISCOGS_EFFNET_SAMPLE_RATE_HZ, dtype=np.float32)
    extractor = DiscogsEffnetExtractor(_artifact_config(tmp_path), InvalidRuntime())

    with pytest.raises(ValueError, match=message):
        extractor.extract(SharedAudio(samples), SAMPLED_V1)
