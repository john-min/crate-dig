from __future__ import annotations

import math
import struct
import wave
from dataclasses import dataclass

from cratedig_engine.audio.decode import DecodedAudio
from cratedig_engine.audio.windows import SAMPLED_V1
from cratedig_engine.extractors.registry import ExtractorRegistry
from cratedig_engine.pipeline.cache import ExtractorCache, ExtractorCacheStatus
from cratedig_engine.pipeline.extract import (
    ExtractionSkipped,
    extract_all,
    extract_manifest_file,
)
from cratedig_engine.records import (
    ChannelPolicy,
    ExtractorSpec,
    FeatureBundle,
    FeatureScope,
    ModelSetManifest,
)


@dataclass(frozen=True)
class FakeAudio:
    source_hash: str = "a" * 64


@dataclass(frozen=True)
class FakeWindowPlan:
    version: str = "windows-v1"


def make_spec(name: str) -> ExtractorSpec:
    return ExtractorSpec(
        name=name,
        version="1",
        required_sample_rate_hz=48_000,
        channel_policy=ChannelPolicy.MONO,
        supported_scopes=frozenset({FeatureScope.TRACK}),
        configuration_version="config-1",
        configuration_sha256=("c" * 64),
    )


class RaisingExtractor:
    spec = make_spec("failure")

    def __init__(self) -> None:
        self.calls = 0

    def extract(self, audio: FakeAudio, window_plan: FakeWindowPlan) -> FeatureBundle:
        self.calls += 1
        raise RuntimeError("isolated failure")


class SuccessfulExtractor:
    spec = make_spec("success")

    def __init__(self) -> None:
        self.calls = 0

    def extract(self, audio: FakeAudio, window_plan: FakeWindowPlan) -> FeatureBundle:
        self.calls += 1
        return FeatureBundle(
            audio_content_hash=audio.source_hash,
            extractor_spec=self.spec,
            window_plan_version=window_plan.version,
        )


class SharedViewExtractor(SuccessfulExtractor):
    def __init__(self, name: str, sample_rate: int) -> None:
        super().__init__()
        self.spec = make_spec(name).model_copy(
            update={"required_sample_rate_hz": sample_rate}
        )

    def extract(self, audio, window_plan) -> FeatureBundle:
        audio.view(self.spec.required_sample_rate_hz, "mono")
        return super().extract(audio, window_plan)


class SkippingExtractor:
    spec = make_spec("skip")

    def extract(self, audio: FakeAudio, window_plan: FakeWindowPlan) -> FeatureBundle:
        raise ExtractionSkipped("unsupported duration")


def test_one_extractor_failure_does_not_block_later_extractors_and_order_is_stable(
    tmp_path,
):
    failed = RaisingExtractor()
    succeeded = SuccessfulExtractor()
    cache = ExtractorCache(tmp_path / "extractors.jsonl")

    outcomes = extract_all(
        FakeAudio(), FakeWindowPlan(), [failed, succeeded], cache
    )

    assert [outcome.extractor_spec.name for outcome in outcomes] == [
        "failure",
        "success",
    ]
    assert [outcome.status for outcome in outcomes] == [
        ExtractorCacheStatus.FAILED,
        ExtractorCacheStatus.SUCCEEDED,
    ]
    assert outcomes[0].failure_code == "RuntimeError"
    assert outcomes[1].bundle is not None
    assert failed.calls == 1
    assert succeeded.calls == 1

    cached = extract_all(
        FakeAudio(), FakeWindowPlan(), [succeeded, failed], cache
    )
    assert [outcome.extractor_spec.name for outcome in cached] == [
        "success",
        "failure",
    ]
    assert all(outcome.cache_hit for outcome in cached)
    assert failed.calls == 1
    assert succeeded.calls == 1


def test_skipped_extractor_is_a_sticky_independent_terminal_outcome(tmp_path):
    cache = ExtractorCache(tmp_path / "extractors.jsonl")
    skipping = SkippingExtractor()
    success = SuccessfulExtractor()

    first = extract_all(FakeAudio(), FakeWindowPlan(), [skipping, success], cache)
    second = extract_all(FakeAudio(), FakeWindowPlan(), [skipping, success], cache)

    assert first[0].status is ExtractorCacheStatus.SKIPPED
    assert first[0].failure_reason == "unsupported duration"
    assert first[1].status is ExtractorCacheStatus.SUCCEEDED
    assert second[0].cache_hit is True
    assert second[1].cache_hit is True


def test_two_extractors_share_one_decoded_audio_instance(tmp_path, monkeypatch):
    import soundfile as sf

    path = tmp_path / "shared.wav"
    sample_rate = 8_000
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(
            b"".join(
                struct.pack(
                    "<h",
                    int(12_000 * math.sin(2 * math.pi * 220 * i / sample_rate)),
                )
                for i in range(sample_rate)
            )
        )

    real_read = sf.read
    decode_calls = 0

    def counted_read(*args, **kwargs):
        nonlocal decode_calls
        decode_calls += 1
        return real_read(*args, **kwargs)

    monkeypatch.setattr(sf, "read", counted_read)
    audio = DecodedAudio.from_file(path)
    outcomes = extract_all(
        audio,
        FakeWindowPlan(),
        [
            SharedViewExtractor("view-8k", 8_000),
            SharedViewExtractor("view-4k", 4_000),
        ],
    )

    assert decode_calls == 1
    assert all(outcome.status is ExtractorCacheStatus.SUCCEEDED for outcome in outcomes)


def test_extractors_can_use_different_declared_window_plans():
    first = SuccessfulExtractor()
    second = SuccessfulExtractor()
    second.spec = make_spec("second")
    plans = {
        first.spec.identity: FakeWindowPlan("windows-a-v1"),
        second.spec.identity: FakeWindowPlan("windows-b-v1"),
    }

    outcomes = extract_all(FakeAudio(), plans, [first, second])

    assert [outcome.bundle.window_plan_version for outcome in outcomes] == [
        "windows-a-v1",
        "windows-b-v1",
    ]


def test_manifest_entrypoint_resolves_extractors_and_decodes_once(
    tmp_path, monkeypatch
):
    import soundfile as sf

    path = tmp_path / "manifest.wav"
    sample_rate = 8_000
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(struct.pack("<h", 0) * sample_rate)

    first = SharedViewExtractor("first", 8_000)
    second = SharedViewExtractor("second", 4_000)
    manifest = ModelSetManifest(
        name="runtime",
        version="1",
        required_extractors=(first.spec, second.spec),
        window_plan_version=SAMPLED_V1.version,
        pooling_configuration_version="pool-v1",
        component_normalization_version="norm-v1",
        component_weighting_version="weights-v1",
    )
    real_read = sf.read
    decode_calls = 0

    def counted_read(*args, **kwargs):
        nonlocal decode_calls
        decode_calls += 1
        return real_read(*args, **kwargs)

    monkeypatch.setattr(sf, "read", counted_read)
    outcomes = extract_manifest_file(
        path,
        manifest,
        ExtractorRegistry([first, second]),
    )

    assert decode_calls == 1
    assert [outcome.extractor_spec.name for outcome in outcomes] == [
        "first",
        "second",
    ]
    assert all(outcome.succeeded for outcome in outcomes)
    assert all(
        outcome.bundle.window_plan_version == SAMPLED_V1.version
        for outcome in outcomes
    )
