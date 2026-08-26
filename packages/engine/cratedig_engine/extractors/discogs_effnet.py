"""Native, decode-once Discogs-EffNet retrieval extractor.

The production model runtime is deliberately local-only.  Callers provide a
checkpoint path and its independently reviewed SHA-256 digest; this module
verifies the bytes before importing Essentia and never downloads artifacts or
executes remote model code.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from importlib.metadata import PackageNotFoundError, version as package_version
from pathlib import Path
from typing import Any, Literal, Protocol, runtime_checkable

import numpy as np
from numpy.typing import NDArray

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
    ModelArtifact,
)


DISCOGS_EFFNET_EXTRACTOR_VERSION = "discogs-effnet-native-v1"
DISCOGS_EFFNET_CONFIGURATION_VERSION = "discogs-effnet-runtime-v1"
DISCOGS_EFFNET_MODEL_NAME = "essentia-discogs-effnet"
DISCOGS_EFFNET_MODEL_VERSION = "discogs-effnet-bs64-1"
DISCOGS_EFFNET_CHECKPOINT_ID = "discogs-effnet-bs64-1.pb"
DISCOGS_EFFNET_SOURCE_URL = (
    "https://essentia.upf.edu/models/feature-extractors/discogs-effnet/"
    "discogs-effnet-bs64-1.pb"
)
DISCOGS_EFFNET_SAMPLE_RATE_HZ = 16_000
DISCOGS_EFFNET_EMBEDDING_DIMENSION = 1_280
DISCOGS_EFFNET_OUTPUT_NODE = "PartitionedCall:1"
DISCOGS_EFFNET_RUNTIME_VERSION = "2.1b6.dev1389"
DISCOGS_EFFNET_RUNTIME = (
    "essentia-tensorflow==2.1b6.dev1389:"
    "TensorflowPredictEffnetDiscogs(frozen-graph)"
)
DISCOGS_EFFNET_SHA256_POLICY = "required-exact-match-before-runtime-load"
DISCOGS_EFFNET_WEIGHTS_LICENSE = "CC-BY-NC-SA-4.0"
DISCOGS_EFFNET_CODE_LICENSE = "AGPL-3.0-only"

Float32Array = NDArray[np.float32]


class ArtifactIntegrityError(ValueError):
    """A local checkpoint does not match its reviewed identity."""


@dataclass(frozen=True, slots=True)
class DiscogsEffnetArtifactConfig:
    """Explicit local artifact and runtime policy for Discogs-EffNet.

    The public weights are non-commercial.  Consequently the resulting
    :class:`ModelArtifact` is evaluation-only and cannot enter a production or
    bundled manifest without a separately reviewed commercial license and a
    new artifact identity.
    """

    checkpoint_path: Path
    expected_sha256: str
    batch_size: int = 64
    output_node: str = DISCOGS_EFFNET_OUTPUT_NODE
    device: Literal["tensorflow-runtime-default"] = "tensorflow-runtime-default"
    allow_remote_code: Literal[False] = False

    def __post_init__(self) -> None:
        path = Path(self.checkpoint_path).expanduser().resolve()
        object.__setattr__(self, "checkpoint_path", path)
        digest = self.expected_sha256.strip().lower()
        if re.fullmatch(r"[0-9a-f]{64}", digest) is None:
            raise ValueError("expected_sha256 must be a SHA-256 hex digest")
        object.__setattr__(self, "expected_sha256", digest)
        if self.batch_size <= 0:
            raise ValueError("batch_size must be positive")
        if not self.output_node.strip():
            raise ValueError("output_node must not be empty")
        if self.device != "tensorflow-runtime-default":
            raise ValueError("Discogs-EffNet device policy is tensorflow-runtime-default")
        if self.allow_remote_code is not False:
            raise ValueError("remote model code must remain disabled")

    @property
    def source_url(self) -> str:
        return DISCOGS_EFFNET_SOURCE_URL

    @property
    def sha256_policy(self) -> str:
        return DISCOGS_EFFNET_SHA256_POLICY

    @property
    def sample_rate_hz(self) -> int:
        return DISCOGS_EFFNET_SAMPLE_RATE_HZ

    @property
    def dimensions(self) -> int:
        return DISCOGS_EFFNET_EMBEDDING_DIMENSION

    @property
    def runtime(self) -> str:
        return DISCOGS_EFFNET_RUNTIME

    def verify_checkpoint(self) -> str:
        """Require a local regular file and verify all bytes before loading."""

        if not self.checkpoint_path.is_file():
            raise FileNotFoundError(
                "Discogs-EffNet checkpoint must be provisioned locally: "
                f"{self.checkpoint_path}"
            )
        digest = hashlib.sha256()
        with self.checkpoint_path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        actual = digest.hexdigest()
        if actual != self.expected_sha256:
            raise ArtifactIntegrityError(
                "Discogs-EffNet checkpoint SHA-256 mismatch: "
                f"expected {self.expected_sha256}, got {actual}"
            )
        return actual

    def model_artifact(self) -> ModelArtifact:
        """Return the immutable model registry record for this exact digest."""

        return ModelArtifact(
            name=DISCOGS_EFFNET_MODEL_NAME,
            version=DISCOGS_EFFNET_MODEL_VERSION,
            checkpoint_id=DISCOGS_EFFNET_CHECKPOINT_ID,
            source_url=DISCOGS_EFFNET_SOURCE_URL,
            sha256=self.expected_sha256,
            code_license=DISCOGS_EFFNET_CODE_LICENSE,
            weights_license=DISCOGS_EFFNET_WEIGHTS_LICENSE,
            commercial_use=False,
            redistribution_allowed=True,
            attribution=(
                "Music Technology Group, Universitat Pompeu Fabra; "
                "Alonso-Jimenez, Serra, and Bogdanov (ISMIR 2022)"
            ),
            trusted_loading=False,
            runtime=DISCOGS_EFFNET_RUNTIME,
            sample_rate_hz=DISCOGS_EFFNET_SAMPLE_RATE_HZ,
            dimensions=DISCOGS_EFFNET_EMBEDDING_DIMENSION,
            supported_devices=("cpu", "cuda-via-tensorflow-runtime"),
            evaluation_only=True,
            production_eligible=False,
            bundle_eligible=False,
        )


@runtime_checkable
class DiscogsEffnetRuntime(Protocol):
    """Small inference seam used by the native extractor and contract tests."""

    def embed(self, mono_samples: Float32Array) -> np.ndarray: ...


class EssentiaDiscogsEffnetRuntime:
    """Local frozen-graph inference through Essentia's TensorFlow wrapper."""

    def __init__(self, config: DiscogsEffnetArtifactConfig) -> None:
        # Verify before importing or constructing any model runtime.  The
        # Essentia API receives a local graph filename and has no download or
        # remote-code path here.
        config.verify_checkpoint()
        try:
            installed_version = package_version("essentia-tensorflow")
        except PackageNotFoundError as exc:  # pragma: no cover - optional runtime
            raise RuntimeError(
                "Discogs-EffNet requires the optional essentia-tensorflow runtime"
            ) from exc
        if installed_version != DISCOGS_EFFNET_RUNTIME_VERSION:
            raise RuntimeError(
                "Discogs-EffNet runtime version mismatch: "
                f"expected {DISCOGS_EFFNET_RUNTIME_VERSION}, got {installed_version}"
            )
        try:
            import essentia.standard as es
        except ImportError as exc:  # pragma: no cover - optional runtime
            raise RuntimeError(
                "Discogs-EffNet requires the optional essentia-tensorflow runtime"
            ) from exc

        self._predict = es.TensorflowPredictEffnetDiscogs(
            graphFilename=str(config.checkpoint_path),
            output=config.output_node,
            batchSize=config.batch_size,
        )

    def embed(self, mono_samples: Float32Array) -> np.ndarray:
        return np.asarray(self._predict(mono_samples), dtype=np.float32)


