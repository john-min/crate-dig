from __future__ import annotations

from dataclasses import dataclass

from cratedig_engine.pipeline.cache import ExtractorCache, ExtractorCacheStatus
from cratedig_engine.pipeline.extract import extract_all
from cratedig_engine.records import (
    ChannelPolicy,
    ExtractorSpec,
    FeatureBundle,
    FeatureScope,
)


AUDIO_HASH = "a" * 64
CONFIG_HASH = "c" * 64


@dataclass(frozen=True)
class FakeAudio:
    source_hash: str
    logical_track_id: str


@dataclass(frozen=True)
class FakeWindowPlan:
    version: str


def make_spec(
    *,
    version: str = "1",
    configuration_version: str = "config-1",
    configuration_sha256: str = CONFIG_HASH,
) -> ExtractorSpec:
    return ExtractorSpec(
        name="fake",
        version=version,
        required_sample_rate_hz=48_000,
        channel_policy=ChannelPolicy.MONO,
        supported_scopes=frozenset({FeatureScope.TRACK}),
        configuration_version=configuration_version,
        configuration_sha256=configuration_sha256,
        default_window_plan_version="default-v1",
    )


class FakeExtractor:
    def __init__(self, spec: ExtractorSpec, *, failures: int = 0) -> None:
        self.spec = spec
        self.failures = failures
        self.calls = 0

    def extract(self, audio: FakeAudio, window_plan: FakeWindowPlan) -> FeatureBundle:
        self.calls += 1
        if self.calls <= self.failures:
            raise RuntimeError("model unavailable")
        return FeatureBundle(
            audio_content_hash=audio.source_hash,
            extractor_spec=self.spec,
            window_plan_version=window_plan.version,
        )


def test_identical_content_reuses_cache_across_logical_track_ids(tmp_path):
    cache = ExtractorCache(tmp_path / "extractors.jsonl")
    extractor = FakeExtractor(make_spec())
    plan = FakeWindowPlan("actual-v1")

    first = extract_all(
        FakeAudio(AUDIO_HASH, "track-one"), plan, [extractor], cache
    )[0]
    second = extract_all(
        FakeAudio(AUDIO_HASH, "track-two"), plan, [extractor], cache
    )[0]

    assert first.status is ExtractorCacheStatus.SUCCEEDED
    assert first.cache_hit is False
    assert second.status is ExtractorCacheStatus.SUCCEEDED
    assert second.cache_hit is True
    assert extractor.calls == 1
    assert cache.line_count() == 1


def test_extractor_version_configuration_and_actual_window_invalidate_independently(
    tmp_path,
):
    cache = ExtractorCache(tmp_path / "extractors.jsonl")
    audio = FakeAudio(AUDIO_HASH, "track")
    original = FakeExtractor(make_spec())
    new_version = FakeExtractor(make_spec(version="2"))
    new_config = FakeExtractor(
        make_spec(
            configuration_version="config-2",
            configuration_sha256="d" * 64,
        )
    )

    extract_all(audio, FakeWindowPlan("windows-v1"), [original], cache)
    extract_all(audio, FakeWindowPlan("windows-v1"), [original], cache)
    extract_all(audio, FakeWindowPlan("windows-v1"), [new_version], cache)
    extract_all(audio, FakeWindowPlan("windows-v1"), [new_config], cache)
    extract_all(audio, FakeWindowPlan("windows-v2"), [original], cache)

    assert original.calls == 2
    assert new_version.calls == 1
    assert new_config.calls == 1
    assert cache.line_count() == 4


def test_failures_are_sticky_until_retry_is_explicit(tmp_path):
    path = tmp_path / "extractors.jsonl"
    cache = ExtractorCache(path)
    extractor = FakeExtractor(make_spec(), failures=1)
    audio = FakeAudio(AUDIO_HASH, "track")
    plan = FakeWindowPlan("windows-v1")

    first = extract_all(audio, plan, [extractor], cache)[0]
    sticky = extract_all(audio, plan, [extractor], cache)[0]
    retried = extract_all(
        audio, plan, [extractor], cache, retry_failed=True
    )[0]
    reused = extract_all(audio, plan, [extractor], ExtractorCache(path))[0]

    assert first.status is ExtractorCacheStatus.FAILED
    assert sticky.status is ExtractorCacheStatus.FAILED
    assert sticky.cache_hit is True
    assert retried.status is ExtractorCacheStatus.SUCCEEDED
    assert retried.cache_hit is False
    assert reused.status is ExtractorCacheStatus.SUCCEEDED
    assert reused.cache_hit is True
    assert extractor.calls == 2
    assert cache.line_count() == 2


def test_overwrite_explicitly_recomputes_a_cached_success(tmp_path):
    cache = ExtractorCache(tmp_path / "extractors.jsonl")
    extractor = FakeExtractor(make_spec())
    audio = FakeAudio(AUDIO_HASH, "track")
    plan = FakeWindowPlan("windows-v1")

    extract_all(audio, plan, [extractor], cache)
    overwritten = extract_all(audio, plan, [extractor], cache, overwrite=True)[0]

    assert overwritten.status is ExtractorCacheStatus.SUCCEEDED
    assert overwritten.cache_hit is False
    assert extractor.calls == 2
    assert cache.line_count() == 2


def test_partial_trailing_jsonl_record_is_removed_before_next_append(tmp_path):
    path = tmp_path / "extractors.jsonl"
    cache = ExtractorCache(path)
    extractor = FakeExtractor(make_spec())
    audio = FakeAudio(AUDIO_HASH, "track")
    plan = FakeWindowPlan("windows-v1")
    extract_all(audio, plan, [extractor], cache)

    with open(path, "ab") as fh:
        fh.write(b'{"audio_content_hash":"torn')

    recovered = ExtractorCache(path)
    hit = extract_all(audio, plan, [extractor], recovered)[0]
    extract_all(
        FakeAudio("b" * 64, "other"), plan, [extractor], recovered
    )

    assert hit.cache_hit is True
    assert recovered.line_count() == 2
    # Reload proves the next append did not concatenate onto the torn object.
    assert ExtractorCache(path).line_count() == 2
