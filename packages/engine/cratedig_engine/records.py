"""Canonical, persistence-agnostic records emitted by Engine v2 extractors.

The models in this module are deliberately immutable.  They are computation
records rather than mutable ORM objects: a change to an extractor, checkpoint,
configuration, or window plan creates new evidence instead of editing old
evidence in place.
"""

from __future__ import annotations

import hashlib
import json
import math
from enum import Enum
from typing import Annotated, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    StringConstraints,
    field_validator,
    field_serializer,
    model_validator,
)

from cratedig_engine.schemas import ANALYSIS_PIPELINE_VERSION, FEATURE_SCHEMA_VERSION


NonEmptyStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
Sha256 = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        to_lower=True,
        pattern=r"^[0-9a-fA-F]{64}$",
    ),
]


class ImmutableRecord(BaseModel):
    """Base configuration shared by value-like Engine v2 contracts."""

    model_config = ConfigDict(frozen=True, extra="forbid", use_enum_values=False)


class FeatureScope(str, Enum):
    TRACK = "track"
    WINDOW = "window"
    SEGMENT = "segment"
    STEM = "stem"


class EmbeddingRole(str, Enum):
    LAYOUT = "layout"
    RETRIEVAL = "retrieval"
    RHYTHM = "rhythm"
    TIMBRE = "timbre"
    PALETTE = "palette"
    EXPLANATION = "explanation"


class FeatureSource(str, Enum):
    MODEL = "model"
    HEURISTIC = "heuristic"
    USER = "user"
    IMPORTED_METADATA = "imported_metadata"


class ChannelPolicy(str, Enum):
    MONO = "mono"
    STEREO = "stereo"
    PRESERVE = "preserve"


class ModelArtifact(ImmutableRecord):
    """Identity and eligibility metadata for model code or weights.

    A model-less heuristic extractor does not need an artifact.  When weights
    are used, their checksum lives here and is copied into emitted records.
    """

    name: NonEmptyStr
    version: NonEmptyStr
    checkpoint_id: NonEmptyStr | None = None
    source_url: HttpUrl | None = None
    sha256: Sha256 | None = None
    code_license: NonEmptyStr | None = None
    weights_license: NonEmptyStr | None = None
    commercial_use: bool | None = None
    redistribution_allowed: bool | None = None
    attribution: str | None = None
    trusted_loading: bool = False
    runtime: NonEmptyStr | None = None
    sample_rate_hz: int | None = Field(default=None, gt=0)
    dimensions: int | None = Field(default=None, gt=0)
    supported_devices: tuple[NonEmptyStr, ...] = ()
    evaluation_only: bool = True
    production_eligible: bool = False
    bundle_eligible: bool = False

    @model_validator(mode="after")
    def validate_eligibility(self) -> Self:
        if self.production_eligible and self.evaluation_only:
            raise ValueError("a production-eligible artifact cannot be evaluation-only")
        if self.bundle_eligible and not self.production_eligible:
            raise ValueError("a bundle-eligible artifact must also be production-eligible")
        if self.checkpoint_id is not None and self.sha256 is None:
            raise ValueError("checkpoint artifacts require a sha256 checksum")
        return self


class ExtractorSpec(ImmutableRecord):
    """Stable declaration of an extractor's runtime and output contract."""

    name: NonEmptyStr
    version: NonEmptyStr
    required_sample_rate_hz: int = Field(gt=0)
    channel_policy: ChannelPolicy
    supported_scopes: frozenset[FeatureScope] = Field(min_length=1)
    output_roles: frozenset[EmbeddingRole] = Field(default_factory=frozenset)
    configuration_version: NonEmptyStr
    configuration_sha256: Sha256
    model_artifact: ModelArtifact | None = None
    default_window_plan_version: NonEmptyStr | None = None
    default_pooling_strategy: NonEmptyStr | None = None
    stem_dependent: bool = False
    separator_name: NonEmptyStr | None = None
    separator_version: NonEmptyStr | None = None
    separator_weights_sha256: Sha256 | None = None
    separator_configuration_sha256: Sha256 | None = None

    @field_serializer("supported_scopes", "output_roles", when_used="json")
    def serialize_unordered_enums(self, values: frozenset[Enum]) -> list[str]:
        """Keep manifest JSON and content hashes stable across processes."""

        return sorted(str(value.value) for value in values)

    @model_validator(mode="after")
    def validate_separator_identity(self) -> Self:
        separator_fields = (
            self.separator_name,
            self.separator_version,
            self.separator_weights_sha256,
            self.separator_configuration_sha256,
        )
        if self.stem_dependent and any(value is None for value in separator_fields):
            raise ValueError(
                "stem-dependent extractors require complete separator identity"
            )
        if not self.stem_dependent and any(value is not None for value in separator_fields):
            raise ValueError(
                "separator identity is only valid for a stem-dependent extractor"
            )
        return self

    @property
    def identity(self) -> tuple[str, str]:
        return (self.name, self.version)

    def cache_identity(
        self, audio_content_hash: str, *, window_plan_version: str | None = None
    ) -> tuple[str | None, ...]:
        """Return the content-addressed fields required by SONIC-RUN-004."""

        artifact = self.model_artifact
        return (
            audio_content_hash,
            self.name,
            self.version,
            artifact.name if artifact else None,
            artifact.version if artifact else None,
            artifact.checkpoint_id if artifact else None,
            artifact.sha256 if artifact else None,
            window_plan_version or self.default_window_plan_version,
            self.configuration_version,
            self.configuration_sha256,
            self.separator_name,
            self.separator_version,
            self.separator_weights_sha256,
            self.separator_configuration_sha256,
        )


