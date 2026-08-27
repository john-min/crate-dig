"""Stable audio-backend interface.

Backends return embeddings + features. The analysis pipeline owns status,
hashes, versions, and cache records (`AnalysisResult`).
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from cratedig_engine.schemas import BackendOutput


@runtime_checkable
class AudioBackend(Protocol):
    name: str
    model_version: str

    def analyze(self, audio_path: str) -> BackendOutput: ...
