from __future__ import annotations

from types import SimpleNamespace

import pytest

from cratedig_engine.audio.windows import LEGACY_CLAP, SAMPLED_V1
from cratedig_engine.extractors.legacy import LegacyBackendExtractor
from cratedig_engine.records import FeatureScope, FeatureSource
from cratedig_engine.schemas import BackendOutput


SOURCE_HASH = "a" * 64


class CountingClapBackend:
    name = "clap"
    model_version = "example/clap-checkpoint"
    sr = 48_000
    n_windows = 3
    win = 480_000
    PROMPT_TEXT = {"driving": "driving electronic music"}

    def __init__(self) -> None:
        self.calls: list[str] = []

    def analyze(self, audio_path: str) -> BackendOutput:
        self.calls.append(audio_path)
        return BackendOutput(
            embedding=[0.25, -0.5, 0.75],
            embedding_dim=3,
            features={
                "energy_rms": 0.42,
                "vibe::driving": 0.81,
                "mood_top": "driving / dark / raw",
            },
        )


def test_legacy_adapter_calls_path_backend_once_and_warns_about_redecode():
    backend = CountingClapBackend()
    extractor = LegacyBackendExtractor(backend)
    audio = SimpleNamespace(source_hash=SOURCE_HASH, source_path="/music/source.wav")
    plan = LEGACY_CLAP

    bundle = extractor.extract(audio, plan)

    assert backend.calls == ["/music/source.wav"]
    assert any("reopens and decodes" in warning for warning in bundle.warnings)
    assert any(
        "does not retain per-window evidence" in warning
        for warning in bundle.warnings
    )
    assert bundle.audio_content_hash == SOURCE_HASH
    assert bundle.embeddings[0].dimension == 3
    assert bundle.embeddings[0].scope is FeatureScope.TRACK
    assert bundle.embeddings[0].source is FeatureSource.MODEL


def test_legacy_clap_semantics_keep_original_keys_in_legacy_namespace():
    extractor = LegacyBackendExtractor(CountingClapBackend())
    bundle = extractor.extract(
        SimpleNamespace(source_hash=SOURCE_HASH, source_path="/music/source.wav"),
        LEGACY_CLAP,
    )

    scalars = {(item.namespace, item.feature_name): item for item in bundle.scalars}
    tags = {(item.namespace, item.feature_name): item for item in bundle.tags}
    assert ("legacy.clap", "energy_rms") in scalars
    assert ("legacy.clap", "vibe::driving") in scalars
    assert ("legacy.clap", "mood_top") in tags
    assert not any(item.namespace == "physical" for item in bundle.scalars)
    # The old backend cannot attest to exact weights, so the adapter does not
    # invent a checksum or checkpoint identity.
    assert bundle.extractor_spec.model_artifact is not None
    assert bundle.extractor_spec.model_artifact.sha256 is None
    assert bundle.extractor_spec.model_artifact.checkpoint_id is None


def test_legacy_configuration_hash_is_deterministic_and_tracks_knobs():
    first = LegacyBackendExtractor(CountingClapBackend())
    second_backend = CountingClapBackend()
    second = LegacyBackendExtractor(second_backend)
    assert first.spec.configuration_sha256 == second.spec.configuration_sha256

    second_backend.PROMPT_TEXT = {"driving": "relentless warehouse drive"}
    changed = LegacyBackendExtractor(second_backend)
    assert changed.spec.configuration_sha256 != first.spec.configuration_sha256


def test_legacy_adapter_rejects_window_provenance_it_did_not_use():
    extractor = LegacyBackendExtractor(CountingClapBackend())

    with pytest.raises(ValueError, match="requires window plan 'legacy-clap-v1'"):
        extractor.extract(
            SimpleNamespace(source_hash=SOURCE_HASH, source_path="/music/source.wav"),
            SAMPLED_V1,
        )
