"""Backend factory.

Fast mode defaults to librosa. Deep mode defaults to CLAP. Essentia is
experimental and only selected when requested by name.
"""

from __future__ import annotations

from pathlib import Path

from cratedig_engine.backends.base import AudioBackend
from cratedig_engine.schemas import AnalysisMode


def get_backend(
    name: str = "auto",
    *,
    mode: AnalysisMode | str = AnalysisMode.fast,
    models_dir: str | Path | None = None,
) -> AudioBackend:
    mode_value = AnalysisMode(mode) if not isinstance(mode, AnalysisMode) else mode
    requested = (name or "auto").lower()
    if requested == "auto":
        requested = "clap" if mode_value is AnalysisMode.deep else "librosa"

    if requested == "librosa":
        from cratedig_engine.backends.librosa_backend import LibrosaBackend

        return LibrosaBackend()
    if requested == "clap":
        from cratedig_engine.backends.clap_backend import ClapBackend

        return ClapBackend()
    if requested == "essentia":
        from cratedig_engine.backends.essentia_backend import EssentiaBackend

        if models_dir is None:
            raise ValueError("Essentia backend requires models_dir")
        return EssentiaBackend(models_dir)
    raise ValueError(f"unknown backend: {requested}")
