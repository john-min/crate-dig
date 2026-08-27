"""Small, storage-agnostic contracts for local analysis work.

The SQLite repository implements this protocol.  Keeping the worker expressed
in terms of these value objects makes its retry and cancellation behavior easy
to test without opening a database or loading an audio model.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Protocol, runtime_checkable


class StageTerminalStatus(str, Enum):
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    SKIPPED = "skipped"


class ErrorCode(str, Enum):
    CANCELLED_BY_USER = "cancelled_by_user"
    MISSING_AUDIO = "missing_audio"
    SOURCE_CHANGED = "source_changed"
    CORRUPT_AUDIO = "corrupt_audio"
    AUDIO_PERMISSION_DENIED = "audio_permission_denied"
    MANIFEST_NOT_FOUND = "manifest_not_found"
    EXTRACTOR_NOT_FOUND = "extractor_not_found"
    ENGINE_UNAVAILABLE = "engine_unavailable"
    RESOURCE_EXHAUSTED = "resource_exhausted"
    TRANSIENT_IO = "transient_io"
    EXTRACTOR_FAILED = "extractor_failed"
    EXTRACTOR_SKIPPED = "extractor_skipped"
    UNEXPECTED_ERROR = "unexpected_error"


@dataclass(frozen=True, slots=True)
class ClaimedStage:
    """The complete unit of work returned by an atomic repository claim."""

    id: str
    run_id: str
    track_id: str
    manifest_id: str
    extractor_name: str
    extractor_version: str
    source_path: Path
    audio_content_hash: str | None = None
    cache_source_stage_id: str | None = None
    attempt_count: int = 1
    max_attempts: int = 3

    @classmethod
    def from_record(cls, value: Mapping[str, Any] | object) -> ClaimedStage:
        """Accept repository rows without coupling the worker to an ORM type."""

        def read(*names: str, default: Any = None) -> Any:
            for name in names:
                if isinstance(value, Mapping) and name in value:
                    return value[name]
                if hasattr(value, name):
                    return getattr(value, name)
            return default

        source_path = read("source_path", "track_location", "location", "audio_path")
        if not source_path:
            raise ValueError("claimed stage must include a source audio path")

        required = {
            "id": read("id", "stage_id"),
            "run_id": read("run_id"),
            "track_id": read("track_id"),
            "manifest_id": read("manifest_id", "model_set_manifest_id"),
            "extractor_name": read("extractor_name"),
            "extractor_version": read("extractor_version"),
        }
        missing = [name for name, item in required.items() if not item]
        if missing:
            raise ValueError(
                "claimed stage is missing required fields: " + ", ".join(missing)
            )

        attempt_count = int(read("attempt_count", "attempts", default=1))
        max_attempts = int(read("max_attempts", default=3))
        if attempt_count < 1 or max_attempts < 1:
            raise ValueError("attempt counts must be positive")

        return cls(
            **{name: str(item) for name, item in required.items()},
            source_path=Path(source_path),
            audio_content_hash=read("audio_content_hash"),
            cache_source_stage_id=read("cache_source_stage_id"),
            attempt_count=attempt_count,
            max_attempts=max_attempts,
        )

    @property
    def extractor_identity(self) -> tuple[str, str]:
        return (self.extractor_name, self.extractor_version)


@dataclass(frozen=True, slots=True)
class StageOutputs:
    """Canonical evidence ready for one short repository transaction."""

    features: tuple[object, ...] = ()
    embeddings: tuple[object, ...] = ()


@dataclass(frozen=True, slots=True)
class Failure:
    code: str
    message: str
    retryable: bool


@dataclass(frozen=True, slots=True)
class WorkResult:
    stage_id: str | None
    status: StageTerminalStatus | None
    error_code: str | None = None
    retryable: bool = False

    @property
    def claimed(self) -> bool:
        return self.stage_id is not None


class CancellationRequested(Exception):
    """Raised cooperatively at an extractor or window boundary."""


class EngineUnavailableError(RuntimeError):
    """Raised when the separately packaged Engine v2 cannot be imported."""


class SourceChangedError(RuntimeError):
    """Raised when the queued content identity no longer matches the source."""


class StageSkipped(Exception):
    """Signal a non-cancellation skip with a stable reason code."""

    def __init__(self, reason: str, *, code: str = ErrorCode.EXTRACTOR_SKIPPED.value):
        super().__init__(reason)
        self.code = code


@runtime_checkable
class Repository(Protocol):
    """Persistence surface required by the single-concurrency worker.

    ``claim_next_stage`` must atomically transition one eligible queued stage to
    running and attach a finite lease.  Expired leases must become claimable so
    a process interruption does not strand work.  ``fail_stage`` may requeue a
    retryable stage, but must leave it terminal once ``retryable`` is false.
    """

    def claim_next_stage(
        self, *, worker_id: str, run_id: str | None = None
    ) -> Mapping[str, Any] | object | None: ...

    def get_analysis_run(self, run_id: str) -> Mapping[str, Any] | object | None: ...

    def complete_stage(
        self,
        stage_id: str,
        *,
        features: Sequence[object] = (),
        embeddings: Sequence[object] = (),
        worker_id: str | None = None,
    ) -> object: ...

    def complete_stage_from_cache(
        self,
        stage_id: str,
        source_stage_id: str,
        *,
        worker_id: str | None = None,
    ) -> object: ...

    def fail_stage(
        self,
        stage_id: str,
        error_code: str,
        error_message: str,
        *,
        retryable: bool,
        worker_id: str | None = None,
    ) -> object: ...

    def skip_stage(
        self,
        stage_id: str,
        reason_code: str,
        reason_message: str = "",
        *,
        worker_id: str | None = None,
    ) -> object: ...


class StageExecutor(Protocol):
    def execute(
        self,
        stage: ClaimedStage,
        should_cancel: Callable[[], bool],
    ) -> StageOutputs: ...


def run_is_cancelled(value: Mapping[str, Any] | object | None) -> bool:
    """Recognize cancellation fields used by both mapping and row adapters."""

    if value is None:
        return False

    def read(name: str, default: Any = None) -> Any:
        if isinstance(value, Mapping):
            return value.get(name, default)
        return getattr(value, name, default)

    if bool(read("cancellation_requested", False)):
        return True
    if bool(read("cancel_requested", False)):
        return True
    if read("cancel_requested_at") is not None:
        return True
    return str(read("status", "")).lower() in {"cancelling", "cancelled"}


def classify_exception(exc: Exception) -> Failure:
    """Map runtime exceptions to stable, safe, machine-readable failures."""

    class_name = type(exc).__name__.lower()
    message = str(exc).lower()
    if isinstance(exc, EngineUnavailableError):
        return Failure(ErrorCode.ENGINE_UNAVAILABLE.value, str(exc), False)
    if isinstance(exc, SourceChangedError):
        return Failure(
            ErrorCode.SOURCE_CHANGED.value,
            "Audio changed after this analysis run was queued; queue a new run.",
            False,
        )
    if isinstance(exc, FileNotFoundError):
        return Failure(
            ErrorCode.MISSING_AUDIO.value,
            "Audio file was not found.",
            False,
        )
    if isinstance(exc, PermissionError):
        return Failure(
            ErrorCode.AUDIO_PERMISSION_DENIED.value,
            "Audio file could not be read because access was denied.",
            False,
        )
    if "libsndfile" in class_name or "format not recognised" in message:
        return Failure(
            ErrorCode.CORRUPT_AUDIO.value,
            "Audio could not be decoded; the file may be corrupt or unsupported.",
            False,
        )
    if isinstance(exc, (MemoryError, TimeoutError)):
        return Failure(
            ErrorCode.RESOURCE_EXHAUSTED.value,
            "Analysis ran out of a temporary runtime resource.",
            True,
        )
    if isinstance(exc, OSError):
        return Failure(
            ErrorCode.TRANSIENT_IO.value,
            "A temporary audio I/O error interrupted analysis.",
            True,
        )

    if "manifest" in class_name or "manifest" in message:
        return Failure(
            ErrorCode.MANIFEST_NOT_FOUND.value,
            "The requested model-set manifest is unavailable or invalid.",
            False,
        )
    if "extractornotfound" in class_name or (
        "extractor" in message and "not registered" in message
    ):
        return Failure(
            ErrorCode.EXTRACTOR_NOT_FOUND.value,
            "The manifest requires an extractor that is not installed.",
            False,
        )
    if isinstance(exc, ValueError) and (
        "decode" in message or "audio file" in message or "soundfile" in message
    ):
        return Failure(
            ErrorCode.CORRUPT_AUDIO.value,
            "Audio could not be decoded; the file may be corrupt or unsupported.",
            False,
        )
    return Failure(
        ErrorCode.EXTRACTOR_FAILED.value,
        "The extractor failed while analyzing this track.",
        False,
    )


__all__ = [
    "CancellationRequested",
    "ClaimedStage",
    "EngineUnavailableError",
    "ErrorCode",
    "Failure",
    "Repository",
    "StageExecutor",
    "StageOutputs",
    "StageSkipped",
    "SourceChangedError",
    "StageTerminalStatus",
    "WorkResult",
    "classify_exception",
    "run_is_cancelled",
]
