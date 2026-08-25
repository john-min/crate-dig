"""In-memory registry for independently versioned extractor implementations."""

from __future__ import annotations

from collections.abc import Iterable, Iterator

from cratedig_engine.extractors.base import Extractor
from cratedig_engine.records import ExtractorSpec, ModelSetManifest


class ExtractorRegistryError(ValueError):
    """Base error for invalid or unavailable extractor registrations."""


class DuplicateExtractorError(ExtractorRegistryError):
    pass


class ExtractorNotFoundError(ExtractorRegistryError, LookupError):
    pass


class AmbiguousExtractorError(ExtractorRegistryError, LookupError):
    pass


class ExtractorSpecMismatchError(ExtractorRegistryError):
    pass


class ExtractorRegistry:
    """Maps ``(name, version)`` identities to implementations.

    Multiple versions of the same extractor may coexist.  A version-less
    lookup is intentionally accepted only when exactly one version is
    registered; this avoids silently selecting a different model.
    """

    def __init__(self, extractors: Iterable[Extractor] = ()) -> None:
        self._extractors: dict[tuple[str, str], Extractor] = {}
        for extractor in extractors:
            self.register(extractor)

    def register(self, extractor: Extractor, *, replace: bool = False) -> None:
        if not isinstance(extractor, Extractor):
            raise TypeError("extractor must satisfy the Extractor protocol")
        if not isinstance(extractor.spec, ExtractorSpec):
            raise TypeError("extractor.spec must be an ExtractorSpec")
        identity = extractor.spec.identity
        if identity in self._extractors and not replace:
            raise DuplicateExtractorError(
                f"extractor {identity[0]}@{identity[1]} is already registered"
            )
        self._extractors[identity] = extractor

    def unregister(self, name: str, version: str) -> Extractor:
        try:
            return self._extractors.pop((name, version))
        except KeyError as exc:
            raise ExtractorNotFoundError(
                f"extractor {name}@{version} is not registered"
            ) from exc

    def get(self, name: str, version: str | None = None) -> Extractor:
        if version is not None:
            try:
                return self._extractors[(name, version)]
            except KeyError as exc:
                raise ExtractorNotFoundError(
                    f"extractor {name}@{version} is not registered"
                ) from exc

        matches = [
            extractor
            for (registered_name, _), extractor in self._extractors.items()
            if registered_name == name
        ]
        if not matches:
            raise ExtractorNotFoundError(f"extractor {name} is not registered")
        if len(matches) > 1:
            versions = ", ".join(sorted(item.spec.version for item in matches))
            raise AmbiguousExtractorError(
                f"extractor {name} has multiple versions ({versions}); specify one"
            )
        return matches[0]

    def resolve(self, manifest: ModelSetManifest) -> tuple[Extractor, ...]:
        """Resolve required extractors and any available optional extractors."""

        resolved: list[Extractor] = []
        for spec in manifest.required_extractors:
            extractor = self.get(spec.name, spec.version)
            self._require_matching_spec(extractor, spec)
            resolved.append(extractor)
        for spec in manifest.optional_extractors:
            extractor = self._extractors.get(spec.identity)
            if extractor is not None:
                self._require_matching_spec(extractor, spec)
                resolved.append(extractor)
        return tuple(resolved)

    @staticmethod
    def _require_matching_spec(
        extractor: Extractor, expected: ExtractorSpec
    ) -> None:
        if extractor.spec != expected:
            raise ExtractorSpecMismatchError(
                f"registered extractor {expected.name}@{expected.version} does not "
                "match the manifest specification"
            )

    def specs(self) -> tuple[ExtractorSpec, ...]:
        return tuple(
            self._extractors[identity].spec for identity in sorted(self._extractors)
        )

    def __contains__(self, identity: object) -> bool:
        return identity in self._extractors

    def __len__(self) -> int:
        return len(self._extractors)

    def __iter__(self) -> Iterator[Extractor]:
        for identity in sorted(self._extractors):
            yield self._extractors[identity]


__all__ = [
    "AmbiguousExtractorError",
    "DuplicateExtractorError",
    "ExtractorNotFoundError",
    "ExtractorRegistry",
    "ExtractorRegistryError",
    "ExtractorSpecMismatchError",
]
