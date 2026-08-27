"""Explicit, versioned, deterministic audio window plans."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
from numpy.typing import NDArray

BoundaryPolicy = Literal["legacy-core", "truncate-short", "cover-end"]
WindowStrategy = Literal["central", "even", "overlap"]


@dataclass(frozen=True, slots=True)
class AudioWindow:
    """Queryable source-relative evidence for one audio interval."""

    index: int
    start_frame: int
    end_frame: int
    sample_rate: int

    def __post_init__(self) -> None:
        if self.index < 0:
            raise ValueError("window index must be non-negative")
        if self.sample_rate <= 0:
            raise ValueError("sample_rate must be positive")
        if self.start_frame < 0 or self.end_frame < self.start_frame:
            raise ValueError("invalid window frame boundaries")

    @property
    def start_sec(self) -> float:
        return self.start_frame / self.sample_rate

    @property
    def end_sec(self) -> float:
        return self.end_frame / self.sample_rate

    @property
    def duration_sec(self) -> float:
        return (self.end_frame - self.start_frame) / self.sample_rate

    @property
    def start_ms(self) -> int:
        return round(self.start_frame * 1000 / self.sample_rate)

    @property
    def end_ms(self) -> int:
        return round(self.end_frame * 1000 / self.sample_rate)

    @property
    def frame_count(self) -> int:
        return self.end_frame - self.start_frame

    def slice(self, samples: NDArray[np.floating]) -> NDArray[np.floating]:
        """Slice a mono or frame-major multichannel array by this evidence."""

        if samples.ndim not in (1, 2):
            raise ValueError("samples must be mono or frame-major multichannel audio")
        if len(samples) < self.end_frame:
            raise ValueError("window extends beyond supplied samples")
        return samples[self.start_frame : self.end_frame]


@dataclass(frozen=True, slots=True)
class WindowPlan:
    """Stable manifest describing selection, boundaries, and pooling."""

    name: str
    version: str
    strategy: WindowStrategy
    window_sec: float | None
    hop_sec: float | None = None
    boundary_policy: BoundaryPolicy = "truncate-short"
    pooling: str = "mean"
    count: int | None = None
    edge_skip: float = 0.0
    minimum_core_sec: float = 20.0
    max_core_sec: float | None = None

    def __post_init__(self) -> None:
        if not self.name or not self.version:
            raise ValueError("window plan name and version must be non-empty")
        if self.window_sec is not None and self.window_sec <= 0:
            raise ValueError("window_sec must be positive")
        if self.hop_sec is not None and self.hop_sec <= 0:
            raise ValueError("hop_sec must be positive")
        if self.count is not None and self.count <= 0:
            raise ValueError("count must be positive")
        if not 0.0 <= self.edge_skip < 0.5:
            raise ValueError("edge_skip must be in [0, 0.5)")
        if self.minimum_core_sec <= 0:
            raise ValueError("minimum_core_sec must be positive")
        if self.max_core_sec is not None and self.max_core_sec <= 0:
            raise ValueError("max_core_sec must be positive")
        if self.strategy == "central":
            if self.window_sec is not None or self.hop_sec is not None or self.count is not None:
                raise ValueError("central plans do not accept window, hop, or count")
        elif self.strategy == "even":
            if self.window_sec is None or self.count is None or self.hop_sec is not None:
                raise ValueError("even plans require window_sec/count and no hop")
        elif self.strategy == "overlap":
            if self.window_sec is None or self.hop_sec is None or self.count is not None:
                raise ValueError("overlap plans require window_sec/hop and no count")

    def windows(self, frame_count: int, sample_rate: int) -> tuple[AudioWindow, ...]:
        """Select source-relative windows for an audio view."""

        if frame_count < 0:
            raise ValueError("frame_count must be non-negative")
        if sample_rate <= 0:
            raise ValueError("sample_rate must be positive")
        if frame_count == 0:
            return ()

        core_start, core_end = self._core_bounds(frame_count, sample_rate)
        if self.strategy == "central":
            bounds = ((core_start, core_end),)
        elif self.strategy == "even":
            bounds = self._even_bounds(core_start, core_end, sample_rate)
        elif self.strategy == "overlap":
            bounds = self._overlap_bounds(core_start, core_end, sample_rate)
        else:  # pragma: no cover - protected by the WindowStrategy type
            raise ValueError(f"unsupported window strategy: {self.strategy!r}")

        return tuple(
            AudioWindow(i, start, end, sample_rate)
            for i, (start, end) in enumerate(bounds)
        )

    select = windows

    def apply(
        self, samples: NDArray[np.floating], sample_rate: int
    ) -> tuple[tuple[AudioWindow, NDArray[np.floating]], ...]:
        """Return evidence paired with slices, retaining the evidence records."""

        return tuple(
            (window, window.slice(samples))
            for window in self.windows(len(samples), sample_rate)
        )

    def _core_bounds(self, frame_count: int, sample_rate: int) -> tuple[int, int]:
        if self.edge_skip == 0.0 and self.max_core_sec is None:
            return 0, frame_count

        start = int(frame_count * self.edge_skip)
        end = frame_count - start
        minimum_frames = int(self.minimum_core_sec * sample_rate)
        if end - start < minimum_frames:
            start, end = 0, frame_count

        if self.max_core_sec is not None:
            cap = int(self.max_core_sec * sample_rate)
            if end - start > cap:
                offset = (end - start - cap) // 2
                start += offset
                end = start + cap
        return start, end

    def _even_bounds(
        self, core_start: int, core_end: int, sample_rate: int
    ) -> tuple[tuple[int, int], ...]:
        if self.window_sec is None or self.count is None:
            raise ValueError("even plans require window_sec and count")
        window_frames = int(self.window_sec * sample_rate)
        core_frames = core_end - core_start
        if core_frames <= window_frames:
            return ((core_start, core_end),)

        if self.boundary_policy == "legacy-core":
            selected_count = min(self.count, max(1, core_frames // window_frames))
        else:
            selected_count = self.count

        span = core_frames - window_frames
        if selected_count == 1:
            relative_starts = (0,)
        else:
            # Integer arithmetic is equivalent to positive np.linspace(...).astype(int)
            # while avoiding platform-dependent floating-point rounding.
            relative_starts = tuple(
                (i * span) // (selected_count - 1) for i in range(selected_count)
            )
        starts = tuple(dict.fromkeys(core_start + value for value in relative_starts))
        return tuple((start, start + window_frames) for start in starts)

    def _overlap_bounds(
        self, core_start: int, core_end: int, sample_rate: int
    ) -> tuple[tuple[int, int], ...]:
        if self.window_sec is None or self.hop_sec is None:
            raise ValueError("overlap plans require window_sec and hop_sec")
        window_frames = int(self.window_sec * sample_rate)
        hop_frames = int(self.hop_sec * sample_rate)
        core_frames = core_end - core_start
        if core_frames <= window_frames:
            return ((core_start, core_end),)

        final_start = core_end - window_frames
        starts = list(range(core_start, final_start + 1, hop_frames))
        if starts[-1] != final_start:
            starts.append(final_start)
        return tuple((start, start + window_frames) for start in starts)


LEGACY_LIBROSA = WindowPlan(
    name="legacy-librosa-central",
    version="legacy-librosa-v1",
    strategy="central",
    window_sec=None,
    boundary_policy="legacy-core",
    pooling="whole-window",
    edge_skip=0.15,
    max_core_sec=120.0,
)

LEGACY_ESSENTIA = WindowPlan(
    name="legacy-essentia-central",
    version="legacy-essentia-v1",
    strategy="central",
    window_sec=None,
    boundary_policy="legacy-core",
    pooling="frame-mean",
    edge_skip=0.15,
    max_core_sec=90.0,
)

LEGACY_CLAP = WindowPlan(
    name="legacy-clap-three-window",
    version="legacy-clap-v1",
    strategy="even",
    window_sec=10.0,
    boundary_policy="legacy-core",
    pooling="embedding-mean",
    count=3,
    edge_skip=0.15,
    max_core_sec=120.0,
)

SAMPLED_V1 = WindowPlan(
    name="sampled",
    version="sampled-v1",
    strategy="even",
    window_sec=10.0,
    boundary_policy="truncate-short",
    pooling="embedding-mean",
    count=3,
)

FULL_OVERLAP_V1 = WindowPlan(
    name="full-overlap",
    version="full-overlap-v1",
    strategy="overlap",
    window_sec=10.0,
    hop_sec=5.0,
    boundary_policy="cover-end",
    pooling="embedding-mean",
)

WINDOW_PLANS = {
    plan.version: plan
    for plan in (
        LEGACY_LIBROSA,
        LEGACY_ESSENTIA,
        LEGACY_CLAP,
        SAMPLED_V1,
        FULL_OVERLAP_V1,
    )
}


def get_window_plan(version: str) -> WindowPlan:
    """Resolve a built-in plan by its exact stable version."""

    try:
        return WINDOW_PLANS[version]
    except KeyError as exc:
        raise ValueError(f"unknown window plan version: {version!r}") from exc


__all__ = [
    "AudioWindow",
    "FULL_OVERLAP_V1",
    "LEGACY_CLAP",
    "LEGACY_ESSENTIA",
    "LEGACY_LIBROSA",
    "SAMPLED_V1",
    "WINDOW_PLANS",
    "WindowPlan",
    "get_window_plan",
]
