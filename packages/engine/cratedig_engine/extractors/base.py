"""Engine v2 extractor interface."""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol, runtime_checkable

from cratedig_engine.records import ExtractorSpec, FeatureBundle

if TYPE_CHECKING:
    from cratedig_engine.audio.decode import DecodedAudio
    from cratedig_engine.audio.windows import WindowPlan


@runtime_checkable
class Extractor(Protocol):
    """An independently versioned producer of canonical feature records.

    Implementations receive the shared decoded-audio substrate; they must not
    reopen the source file.  The window plan is an explicit input so callers
    can cache and compare windowing strategies independently.
    """

    @property
    def spec(self) -> ExtractorSpec: ...

    def extract(
        self, audio: DecodedAudio, window_plan: WindowPlan
    ) -> FeatureBundle: ...


__all__ = ["Extractor"]
