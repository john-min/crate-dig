"""JSONL analysis cache with success, failure, and skipped terminal states.

Jeff's prototype only treated successful rows as done, so permanent failures
were retried forever. Any terminal status for a cache key is now sticky until
the source hash or pipeline/model/schema version changes.
"""

from __future__ import annotations

import json
from pathlib import Path

from cratedig_engine.schemas import AnalysisResult


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
