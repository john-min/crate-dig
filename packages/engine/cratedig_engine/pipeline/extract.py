"""Independent orchestration for Engine v2 extractors."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
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


@dataclass(frozen=True, slots=True)
class ExtractionOutcome:
    """Terminal result for one extractor, in the caller's requested order."""

    extractor_spec: ExtractorSpec
    status: ExtractorCacheStatus
    bundle: FeatureBundle | None = None
    failure_code: str | None = None
    failure_reason: str | None = None
    cache_hit: bool = False

    @property
    def succeeded(self) -> bool:
        return self.status is ExtractorCacheStatus.SUCCEEDED


def extract_all(
    audio: DecodedAudio,
    window_plan: WindowPlanSelection,
    extractors: Iterable[Extractor],
    cache: ExtractorCache | None = None,
    *,
    retry_failed: bool = False,
    overwrite: bool = False,
) -> tuple[ExtractionOutcome, ...]:
    """Run resolved extractors independently over one decoded audio object.

    ``retry_failed`` reopens cached failed/skipped stages but continues to reuse
    successes. ``overwrite`` explicitly recomputes every stage. Exceptions are
    converted into per-extractor failures so later extractors still run.
    """

    outcomes: list[ExtractionOutcome] = []
    for extractor in extractors:
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

        try:
            bundle = extractor.extract(audio, selected_plan)
            _validate_bundle(bundle, audio.source_hash, spec, selected_plan.version)
            entry = ExtractorCacheEntry(
                audio_content_hash=audio.source_hash,
                extractor_spec=spec,
                window_plan_version=selected_plan.version,
                status=ExtractorCacheStatus.SUCCEEDED,
                bundle=bundle,
            )
        except ExtractionSkipped as exc:
            entry = ExtractorCacheEntry(
                audio_content_hash=audio.source_hash,
                extractor_spec=spec,
                window_plan_version=selected_plan.version,
                status=ExtractorCacheStatus.SKIPPED,
                failure_code="skipped",
                failure_reason=str(exc) or "extractor skipped",
            )
        except Exception as exc:
            entry = ExtractorCacheEntry(
                audio_content_hash=audio.source_hash,
                extractor_spec=spec,
                window_plan_version=selected_plan.version,
                status=ExtractorCacheStatus.FAILED,
                failure_code=type(exc).__name__,
                failure_reason=str(exc) or type(exc).__name__,
            )

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
    return extract_file(
        path,
        selected,
        extractors,
        cache,
        retry_failed=retry_failed,
        overwrite=overwrite,
    )


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
    )


# Readable aliases for callers that phrase this operation around the audio or
# the resulting features. All names preserve the same contract.
extract_audio = extract_all
extract_features = extract_all


__all__ = [
    "ExtractionOutcome",
    "ExtractionSkipped",
    "extract_all",
    "extract_audio",
    "extract_file",
    "extract_features",
    "extract_manifest_file",
]
