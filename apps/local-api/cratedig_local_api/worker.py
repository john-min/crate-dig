"""Single-concurrency local analysis worker and Engine v2 adapter."""

from __future__ import annotations

import time
import uuid
from argparse import ArgumentParser
from collections.abc import Callable, Mapping
from typing import Any

from .jobs import (
    CancellationRequested,
    ClaimedStage,
    EngineUnavailableError,
    ErrorCode,
    Repository,
    StageExecutor,
    StageOutputs,
    StageSkipped,
    StageTerminalStatus,
    SourceChangedError,
    WorkResult,
    classify_exception,
    run_is_cancelled,
)


class EngineV2StageExecutor:
    """Resolve one claimed extractor from a versioned model-set manifest.

    The resolver accepts the repository's immutable ``manifest_id`` and returns
    a ``ModelSetManifest``.  The registry is injected once at worker startup.
    Imports are intentionally lazy: metadata/playback can still start when the
    optional analysis environment is absent, while a claimed analysis stage
    fails with the explicit ``engine_unavailable`` code.
    """

    def __init__(self, manifest_resolver: Callable[[str], object], registry: object):
        self._manifest_resolver = manifest_resolver
        self._registry = registry

    def execute(
        self,
        stage: ClaimedStage,
        should_cancel: Callable[[], bool],
    ) -> StageOutputs:
        try:
            from cratedig_engine.audio import DecodedAudio, get_window_plan
            from cratedig_engine.pipeline import ExtractionSkipped
            from cratedig_engine.records import FeatureBundle, ModelSetManifest
        except ImportError as exc:
            raise EngineUnavailableError(
                "Engine v2 is not installed in the local analysis environment."
            ) from exc

        manifest = self._manifest_resolver(stage.manifest_id)
        if manifest is None or not isinstance(manifest, ModelSetManifest):
            raise ValueError(
                f"model-set manifest {stage.manifest_id!r} is unavailable or invalid"
            )

        # Resolving the whole manifest verifies that every required spec is
        # installed and exactly version-matched before any expensive decode.
        extractors = self._registry.resolve(manifest)  # type: ignore[attr-defined]
        matches = [
            extractor
            for extractor in extractors
            if extractor.spec.identity == stage.extractor_identity
        ]
        if len(matches) != 1:
            raise LookupError(
                "extractor "
                f"{stage.extractor_name}@{stage.extractor_version} is not registered "
                "in the claimed manifest"
            )
        extractor = matches[0]

        if should_cancel():
            raise CancellationRequested
        audio = DecodedAudio.from_file(stage.source_path)
        if (
            stage.audio_content_hash is not None
            and audio.source_hash != stage.audio_content_hash
        ):
            raise SourceChangedError
        if should_cancel():
            raise CancellationRequested

        plan_version = (
            extractor.spec.default_window_plan_version
            or manifest.window_plan_version
        )
        plan = get_window_plan(plan_version)
        try:
            bundle = extractor.extract(audio, plan)
        except ExtractionSkipped as exc:
            raise StageSkipped(
                str(exc) or "Extractor intentionally skipped this track"
            ) from exc
        if should_cancel():
            raise CancellationRequested
        if not isinstance(bundle, FeatureBundle):
            raise TypeError("extractor must return a FeatureBundle")
        if bundle.audio_content_hash != audio.source_hash:
            raise ValueError("extractor returned evidence for different audio content")
        if bundle.extractor_spec != extractor.spec:
            raise ValueError(
                "extractor returned evidence with a different specification"
            )
        if bundle.window_plan_version != plan.version:
            raise ValueError("extractor returned evidence for a different window plan")
        return StageOutputs(
            features=tuple(
                _feature_mapping(record)
                for record in (*bundle.scalars, *bundle.tags)
            ),
            embeddings=tuple(
                _embedding_mapping(record) for record in bundle.embeddings
            ),
        )


