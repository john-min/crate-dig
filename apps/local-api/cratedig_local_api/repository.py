from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
import threading
import uuid
from array import array
from collections.abc import Mapping, Sequence
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Iterator

from cratedig_local_api.db import utc_now


class RepositoryError(RuntimeError):
    pass


class NotFoundError(RepositoryError):
    pass


class ConflictError(RepositoryError):
    pass


class RetryLimitError(RepositoryError):
    pass


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _record_mapping(value: object) -> dict[str, Any]:
    if isinstance(value, Mapping):
        return dict(value)
    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        return dict(model_dump(mode="json"))
    raise TypeError(
        "analysis output must be a mapping or Pydantic record, "
        f"got {type(value).__name__}"
    )


def _row(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    result = dict(row)
    for key in ("cancellation_requested", "retryable"):
        if key in result:
            result[key] = bool(result[key])
    for key in (
        "manifest_json",
        "value_json",
        "provenance_json",
        "explanation_json",
        "parameters_json",
    ):
        if key in result and isinstance(result[key], str):
            result[key] = json.loads(result[key])
    return result


def _utc_after(seconds: int) -> str:
    if seconds <= 0:
        raise ValueError("lease_seconds must be positive")
    return (
        datetime.now(timezone.utc) + timedelta(seconds=seconds)
    ).replace(microsecond=0).isoformat()


def _embedding_bytes(value: Any, dimensions: int | None) -> tuple[bytes, int]:
    if isinstance(value, memoryview):
        value = value.tobytes()
    if isinstance(value, (bytes, bytearray)):
        payload = bytes(value)
        if len(payload) % 4:
            raise ValueError("float32 embedding byte length must be divisible by four")
        actual = len(payload) // 4
        if dimensions is not None and dimensions != actual:
            raise ValueError(f"embedding dimensions={dimensions} but payload has {actual}")
        return payload, actual

    if hasattr(value, "tolist"):
        value = value.tolist()
    floats = array("f", (float(item) for item in value))
    if sys.byteorder != "little":
        floats.byteswap()
    actual = len(floats)
    if actual == 0:
        raise ValueError("embedding cannot be empty")
    if dimensions is not None and dimensions != actual:
        raise ValueError(f"embedding dimensions={dimensions} but received {actual} values")
    return floats.tobytes(), actual


class Repository:
    """Short-transaction persistence boundary for local analysis."""

    def __init__(
        self,
        conn: sqlite3.Connection,
        *,
        connection_lock: threading.RLock | None = None,
    ):
        self.conn = conn
        self._connection_lock = connection_lock or threading.RLock()

    @contextmanager
    def synchronized(self) -> Iterator[None]:
        """Serialize every use of this shared SQLite connection."""

        with self._connection_lock:
            yield

    @contextmanager
    def _write(self) -> Iterator[None]:
        with self._connection_lock:
            self.conn.execute("begin immediate")
            try:
                yield
                self.conn.commit()
            except Exception:
                self.conn.rollback()
                raise

    def upsert_model_set_manifest(
        self,
        name: str | Mapping[str, Any] | object,
        version: str | None = None,
        manifest: Mapping[str, Any] | object | None = None,
        *,
        manifest_hash: str | None = None,
    ) -> dict[str, Any]:
        if not isinstance(name, str):
            if manifest is not None or version is not None:
                raise ValueError("pass either a manifest record or name, version, and manifest")
            manifest_data = _record_mapping(name)
            name = str(manifest_data.get("name") or "")
            version = str(manifest_data.get("version") or "")
        else:
            if manifest is None:
                raise ValueError("manifest is required")
            manifest_data = _record_mapping(manifest)
        if not name or not version:
            raise ValueError("manifest name and version are required")
        payload = _canonical_json(manifest_data)
        computed_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        if manifest_hash is not None and manifest_hash != computed_hash:
            raise ValueError("manifest_hash does not match canonical manifest JSON")
        manifest_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"crate-dig:model-set:{computed_hash}"))
        with self._write():
            existing = self.conn.execute(
                "select * from model_set_manifests where name = ? and version = ?",
                (name, version),
            ).fetchone()
            if existing is not None:
                if existing["manifest_hash"] != computed_hash:
                    raise ConflictError(
                        f"model set {name!r} version {version!r} is immutable and already has different content"
                    )
                return _row(existing) or {}
            self.conn.execute(
                """
                insert into model_set_manifests (
                  id, name, version, manifest_hash, manifest_json, created_at
                ) values (?, ?, ?, ?, ?, ?)
                """,
                (manifest_id, name, version, computed_hash, payload, utc_now()),
            )
        return self.get_model_set_manifest(manifest_id) or {}

    def get_model_set_manifest(
        self,
        manifest_id: str | None = None,
        *,
        name: str | None = None,
        version: str | None = None,
    ) -> dict[str, Any] | None:
        if manifest_id is not None:
            row = self.conn.execute(
                "select * from model_set_manifests where id = ?", (manifest_id,)
            ).fetchone()
        elif name is not None and version is not None:
            row = self.conn.execute(
                "select * from model_set_manifests where name = ? and version = ?",
                (name, version),
            ).fetchone()
        else:
            raise ValueError("provide manifest_id or both name and version")
        return _row(row)

    def resolve_model_set_manifest(self, name: str, version: str) -> dict[str, Any] | None:
        return self.get_model_set_manifest(name=name, version=version)

    def create_analysis_run(
        self,
        library_id: str,
        manifest_id: str,
        *,
        mode: str = "fast",
        stages: Sequence[str | Mapping[str, Any]] | None = None,
        idempotency_key: str | None = None,
        max_attempts: int = 3,
    ) -> dict[str, Any]:
        if mode not in {"fast", "deep"}:
            raise ValueError("mode must be 'fast' or 'deep'")
        if max_attempts <= 0:
            raise ValueError("max_attempts must be positive")
        manifest = self.get_model_set_manifest(manifest_id)
        if manifest is None:
            raise NotFoundError(f"model set manifest not found: {manifest_id}")
        definitions = self._stage_definitions(
            stages if stages is not None else self._manifest_stages(manifest["manifest_json"]),
            max_attempts,
        )
        key = idempotency_key or str(uuid.uuid4())
        now = utc_now()

        with self._write():
            if not self.conn.execute(
                "select 1 from libraries where id = ?", (library_id,)
            ).fetchone():
                raise NotFoundError(f"library not found: {library_id}")
            if not self.conn.execute(
                "select 1 from model_set_manifests where id = ?", (manifest_id,)
            ).fetchone():
                raise NotFoundError(f"model set manifest not found: {manifest_id}")

            existing = self.conn.execute(
                "select id, library_id, manifest_id, mode from analysis_runs where idempotency_key = ?",
                (key,),
            ).fetchone()
            if existing is not None:
                if (
                    existing["library_id"] != library_id
                    or existing["manifest_id"] != manifest_id
                    or existing["mode"] != mode
                ):
                    raise ConflictError(
                        "idempotency key is already bound to a different manifest or mode"
                    )
                run_id = str(existing["id"])
            else:
                tracks = self.conn.execute(
                    "select id, audio_content_hash from tracks where library_id = ? order by id", (library_id,)
                ).fetchall()
                run_id = str(uuid.uuid4())
                stage_total = len(tracks) * len(definitions)
                status = "completed" if stage_total == 0 else "queued"
                self.conn.execute(
                    """
                    insert into analysis_runs (
                      id, library_id, manifest_id, mode, idempotency_key, status,
                      tracks_total, stages_total, stages_done, created_at, finished_at, updated_at
                    ) values (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
                    """,
                    (
                        run_id,
                        library_id,
                        manifest_id,
                        mode,
                        key,
                        status,
                        len(tracks),
                        stage_total,
                        now,
                        now if stage_total == 0 else None,
                        now,
                    ),
                )
                for track in tracks:
                    for definition in definitions:
                        cache_key = self._cache_key(
                            audio_content_hash=track["audio_content_hash"],
                            manifest=manifest["manifest_json"],
                            extractor_name=definition["extractor_name"],
                            extractor_version=definition["extractor_version"],
                        )
                        identity = ":".join(
                            (
                                run_id,
                                str(track["id"]),
                                definition["stage_name"],
                                definition["extractor_name"],
                                definition["extractor_version"],
                            )
                        )
                        self.conn.execute(
                            """
                            insert into analysis_stages (
                              id, run_id, track_id, stage_name, extractor_name,
                              extractor_version, audio_content_hash, cache_key, max_attempts,
                              created_at, updated_at
                            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                str(uuid.uuid5(uuid.NAMESPACE_URL, identity)),
                                run_id,
                                track["id"],
                                definition["stage_name"],
                                definition["extractor_name"],
                                definition["extractor_version"],
                                track["audio_content_hash"],
                                cache_key,
                                definition["max_attempts"],
                                now,
                                now,
                            ),
                        )
        return self.get_analysis_run(run_id) or {}

    @staticmethod
    def _cache_key(
        *,
        audio_content_hash: str | None,
        manifest: Mapping[str, Any],
        extractor_name: str,
        extractor_version: str,
    ) -> str | None:
        if not audio_content_hash:
            return None
        matching_spec: Mapping[str, Any] | None = None
        for collection_name in ("required_extractors", "optional_extractors", "extractors"):
            collection = manifest.get(collection_name, ())
            if not isinstance(collection, Sequence) or isinstance(collection, (str, bytes)):
                continue
            matching_spec = next(
                (
                    item
                    for item in collection
                    if isinstance(item, Mapping)
                    and item.get("name") == extractor_name
                    and item.get("version") == extractor_version
                ),
                matching_spec,
            )
        spec_identity: Mapping[str, Any] = matching_spec or {
            "name": extractor_name,
            "version": extractor_version,
        }
        payload = _canonical_json(
            {
                "audio_content_hash": audio_content_hash,
                "extractor_spec": spec_identity,
                "window_plan_version": spec_identity.get(
                    "default_window_plan_version"
                )
                or manifest.get("window_plan_version"),
                "separator_identity": manifest.get("separator_identity"),
            }
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    @staticmethod
    def _manifest_stages(manifest: Mapping[str, Any]) -> list[dict[str, Any]]:
        specs: list[Mapping[str, Any]] = []
        for key in ("required_extractors", "optional_extractors", "extractors"):
            value = manifest.get(key, ())
            if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
                specs.extend(item for item in value if isinstance(item, Mapping))
        deduplicated: list[dict[str, Any]] = []
        seen: set[tuple[str, str]] = set()
        for spec in specs:
            identity = (str(spec.get("name") or ""), str(spec.get("version") or ""))
            if not all(identity) or identity in seen:
                continue
            seen.add(identity)
            deduplicated.append(
                {
                    "stage_name": "extract",
                    "extractor_name": identity[0],
                    "extractor_version": identity[1],
                }
            )
        if not deduplicated:
            raise ValueError("manifest must declare at least one extractor")
        return deduplicated

    @staticmethod
    def _stage_definitions(
        stages: Sequence[str | Mapping[str, Any]], default_max_attempts: int
    ) -> list[dict[str, Any]]:
        if not stages:
            raise ValueError("at least one stage is required")
        result: list[dict[str, Any]] = []
        seen: set[tuple[str, str, str]] = set()
        for item in stages:
            if isinstance(item, str):
                definition = {
                    "stage_name": item,
                    "extractor_name": item,
                    "extractor_version": "",
                    "max_attempts": default_max_attempts,
                }
            else:
                stage_name = str(item.get("stage_name") or item.get("name") or "extract")
                extractor_name = str(item.get("extractor_name") or item.get("name") or stage_name)
                definition = {
                    "stage_name": stage_name,
                    "extractor_name": extractor_name,
                    "extractor_version": str(item.get("extractor_version") or item.get("version") or ""),
                    "max_attempts": int(item.get("max_attempts", default_max_attempts)),
                }
            identity = (
                definition["stage_name"],
                definition["extractor_name"],
                definition["extractor_version"],
            )
            if not all(identity[:2]) or definition["max_attempts"] <= 0:
                raise ValueError("stage names and max_attempts must be valid")
            if identity in seen:
                raise ValueError(f"duplicate stage definition: {identity}")
            seen.add(identity)
            result.append(definition)
        return result

    def get_analysis_run(self, run_id: str) -> dict[str, Any] | None:
        row = self.conn.execute(
            """
            select r.*, m.name as manifest_name, m.version as manifest_version,
                   m.manifest_hash, m.manifest_json
            from analysis_runs r
            join model_set_manifests m on m.id = r.manifest_id
            where r.id = ?
            """,
            (run_id,),
        ).fetchone()
        return _row(row)

    def list_run_stages(self, run_id: str) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            """
            select s.*, t.location as track_location
            from analysis_stages s
            join tracks t on t.id = s.track_id
            where s.run_id = ?
            order by s.created_at, s.track_id, s.stage_name, s.extractor_name
            """,
            (run_id,),
        ).fetchall()
        return [_row(row) or {} for row in rows]

    def list_run_tracks(self, run_id: str) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            """
            select t.*,
                   count(s.id) as stages_total,
                   sum(case when s.status in ('succeeded', 'skipped') or
                                      (s.status = 'failed' and (s.retryable = 0 or s.attempt_count >= s.max_attempts))
                            then 1 else 0 end) as stages_done,
                   sum(case when s.status = 'running' then 1 else 0 end) as stages_running,
                   sum(case when s.status = 'failed' then 1 else 0 end) as stages_failed
            from analysis_stages s
            join tracks t on t.id = s.track_id
            where s.run_id = ?
            group by t.id
            order by t.artist, t.title
            """,
            (run_id,),
        ).fetchall()
        return [dict(row) for row in rows]

    def claim_next_stage(
        self,
        *,
        worker_id: str,
        run_id: str | None = None,
        lease_seconds: int = 300,
    ) -> dict[str, Any] | None:
        if not worker_id:
            raise ValueError("worker_id is required")
        now = utc_now()
        lease_expires = _utc_after(lease_seconds)
        with self._write():
            exhausted_runs = self.conn.execute(
                """
                select distinct run_id from analysis_stages
                where status = 'running' and lease_expires_at < ?
                  and attempt_count >= max_attempts
                """,
                (now,),
            ).fetchall()
            self.conn.execute(
                """
                update analysis_stages
                set status = 'failed', retryable = 0,
                    error_code = 'worker_lease_expired',
                    error_message = 'Worker lease expired after the retry ceiling.',
                    worker_id = null, lease_expires_at = null, finished_at = ?, updated_at = ?
                where status = 'running' and lease_expires_at < ?
                  and attempt_count >= max_attempts
                """,
                (now, now, now),
            )
            for exhausted in exhausted_runs:
                self._refresh_run(str(exhausted["run_id"]), now)
            params: list[Any] = [now]
            run_filter = ""
            if run_id is not None:
                run_filter = "and s.run_id = ?"
                params.append(run_id)
            candidate = self.conn.execute(
                f"""
                select s.id
                from analysis_stages s
                join analysis_runs r on r.id = s.run_id
                where r.cancellation_requested = 0
                  and (
                    s.status = 'queued'
                    or (s.status = 'failed' and s.retryable = 1 and s.attempt_count < s.max_attempts)
                    or (s.status = 'running' and s.lease_expires_at < ? and s.attempt_count < s.max_attempts)
                  )
                  and (
                    s.cache_key is null
                    or not exists (
                      select 1 from analysis_stages active
                      where active.cache_key = s.cache_key
                        and active.status = 'running'
                        and active.id <> s.id
                    )
                  )
                  {run_filter}
                order by s.created_at, s.track_id, s.stage_name, s.extractor_name
                limit 1
                """,
                params,
            ).fetchone()
            if candidate is None:
                return None
            stage_id = str(candidate["id"])
            self.conn.execute(
                """
                update analysis_stages
                set status = 'running', attempt_count = attempt_count + 1,
                    worker_id = ?, lease_expires_at = ?, retryable = 1,
                    error_code = null, error_message = null,
                    reason_code = null, reason_message = null,
                    started_at = coalesce(started_at, ?), finished_at = null, updated_at = ?
                where id = ?
                """,
                (worker_id, lease_expires, now, now, stage_id),
            )
            self.conn.execute(
                """
                update analysis_runs
                set status = 'running', started_at = coalesce(started_at, ?), updated_at = ?
                where id = (select run_id from analysis_stages where id = ?)
                  and status = 'queued'
                """,
                (now, now, stage_id),
            )
            claimed = self._claimed_stage(stage_id)
        return claimed

    def complete_stage_from_cache(
        self,
        stage_id: str,
        source_stage_id: str,
        *,
        worker_id: str | None = None,
    ) -> dict[str, Any]:
        now = utc_now()
        with self._write():
            target = self.conn.execute(
                "select * from analysis_stages where id = ?", (stage_id,)
            ).fetchone()
            source = self.conn.execute(
                "select * from analysis_stages where id = ?", (source_stage_id,)
            ).fetchone()
            if target is None or source is None:
                raise NotFoundError("cache source or target stage was not found")
            self._require_running_owner(target, worker_id)
            if (
                source["status"] != "succeeded"
                or not target["cache_key"]
                or source["cache_key"] != target["cache_key"]
            ):
                raise ConflictError("cache source is not a successful equivalent stage")
            hit = {
                "target_id": target["id"],
                "target_run_id": target["run_id"],
                "target_track_id": target["track_id"],
                "source_id": source["id"],
            }
            self._copy_cached_evidence(hit, now)
            self.conn.execute(
                """
                update analysis_stages
                set status = 'succeeded', progress = 1, retryable = 0,
                    cache_hit_from_stage_id = ?, worker_id = null,
                    lease_expires_at = null, finished_at = ?, updated_at = ?
                where id = ? and status = 'running'
                """,
                (source_stage_id, now, now, stage_id),
            )
            self._refresh_run(str(target["run_id"]), now)
        return self._claimed_stage(stage_id) or {}

    def _copy_cached_evidence(self, hit: Mapping[str, Any], now: str) -> None:
        features = self.conn.execute(
            "select * from track_features where stage_id = ?",
            (hit["source_id"],),
        ).fetchall()
        for item in features:
            self.conn.execute(
                """
                insert into track_features (
                  id, track_id, analysis_run_id, stage_id, feature_key, evidence_key,
                  extractor_name, extractor_version, scope, start_ms, end_ms, stem,
                  value_json, unit, confidence, provenance_json, created_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()), hit["target_track_id"], hit["target_run_id"],
                    hit["target_id"], item["feature_key"], item["evidence_key"],
                    item["extractor_name"], item["extractor_version"], item["scope"],
                    item["start_ms"], item["end_ms"], item["stem"], item["value_json"],
                    item["unit"], item["confidence"], item["provenance_json"], now,
                ),
            )
        embeddings = self.conn.execute(
            "select * from track_embeddings where stage_id = ?",
            (hit["source_id"],),
        ).fetchall()
        for item in embeddings:
            self.conn.execute(
                """
                insert into track_embeddings (
                  id, track_id, analysis_run_id, stage_id, embedding_key, evidence_key,
                  model_name, model_version, scope, start_ms, end_ms, stem,
                  pooling_strategy, dimensions, dtype, embedding_blob,
                  provenance_json, created_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()), hit["target_track_id"], hit["target_run_id"],
                    hit["target_id"], item["embedding_key"], item["evidence_key"],
                    item["model_name"], item["model_version"], item["scope"],
                    item["start_ms"], item["end_ms"], item["stem"],
                    item["pooling_strategy"], item["dimensions"], item["dtype"],
                    item["embedding_blob"], item["provenance_json"], now,
                ),
            )

    def _claimed_stage(self, stage_id: str) -> dict[str, Any] | None:
        row = self.conn.execute(
            """
            select s.*, t.location as track_location,
                   (
                     select source.id from analysis_stages source
                     where source.cache_key = s.cache_key
                       and source.status = 'succeeded'
                       and source.id <> s.id
                     order by source.finished_at desc limit 1
                   ) as cache_source_stage_id,
                   r.manifest_id, r.cancellation_requested,
                   m.name as manifest_name, m.version as manifest_version,
                   m.manifest_hash, m.manifest_json
            from analysis_stages s
            join tracks t on t.id = s.track_id
            join analysis_runs r on r.id = s.run_id
            join model_set_manifests m on m.id = r.manifest_id
            where s.id = ?
            """,
            (stage_id,),
        ).fetchone()
        return _row(row)

    def renew_stage_lease(
        self, stage_id: str, worker_id: str, *, lease_seconds: int = 300
    ) -> bool:
        with self._write():
            cursor = self.conn.execute(
                """
                update analysis_stages set lease_expires_at = ?, updated_at = ?
                where id = ? and worker_id = ? and status = 'running'
                """,
                (_utc_after(lease_seconds), utc_now(), stage_id, worker_id),
            )
        return cursor.rowcount == 1

    def release_stage(self, stage_id: str, worker_id: str) -> bool:
        """Return owned work to the queue without consuming an attempt."""

        with self._write():
            cursor = self.conn.execute(
                """
                update analysis_stages
                set status = 'queued', attempt_count = max(attempt_count - 1, 0),
                    worker_id = null, lease_expires_at = null, updated_at = ?
                where id = ? and worker_id = ? and status = 'running'
                """,
                (utc_now(), stage_id, worker_id),
            )
        return cursor.rowcount == 1

    def complete_stage(
        self,
        stage_id: str,
        *,
        features: Sequence[object] = (),
        embeddings: Sequence[object] = (),
        worker_id: str | None = None,
    ) -> dict[str, Any]:
        now = utc_now()
        with self._write():
            stage = self.conn.execute(
                "select * from analysis_stages where id = ?", (stage_id,)
            ).fetchone()
            if stage is None:
                raise NotFoundError(f"analysis stage not found: {stage_id}")
            self._require_running_owner(stage, worker_id)
            for feature in features:
                self._store_feature(stage, _record_mapping(feature), now)
            for embedding in embeddings:
                self._store_embedding(stage, _record_mapping(embedding), now)
            changed = self.conn.execute(
                """
                update analysis_stages
                set status = 'succeeded', progress = 1, worker_id = null,
                    lease_expires_at = null, retryable = 0, error_code = null,
                    error_message = null, finished_at = ?, updated_at = ?
                where id = ? and status = 'running'
                """,
                (now, now, stage_id),
            ).rowcount
            if changed != 1:
                raise ConflictError(f"analysis stage is no longer running: {stage_id}")
            self._refresh_run(str(stage["run_id"]), now)
        return self._claimed_stage(stage_id) or {}

    @staticmethod
    def _require_running_owner(stage: sqlite3.Row, worker_id: str | None) -> None:
        if stage["status"] != "running":
            raise ConflictError(f"analysis stage is not running: {stage['id']}")
        if worker_id is not None and stage["worker_id"] != worker_id:
            raise ConflictError(f"analysis stage is owned by another worker: {stage['id']}")

    def _store_feature(
        self, stage: sqlite3.Row, feature: Mapping[str, Any], now: str
    ) -> None:
        feature_name = str(feature.get("feature_name") or "")
        namespace = str(feature.get("namespace") or "")
        key = str(
            feature.get("feature_key")
            or feature.get("name")
            or (f"{namespace}.{feature_name}" if namespace else feature_name)
        )
        if not key:
            raise ValueError("feature_key is required")
        value = feature.get("value", feature.get("value_json"))
        scope = str(feature.get("scope") or "track")
        start_ms = feature.get("start_ms")
        end_ms = feature.get("end_ms")
        stem = feature.get("stem")
        evidence_key = _canonical_json((key, scope, start_ms, end_ms, stem))
        extractor_name = str(feature.get("extractor_name") or stage["extractor_name"])
        extractor_version = str(feature.get("extractor_version") or stage["extractor_version"])
        provenance = feature.get("provenance", feature.get("provenance_json"))
        if provenance is None:
            provenance = {
                field: value
                for field, value in feature.items()
                if field
                not in {
                    "value",
                    "feature_key",
                    "feature_name",
                    "namespace",
                    "unit",
                    "confidence",
                }
            }
        self.conn.execute(
            """
            insert into track_features (
              id, track_id, analysis_run_id, stage_id, feature_key, evidence_key,
              extractor_name, extractor_version, scope, start_ms, end_ms, stem,
              value_json, unit, confidence, provenance_json, created_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            on conflict (track_id, analysis_run_id, evidence_key, extractor_name, extractor_version)
            do update set stage_id = excluded.stage_id, value_json = excluded.value_json,
                          unit = excluded.unit, confidence = excluded.confidence,
                          provenance_json = excluded.provenance_json, created_at = excluded.created_at
            """,
            (
                str(uuid.uuid4()),
                stage["track_id"],
                stage["run_id"],
                stage["id"],
                key,
                evidence_key,
                extractor_name,
                extractor_version,
                scope,
                start_ms,
                end_ms,
                stem,
                _canonical_json(value),
                feature.get("unit"),
                feature.get("confidence"),
                _canonical_json(provenance),
                now,
            ),
        )

    def _store_embedding(
        self, stage: sqlite3.Row, embedding: Mapping[str, Any], now: str
    ) -> None:
        key = str(
            embedding.get("embedding_key")
            or embedding.get("name")
            or embedding.get("role")
            or ""
        )
        model_name = str(embedding.get("model_name") or stage["extractor_name"])
        model_version = str(embedding.get("model_version") or stage["extractor_version"])
        if not key or not model_name:
            raise ValueError("embedding_key and model_name are required")
        values = embedding.get(
            "embedding",
            embedding.get(
                "values", embedding.get("vector", embedding.get("embedding_blob"))
            ),
        )
        if values is None:
            raise ValueError("embedding values are required")
        scope = str(embedding.get("scope") or "track")
        start_ms = embedding.get("start_ms")
        end_ms = embedding.get("end_ms")
        stem = embedding.get("stem")
        evidence_key = _canonical_json((key, scope, start_ms, end_ms, stem))
        payload, dimensions = _embedding_bytes(
            values, embedding.get("dimensions", embedding.get("dimension"))
        )
        provenance = embedding.get("provenance", embedding.get("provenance_json"))
        if provenance is None:
            provenance = {
                field: value
                for field, value in embedding.items()
                if field not in {"embedding", "values", "vector", "embedding_blob"}
            }
        self.conn.execute(
            """
            insert into track_embeddings (
              id, track_id, analysis_run_id, stage_id, embedding_key, evidence_key,
              model_name, model_version, scope, start_ms, end_ms, stem, pooling_strategy,
              dimensions, dtype, embedding_blob, provenance_json, created_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'float32-le', ?, ?, ?)
            on conflict (track_id, analysis_run_id, evidence_key, model_name, model_version)
            do update set stage_id = excluded.stage_id, dimensions = excluded.dimensions,
                          dtype = excluded.dtype, embedding_blob = excluded.embedding_blob,
                          provenance_json = excluded.provenance_json, created_at = excluded.created_at
            """,
            (
                str(uuid.uuid4()),
                stage["track_id"],
                stage["run_id"],
                stage["id"],
                key,
                evidence_key,
                model_name,
                model_version,
                scope,
                start_ms,
                end_ms,
                stem,
                embedding.get("pooling_strategy"),
                dimensions,
                payload,
                _canonical_json(provenance),
                now,
            ),
        )

    def fail_stage(
        self,
        stage_id: str,
        error_code: str,
        error_message: str,
        *,
        retryable: bool,
        worker_id: str | None = None,
    ) -> dict[str, Any]:
        now = utc_now()
        with self._write():
            stage = self.conn.execute(
                "select * from analysis_stages where id = ?", (stage_id,)
            ).fetchone()
            if stage is None:
                raise NotFoundError(f"analysis stage not found: {stage_id}")
            self._require_running_owner(stage, worker_id)
            can_retry = bool(retryable and stage["attempt_count"] < stage["max_attempts"])
            self.conn.execute(
                """
                update analysis_stages
                set status = 'failed', retryable = ?, error_code = ?, error_message = ?,
                    worker_id = null, lease_expires_at = null, finished_at = ?, updated_at = ?
                where id = ?
                """,
                (int(can_retry), error_code, error_message, now, now, stage_id),
            )
            self._refresh_run(str(stage["run_id"]), now)
        return self._claimed_stage(stage_id) or {}

    def skip_stage(
        self,
        stage_id: str,
        reason_code: str,
        reason_message: str = "",
        *,
        worker_id: str | None = None,
    ) -> dict[str, Any]:
        now = utc_now()
        with self._write():
            stage = self.conn.execute(
                "select * from analysis_stages where id = ?", (stage_id,)
            ).fetchone()
            if stage is None:
                raise NotFoundError(f"analysis stage not found: {stage_id}")
            if stage["status"] == "running":
                self._require_running_owner(stage, worker_id)
            elif stage["status"] == "skipped" and stage["reason_code"] == reason_code:
                return self._claimed_stage(stage_id) or {}
            elif stage["status"] not in {"queued", "failed"}:
                raise ConflictError(f"analysis stage is already terminal: {stage_id}")
            self.conn.execute(
                """
                update analysis_stages
                set status = 'skipped', progress = 1, retryable = 0,
                    reason_code = ?, reason_message = ?, worker_id = null,
                    lease_expires_at = null, finished_at = ?, updated_at = ?
                where id = ?
                """,
                (reason_code, reason_message, now, now, stage_id),
            )
            self._refresh_run(str(stage["run_id"]), now)
        return self._claimed_stage(stage_id) or {}

    def request_cancellation(
        self, run_id: str, *, reason: str = "cancelled_by_user"
    ) -> dict[str, Any]:
        if reason != "cancelled_by_user":
            raise ValueError("unsupported cancellation reason")
        now = utc_now()
        with self._write():
            run = self.conn.execute(
                "select status from analysis_runs where id = ?", (run_id,)
            ).fetchone()
            if run is None:
                raise NotFoundError(f"analysis run not found: {run_id}")
            if run["status"] in {"completed", "failed", "cancelled"}:
                return self.get_analysis_run(run_id) or {}
            self.conn.execute(
                """
                update analysis_runs
                set status = 'cancel_requested', cancellation_requested = 1, updated_at = ?
                where id = ?
                """,
                (now, run_id),
            )
            self.conn.execute(
                """
                update analysis_stages
                set status = 'skipped', retryable = 0, progress = 1,
                    reason_code = 'cancelled_by_user',
                    reason_message = 'Analysis cancelled by user',
                    worker_id = null, lease_expires_at = null,
                    finished_at = ?, updated_at = ?
                where run_id = ? and status in ('queued', 'failed')
                """,
                (now, now, run_id),
            )
            self._refresh_run(run_id, now)
        return self.get_analysis_run(run_id) or {}

    def retry_stage(
        self, stage_id: str, *, reason: str | None = None
    ) -> dict[str, Any]:
        now = utc_now()
        with self._write():
            stage = self.conn.execute(
                """
                select s.*, r.cancellation_requested
                from analysis_stages s join analysis_runs r on r.id = s.run_id
                where s.id = ?
                """,
                (stage_id,),
            ).fetchone()
            if stage is None:
                raise NotFoundError(f"analysis stage not found: {stage_id}")
            if stage["cancellation_requested"]:
                raise ConflictError("cannot retry a cancelled run")
            if stage["status"] != "failed":
                raise ConflictError("only failed stages can be retried")
            if not stage["retryable"] or stage["attempt_count"] >= stage["max_attempts"]:
                raise RetryLimitError("stage is terminal or has exhausted its retry ceiling")
            self.conn.execute(
                """
                update analysis_stages
                set status = 'queued', error_code = null, error_message = null,
                    finished_at = null, updated_at = ?
                where id = ?
                """,
                (now, stage_id),
            )
            self.conn.execute(
                """
                update analysis_runs
                set status = case when started_at is null then 'queued' else 'running' end,
                    error_code = null, error_message = null, finished_at = null, updated_at = ?
                where id = ?
                """,
                (now, stage["run_id"]),
            )
        return self._claimed_stage(stage_id) or {}

    def get_track_analysis(
        self, track_id: str, *, run_id: str | None = None
    ) -> dict[str, Any] | None:
        if not self.conn.execute("select 1 from tracks where id = ?", (track_id,)).fetchone():
            return None
        if run_id is None:
            latest = self.conn.execute(
                """
                select r.id from analysis_runs r
                join analysis_stages s on s.run_id = r.id
                where s.track_id = ?
                order by r.created_at desc limit 1
                """,
                (track_id,),
            ).fetchone()
            run_id = str(latest["id"]) if latest else None
        if run_id is None:
            return {"track_id": track_id, "run_id": None, "stages": [], "features": [], "embeddings": []}
        stages = self.conn.execute(
            "select * from analysis_stages where run_id = ? and track_id = ? order by stage_name, extractor_name",
            (run_id, track_id),
        ).fetchall()
        features = self.conn.execute(
            "select * from track_features where analysis_run_id = ? and track_id = ? order by feature_key",
            (run_id, track_id),
        ).fetchall()
        embeddings = self.conn.execute(
            """
            select id, track_id, analysis_run_id, stage_id, embedding_key, model_name,
                   model_version, scope, start_ms, end_ms, stem, pooling_strategy,
                   dimensions, dtype, length(embedding_blob) as byte_length,
                   provenance_json, created_at
            from track_embeddings where analysis_run_id = ? and track_id = ?
            order by embedding_key, model_name
            """,
            (run_id, track_id),
        ).fetchall()
        return {
            "track_id": track_id,
            "run_id": run_id,
            "stages": [_row(row) or {} for row in stages],
            "features": [_row(row) or {} for row in features],
            "embeddings": [_row(row) or {} for row in embeddings],
        }

    def list_neighbors(
        self,
        track_id: str,
        *,
        run_id: str | None = None,
        limit: int = 25,
        channel: str | None = None,
    ) -> list[dict[str, Any]] | None:
        if limit <= 0 or limit > 500:
            raise ValueError("limit must be between 1 and 500")
        if not self.conn.execute(
            "select 1 from tracks where id = ?", (track_id,)
        ).fetchone():
            return None
        if run_id is None:
            latest = self.conn.execute(
                """
                select analysis_run_id from similarity_neighbors
                where source_track_id = ? order by created_at desc limit 1
                """,
                (track_id,),
            ).fetchone()
            if latest is None:
                return []
            run_id = str(latest["analysis_run_id"])
        params: list[Any] = [run_id, track_id]
        channel_filter = ""
        if channel is not None:
            channel_filter = "and n.channel = ?"
            params.append(channel)
        params.append(limit)
        rows = self.conn.execute(
            f"""
            select n.*, t.title, t.artist, t.album, t.location
            from similarity_neighbors n
            join tracks t on t.id = n.target_track_id
            where n.analysis_run_id = ? and n.source_track_id = ? {channel_filter}
            order by n.channel, n.rank limit ?
            """,
            params,
        ).fetchall()
        return [_row(row) or {} for row in rows]

    def _refresh_run(self, run_id: str, now: str) -> None:
        counts = self.conn.execute(
            """
            select count(*) as total,
                   sum(case when status in ('succeeded', 'skipped') or
                                      (status = 'failed' and (retryable = 0 or attempt_count >= max_attempts))
                            then 1 else 0 end) as done,
                   sum(case when status = 'failed' and (retryable = 0 or attempt_count >= max_attempts)
                            then 1 else 0 end) as terminal_failures
            from analysis_stages where run_id = ?
            """,
            (run_id,),
        ).fetchone()
        run = self.conn.execute(
            "select cancellation_requested from analysis_runs where id = ?", (run_id,)
        ).fetchone()
        total = int(counts["total"] or 0)
        done = int(counts["done"] or 0)
        failures = int(counts["terminal_failures"] or 0)
        if done == total:
            if run["cancellation_requested"]:
                status = "cancelled"
            elif failures:
                status = "failed"
            else:
                status = "completed"
            finished_at = now
        else:
            status = "cancel_requested" if run["cancellation_requested"] else "running"
            finished_at = None
        error = self.conn.execute(
            """
            select error_code, error_message from analysis_stages
            where run_id = ? and status = 'failed'
              and (retryable = 0 or attempt_count >= max_attempts)
            order by finished_at limit 1
            """,
            (run_id,),
        ).fetchone()
        self.conn.execute(
            """
            update analysis_runs
            set status = ?, stages_done = ?, error_code = ?, error_message = ?,
                finished_at = ?, updated_at = ? where id = ?
            """,
            (
                status,
                done,
                error["error_code"] if error else None,
                error["error_message"] if error else None,
                finished_at,
                now,
                run_id,
            ),
        )
