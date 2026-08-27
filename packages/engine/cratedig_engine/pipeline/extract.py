"""Independent orchestration for Engine v2 extractors."""

from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from os import PathLike
from pathlib import Path

from cratedig_engine.audio.decode import DecodedAudio
from cratedig_engine.audio.windows import WindowPlan, get_window_plan
from cratedig_engine.extractors.base import Extractor
from cratedig_engine.extractors.registry import ExtractorRegistry
from cratedig_engine.pipeline.cache import (
    ExtractorCache,
    ExtractorCacheEntry,
    ExtractorCacheStatus,
)
from cratedig_engine.records import ExtractorSpec, FeatureBundle, ModelSetManifest


WindowPlanKey = tuple[str, str] | str
WindowPlanSelection = WindowPlan | Mapping[WindowPlanKey, WindowPlan]


class ExtractionSkipped(Exception):
    """Signal that an extractor intentionally produced no evidence."""


class AnalysisCancelled(Exception):
    """Cooperative cancellation that leaves completed stage caches reusable."""


class EvidenceValidationError(ValueError):
    """Persisted outcomes do not satisfy the active manifest contract."""


@dataclass(frozen=True, slots=True)
class RetryPolicy:
    """Bounded retry policy for failures classified as transient.

    ``max_attempts`` includes the first call.  Retries occur in-process and do
    not add sleep/backoff; queue-level scheduling can add delayed retries while
    this contract guarantees that an engine invocation always terminates.
    """

    max_attempts: int = 1
    retryable_exceptions: tuple[type[BaseException], ...] = (
        TimeoutError,
        ConnectionError,
        OSError,
    )

    def __post_init__(self) -> None:
        if self.max_attempts < 1:
            raise ValueError("max_attempts must be at least 1")

    def is_retryable(self, error: BaseException) -> bool:
        return isinstance(error, self.retryable_exceptions)


@dataclass(frozen=True, slots=True)
class ExtractionOutcome:
    """Terminal result for one extractor, in the caller's requested order."""

    extractor_spec: ExtractorSpec
    status: ExtractorCacheStatus
    bundle: FeatureBundle | None = None
    failure_code: str | None = None
    failure_reason: str | None = None
    cache_hit: bool = False
    attempt_count: int = 1
    failure_retryable: bool = False

    @property
    def succeeded(self) -> bool:
        return self.status is ExtractorCacheStatus.SUCCEEDED


@dataclass(frozen=True, slots=True)
class ManifestExecutionSummary:
    """Validated completion evidence for one manifest execution."""

    manifest_name: str
    manifest_version: str
    manifest_sha256: str
    completion_status: str
    required_succeeded: tuple[tuple[str, str], ...]
    required_failed: tuple[tuple[str, str], ...]
    optional_succeeded: tuple[tuple[str, str], ...]
    optional_failed: tuple[tuple[str, str], ...]
    optional_unavailable: tuple[tuple[str, str], ...]
    cache_hits: int
    total_attempts: int


def extract_all(
    audio: DecodedAudio,
    window_plan: WindowPlanSelection,
    extractors: Iterable[Extractor],
    cache: ExtractorCache | None = None,
    *,
    retry_failed: bool = False,
    overwrite: bool = False,
    retry_policy: RetryPolicy | None = None,
    cancel_check: Callable[[], bool] | None = None,
) -> tuple[ExtractionOutcome, ...]:
    """Run resolved extractors independently over one decoded audio object.

    ``retry_failed`` reopens cached failed/skipped stages but continues to reuse
    successes. ``overwrite`` explicitly recomputes every stage. Exceptions are
    converted into per-extractor failures so later extractors still run.
    """

    policy = retry_policy or RetryPolicy()
    outcomes: list[ExtractionOutcome] = []
    for extractor in extractors:
        _raise_if_cancelled(cancel_check)
        spec = extractor.spec
        selected_plan = _select_window_plan(spec, window_plan)
        cached = None
        if cache is not None and not overwrite:
            cached = cache.get(
                audio.source_hash,
                spec,
                window_plan_version=selected_plan.version,
                retry=retry_failed,
            )
        if cached is not None:
            outcomes.append(_outcome_from_entry(cached, cache_hit=True))
            continue

        attempt_count = 0
        while True:
            _raise_if_cancelled(cancel_check)
            attempt_count += 1
            try:
                bundle = extractor.extract(audio, selected_plan)
                _validate_bundle(bundle, audio.source_hash, spec, selected_plan.version)
                entry = ExtractorCacheEntry(
                    audio_content_hash=audio.source_hash,
                    extractor_spec=spec,
                    window_plan_version=selected_plan.version,
                    status=ExtractorCacheStatus.SUCCEEDED,
                    bundle=bundle,
                    attempt_count=attempt_count,
                )
                break
            except AnalysisCancelled:
                raise
            except ExtractionSkipped as exc:
                entry = ExtractorCacheEntry(
                    audio_content_hash=audio.source_hash,
                    extractor_spec=spec,
                    window_plan_version=selected_plan.version,
                    status=ExtractorCacheStatus.SKIPPED,
                    failure_code="skipped",
                    failure_reason=_safe_failure_reason(exc, "extractor skipped"),
                    attempt_count=attempt_count,
                )
                break
            except Exception as exc:
                retryable = policy.is_retryable(exc)
                if retryable and attempt_count < policy.max_attempts:
                    continue
                entry = ExtractorCacheEntry(
                    audio_content_hash=audio.source_hash,
                    extractor_spec=spec,
                    window_plan_version=selected_plan.version,
                    status=ExtractorCacheStatus.FAILED,
                    failure_code=type(exc).__name__,
                    failure_reason=_safe_failure_reason(exc, type(exc).__name__),
                    attempt_count=attempt_count,
                    failure_retryable=retryable,
                )
                break

        if cache is not None:
            entry = cache.put(
                entry,
                overwrite=overwrite or retry_failed,
            )
        outcomes.append(_outcome_from_entry(entry, cache_hit=False))
    return tuple(outcomes)


