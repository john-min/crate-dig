from __future__ import annotations

import pytest
from pydantic import ValidationError

from cratedig_engine.records import (
    ChannelPolicy,
    EmbeddingRecord,
    EmbeddingRole,
    ExtractorSpec,
    FeatureBundle,
    FeatureScope,
    FeatureSource,
    ModelArtifact,
    ModelSetManifest,
    RoleAssignment,
    ScalarFeatureRecord,
    TagFeatureRecord,
)


HASH_A = "a" * 64
HASH_B = "b" * 64
HASH_C = "c" * 64


def make_spec(
    *, name: str = "physical", version: str = "1.0.0"
) -> ExtractorSpec:
    return ExtractorSpec(
        name=name,
        version=version,
        required_sample_rate_hz=48_000,
        channel_policy=ChannelPolicy.MONO,
        supported_scopes={FeatureScope.TRACK, FeatureScope.WINDOW},
        output_roles={EmbeddingRole.RETRIEVAL},
        configuration_version="physical-config-v1",
        configuration_sha256=HASH_A,
        default_window_plan_version="sampled-v1",
        default_pooling_strategy="mean-v1",
    )


def common_record_fields() -> dict[str, object]:
    return {
        "audio_content_hash": HASH_B,
        "extractor_name": "physical",
        "extractor_version": "1.0.0",
        "configuration_version": "physical-config-v1",
        "configuration_sha256": HASH_A,
        "window_plan_version": "sampled-v1",
        "scope": FeatureScope.TRACK,
        "source": FeatureSource.HEURISTIC,
    }


def test_extractor_spec_is_immutable_and_cache_identity_is_content_addressed():
    spec = make_spec()

    with pytest.raises(ValidationError):
        spec.version = "2.0.0"  # type: ignore[misc]

    identity = spec.cache_identity(HASH_B)
    assert identity[:3] == (HASH_B, "physical", "1.0.0")
    assert "track-id" not in identity
    assert HASH_A in identity


def test_cache_identity_includes_full_model_identity_when_present():
    artifact = ModelArtifact(
        name="music-model",
        version="2",
        checkpoint_id="checkpoint-main",
        sha256=HASH_C,
    )
    spec = make_spec().model_copy(update={"model_artifact": artifact})

    identity = spec.cache_identity(HASH_B)

    assert "music-model" in identity
    assert "2" in identity
    assert "checkpoint-main" in identity
    assert HASH_C in identity


def test_model_artifact_requires_checkpoint_checksum_and_safe_eligibility():
    with pytest.raises(ValidationError, match="sha256"):
        ModelArtifact(name="discogs-effnet", version="1", checkpoint_id="main")

    with pytest.raises(ValidationError, match="production-eligible"):
        ModelArtifact(
            name="discogs-effnet",
            version="1",
            production_eligible=True,
        )


def test_embedding_retains_native_dimension_and_window_evidence():
    record = EmbeddingRecord(
        **(common_record_fields() | {"scope": FeatureScope.WINDOW}),
        start_ms=10_000,
        end_ms=20_000,
        role=EmbeddingRole.RETRIEVAL,
        vector=[0.1, 0.2, 0.3],
        pooling_strategy="none",
        confidence=0.8,
    )

    assert record.dimension == 3
    assert record.vector == (0.1, 0.2, 0.3)
    assert record.start_ms == 10_000

    with pytest.raises(ValidationError, match="dimension"):
        EmbeddingRecord(
            **common_record_fields(),
            role=EmbeddingRole.RETRIEVAL,
            vector=[0.1, 0.2],
            dimension=512,
            pooling_strategy="mean-v1",
        )


def test_time_ranges_scope_and_confidence_are_validated():
    with pytest.raises(ValidationError, match="time range"):
        ScalarFeatureRecord(
            **(common_record_fields() | {"scope": FeatureScope.WINDOW}),
            namespace="physical",
            feature_name="energy_rms",
            value=0.2,
        )

    with pytest.raises(ValidationError, match="less than or equal to 1"):
        TagFeatureRecord(
            **common_record_fields(),
            namespace="palette",
            feature_name="warm_pad",
            value=True,
            confidence=1.1,
        )


def test_feature_bundle_rejects_cross_extractor_and_undeclared_outputs():
    valid = EmbeddingRecord(
        **common_record_fields(),
        role=EmbeddingRole.RETRIEVAL,
        vector=[0.1, 0.2],
        pooling_strategy="mean-v1",
    )
    bundle = FeatureBundle(
        audio_content_hash=HASH_B,
        extractor_spec=make_spec(),
        window_plan_version="sampled-v1",
        embeddings=[valid],
        warnings=["short track used one deterministic window"],
    )
    assert bundle.embeddings == (valid,)

    wrong_role = valid.model_copy(update={"role": EmbeddingRole.LAYOUT})
    with pytest.raises(ValidationError, match="undeclared"):
        FeatureBundle(
            audio_content_hash=HASH_B,
            extractor_spec=make_spec(),
            window_plan_version="sampled-v1",
            embeddings=[wrong_role],
        )

    with pytest.raises(ValidationError, match="String should match pattern"):
        FeatureBundle(
            audio_content_hash="not-a-content-hash",
            extractor_spec=make_spec(),
            window_plan_version="sampled-v1",
        )


def test_manifest_allows_versions_to_coexist_and_enforces_one_layout_owner():
    layout_v1 = make_spec(name="music", version="1")
    layout_v1 = layout_v1.model_copy(
        update={"output_roles": frozenset({EmbeddingRole.LAYOUT})}
    )
    layout_v2 = make_spec(name="music", version="2")
    layout_v2 = layout_v2.model_copy(
        update={"output_roles": frozenset({EmbeddingRole.LAYOUT})}
    )

    manifest = ModelSetManifest(
        name="pilot",
        version="1",
        required_extractors=[layout_v1],
        optional_extractors=[layout_v2],
        window_plan_version="sampled-v1",
        pooling_configuration_version="pool-v1",
        role_assignments=[
            RoleAssignment(
                role=EmbeddingRole.LAYOUT,
                extractor_name="music",
                extractor_version="1",
            )
        ],
        component_normalization_version="norm-v1",
        component_weighting_version="weights-v1",
        projection_version="umap-v1",
    )
    assert [spec.version for spec in manifest.extractors] == ["1", "2"]

    second_layout = RoleAssignment(
        role=EmbeddingRole.LAYOUT,
        extractor_name="music",
        extractor_version="2",
    )
    with pytest.raises(ValidationError, match="at most one layout"):
        ModelSetManifest(
            **manifest.model_dump(exclude={"role_assignments"}),
            role_assignments=[*manifest.role_assignments, second_layout],
        )
