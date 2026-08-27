"""Representative excerpt: focus on a track's core, not its intro/outro.

Extended DJ edits have long mix-in / mix-out sections that do not represent
the track. We trim the outer edges and keep a central, content-dense window.
"""

from __future__ import annotations

import numpy as np


def core_excerpt(
    y: np.ndarray,
    sr: int,
    max_sec: float = 90.0,
    edge_skip: float = 0.15,
) -> np.ndarray:
    """Return the central section of a track, dropping intro/outro edges.

    edge_skip: fraction trimmed from each end (0.15 -> drop first and last 15%).
    max_sec: cap the analyzed length, centered, to bound compute.
    Falls back to the whole signal for short tracks.
    """
    n = len(y)
    if n == 0:
        return y
    a = int(n * edge_skip)
    b = n - a
    if b - a < sr * 20:
        a, b = 0, n
    core = y[a:b]
    cap = int(max_sec * sr)
    if len(core) > cap:
        s = (len(core) - cap) // 2
        core = core[s : s + cap]
    return core
