from __future__ import annotations

import numpy as np

from cratedig_engine.audio.excerpt import core_excerpt


def test_empty_signal_passthrough():
    y = np.zeros(0, dtype=np.float32)
    assert core_excerpt(y, sr=22050).size == 0


def test_short_track_keeps_full_signal():
    sr = 22050
    y = np.linspace(0, 1, sr * 10).astype(np.float32)
    out = core_excerpt(y, sr=sr)
    assert out.shape == y.shape


def test_long_track_drops_edges_and_caps_length():
    sr = 1000
    y = np.arange(sr * 200, dtype=np.float32)  # 200 seconds
    out = core_excerpt(y, sr=sr, max_sec=90.0, edge_skip=0.15)
    assert len(out) == 90 * sr
    # Centered inside the trimmed core (15%..85%), not the raw start.
    assert out[0] > y[int(len(y) * 0.15)]
    assert out[-1] < y[int(len(y) * 0.85)]
