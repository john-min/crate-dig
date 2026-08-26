from __future__ import annotations

from dataclasses import dataclass

import pytest
from pydantic import ValidationError

from cratedig_engine.pipeline.cache import (
    CacheCorruptionError,
    ExtractorCache,
    ExtractorCacheEntry,
    ExtractorCacheStatus,
)
from cratedig_engine.pipeline.extract import (
    AnalysisCancelled,
    EvidenceValidationError,
    ExtractionOutcome,
    RetryPolicy,
    extract_all,
    summarize_manifest_execution,
)
from cratedig_engine.records import (
    ChannelPolicy,
    ExtractorSpec,
    FeatureBundle,
    FeatureScope,
    ModelSetManifest,
)


AUDIO_HASH = "a" * 64
CONFIG_HASH = "c" * 64


@dataclass(frozen=True)
class FakeAudio:
    source_hash: str = AUDIO_HASH


@dataclass(frozen=True)
class FakeWindowPlan:
    version: str = "windows-v1"


def make_spec(name: str, *, version: str = "1") -> ExtractorSpec:
    return ExtractorSpec(
        name=name,
        version=version,
        required_sample_rate_hz=48_000,
        channel_policy=ChannelPolicy.MONO,
        supported_scopes=frozenset({FeatureScope.TRACK}),
        configuration_version="config-v1",
        configuration_sha256=CONFIG_HASH,
        default_window_plan_version="windows-v1",
    )


def make_manifest(
    required: tuple[ExtractorSpec, ...], optional: tuple[ExtractorSpec, ...] = ()
) -> ModelSetManifest:
    return ModelSetManifest(
        name="deep",
        version="1",
        required_extractors=required,
        optional_extractors=optional,
        window_plan_version="windows-v1",
        pooling_configuration_version="pool-v1",
        component_normalization_version="norm-v1",
        component_weighting_version="weight-v1",
    )


class ScriptedExtractor:
    def __init__(self, name: str, failures: list[BaseException] | None = None) -> None:
        self.spec = make_spec(name)
        self.failures = list(failures or [])
        self.calls = 0

    def extract(self, audio: FakeAudio, window_plan: FakeWindowPlan) -> FeatureBundle:
        self.calls += 1
        if self.failures:
            raise self.failures.pop(0)
        return FeatureBundle(
            audio_content_hash=audio.source_hash,
            extractor_spec=self.spec,
            window_plan_version=window_plan.version,
        )


def test_transient_retries_are_bounded_and_attempts_are_persisted(tmp_path):
    cache = ExtractorCache(tmp_path / "extractors.jsonl")
    succeeds = ScriptedExtractor(
        "transient-success",
        failures=[TimeoutError("cold model"), OSError("device busy")],
    )
    exhausted = ScriptedExtractor(
        "transient-failure",
        failures=[TimeoutError("one"), TimeoutError("two"), TimeoutError("three")],
    )

    success, failure = extract_all(
        FakeAudio(),
        FakeWindowPlan(),
        [succeeds, exhausted],
        cache,
        retry_policy=RetryPolicy(max_attempts=3),
    )

    assert success.succeeded is True
    assert success.attempt_count == 3
    assert failure.status is ExtractorCacheStatus.FAILED
    assert failure.failure_retryable is True
    assert failure.attempt_count == 3
    assert succeeds.calls == 3
    assert exhausted.calls == 3

    reloaded = ExtractorCache(tmp_path / "extractors.jsonl")
    cached = extract_all(
        FakeAudio(), FakeWindowPlan(), [succeeds, exhausted], reloaded
    )
    assert [item.attempt_count for item in cached] == [3, 3]
    assert all(item.cache_hit for item in cached)


def test_permanent_failure_is_not_automatically_retried():
    extractor = ScriptedExtractor("permanent", failures=[RuntimeError("bad weights")])

    outcome = extract_all(
        FakeAudio(),
        FakeWindowPlan(),
        [extractor],
        retry_policy=RetryPolicy(max_attempts=5),
    )[0]

    assert outcome.status is ExtractorCacheStatus.FAILED
    assert outcome.failure_retryable is False
    assert outcome.attempt_count == 1
    assert extractor.calls == 1


