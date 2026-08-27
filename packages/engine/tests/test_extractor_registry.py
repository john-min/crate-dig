from __future__ import annotations

from typing import Any

import pytest

from cratedig_engine.extractors import (
    AmbiguousExtractorError,
    DuplicateExtractorError,
    Extractor,
    ExtractorNotFoundError,
    ExtractorRegistry,
    ExtractorSpecMismatchError,
)
from cratedig_engine.records import (
    ChannelPolicy,
    EmbeddingRole,
    ExtractorSpec,
    FeatureBundle,
    FeatureScope,
    ModelSetManifest,
)


HASH_A = "a" * 64


class FakeExtractor:
    def __init__(self, name: str, version: str) -> None:
        self.spec = ExtractorSpec(
            name=name,
            version=version,
            required_sample_rate_hz=16_000,
            channel_policy=ChannelPolicy.MONO,
            supported_scopes={FeatureScope.TRACK},
            output_roles={EmbeddingRole.RETRIEVAL},
            configuration_version=f"config-{version}",
            configuration_sha256=HASH_A,
            default_window_plan_version="whole-track-v1",
        )

    def extract(self, audio: Any, window_plan: Any) -> FeatureBundle:
        return FeatureBundle(
            audio_content_hash=audio.source_hash,
            extractor_spec=self.spec,
            window_plan_version=window_plan.version,
        )


def make_manifest(
    *, required: tuple[ExtractorSpec, ...], optional: tuple[ExtractorSpec, ...] = ()
) -> ModelSetManifest:
    return ModelSetManifest(
        name="pilot",
        version="1",
        required_extractors=required,
        optional_extractors=optional,
        window_plan_version="whole-track-v1",
        pooling_configuration_version="pool-v1",
        component_normalization_version="norm-v1",
        component_weighting_version="weights-v1",
    )


def test_structural_extractor_protocol_and_versioned_registration():
    v1 = FakeExtractor("music", "1")
    v2 = FakeExtractor("music", "2")
    registry = ExtractorRegistry([v1, v2])

    assert isinstance(v1, Extractor)
    assert registry.get("music", "1") is v1
    assert registry.get("music", "2") is v2
    assert len(registry) == 2
    with pytest.raises(AmbiguousExtractorError):
        registry.get("music")


def test_duplicate_registration_is_explicit_and_can_be_replaced():
    original = FakeExtractor("music", "1")
    replacement = FakeExtractor("music", "1")
    registry = ExtractorRegistry([original])

    with pytest.raises(DuplicateExtractorError):
        registry.register(replacement)

    registry.register(replacement, replace=True)
    assert registry.get("music", "1") is replacement


def test_manifest_resolution_requires_required_and_skips_missing_optional():
    required = FakeExtractor("physical", "1")
    optional = FakeExtractor("music", "1")
    manifest = make_manifest(
        required=(required.spec,),
        optional=(optional.spec,),
    )
    registry = ExtractorRegistry([required])

    assert registry.resolve(manifest) == (required,)

    empty_registry = ExtractorRegistry()
    with pytest.raises(ExtractorNotFoundError):
        empty_registry.resolve(manifest)


def test_specs_have_deterministic_identity_order():
    registry = ExtractorRegistry(
        [FakeExtractor("zeta", "1"), FakeExtractor("alpha", "2")]
    )
    assert [spec.identity for spec in registry.specs()] == [
        ("alpha", "2"),
        ("zeta", "1"),
    ]


def test_manifest_resolution_rejects_same_version_with_different_config():
    registered = FakeExtractor("music", "1")
    expected = registered.spec.model_copy(
        update={"configuration_sha256": "b" * 64}
    )
    registry = ExtractorRegistry([registered])

    with pytest.raises(ExtractorSpecMismatchError):
        registry.resolve(make_manifest(required=(expected,)))