class DiscogsEffnetExtractor:
    """Emit queryable 1280-d window and pooled retrieval embeddings."""

    def __init__(
        self,
        artifact_config: DiscogsEffnetArtifactConfig,
        runtime: DiscogsEffnetRuntime | None = None,
    ) -> None:
        # Fake runtimes do not bypass artifact identity: unit tests use a tiny
        # local fixture with its real digest, while production uses the model.
        self.artifact_config = artifact_config
        if runtime is None:
            self.runtime = EssentiaDiscogsEffnetRuntime(artifact_config)
        else:
            artifact_config.verify_checkpoint()
            self.runtime = runtime
        if not isinstance(self.runtime, DiscogsEffnetRuntime):
            raise TypeError("runtime must satisfy the DiscogsEffnetRuntime protocol")
        self._spec = discogs_effnet_extractor_spec(artifact_config)

    @property
    def spec(self) -> ExtractorSpec:
        return self._spec

    def extract(
        self, audio: DecodedAudio, window_plan: WindowPlan
    ) -> FeatureBundle:
        samples = np.asarray(
            audio.view(
                sample_rate=DISCOGS_EFFNET_SAMPLE_RATE_HZ,
                channel_policy="mono",
                normalize=False,
            ),
            dtype=np.float32,
        )
        if samples.ndim == 2 and samples.shape[1] == 1:
            samples = samples[:, 0]
        if samples.ndim != 1:
            raise ValueError("Discogs-EffNet requires a mono audio view")
        if samples.size == 0:
            raise ValueError("empty audio")

        plan_version = str(window_plan.version)
        windows = tuple(
            window_plan.windows(len(samples), DISCOGS_EFFNET_SAMPLE_RATE_HZ)
        )
        if not windows:
            raise ValueError(f"window plan {plan_version!r} produced no windows")

        window_records: list[EmbeddingRecord] = []
        for window in windows:
            chunk = np.ascontiguousarray(window.slice(samples), dtype=np.float32)
            if chunk.size == 0:
                raise ValueError(f"window plan {plan_version!r} produced an empty window")
            frame_embeddings = _validated_frame_embeddings(self.runtime.embed(chunk))
            pooled = np.mean(frame_embeddings, axis=0, dtype=np.float32)
            window_records.append(
                EmbeddingRecord(
                    **self._record_provenance(
                        audio.source_hash,
                        plan_version,
                        scope=FeatureScope.WINDOW,
                        start_ms=window.start_ms,
                        end_ms=window.end_ms,
                    ),
                    role=EmbeddingRole.RETRIEVAL,
                    vector=tuple(float(value) for value in pooled),
                    dimension=DISCOGS_EFFNET_EMBEDDING_DIMENSION,
                    pooling_strategy="frame-arithmetic-mean-v1",
                )
            )

        track_vector = np.mean(
            np.asarray([record.vector for record in window_records], dtype=np.float32),
            axis=0,
            dtype=np.float32,
        )
        track_record = EmbeddingRecord(
            **self._record_provenance(
                audio.source_hash, plan_version, scope=FeatureScope.TRACK
            ),
            role=EmbeddingRole.RETRIEVAL,
            vector=tuple(float(value) for value in track_vector),
            dimension=DISCOGS_EFFNET_EMBEDDING_DIMENSION,
            pooling_strategy="window-arithmetic-mean-v1",
        )
        return FeatureBundle(
            audio_content_hash=audio.source_hash,
            extractor_spec=self.spec,
            window_plan_version=plan_version,
            embeddings=(*window_records, track_record),
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
        artifact = self.spec.model_artifact
        if artifact is None:  # pragma: no cover - protected by spec construction
            raise RuntimeError("Discogs-EffNet spec is missing its model artifact")
        return {
            "audio_content_hash": audio_content_hash,
            "extractor_name": self.spec.name,
            "extractor_version": self.spec.version,
            "model_name": artifact.name,
            "model_version": artifact.version,
            "checkpoint_id": artifact.checkpoint_id,
            "weights_sha256": artifact.sha256,
            "configuration_version": self.spec.configuration_version,
            "configuration_sha256": self.spec.configuration_sha256,
            "window_plan_version": window_plan_version,
            "scope": scope,
            "start_ms": start_ms,
            "end_ms": end_ms,
            "confidence": 1.0,
            "source": FeatureSource.MODEL,
        }


def discogs_effnet_extractor_spec(
    artifact_config: DiscogsEffnetArtifactConfig,
) -> ExtractorSpec:
    """Build a stable spec without importing the optional Essentia runtime."""

    configuration = {
        "adapter": DISCOGS_EFFNET_EXTRACTOR_VERSION,
        "artifact_sha256": artifact_config.expected_sha256,
        "batch_size": artifact_config.batch_size,
        "channel_policy": "mono",
        "device": artifact_config.device,
        "dimensions": DISCOGS_EFFNET_EMBEDDING_DIMENSION,
        "frame_pooling": "arithmetic-mean-v1",
        "output_node": artifact_config.output_node,
        "remote_code": artifact_config.allow_remote_code,
        "runtime": DISCOGS_EFFNET_RUNTIME,
        "sample_rate_hz": DISCOGS_EFFNET_SAMPLE_RATE_HZ,
        "sha256_policy": DISCOGS_EFFNET_SHA256_POLICY,
        "window_pooling": "arithmetic-mean-v1",
    }
    configuration_sha256 = hashlib.sha256(
        json.dumps(configuration, sort_keys=True, separators=(",", ":")).encode(
            "utf-8"
        )
    ).hexdigest()
    return ExtractorSpec(
        name="discogs-effnet",
        version=DISCOGS_EFFNET_EXTRACTOR_VERSION,
        required_sample_rate_hz=DISCOGS_EFFNET_SAMPLE_RATE_HZ,
        channel_policy=ChannelPolicy.MONO,
        supported_scopes={FeatureScope.TRACK, FeatureScope.WINDOW},
        output_roles={EmbeddingRole.RETRIEVAL},
        configuration_version=DISCOGS_EFFNET_CONFIGURATION_VERSION,
        configuration_sha256=configuration_sha256,
        model_artifact=artifact_config.model_artifact(),
        default_window_plan_version="legacy-essentia-v1",
        default_pooling_strategy="window-arithmetic-mean-v1",
    )


def _validated_frame_embeddings(values: np.ndarray) -> Float32Array:
    embeddings = np.asarray(values, dtype=np.float32)
    if embeddings.ndim == 1:
        embeddings = embeddings[np.newaxis, :]
    if embeddings.ndim != 2:
        raise ValueError(
            "Discogs-EffNet runtime must return a frame-major 2D embedding array"
        )
    if embeddings.shape[0] == 0:
        raise ValueError("Discogs-EffNet runtime returned no embedding frames")
    if embeddings.shape[1] != DISCOGS_EFFNET_EMBEDDING_DIMENSION:
        raise ValueError(
            "unexpected Discogs-EffNet embedding dimension: "
            f"{embeddings.shape[1]} "
            f"(expected {DISCOGS_EFFNET_EMBEDDING_DIMENSION})"
        )
    if not np.all(np.isfinite(embeddings)):
        raise ValueError("Discogs-EffNet runtime returned non-finite embeddings")
    return embeddings


__all__ = [
    "ArtifactIntegrityError",
    "DISCOGS_EFFNET_CHECKPOINT_ID",
    "DISCOGS_EFFNET_CODE_LICENSE",
    "DISCOGS_EFFNET_CONFIGURATION_VERSION",
    "DISCOGS_EFFNET_EMBEDDING_DIMENSION",
    "DISCOGS_EFFNET_MODEL_NAME",
    "DISCOGS_EFFNET_MODEL_VERSION",
    "DISCOGS_EFFNET_RUNTIME",
    "DISCOGS_EFFNET_RUNTIME_VERSION",
    "DISCOGS_EFFNET_SAMPLE_RATE_HZ",
    "DISCOGS_EFFNET_SHA256_POLICY",
    "DISCOGS_EFFNET_SOURCE_URL",
    "DISCOGS_EFFNET_WEIGHTS_LICENSE",
    "DISCOGS_EFFNET_EXTRACTOR_VERSION",
    "DiscogsEffnetArtifactConfig",
    "DiscogsEffnetExtractor",
    "DiscogsEffnetRuntime",
    "EssentiaDiscogsEffnetRuntime",
    "discogs_effnet_extractor_spec",
]