class FeatureRecord(ImmutableRecord):
    """Provenance common to scalar, tag, and embedding evidence."""

    audio_content_hash: Sha256
    extractor_name: NonEmptyStr
    extractor_version: NonEmptyStr
    model_name: NonEmptyStr | None = None
    model_version: NonEmptyStr | None = None
    checkpoint_id: NonEmptyStr | None = None
    weights_sha256: Sha256 | None = None
    configuration_version: NonEmptyStr
    configuration_sha256: Sha256
    window_plan_version: NonEmptyStr
    scope: FeatureScope
    start_ms: int | None = Field(default=None, ge=0)
    end_ms: int | None = Field(default=None, ge=0)
    stem: NonEmptyStr | None = None
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    source: FeatureSource
    analysis_pipeline_version: NonEmptyStr = ANALYSIS_PIPELINE_VERSION
    feature_schema_version: NonEmptyStr = FEATURE_SCHEMA_VERSION

    @model_validator(mode="after")
    def validate_evidence_bounds(self) -> Self:
        if (self.start_ms is None) != (self.end_ms is None):
            raise ValueError("start_ms and end_ms must be supplied together")
        if self.start_ms is not None and self.end_ms is not None:
            if self.end_ms <= self.start_ms:
                raise ValueError("end_ms must be greater than start_ms")
        if self.scope in {FeatureScope.WINDOW, FeatureScope.SEGMENT}:
            if self.start_ms is None:
                raise ValueError("window and segment records require a time range")
        if self.scope is FeatureScope.STEM and self.stem is None:
            raise ValueError("stem-scoped records require a stem name")
        if (self.model_name is None) != (self.model_version is None):
            raise ValueError("model_name and model_version must be supplied together")
        if self.checkpoint_id is not None and self.weights_sha256 is None:
            raise ValueError("checkpoint records require weights_sha256")
        return self

    @property
    def extractor_identity(self) -> tuple[str, str]:
        return (self.extractor_name, self.extractor_version)


class EmbeddingRecord(FeatureRecord):
    role: EmbeddingRole
    vector: tuple[float, ...] = Field(min_length=1)
    dimension: int | None = Field(default=None, gt=0)
    pooling_strategy: NonEmptyStr

    @field_validator("vector")
    @classmethod
    def validate_vector(cls, vector: tuple[float, ...]) -> tuple[float, ...]:
        if not all(math.isfinite(value) for value in vector):
            raise ValueError("embedding vector must contain only finite values")
        return vector

    @model_validator(mode="after")
    def validate_dimension(self) -> Self:
        if self.dimension is not None and self.dimension != len(self.vector):
            raise ValueError("dimension must match the native vector length")
        if self.dimension is None:
            object.__setattr__(self, "dimension", len(self.vector))
        return self