def extract_file(
    path: str | PathLike[str],
    window_plan: WindowPlanSelection,
    extractors: Iterable[Extractor],
    cache: ExtractorCache | None = None,
    *,
    retry_failed: bool = False,
    overwrite: bool = False,
    retry_policy: RetryPolicy | None = None,
    cancel_check: Callable[[], bool] | None = None,
) -> tuple[ExtractionOutcome, ...]:
    """Decode one source file and run every extractor over the shared audio."""

    audio = DecodedAudio.from_file(Path(path))
    return extract_all(
        audio,
        window_plan,
        extractors,
        cache,
        retry_failed=retry_failed,
        overwrite=overwrite,
        retry_policy=retry_policy,
        cancel_check=cancel_check,
    )


def extract_manifest_file(
    path: str | PathLike[str],
    manifest: ModelSetManifest,
    registry: ExtractorRegistry,
    cache: ExtractorCache | None = None,
    *,
    window_plans: Mapping[WindowPlanKey, WindowPlan] | None = None,
    retry_failed: bool = False,
    overwrite: bool = False,
    retry_policy: RetryPolicy | None = None,
    cancel_check: Callable[[], bool] | None = None,
) -> tuple[ExtractionOutcome, ...]:
    """Resolve a reproducible manifest and analyze a file with one decode.

    An explicit per-extractor plan wins. Otherwise the extractor's declared
    default is used, falling back to the manifest-wide plan. Every selected
    version must resolve to a built-in plan unless the caller supplies it.
    """

    extractors = registry.resolve(manifest)
    selected: dict[WindowPlanKey, WindowPlan] = dict(window_plans or {})
    for extractor in extractors:
        identity = extractor.spec.identity
        if identity in selected or extractor.spec.name in selected:
            continue
        plan_version = (
            extractor.spec.default_window_plan_version
            or manifest.window_plan_version
        )
        selected[identity] = get_window_plan(plan_version)
    outcomes = extract_file(
        path,
        selected,
        extractors,
        cache,
        retry_failed=retry_failed,
        overwrite=overwrite,
        retry_policy=retry_policy,
        cancel_check=cancel_check,
    )
    # Fail closed if orchestration ever emits evidence inconsistent with the
    # manifest. Callers still receive the stable tuple API; the validated
    # summary can be persisted separately through ``summarize_manifest_execution``.
    summarize_manifest_execution(manifest, outcomes)
    return outcomes


def _select_window_plan(
    spec: ExtractorSpec, selection: WindowPlanSelection
) -> WindowPlan:
    if not isinstance(selection, Mapping):
        return selection
    plan = selection.get(spec.identity) or selection.get(spec.name)
    if plan is None:
        raise ValueError(
            f"no window plan supplied for extractor {spec.name}@{spec.version}"
        )
    return plan


def _validate_bundle(
    bundle: FeatureBundle,
    audio_content_hash: str,
    extractor_spec: ExtractorSpec,
    window_plan_version: str,
) -> None:
    if not isinstance(bundle, FeatureBundle):
        raise TypeError("extractor must return a FeatureBundle")
    if bundle.audio_content_hash != audio_content_hash:
        raise ValueError("extractor returned a bundle for different audio content")
    if bundle.extractor_spec != extractor_spec:
        raise ValueError("extractor returned a bundle with a different specification")
    if bundle.window_plan_version != window_plan_version:
        raise ValueError("extractor returned a bundle for a different window plan")


