from __future__ import annotations

import numpy as np

from cratedig_engine.audio.excerpt import core_excerpt
from cratedig_engine.audio.windows import (
    FULL_OVERLAP_V1,
    LEGACY_CLAP,
    LEGACY_ESSENTIA,
    LEGACY_LIBROSA,
    SAMPLED_V1,
    WindowPlan,
    get_window_plan,
)
import pytest


def _bounds(plan, seconds: int, sample_rate: int = 10):
    return [
        (window.start_frame, window.end_frame)
        for window in plan.windows(seconds * sample_rate, sample_rate)
    ]


def test_legacy_central_plans_match_core_excerpt_sample_exactly():
    sample_rate = 10
    source = np.arange(200 * sample_rate, dtype=np.float32)

    for plan, max_sec in ((LEGACY_LIBROSA, 120.0), (LEGACY_ESSENTIA, 90.0)):
        [(window, selected)] = plan.apply(source, sample_rate)
        expected = core_excerpt(source, sample_rate, max_sec=max_sec)
        np.testing.assert_array_equal(selected, expected)
        assert window.start_sec > 0
        assert window.end_sec < 200


def test_legacy_clap_reproduces_cored_even_window_behavior():
    # 200 s -> central 120 s core at 40..160 s, then 10 s windows at its
    # beginning, midpoint, and end.
    assert _bounds(LEGACY_CLAP, 200) == [(400, 500), (950, 1050), (1500, 1600)]
    # Legacy CLAP chose only one 10 s window for a post-core signal <20 s.
    assert _bounds(LEGACY_CLAP, 15) == [(0, 100)]


def test_sampled_v1_is_three_source_representative_windows():
    windows = SAMPLED_V1.windows(frame_count=40 * 10, sample_rate=10)
    assert [(w.start_sec, w.end_sec) for w in windows] == [
        (0.0, 10.0),
        (15.0, 25.0),
        (30.0, 40.0),
    ]
    assert [w.index for w in windows] == [0, 1, 2]
    assert [(w.start_ms, w.end_ms) for w in windows] == [
        (0, 10_000),
        (15_000, 25_000),
        (30_000, 40_000),
    ]
    assert SAMPLED_V1.windows(400, 10) == windows


def test_short_tracks_have_one_deterministic_truncated_window():
    for plan in (LEGACY_CLAP, SAMPLED_V1, FULL_OVERLAP_V1):
        windows = plan.windows(frame_count=73, sample_rate=10)
        assert len(windows) == 1
        assert windows[0].start_frame == 0
        assert windows[0].end_frame == 73
        assert windows[0].duration_sec == 7.3


def test_full_overlap_uses_five_second_hop_and_covers_final_boundary():
    assert _bounds(FULL_OVERLAP_V1, 23) == [
        (0, 100),
        (50, 150),
        (100, 200),
        (130, 230),
    ]
    assert FULL_OVERLAP_V1.hop_sec == 5.0
    assert FULL_OVERLAP_V1.boundary_policy == "cover-end"


def test_versions_are_explicit_and_queryable():
    plans = (
        LEGACY_LIBROSA,
        LEGACY_ESSENTIA,
        LEGACY_CLAP,
        SAMPLED_V1,
        FULL_OVERLAP_V1,
    )
    assert len({plan.version for plan in plans}) == len(plans)
    for plan in plans:
        assert get_window_plan(plan.version) is plan


def test_window_plan_rejects_incomplete_or_ambiguous_strategy_configuration():
    with pytest.raises(ValueError, match="even plans require"):
        WindowPlan(
            name="bad-even",
            version="bad-even-v1",
            strategy="even",
            window_sec=10,
        )
    with pytest.raises(ValueError, match="central plans do not accept"):
        WindowPlan(
            name="bad-central",
            version="bad-central-v1",
            strategy="central",
            window_sec=10,
        )