class ScalarFeatureRecord(FeatureRecord):
    namespace: NonEmptyStr
    feature_name: NonEmptyStr
    value: float
    unit: NonEmptyStr | None = None

    @field_validator("value")
    @classmethod
    def validate_value(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("scalar feature value must be finite")
        return value


TagValue = str | float | bool


class TagFeatureRecord(FeatureRecord):
    namespace: NonEmptyStr
    feature_name: NonEmptyStr
    value: TagValue = True

    @field_validator("value")
    @classmethod
    def validate_tag_value(cls, value: TagValue) -> TagValue:
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError("numeric tag values must be finite")
        if isinstance(value, str) and not value.strip():
            raise ValueError("text tag values must not be empty")
        return value


class FeatureBundle(ImmutableRecord):
    """All independently queryable evidence produced by one extraction call."""

    audio_content_hash: Sha256
    extractor_spec: ExtractorSpec
    window_plan_version: NonEmptyStr
    embeddings: tuple[EmbeddingRecord, ...] = ()
    scalars: tuple[ScalarFeatureRecord, ...] = ()
    tags: tuple[TagFeatureRecord, ...] = ()
    warnings: tuple[NonEmptyStr, ...] = ()

    @model_validator(mode="after")
    def validate_provenance(self) -> Self:
        for record in (*self.embeddings, *self.scalars, *self.tags):
            if record.audio_content_hash != self.audio_content_hash:
                raise ValueError("all bundle records must use the bundle content hash")
            if record.extractor_identity != self.extractor_spec.identity:
                raise ValueError("all bundle records must use the bundle extractor identity")
            if record.window_plan_version != self.window_plan_version:
                raise ValueError("all bundle records must use the bundle window plan")
            if (
                record.configuration_version
                != self.extractor_spec.configuration_version
                or record.configuration_sha256
                != self.extractor_spec.configuration_sha256
            ):
                raise ValueError("all bundle records must use the bundle configuration")
            artifact = self.extractor_spec.model_artifact
            expected_model = (
                (
                    artifact.name,
                    artifact.version,
                    artifact.checkpoint_id,
                    artifact.sha256,
                )
                if artifact is not None
                else (None, None, None, None)
            )
            actual_model = (
                record.model_name,
                record.model_version,
                record.checkpoint_id,
                record.weights_sha256,
            )
            if actual_model != expected_model:
                raise ValueError("all bundle records must use the bundle model identity")
        undeclared_roles = {
            record.role for record in self.embeddings
        } - self.extractor_spec.output_roles
        if undeclared_roles:
            roles = ", ".join(sorted(role.value for role in undeclared_roles))
            raise ValueError(f"bundle contains undeclared embedding roles: {roles}")
        return self


class RoleAssignment(ImmutableRecord):
    role: EmbeddingRole
    extractor_name: NonEmptyStr
    extractor_version: NonEmptyStr

    @property
    def extractor_identity(self) -> tuple[str, str]:
        return (self.extractor_name, self.extractor_version)


class ModelSetManifest(ImmutableRecord):
    """A reproducible production or evaluation extractor configuration."""

    name: NonEmptyStr
    version: NonEmptyStr
    required_extractors: tuple[ExtractorSpec, ...] = ()
    optional_extractors: tuple[ExtractorSpec, ...] = ()
    window_plan_version: NonEmptyStr
    pooling_configuration_version: NonEmptyStr
    role_assignments: tuple[RoleAssignment, ...] = ()
    component_normalization_version: NonEmptyStr
    component_weighting_version: NonEmptyStr
    projection_version: NonEmptyStr | None = None

    @model_validator(mode="after")
    def validate_manifest(self) -> Self:
        required_ids = [spec.identity for spec in self.required_extractors]
        optional_ids = [spec.identity for spec in self.optional_extractors]
        all_ids = required_ids + optional_ids
        if len(all_ids) != len(set(all_ids)):
            raise ValueError("extractor identities must be unique within a manifest")

        assignments = [(item.role, item.extractor_identity) for item in self.role_assignments]
        if len(assignments) != len(set(assignments)):
            raise ValueError("role assignments must be unique")
        unknown = {
            identity for _, identity in assignments if identity not in set(all_ids)
        }
        if unknown:
            raise ValueError("role assignments must reference manifest extractors")

        specs = {spec.identity: spec for spec in self.extractors}
        for role, identity in assignments:
            if role not in specs[identity].output_roles:
                raise ValueError(
                    f"extractor {identity[0]}@{identity[1]} does not declare role {role.value}"
                )

        layout_count = sum(
            assignment.role is EmbeddingRole.LAYOUT
            for assignment in self.role_assignments
        )
        if layout_count > 1:
            raise ValueError("a manifest may assign at most one layout representation")
        if self.projection_version is not None and layout_count != 1:
            raise ValueError("a projected manifest requires exactly one layout assignment")
        return self

    @property
    def identity(self) -> tuple[str, str]:
        return (self.name, self.version)

    @property
    def extractors(self) -> tuple[ExtractorSpec, ...]:
        return self.required_extractors + self.optional_extractors

    @property
    def manifest_sha256(self) -> str:
        """Stable identity for the complete executable model-set declaration.

        ``name`` and ``version`` are useful human identifiers, but cannot prove
        that two processes received identical extractor/checkpoint/configuration
        declarations.  The digest is deliberately computed from the complete
        validated record and can be persisted with run evidence.
        """

        payload = json.dumps(
            self.model_dump(mode="json"),
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
        ).encode("utf-8")
        return hashlib.sha256(payload).hexdigest()


__all__ = [
    "ChannelPolicy",
    "EmbeddingRecord",
    "EmbeddingRole",
    "ExtractorSpec",
    "FeatureBundle",
    "FeatureRecord",
    "FeatureScope",
    "FeatureSource",
    "ModelArtifact",
    "ModelSetManifest",
    "RoleAssignment",
    "ScalarFeatureRecord",
    "Sha256",
    "TagFeatureRecord",
]