class AnalysisWorker:
    """Claim and finish one stage at a time outside HTTP request handling."""

    def __init__(
        self,
        repository: Repository,
        executor: StageExecutor,
        *,
        worker_id: str | None = None,
        max_attempts: int = 3,
    ) -> None:
        if max_attempts < 1:
            raise ValueError("max_attempts must be positive")
        self.repository = repository
        self.executor = executor
        self.worker_id = worker_id or f"local-{uuid.uuid4()}"
        self.max_attempts = max_attempts

    def run_once(self, *, run_id: str | None = None) -> WorkResult:
        """Atomically claim at most one stage and drive it to a persisted state.

        ``BaseException`` is deliberately not caught.  A process interruption
        leaves the stage running with its lease; the repository can reclaim it
        after expiry rather than guessing whether model writes completed.
        """

        claimed = self.repository.claim_next_stage(
            worker_id=self.worker_id,
            run_id=run_id,
        )
        if claimed is None:
            return WorkResult(stage_id=None, status=None)

        try:
            stage = ClaimedStage.from_record(claimed)
        except Exception:
            # A malformed claim still has an id in normal repositories. Record
            # a bounded terminal failure when possible instead of stalling it.
            stage_id = _read(claimed, "id") or _read(claimed, "stage_id")
            if stage_id is None:
                raise
            self.repository.fail_stage(
                str(stage_id),
                ErrorCode.UNEXPECTED_ERROR.value,
                "Claimed stage was missing required worker fields.",
                retryable=False,
                worker_id=self.worker_id,
            )
            return WorkResult(
                stage_id=str(stage_id),
                status=StageTerminalStatus.FAILED,
                error_code=ErrorCode.UNEXPECTED_ERROR.value,
                retryable=False,
            )

        def should_cancel() -> bool:
            return run_is_cancelled(self.repository.get_analysis_run(stage.run_id))

        if should_cancel():
            return self._record_cancelled(stage)

        try:
            if stage.cache_source_stage_id is not None:
                from cratedig_engine.audio import hash_audio_file

                if (
                    stage.audio_content_hash is not None
                    and hash_audio_file(stage.source_path) != stage.audio_content_hash
                ):
                    raise SourceChangedError
                self.repository.complete_stage_from_cache(
                    stage.id,
                    stage.cache_source_stage_id,
                    worker_id=self.worker_id,
                )
                return WorkResult(stage.id, StageTerminalStatus.SUCCEEDED)
            outputs = self.executor.execute(stage, should_cancel)
            if should_cancel():
                return self._record_cancelled(stage)
            self.repository.complete_stage(
                stage.id,
                features=outputs.features,
                embeddings=outputs.embeddings,
                worker_id=self.worker_id,
            )
            return WorkResult(stage.id, StageTerminalStatus.SUCCEEDED)
        except CancellationRequested:
            return self._record_cancelled(stage)
        except StageSkipped as exc:
            self.repository.skip_stage(
                stage.id,
                exc.code,
                str(exc),
                worker_id=self.worker_id,
            )
            return WorkResult(
                stage.id,
                StageTerminalStatus.SKIPPED,
                error_code=exc.code,
                retryable=False,
            )
        except Exception as exc:
            failure = classify_exception(exc)
            attempt_ceiling = min(stage.max_attempts, self.max_attempts)
            retryable = failure.retryable and stage.attempt_count < attempt_ceiling
            self.repository.fail_stage(
                stage.id,
                failure.code,
                failure.message,
                retryable=retryable,
                worker_id=self.worker_id,
            )
            return WorkResult(
                stage.id,
                StageTerminalStatus.FAILED,
                error_code=failure.code,
                retryable=retryable,
            )

    def run(
        self,
        *,
        max_stages: int,
        run_id: str | None = None,
        idle_wait_seconds: float = 0.0,
        stop_requested: Callable[[], bool] | None = None,
    ) -> tuple[WorkResult, ...]:
        """Run a finite sequential batch, stopping when no work is available."""

        if max_stages < 1:
            raise ValueError("max_stages must be positive")
        if idle_wait_seconds < 0 or idle_wait_seconds > 60:
            raise ValueError("idle_wait_seconds must be between 0 and 60")

        stop_requested = stop_requested or (lambda: False)
        results: list[WorkResult] = []
        for _ in range(max_stages):
            if stop_requested():
                break
            result = self.run_once(run_id=run_id)
            results.append(result)
            if result.claimed:
                continue
            if idle_wait_seconds:
                time.sleep(idle_wait_seconds)
            break
        return tuple(results)

    def _record_cancelled(self, stage: ClaimedStage) -> WorkResult:
        self.repository.skip_stage(
            stage.id,
            ErrorCode.CANCELLED_BY_USER.value,
            "Analysis was cancelled by the user.",
            worker_id=self.worker_id,
        )
        return WorkResult(
            stage.id,
            StageTerminalStatus.SKIPPED,
            error_code=ErrorCode.CANCELLED_BY_USER.value,
            retryable=False,
        )


