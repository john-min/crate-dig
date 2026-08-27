"""Temporary adapter from the v1 ``AudioBackend`` API to canonical records.

This adapter intentionally does *not* pretend to participate in decode-once
execution.  A legacy backend receives the original path and therefore opens,
decodes, resamples, and windows the source according to its own implementation.
The warning on every returned bundle makes that limitation visible to callers.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from cratedig_engine.audio.decode import DecodedAudio
from cratedig_engine.audio.windows import (
    LEGACY_CLAP,
    LEGACY_ESSENTIA,
    LEGACY_LIBROSA,
    WindowPlan,
)
from cratedig_engine.backends.base import AudioBackend
from cratedig_engine.records import (
    ChannelPolicy,
    EmbeddingRecord,
    EmbeddingRole,
    ExtractorSpec,
    FeatureBundle,
    FeatureScope,
    FeatureSource,
    ModelArtifact,
    ScalarFeatureRecord,
    TagFeatureRecord,
)


LEGACY_ADAPTER_VERSION = "legacy-backend-adapter-v1"
_CONFIG_FIELDS = (
    "sr",
    "duration",
    "n_windows",
    "win",
    "VIBES",
    "PROMPTS",
    "PROMPT_TEXT",
    "ENERGY",
    "VALENCE",
    "HEADS",
)
_WINDOW_PLAN_BY_BACKEND = {
    "clap": LEGACY_CLAP,
    "essentia": LEGACY_ESSENTIA,
    "librosa": LEGACY_LIBROSA,
}


def _jsonable_configuration(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            str(key): _jsonable_configuration(item)
            for key, item in sorted(value.items(), key=lambda pair: str(pair[0]))
        }
    if isinstance(value, (set, frozenset)):
        return sorted(_jsonable_configuration(item) for item in value)
    if isinstance(value, (list, tuple)):
        return [_jsonable_configuration(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return repr(value)


def _configuration_hash(backend: AudioBackend) -> str:
    """Hash the adapter policy and the stable legacy knobs that affect output."""

    payload: dict[str, Any] = {
        "adapter": LEGACY_ADAPTER_VERSION,
        "backend_name": backend.name,
        "backend_model_version": backend.model_version,
        "feature_namespace": f"legacy.{backend.name}",
        "embedding_role": EmbeddingRole.RETRIEVAL.value,
    }
    for field in _CONFIG_FIELDS:
        if hasattr(backend, field):
            payload[field] = _jsonable_configuration(getattr(backend, field))
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def _is_model_backend(backend: AudioBackend) -> bool:
    """Known legacy deep backends use weights; librosa is model-less."""

    return backend.name not in {"librosa"}


class LegacyBackendExtractor:
    """Expose an existing path-based backend through the Engine v2 contract."""

    def __init__(self, backend: AudioBackend) -> None:
        self.backend = backend
        sample_rate = int(getattr(backend, "sr", 44_100))
        self.window_plan = _WINDOW_PLAN_BY_BACKEND.get(backend.name)
        window_plan_version = (
            self.window_plan.version
            if self.window_plan is not None
            else f"legacy-{backend.name}-v1"
        )
        artifact = None
        if _is_model_backend(backend):
            # Legacy backends do not expose a verified checkpoint digest.  Keep
            # the model identity, but deliberately leave checkpoint_id/sha256
            # unset instead of fabricating stronger provenance than we have.
            artifact = ModelArtifact(
                name=backend.name,
                version=backend.model_version,
                runtime=type(backend).__qualname__,
                sample_rate_hz=sample_rate,
                evaluation_only=True,
            )
        self._spec = ExtractorSpec(
            name=f"legacy.{backend.name}",
            version=f"{backend.model_version}+{LEGACY_ADAPTER_VERSION}",
            required_sample_rate_hz=sample_rate,
            channel_policy=ChannelPolicy.MONO,
            supported_scopes={FeatureScope.TRACK},
            output_roles={EmbeddingRole.RETRIEVAL},
            configuration_version=LEGACY_ADAPTER_VERSION,
            configuration_sha256=_configuration_hash(backend),
            model_artifact=artifact,
            default_window_plan_version=window_plan_version,
            default_pooling_strategy="legacy-backend-native",
        )

    @property
    def spec(self) -> ExtractorSpec:
        return self._spec

    def extract(
        self, audio: DecodedAudio, window_plan: WindowPlan
    ) -> FeatureBundle:
        """Run the legacy path-based implementation and wrap its output.

        The adapter uses only ``source_hash`` and ``source_path`` from the
        canonical object; the backend still performs its own decode.
        """

        plan_version = str(window_plan.version)
        if plan_version != self.spec.default_window_plan_version:
            raise ValueError(
                f"legacy backend {self.backend.name!r} requires window plan "
                f"{self.spec.default_window_plan_version!r}; received "
                f"{plan_version!r}"
            )
        output = self.backend.analyze(str(audio.source_path))
        namespace = f"legacy.{self.backend.name}"
        common = self._record_provenance(audio.source_hash, plan_version)

        embedding = EmbeddingRecord(
            **common,
            role=EmbeddingRole.RETRIEVAL,
            vector=tuple(float(value) for value in output.embedding),
            dimension=output.embedding_dim,
            pooling_strategy="legacy-backend-native",
        )
        scalars: list[ScalarFeatureRecord] = []
        tags: list[TagFeatureRecord] = []
        for key, value in output.features.items():
            # bool is a subclass of int, so check it before numeric values.
            if isinstance(value, bool) or isinstance(value, str):
                tags.append(
                    TagFeatureRecord(
                        **common,
                        namespace=namespace,
                        feature_name=str(key),
                        value=value,
                    )
                )
            elif isinstance(value, (int, float)):
                scalars.append(
                    ScalarFeatureRecord(
                        **common,
                        namespace=namespace,
                        feature_name=str(key),
                        value=float(value),
                    )
                )
            else:
                tags.append(
                    TagFeatureRecord(
                        **common,
                        namespace=namespace,
                        feature_name=str(key),
                        value=str(value),
                    )
                )

        warnings = [
            f"legacy backend {self.backend.name!r} reopens and decodes source audio; "
            "it does not use the shared DecodedAudio samples",
            f"legacy backend {self.backend.name!r} uses declared internal plan "
            f"{plan_version!r}, but does not retain per-window evidence",
        ]
        if self.spec.model_artifact is not None:
            warnings.append(
                f"legacy backend {self.backend.name!r} does not expose a verified "
                "checkpoint weights hash"
            )
        return FeatureBundle(
            audio_content_hash=audio.source_hash,
            extractor_spec=self.spec,
            window_plan_version=plan_version,
            embeddings=(embedding,),
            scalars=tuple(scalars),
            tags=tuple(tags),
            warnings=tuple(warnings),
        )

    def _record_provenance(
        self, audio_content_hash: str, window_plan_version: str
    ) -> dict[str, Any]:
        artifact = self.spec.model_artifact
        return {
            "audio_content_hash": audio_content_hash,
            "extractor_name": self.spec.name,
            "extractor_version": self.spec.version,
            "model_name": artifact.name if artifact else None,
            "model_version": artifact.version if artifact else None,
            "checkpoint_id": artifact.checkpoint_id if artifact else None,
            "weights_sha256": artifact.sha256 if artifact else None,
            "configuration_version": self.spec.configuration_version,
            "configuration_sha256": self.spec.configuration_sha256,
            "window_plan_version": window_plan_version,
            "scope": FeatureScope.TRACK,
            "confidence": 1.0,
            "source": (
                FeatureSource.MODEL if artifact else FeatureSource.HEURISTIC
            ),
        }


__all__ = ["LEGACY_ADAPTER_VERSION", "LegacyBackendExtractor"]