def test_cancellation_preserves_completed_cache_and_resume_continues(tmp_path):
    cache_path = tmp_path / "extractors.jsonl"
    cache = ExtractorCache(cache_path)
    first = ScriptedExtractor("first")
    second = ScriptedExtractor("second")

    with pytest.raises(AnalysisCancelled):
        extract_all(
            FakeAudio(),
            FakeWindowPlan(),
            [first, second],
            cache,
            cancel_check=lambda: first.calls == 1,
        )

    assert first.calls == 1
    assert second.calls == 0
    assert cache.line_count() == 1

    resumed = extract_all(
        FakeAudio(),
        FakeWindowPlan(),
        [first, second],
        ExtractorCache(cache_path),
    )
    assert resumed[0].cache_hit is True
    assert resumed[1].cache_hit is False
    assert first.calls == 1
    assert second.calls == 1


def test_extractor_cancellation_is_not_converted_to_sticky_failure(tmp_path):
    cache = ExtractorCache(tmp_path / "extractors.jsonl")
    extractor = ScriptedExtractor("cancelled", failures=[AnalysisCancelled("stop")])

    with pytest.raises(AnalysisCancelled, match="stop"):
        extract_all(FakeAudio(), FakeWindowPlan(), [extractor], cache)

    assert cache.line_count() == 0


def test_completed_malformed_cache_record_fails_closed(tmp_path):
    path = tmp_path / "extractors.jsonl"
    path.write_text('{"valid_json_but_wrong_schema":true}\n', encoding="utf-8")

    with pytest.raises(CacheCorruptionError, match="line 1"):
        ExtractorCache(path)


def test_terminal_failure_evidence_requires_code_and_reason():
    with pytest.raises(ValidationError, match="failure_code"):
        ExtractorCacheEntry(
            audio_content_hash=AUDIO_HASH,
            extractor_spec=make_spec("broken"),
            window_plan_version="windows-v1",
            status=ExtractorCacheStatus.FAILED,
        )


def test_manifest_digest_and_completion_summary_are_reproducible():
    required = make_spec("required")
    optional = make_spec("optional")
    manifest = make_manifest((required,), (optional,))
    equivalent = ModelSetManifest.model_validate(manifest.model_dump())
    changed = manifest.model_copy(update={"component_weighting_version": "weight-v2"})
    bundle = FeatureBundle(
        audio_content_hash=AUDIO_HASH,
        extractor_spec=required,
        window_plan_version="windows-v1",
    )

    summary = summarize_manifest_execution(
        manifest,
        [
            ExtractionOutcome(
                extractor_spec=required,
                status=ExtractorCacheStatus.SUCCEEDED,
                bundle=bundle,
                cache_hit=True,
                attempt_count=2,
            )
        ],
    )

    assert manifest.manifest_sha256 == equivalent.manifest_sha256
    assert manifest.manifest_sha256 != changed.manifest_sha256
    assert summary.manifest_sha256 == manifest.manifest_sha256
    assert summary.completion_status == "ready_deep"
    assert summary.optional_unavailable == (("optional", "1"),)
    assert summary.cache_hits == 1
    assert summary.total_attempts == 2


def test_manifest_summary_rejects_missing_required_or_mismatched_evidence():
    required = make_spec("required")
    manifest = make_manifest((required,))

    with pytest.raises(EvidenceValidationError, match="missing required"):
        summarize_manifest_execution(manifest, [])

    changed_spec = make_spec("required", version="2")
    with pytest.raises(EvidenceValidationError, match="not declared"):
        summarize_manifest_execution(
            manifest,
            [
                ExtractionOutcome(
                    extractor_spec=changed_spec,
                    status=ExtractorCacheStatus.FAILED,
                    failure_code="RuntimeError",
                    failure_reason="bad",
                )
            ],
        )