def _outcome_from_entry(
    entry: ExtractorCacheEntry, *, cache_hit: bool
) -> ExtractionOutcome:
    return ExtractionOutcome(
        extractor_spec=entry.extractor_spec,
        status=entry.status,
        bundle=entry.bundle,
        failure_code=entry.failure_code,
        failure_reason=entry.failure_reason,
        cache_hit=cache_hit,
        attempt_count=entry.attempt_count,
        failure_retryable=entry.failure_retryable,
    )


def _raise_if_cancelled(cancel_check: Callable[[], bool] | None) -> None:
    if cancel_check is not None and cancel_check():
        raise AnalysisCancelled("analysis cancelled")


def _safe_failure_reason(error: BaseException, fallback: str) -> str:
    """Return bounded single-line diagnostic text suitable for durable evidence."""

    reason = " ".join(str(error).split()) or fallback
    return reason[:2_000]


def summarize_manifest_execution(
    manifest: ModelSetManifest,
    outcomes: Iterable[ExtractionOutcome],
) -> ManifestExecutionSummary:
    """Validate outcomes against a manifest and compute completion state.

    Missing required evidence and duplicate/unexpected outcomes are rejected
    rather than silently producing a misleading ``ready`` state.  Missing
    optional extractors are recorded but do not block readiness.
    """

    outcome_list = tuple(outcomes)
    by_identity: dict[tuple[str, str], ExtractionOutcome] = {}
    declared = {spec.identity for spec in manifest.extractors}
    for outcome in outcome_list:
        identity = outcome.extractor_spec.identity
        if identity not in declared:
            raise EvidenceValidationError(
                f"outcome {identity[0]}@{identity[1]} is not declared by manifest"
            )
        if identity in by_identity:
            raise EvidenceValidationError(
                f"duplicate outcome for {identity[0]}@{identity[1]}"
            )
        expected = next(
            spec for spec in manifest.extractors if spec.identity == identity
        )
        if outcome.extractor_spec != expected:
            raise EvidenceValidationError(
                f"outcome specification mismatch for {identity[0]}@{identity[1]}"
            )
        if outcome.succeeded and outcome.bundle is None:
            raise EvidenceValidationError(
                f"successful outcome {identity[0]}@{identity[1]} has no bundle"
            )
        by_identity[identity] = outcome

    required_ids = tuple(spec.identity for spec in manifest.required_extractors)
    optional_ids = tuple(spec.identity for spec in manifest.optional_extractors)
    missing_required = tuple(
        identity for identity in required_ids if identity not in by_identity
    )
    if missing_required:
        names = ", ".join(f"{name}@{version}" for name, version in missing_required)
        raise EvidenceValidationError(f"missing required extractor outcomes: {names}")

    required_succeeded = tuple(
        identity for identity in required_ids if by_identity[identity].succeeded
    )
    required_failed = tuple(
        identity for identity in required_ids if not by_identity[identity].succeeded
    )
    optional_succeeded = tuple(
        identity
        for identity in optional_ids
        if identity in by_identity and by_identity[identity].succeeded
    )
    optional_failed = tuple(
        identity
        for identity in optional_ids
        if identity in by_identity and not by_identity[identity].succeeded
    )
    optional_unavailable = tuple(
        identity for identity in optional_ids if identity not in by_identity
    )

    if not required_failed:
        completion_status = "ready_deep"
    elif required_succeeded or optional_succeeded:
        completion_status = "degraded"
    else:
        completion_status = "failed"

    return ManifestExecutionSummary(
        manifest_name=manifest.name,
        manifest_version=manifest.version,
        manifest_sha256=manifest.manifest_sha256,
        completion_status=completion_status,
        required_succeeded=required_succeeded,
        required_failed=required_failed,
        optional_succeeded=optional_succeeded,
        optional_failed=optional_failed,
        optional_unavailable=optional_unavailable,
        cache_hits=sum(outcome.cache_hit for outcome in outcome_list),
        total_attempts=sum(outcome.attempt_count for outcome in outcome_list),
    )


# Readable aliases for callers that phrase this operation around the audio or
# the resulting features. All names preserve the same contract.
extract_audio = extract_all
extract_features = extract_all


__all__ = [
    "ExtractionOutcome",
    "ExtractionSkipped",
    "AnalysisCancelled",
    "EvidenceValidationError",
    "ManifestExecutionSummary",
    "RetryPolicy",
    "extract_all",
    "extract_audio",
    "extract_file",
    "extract_features",
    "extract_manifest_file",
    "summarize_manifest_execution",
]
