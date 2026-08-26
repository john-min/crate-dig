"""Public contracts for Engine v2 feature extractors."""

from cratedig_engine.extractors.base import Extractor
from cratedig_engine.extractors.discogs_effnet import (
    DiscogsEffnetArtifactConfig,
    DiscogsEffnetExtractor,
    DiscogsEffnetRuntime,
    discogs_effnet_extractor_spec,
)
from cratedig_engine.extractors.legacy import LegacyBackendExtractor
from cratedig_engine.extractors.librosa import LibrosaExtractor, librosa_extractor_spec
from cratedig_engine.extractors.registry import (
    AmbiguousExtractorError,
    DuplicateExtractorError,
    ExtractorNotFoundError,
    ExtractorRegistry,
    ExtractorRegistryError,
    ExtractorSpecMismatchError,
)
from cratedig_engine.records import ExtractorSpec

__all__ = [
    "AmbiguousExtractorError",
    "DuplicateExtractorError",
    "DiscogsEffnetArtifactConfig",
    "DiscogsEffnetExtractor",
    "DiscogsEffnetRuntime",
    "Extractor",
    "ExtractorNotFoundError",
    "ExtractorRegistry",
    "ExtractorRegistryError",
    "ExtractorSpecMismatchError",
    "ExtractorSpec",
    "LegacyBackendExtractor",
    "LibrosaExtractor",
    "discogs_effnet_extractor_spec",
    "librosa_extractor_spec",
]