def _read(value: Any, name: str) -> Any:
    if isinstance(value, Mapping):
        return value.get(name)
    return getattr(value, name, None)


def _evidence_key(record: object, prefix: str) -> str:
    """Build a stable key without collapsing window/stem evidence in SQLite."""

    scope = getattr(record, "scope", "track")
    scope = getattr(scope, "value", scope)
    parts = [prefix, str(scope)]
    stem = getattr(record, "stem", None)
    if stem:
        parts.append(str(stem))
    start_ms = getattr(record, "start_ms", None)
    end_ms = getattr(record, "end_ms", None)
    if start_ms is not None and end_ms is not None:
        parts.append(f"{start_ms}-{end_ms}ms")
    return ":".join(parts)


def _provenance(record: object, excluded: set[str]) -> Mapping[str, Any]:
    if not hasattr(record, "model_dump"):
        return {}
    payload = record.model_dump(mode="json")  # type: ignore[attr-defined]
    return {key: value for key, value in payload.items() if key not in excluded}


def _feature_mapping(record: object) -> Mapping[str, Any]:
    namespace = str(getattr(record, "namespace", "feature"))
    name = str(getattr(record, "feature_name", "value"))
    return {
        "feature_key": _evidence_key(record, f"{namespace}.{name}"),
        "value": getattr(record, "value"),
        "unit": getattr(record, "unit", None),
        "confidence": getattr(record, "confidence", None),
        "scope": getattr(getattr(record, "scope", None), "value", getattr(record, "scope", None)),
        "start_ms": getattr(record, "start_ms", None),
        "end_ms": getattr(record, "end_ms", None),
        "stem": getattr(record, "stem", None),
        "extractor_name": getattr(record, "extractor_name", None),
        "extractor_version": getattr(record, "extractor_version", None),
        "provenance": _provenance(
            record,
            {"namespace", "feature_name", "value", "unit", "confidence"},
        ),
    }


def _embedding_mapping(record: object) -> Mapping[str, Any]:
    role = getattr(record, "role", "embedding")
    role = getattr(role, "value", role)
    return {
        "embedding_key": _evidence_key(record, str(role)),
        "embedding": getattr(record, "vector"),
        "dimensions": getattr(record, "dimension", None),
        "model_name": getattr(record, "model_name", None)
        or getattr(record, "extractor_name", None),
        "model_version": getattr(record, "model_version", None)
        or getattr(record, "extractor_version", None),
        "scope": getattr(getattr(record, "scope", None), "value", getattr(record, "scope", None)),
        "start_ms": getattr(record, "start_ms", None),
        "end_ms": getattr(record, "end_ms", None),
        "stem": getattr(record, "stem", None),
        "pooling_strategy": getattr(record, "pooling_strategy", None),
        "provenance": _provenance(
            record,
            {"role", "vector", "dimension", "pooling_strategy"},
        ),
    }


def main() -> None:
    """Process a finite local batch in a separate OS process."""

    from . import db
    from .repository import Repository
    from .runtime import (
        ensure_local_fast_manifest,
        local_fast_registry,
        resolve_manifest_record,
    )
    from .settings import Settings

    parser = ArgumentParser(description="Run Crate Dig local audio analysis")
    parser.add_argument("--run-id")
    parser.add_argument("--max-stages", type=int, default=10_000)
    args = parser.parse_args()

    settings = Settings.from_env()
    repository = Repository(db.connect(settings.sqlite_path))
    ensure_local_fast_manifest(repository)
    executor = EngineV2StageExecutor(
        lambda manifest_id: resolve_manifest_record(repository, manifest_id),
        local_fast_registry(),
    )
    AnalysisWorker(repository, executor).run(
        max_stages=args.max_stages,
        run_id=args.run_id,
    )


__all__ = ["AnalysisWorker", "EngineV2StageExecutor", "main"]
