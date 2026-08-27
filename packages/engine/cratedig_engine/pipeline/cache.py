"""JSONL analysis cache with success, failure, and skipped terminal states.

Jeff's prototype only treated successful rows as done, so permanent failures
were retried forever. Any terminal status for a cache key is now sticky until
the source hash or pipeline/model/schema version changes.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from cratedig_engine.records import ExtractorSpec, FeatureBundle, Sha256
from cratedig_engine.schemas import AnalysisResult


class CacheCorruptionError(ValueError):
    """A completed cache record is invalid and cannot be trusted as evidence."""


class AnalysisCache:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self._by_key: dict[tuple, AnalysisResult] = {}
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            return
        with open(self.path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                result = AnalysisResult.model_validate(json.loads(line))
                self._by_key[result.cache_key] = result

    def get(
        self,
        track_id: str,
        audio_file_hash: str | None,
        *,
        analysis_pipeline_version: str,
        model_version: str,
        feature_schema_version: str,
    ) -> AnalysisResult | None:
        key = (
            track_id,
            audio_file_hash,
            analysis_pipeline_version,
            model_version,
            feature_schema_version,
        )
        return self._by_key.get(key)

    def put(self, result: AnalysisResult) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.path, "a", encoding="utf-8") as fh:
            fh.write(result.model_dump_json() + "\n")
        self._by_key[result.cache_key] = result

    def line_count(self) -> int:
        if not self.path.exists():
            return 0
        with open(self.path, "r", encoding="utf-8") as fh:
            return sum(1 for line in fh if line.strip())


class ExtractorCacheStatus(str, Enum):
    """Terminal states persisted independently for each extractor identity."""

    SUCCEEDED = "succeeded"
    FAILED = "failed"
    SKIPPED = "skipped"


class ExtractorCacheEntry(BaseModel):
    """One terminal extractor result in the content-addressed JSONL cache."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    audio_content_hash: Sha256
    extractor_spec: ExtractorSpec
    window_plan_version: str
    status: ExtractorCacheStatus
    bundle: FeatureBundle | None = None
    failure_code: str | None = None
    failure_reason: str | None = None
    attempt_count: int = Field(default=1, ge=1)
    failure_retryable: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @model_validator(mode="after")
    def validate_terminal_record(self) -> Self:
        if not self.audio_content_hash.strip():
            raise ValueError("audio_content_hash must not be empty")
        if not self.window_plan_version.strip():
            raise ValueError("window_plan_version must not be empty")
        if self.status is ExtractorCacheStatus.SUCCEEDED:
            if self.bundle is None:
                raise ValueError("succeeded cache entries require a feature bundle")
            if self.failure_code is not None or self.failure_reason is not None:
                raise ValueError("succeeded cache entries cannot contain a failure")
            if self.failure_retryable:
                raise ValueError("succeeded cache entries cannot be retryable")
            if self.bundle.audio_content_hash != self.audio_content_hash:
                raise ValueError("bundle content hash must match the cache entry")
            if self.bundle.extractor_spec != self.extractor_spec:
                raise ValueError("bundle extractor spec must match the cache entry")
            if self.bundle.window_plan_version != self.window_plan_version:
                raise ValueError("bundle window plan must match the cache entry")
        elif self.bundle is not None:
            raise ValueError("failed and skipped cache entries cannot contain a bundle")
        if self.status in {
            ExtractorCacheStatus.FAILED,
            ExtractorCacheStatus.SKIPPED,
        }:
            if not self.failure_code or not self.failure_code.strip():
                raise ValueError("failed and skipped cache entries require failure_code")
            if not self.failure_reason or not self.failure_reason.strip():
                raise ValueError("failed and skipped cache entries require failure_reason")
        if self.status is ExtractorCacheStatus.SKIPPED and self.failure_retryable:
            raise ValueError("skipped cache entries cannot be retryable")
        return self

    @property
    def cache_key(self) -> tuple[str | None, ...]:
        """The complete SONIC-RUN-004 identity, deliberately excluding track ID."""

        return self.extractor_spec.cache_identity(
            self.audio_content_hash,
            window_plan_version=self.window_plan_version,
        )


class ExtractorCache:
    """Content-addressed JSONL cache for independent extractor stages.

    The newest entry for an identity wins. Failures and skips are sticky just
    like successes; callers must explicitly request a retry or overwrite.
    A torn final write is removed during loading so the next append produces a
    valid JSONL stream instead of extending a partial object.
    """

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self._by_key: dict[tuple[str | None, ...], ExtractorCacheEntry] = {}
        self._append_needs_newline = False
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            return

        data = self.path.read_bytes()
        lines = data.splitlines(keepends=True)
        offset = 0
        for index, raw_line in enumerate(lines):
            next_offset = offset + len(raw_line)
            stripped = raw_line.strip()
            if not stripped:
                offset = next_offset
                continue
            terminated = raw_line.endswith((b"\n", b"\r"))
            try:
                entry = ExtractorCacheEntry.model_validate_json(stripped)
            except (json.JSONDecodeError, ValueError) as exc:
                if index == len(lines) - 1 and not terminated:
                    # A process may have stopped between writing bytes and the
                    # terminating newline. Discard only that incomplete tail.
                    with open(self.path, "r+b") as fh:
                        fh.truncate(offset)
                    self._append_needs_newline = False
                    return
                raise CacheCorruptionError(
                    f"invalid extractor cache record at line {index + 1}"
                ) from exc
            self._by_key[entry.cache_key] = entry
            offset = next_offset

        self._append_needs_newline = bool(data) and not data.endswith((b"\n", b"\r"))

    @staticmethod
    def key_for(
        audio_content_hash: str,
        extractor_spec: ExtractorSpec,
        *,
        window_plan_version: str,
    ) -> tuple[str | None, ...]:
        return extractor_spec.cache_identity(
            audio_content_hash,
            window_plan_version=window_plan_version,
        )

    def get(
        self,
        audio_content_hash: str,
        extractor_spec: ExtractorSpec,
        *,
        window_plan_version: str,
        retry: bool = False,
    ) -> ExtractorCacheEntry | None:
        """Return a terminal result, optionally reopening failures and skips."""

        entry = self._by_key.get(
            self.key_for(
                audio_content_hash,
                extractor_spec,
                window_plan_version=window_plan_version,
            )
        )
        if retry and entry is not None and entry.status in {
            ExtractorCacheStatus.FAILED,
            ExtractorCacheStatus.SKIPPED,
        }:
            return None
        return entry

    def put(
        self,
        entry: ExtractorCacheEntry,
        *,
        overwrite: bool = False,
    ) -> ExtractorCacheEntry:
        """Persist a terminal result.

        Existing identities are sticky by default. ``overwrite=True`` appends
        an explicit replacement; the append-only history remains auditable and
        the replacement is the value returned after reload.
        """

        existing = self._by_key.get(entry.cache_key)
        if existing is not None and not overwrite:
            return existing

        self.path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.path, "a", encoding="utf-8") as fh:
            if self._append_needs_newline:
                fh.write("\n")
            fh.write(entry.model_dump_json() + "\n")
            fh.flush()
            os.fsync(fh.fileno())
        self._append_needs_newline = False
        self._by_key[entry.cache_key] = entry
        return entry

    def line_count(self) -> int:
        if not self.path.exists():
            return 0
        with open(self.path, "r", encoding="utf-8") as fh:
            return sum(1 for line in fh if line.strip())


__all__ = [
    "AnalysisCache",
    "CacheCorruptionError",
    "ExtractorCache",
    "ExtractorCacheEntry",
    "ExtractorCacheStatus",
]
