"""Durable similarity-evaluation workflows over the local SQLite repository.

The service materializes neighbor lists before review so a model upgrade cannot
silently change an in-progress evaluation.  Human judgments and metric snapshots
therefore always resolve to an evaluation-set version, configuration version,
analysis run, and immutable ranked result.
"""

from __future__ import annotations

import json
import math
import sqlite3
import uuid
from collections import defaultdict
from collections.abc import Mapping, Sequence
from typing import Any

from cratedig_local_api.db import utc_now
from cratedig_local_api.repository import ConflictError, NotFoundError, Repository


CONTRACT_VERSION = "evaluation.v1"
DIMENSIONS = {
    "overall",
    "drums",
    "bass",
    "melodic_palette",
    "groove",
    "production_space",
    "mix_compatibility",
}


def _json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _load(value: Any, default: Any) -> Any:
    if value is None or value == "":
        return default
    if isinstance(value, str):
        return json.loads(value)
    return value


def _bool(value: Any) -> bool:
    return bool(int(value))


def _track_payload(row: sqlite3.Row, *, reveal_metadata: bool) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "track_id": str(row["id"]),
        "preview_url": f"/audio/{row['id']}",
    }
    if reveal_metadata:
        payload.update(
            title=row["title"],
            artist=row["artist"],
            album=row["album"],
            duration_sec=row["duration_sec"],
        )
    return payload


class EvaluationService:
    """Application service for the ``evaluation.v1`` HTTP contract."""

    def __init__(self, repository: Repository):
        self.repository = repository
        self.conn = repository.conn

    def list_evaluation_sets(self, *, library_id: str | None = None) -> list[dict[str, Any]]:
        with self.repository.synchronized():
            params: tuple[Any, ...] = ()
            where = ""
            if library_id:
                where = "where s.library_id = ?"
                params = (library_id,)
            rows = self.conn.execute(
                f"""
                select s.*,
                       count(distinct a.id) as anchor_count,
                       count(distinct t.track_id) as track_count,
                       count(distinct c.id) as configuration_count
                from evaluation_sets s
                left join evaluation_anchors a on a.evaluation_set_id = s.id
                left join evaluation_set_tracks t on t.evaluation_set_id = s.id
                left join evaluation_configurations c on c.evaluation_set_id = s.id
                {where}
                group by s.id
                order by s.updated_at desc, s.id
                """,
                params,
            ).fetchall()
        return [self._set_summary(row) for row in rows]

    def create_evaluation_set(self, spec: Mapping[str, Any]) -> dict[str, Any]:
        library_id = str(spec["library_id"])
        name = str(spec["name"]).strip()
        version = str(spec["version"]).strip()
        if not name or not version:
            raise ValueError("evaluation set name and version are required")
        now = utc_now()
        set_id = str(uuid.uuid4())
        requested_tracks = list(dict.fromkeys(str(value) for value in spec.get("track_ids", ())))
        anchors = list(spec.get("anchors", ()))
        configurations = list(spec.get("configurations", ()))

        with self.repository.write_transaction():
            library = self.conn.execute(
                "select id from libraries where id = ?", (library_id,)
            ).fetchone()
            if library is None:
                raise NotFoundError(f"library not found: {library_id}")
            if self.conn.execute(
                "select 1 from evaluation_sets where library_id = ? and name = ? and version = ?",
                (library_id, name, version),
            ).fetchone():
                raise ConflictError(
                    f"evaluation set {name!r} version {version!r} already exists"
                )

            if not requested_tracks:
                requested_tracks = [
                    str(row["id"])
                    for row in self.conn.execute(
                        "select id from tracks where library_id = ? order by id", (library_id,)
                    ).fetchall()
                ]
            self._require_library_tracks(library_id, requested_tracks)

            self.conn.execute(
                """
                insert into evaluation_sets (
                  id, library_id, name, description, version, purpose,
                  hidden_metadata_policy_json, split_policy_json,
                  evaluator_membership_json, created_at, updated_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    set_id,
                    library_id,
                    name,
                    str(spec.get("description") or ""),
                    version,
                    str(spec.get("purpose") or ""),
                    _json(spec.get("hidden_metadata_policy") or {"hide_during_primary_judgment": True}),
                    _json(spec.get("split_policy") or {}),
                    _json(spec.get("evaluator_ids") or []),
                    now,
                    now,
                ),
            )
            split_by_track = {
                str(item.get("track_id")): str(item.get("split") or "evaluation")
                for item in spec.get("track_splits", ())
            }
            for track_id in requested_tracks:
                split = split_by_track.get(track_id, "evaluation")
                self._validate_split(split)
                self.conn.execute(
                    "insert into evaluation_set_tracks values (?, ?, ?, ?)",
                    (set_id, track_id, split, now),
                )

            for anchor in anchors:
                track_id = str(anchor["track_id"])
                if track_id not in requested_tracks:
                    raise ValueError(f"anchor {track_id} is not in the evaluation corpus")
                split = str(anchor.get("split") or split_by_track.get(track_id) or "evaluation")
                self._validate_split(split)
                pool = list(dict.fromkeys(str(value) for value in anchor.get("candidate_track_ids", ())))
                if pool:
                    unknown = set(pool) - set(requested_tracks)
                    if unknown:
                        raise ValueError(f"candidate pool contains tracks outside the corpus: {sorted(unknown)}")
                self.conn.execute(
                    """
                    insert into evaluation_anchors (
                      id, evaluation_set_id, track_id, label, notes, split,
                      held_out, candidate_pool_json, created_at
                    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(uuid.uuid4()),
                        set_id,
                        track_id,
                        str(anchor.get("label") or ""),
                        str(anchor.get("notes") or ""),
                        split,
                        int(bool(anchor.get("held_out", False))),
                        _json(pool),
                        now,
                    ),
                )

            for configuration in configurations:
                self._insert_configuration(set_id, library_id, configuration, now)
        return self.get_evaluation_set(set_id) or {}

    def get_evaluation_set(self, evaluation_set_id: str) -> dict[str, Any] | None:
        with self.repository.synchronized():
            row = self.conn.execute(
                "select * from evaluation_sets where id = ?", (evaluation_set_id,)
            ).fetchone()
            if row is None:
                return None
            tracks = self.conn.execute(
                """
                select t.track_id, t.split, r.title, r.artist
                from evaluation_set_tracks t join tracks r on r.id = t.track_id
                where t.evaluation_set_id = ? order by r.artist, r.title, r.id
                """,
                (evaluation_set_id,),
            ).fetchall()
            anchors = self.conn.execute(
                """
                select a.*, t.title, t.artist
                from evaluation_anchors a join tracks t on t.id = a.track_id
                where a.evaluation_set_id = ? order by a.created_at, a.id
                """,
                (evaluation_set_id,),
            ).fetchall()
            configurations = self.conn.execute(
                "select * from evaluation_configurations where evaluation_set_id = ? order by name, version",
                (evaluation_set_id,),
            ).fetchall()
            latest_run = self.conn.execute(
                "select * from evaluation_runs where evaluation_set_id = ? order by created_at desc, id desc limit 1",
                (evaluation_set_id,),
            ).fetchone()
        result = self._set_summary(row)
        result.update(
            tracks=[dict(item) for item in tracks],
            anchors=[self._anchor(item) for item in anchors],
            configurations=[self._configuration(item) for item in configurations],
            latest_run=self._run(latest_run) if latest_run else None,
        )
        return result

    def create_evaluation_run(
        self,
        evaluation_set_id: str,
        *,
        configuration_ids: Sequence[str],
        requested_k: int,
        idempotency_key: str,
    ) -> dict[str, Any]:
        now = utc_now()
        configuration_ids = list(dict.fromkeys(configuration_ids))
        if not configuration_ids:
            raise ValueError("at least one configuration is required")
        if requested_k < 1:
            raise ValueError("requested_k must be positive")
        with self.repository.write_transaction():
            evaluation_set = self.conn.execute(
                "select * from evaluation_sets where id = ?", (evaluation_set_id,)
            ).fetchone()
            if evaluation_set is None:
                raise NotFoundError(f"evaluation set not found: {evaluation_set_id}")
            placeholders = ",".join("?" for _ in configuration_ids)
            configurations = self.conn.execute(
                f"select * from evaluation_configurations where evaluation_set_id = ? and id in ({placeholders})",
                (evaluation_set_id, *configuration_ids),
            ).fetchall()
            if len(configurations) != len(configuration_ids):
                raise ValueError("one or more configurations do not belong to the evaluation set")
            anchors = self.conn.execute(
                "select * from evaluation_anchors where evaluation_set_id = ? order by created_at, id",
                (evaluation_set_id,),
            ).fetchall()
            corpus = {
                str(row["track_id"])
                for row in self.conn.execute(
                    "select track_id from evaluation_set_tracks where evaluation_set_id = ?",
                    (evaluation_set_id,),
                ).fetchall()
            }
            existing = self.conn.execute(
                "select * from evaluation_runs where idempotency_key = ?", (idempotency_key,)
            ).fetchone()
            signature = (evaluation_set_id, requested_k, sorted(configuration_ids))
            if existing:
                prior = (
                    str(existing["evaluation_set_id"]),
                    int(existing["requested_k"]),
                    sorted(_load(existing["configuration_ids_json"], [])),
                )
                if prior != signature:
                    raise ConflictError("idempotency key is bound to a different evaluation run")
                self._require_evaluation_results_complete(
                    str(existing["id"]),
                    configurations=configurations,
                    anchors=anchors,
                    corpus=corpus,
                    requested_k=requested_k,
                )
                return self._run(existing)
            run_id = str(uuid.uuid4())
            self.conn.execute(
                """
                insert into evaluation_runs (
                  id, evaluation_set_id, evaluation_set_version, idempotency_key,
                  status, requested_k, configuration_ids_json, created_at,
                  finished_at, updated_at
                ) values (?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    evaluation_set_id,
                    evaluation_set["version"],
                    idempotency_key,
                    requested_k,
                    _json(configuration_ids),
                    now,
                    now,
                    now,
                ),
            )
            for anchor in anchors:
                explicit_pool = set(_load(anchor["candidate_pool_json"], []))
                pool = set(explicit_pool or corpus)
                pool.discard(str(anchor["track_id"]))
                for configuration in configurations:
                    self._materialize_neighbors(
                        run_id,
                        evaluation_set_id,
                        anchor_track_id=str(anchor["track_id"]),
                        configuration=configuration,
                        candidate_pool=pool,
                        requested_k=requested_k,
                        now=now,
                    )
            self._require_evaluation_results_complete(
                run_id,
                configurations=configurations,
                anchors=anchors,
                corpus=corpus,
                requested_k=requested_k,
            )
            row = self.conn.execute(
                "select * from evaluation_runs where id = ?", (run_id,)
            ).fetchone()
        return self._run(row)

    def get_next(
        self,
        evaluation_set_id: str,
        *,
        evaluator_id: str,
        anchor_id: str | None,
        configuration_ids: Sequence[str],
    ) -> dict[str, Any] | None:
        with self.repository.synchronized():
            evaluation_set = self.conn.execute(
                "select * from evaluation_sets where id = ?", (evaluation_set_id,)
            ).fetchone()
            if evaluation_set is None:
                raise NotFoundError(f"evaluation set not found: {evaluation_set_id}")
            self._require_evaluator(evaluation_set, evaluator_id)
            run = self.conn.execute(
                "select * from evaluation_runs where evaluation_set_id = ? and status = 'completed' order by created_at desc, id desc limit 1",
                (evaluation_set_id,),
            ).fetchone()
            if run is None:
                return None
            params: list[Any] = [evaluation_set_id]
            anchor_where = ""
            if anchor_id:
                anchor_where = "and a.track_id = ?"
                params.append(anchor_id)
            anchor = self.conn.execute(
                f"""
                select a.*, t.title, t.artist, t.album, t.duration_sec,
                       count(j.id) as judgment_count
                from evaluation_anchors a
                join tracks t on t.id = a.track_id
                left join similarity_judgments j
                  on j.evaluation_set_id = a.evaluation_set_id
                 and j.anchor_track_id = a.track_id and j.evaluator_id = ?
                where a.evaluation_set_id = ? {anchor_where}
                group by a.id
                order by judgment_count, a.created_at, a.id
                limit 1
                """,
                (evaluator_id, *params),
            ).fetchone()
            if anchor is None:
                return None
            selected_configs = list(configuration_ids) or _load(run["configuration_ids_json"], [])
            groups = self._neighbor_groups(
                evaluation_set_id,
                str(run["id"]),
                str(anchor["track_id"]),
                selected_configs,
                reveal_metadata=not self._metadata_hidden(evaluation_set),
            )
        return {
            "contract_version": CONTRACT_VERSION,
            "evaluation_set_id": evaluation_set_id,
            "evaluation_set_version": evaluation_set["version"],
            "evaluation_run_id": run["id"],
            "blind": self._metadata_hidden(evaluation_set),
            "anchor": {
                "track_id": anchor["track_id"],
                "id": anchor["track_id"],
                "preview_url": f"/audio/{anchor['track_id']}",
                **(
                    {
                        "title": anchor["title"],
                        "artist": anchor["artist"],
                        "album": anchor["album"],
                        "duration_sec": anchor["duration_sec"],
                    }
                    if not self._metadata_hidden(evaluation_set)
                    else {}
                ),
                "label": anchor["label"] if not self._metadata_hidden(evaluation_set) else "Anchor",
                "split": anchor["split"],
                "held_out": _bool(anchor["held_out"]),
            },
            "configurations": groups,
            "rankings": [
                {
                    "configuration_id": group["configuration_id"],
                    "candidates": group["neighbors"],
                }
                for group in groups
            ],
        }

    def list_neighbors(
        self,
        evaluation_set_id: str,
        *,
        anchor_track_id: str,
        configuration_ids: Sequence[str],
    ) -> dict[str, Any]:
        with self.repository.synchronized():
            evaluation_set = self.conn.execute(
                "select * from evaluation_sets where id = ?", (evaluation_set_id,)
            ).fetchone()
            if evaluation_set is None:
                raise NotFoundError(f"evaluation set not found: {evaluation_set_id}")
            run = self.conn.execute(
                "select * from evaluation_runs where evaluation_set_id = ? and status = 'completed' order by created_at desc, id desc limit 1",
                (evaluation_set_id,),
            ).fetchone()
            if run is None:
                raise NotFoundError("evaluation set has no materialized run")
            configs = list(configuration_ids) or _load(run["configuration_ids_json"], [])
            groups = self._neighbor_groups(
                evaluation_set_id,
                str(run["id"]),
                anchor_track_id,
                configs,
                reveal_metadata=not self._metadata_hidden(evaluation_set),
            )
        return {
            "contract_version": CONTRACT_VERSION,
            "evaluation_set_id": evaluation_set_id,
            "evaluation_run_id": run["id"],
            "anchor_track_id": anchor_track_id,
            "configurations": groups,
        }

    def save_judgment(self, evaluation_set_id: str, value: Mapping[str, Any]) -> dict[str, Any]:
        now = utc_now()
        evaluator_id = str(value["evaluator_id"])
        judgment_type = str(value["judgment_type"])
        decision = str(value["decision"])
        stored_decision = {"accepted": "similar", "rejected": "not_similar"}.get(
            decision, decision
        )
        dimension = str(value.get("dimension") or "overall")
        if dimension not in DIMENSIONS:
            raise ValueError(f"unsupported judgment dimension: {dimension}")
        candidate_b = value.get("candidate_b_track_id")
        ordinal = value.get("ordinal_rating")
        self._validate_judgment(judgment_type, decision, candidate_b, ordinal)
        key = str(value["idempotency_key"])

        with self.repository.write_transaction():
            evaluation_set = self.conn.execute(
                "select * from evaluation_sets where id = ?", (evaluation_set_id,)
            ).fetchone()
            if evaluation_set is None:
                raise NotFoundError(f"evaluation set not found: {evaluation_set_id}")
            self._require_evaluator(evaluation_set, evaluator_id)
            existing = self.conn.execute(
                "select * from similarity_judgments where evaluation_set_id = ? and idempotency_key = ?",
                (evaluation_set_id, key),
            ).fetchone()
            if existing:
                signature = (
                    str(existing["anchor_track_id"]),
                    str(existing["candidate_a_track_id"]),
                    existing["candidate_b_track_id"],
                    str(existing["judgment"]),
                    str(existing["judgment_type"]),
                    str(existing["dimension"]),
                )
                requested = (
                    str(value["anchor_track_id"]),
                    str(value["candidate_a_track_id"]),
                    candidate_b,
                    stored_decision,
                    judgment_type,
                    dimension,
                )
                if signature != requested:
                    raise ConflictError("idempotency key is bound to a different judgment")
                return self._judgment(existing)

            anchor_track_id = str(value["anchor_track_id"])
            candidate_a = str(value["candidate_a_track_id"])
            self._require_evaluation_tracks(evaluation_set_id, [anchor_track_id, candidate_a, candidate_b])
            if not self.conn.execute(
                "select 1 from evaluation_anchors where evaluation_set_id = ? and track_id = ?",
                (evaluation_set_id, anchor_track_id),
            ).fetchone():
                raise ValueError("anchor is not registered in the evaluation set")
            configuration_id = value.get("configuration_id")
            if configuration_id and not self.conn.execute(
                "select 1 from evaluation_configurations where evaluation_set_id = ? and id = ?",
                (evaluation_set_id, configuration_id),
            ).fetchone():
                raise ValueError("configuration does not belong to the evaluation set")
            evaluation_run_id = value.get("evaluation_run_id")
            if evaluation_run_id:
                run = self.conn.execute(
                    "select id from evaluation_runs where id = ? and evaluation_set_id = ?",
                    (evaluation_run_id, evaluation_set_id),
                ).fetchone()
            else:
                run = self.conn.execute(
                    "select id from evaluation_runs where evaluation_set_id = ? and status = 'completed' order by created_at desc, id desc limit 1",
                    (evaluation_set_id,),
                ).fetchone()
                evaluation_run_id = run["id"] if run else None
            if evaluation_run_id and run is None:
                raise ValueError("evaluation run does not belong to the evaluation set")
            rank_position = value.get("rank_position")
            if configuration_id and evaluation_run_id:
                frozen_result = self.conn.execute(
                    """
                    select rank from evaluation_neighbor_results
                    where evaluation_run_id = ? and evaluation_set_id = ?
                      and anchor_track_id = ? and configuration_id = ?
                      and candidate_track_id = ?
                    """,
                    (
                        evaluation_run_id,
                        evaluation_set_id,
                        anchor_track_id,
                        configuration_id,
                        candidate_a,
                    ),
                ).fetchone()
                if frozen_result is None:
                    raise ValueError("candidate is not in the frozen evaluation ranking")
                if rank_position is not None and int(rank_position) != int(frozen_result["rank"]):
                    raise ConflictError("submitted rank does not match the frozen evaluation ranking")
                rank_position = int(frozen_result["rank"])
            judgment_id = str(uuid.uuid4())
            self.conn.execute(
                """
                insert into similarity_judgments (
                  id, evaluation_set_id, anchor_track_id, candidate_a_track_id,
                  candidate_b_track_id, judgment, confidence, notes, created_at,
                  evaluator_id, judgment_type, dimension, ordinal_rating,
                  candidate_configuration_id, evaluation_run_id, rank_position,
                  blind, idempotency_key, updated_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    judgment_id,
                    evaluation_set_id,
                    anchor_track_id,
                    candidate_a,
                    candidate_b,
                    stored_decision,
                    value.get("confidence"),
                    str(value.get("notes") or ""),
                    now,
                    evaluator_id,
                    judgment_type,
                    dimension,
                    ordinal,
                    configuration_id,
                    evaluation_run_id,
                    rank_position,
                    int(bool(value.get("blind", True))),
                    key,
                    now,
                ),
            )
            row = self.conn.execute(
                "select * from similarity_judgments where id = ?", (judgment_id,)
            ).fetchone()
        return self._judgment(row)

    def save_operational_metrics(
        self, evaluation_set_id: str, evaluation_run_id: str, metrics: Sequence[Mapping[str, Any]]
    ) -> list[dict[str, Any]]:
        with self.repository.write_transaction():
            run = self.conn.execute(
                "select * from evaluation_runs where id = ? and evaluation_set_id = ?",
                (evaluation_run_id, evaluation_set_id),
            ).fetchone()
            if run is None:
                raise NotFoundError("evaluation run not found")
            now = utc_now()
            allowed_configurations = set(_load(run["configuration_ids_json"], []))
            for metric in metrics:
                configuration_id = str(metric["configuration_id"])
                if configuration_id not in allowed_configurations:
                    raise ValueError(
                        "metric configuration does not belong to the evaluation run"
                    )
                self.conn.execute(
                    """
                    insert into evaluation_run_metrics (
                      evaluation_run_id, configuration_id, metric_name, dimension,
                      k, value, sample_count, details_json, computed_at
                    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    on conflict (evaluation_run_id, configuration_id, metric_name, dimension, k)
                    do update set value = excluded.value, sample_count = excluded.sample_count,
                                  details_json = excluded.details_json,
                                  computed_at = excluded.computed_at
                    """,
                    (
                        evaluation_run_id,
                        configuration_id,
                        str(metric["metric_name"]),
                        str(metric.get("dimension") or "overall"),
                        int(metric.get("k") or 0),
                        metric.get("value"),
                        int(metric.get("sample_count") or 0),
                        _json(metric.get("details") or {}),
                        now,
                    ),
                )
            rows = self.conn.execute(
                "select * from evaluation_run_metrics where evaluation_run_id = ? order by configuration_id, metric_name, dimension, k",
                (evaluation_run_id,),
            ).fetchall()
        return [self._metric(row) for row in rows]

    def report(self, evaluation_set_id: str) -> dict[str, Any]:
        with self.repository.write_transaction():
            evaluation_set = self.conn.execute(
                "select * from evaluation_sets where id = ?", (evaluation_set_id,)
            ).fetchone()
            if evaluation_set is None:
                raise NotFoundError(f"evaluation set not found: {evaluation_set_id}")
            run = self.conn.execute(
                "select * from evaluation_runs where evaluation_set_id = ? and status = 'completed' order by created_at desc, id desc limit 1",
                (evaluation_set_id,),
            ).fetchone()
            if run is None:
                return {
                    "contract_version": CONTRACT_VERSION,
                    "evaluation_set_id": evaluation_set_id,
                    "evaluation_set_version": evaluation_set["version"],
                    "evaluation_run_id": None,
                    "configurations": [],
                    "comparisons": [],
                }
            self._compute_judgment_metrics(evaluation_set_id, str(run["id"]))
            configs = self.conn.execute(
                """
                select c.* from evaluation_configurations c
                where c.id in (
                  select configuration_id from evaluation_neighbor_results where evaluation_run_id = ?
                  union select configuration_id from evaluation_run_metrics where evaluation_run_id = ?
                ) order by c.name, c.version
                """,
                (run["id"], run["id"]),
            ).fetchall()
            metric_rows = self.conn.execute(
                "select * from evaluation_run_metrics where evaluation_run_id = ? order by metric_name, dimension, k, configuration_id",
                (run["id"],),
            ).fetchall()
            failure_rows = self.conn.execute(
                """
                select c.id as configuration_id, s.track_id, t.location,
                       s.extractor_name, s.error_code, s.error_message
                from evaluation_configurations c
                join analysis_stages s
                  on s.run_id = c.analysis_run_id and s.status = 'failed'
                join tracks t on t.id = s.track_id
                where c.evaluation_set_id = ?
                order by c.id, s.extractor_name, s.track_id
                """,
                (evaluation_set_id,),
            ).fetchall()
        by_config: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for metric in metric_rows:
            by_config[str(metric["configuration_id"])].append(self._metric(metric))
        failures: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in failure_rows:
            failures[str(row["configuration_id"])].append(
                {
                    "track_id": row["track_id"],
                    "location": row["location"],
                    "extractor_name": row["extractor_name"],
                    "error_code": row["error_code"],
                    "error_message": row["error_message"],
                }
            )
        summaries = [
            self._configuration_report(
                config,
                by_config.get(str(config["id"]), []),
                failures.get(str(config["id"]), []),
            )
            for config in configs
        ]
        return {
            "contract_version": CONTRACT_VERSION,
            "evaluation_set_id": evaluation_set_id,
            "evaluation_set_version": evaluation_set["version"],
            "evaluation_run_id": run["id"],
            "configurations": summaries,
            "comparisons": self._comparisons(metric_rows, configs),
        }

    def _insert_configuration(
        self, evaluation_set_id: str, library_id: str, value: Mapping[str, Any], now: str
    ) -> str:
        name = str(value["name"]).strip()
        version = str(value["version"]).strip()
        run_id = value.get("analysis_run_id")
        if run_id:
            run = self.conn.execute(
                "select library_id from analysis_runs where id = ?", (run_id,)
            ).fetchone()
            if run is None or str(run["library_id"]) != library_id:
                raise ValueError("configuration analysis run must belong to the evaluation library")
        configuration_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"crate-dig:evaluation:{evaluation_set_id}:{name}:{version}"))
        self.conn.execute(
            """
            insert into evaluation_configurations (
              id, evaluation_set_id, name, version, analysis_run_id, channel,
              parameters_json, created_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                configuration_id,
                evaluation_set_id,
                name,
                version,
                run_id,
                str(value.get("channel") or "global"),
                _json(value.get("parameters") or {}),
                now,
            ),
        )
        return configuration_id

    def _materialize_neighbors(
        self,
        evaluation_run_id: str,
        evaluation_set_id: str,
        *,
        anchor_track_id: str,
        configuration: sqlite3.Row,
        candidate_pool: set[str],
        requested_k: int,
        now: str,
    ) -> int:
        analysis_run_id = configuration["analysis_run_id"]
        if not analysis_run_id:
            raise ConflictError(
                f"evaluation configuration {configuration['id']!r} has no analysis run"
            )
        rows = self.conn.execute(
            """
            select * from similarity_neighbors
            where analysis_run_id = ? and source_track_id = ? and channel = ?
            order by rank, target_track_id
            """,
            (analysis_run_id, anchor_track_id, configuration["channel"]),
        ).fetchall()
        expected = min(requested_k, len(candidate_pool))
        eligible = [
            row for row in rows if str(row["target_track_id"]) in candidate_pool
        ]
        if len(eligible) < expected:
            raise ConflictError(
                "incomplete similarity candidates for "
                f"anchor {anchor_track_id!r}, configuration {configuration['id']!r}: "
                f"expected {expected}, found {len(eligible)}"
            )
        inserted = 0
        for row in eligible:
            candidate = str(row["target_track_id"])
            explanation = _load(row["explanation_json"], {})
            inserted += 1
            self.conn.execute(
                """
                insert into evaluation_neighbor_results (
                  evaluation_run_id, evaluation_set_id, anchor_track_id,
                  configuration_id, candidate_track_id, rank, score, distance,
                  components_json, reason_codes_json, provenance_json, created_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    evaluation_run_id,
                    evaluation_set_id,
                    anchor_track_id,
                    configuration["id"],
                    candidate,
                    inserted,
                    row["score"],
                    row["distance"],
                    _json(explanation.get("components") or {}),
                    _json(explanation.get("reason_codes") or []),
                    _json(
                        {
                            "analysis_run_id": analysis_run_id,
                            "channel": configuration["channel"],
                            "source_rank": row["rank"],
                            "configuration_name": configuration["name"],
                            "configuration_version": configuration["version"],
                        }
                    ),
                    now,
                ),
            )
            if inserted >= requested_k:
                break
        return inserted

    def _require_evaluation_results_complete(
        self,
        evaluation_run_id: str,
        *,
        configurations: Sequence[sqlite3.Row],
        anchors: Sequence[sqlite3.Row],
        corpus: set[str],
        requested_k: int,
    ) -> None:
        """Refuse completed/replayed evaluation runs with partial rankings."""

        for anchor in anchors:
            anchor_track_id = str(anchor["track_id"])
            explicit_pool = set(_load(anchor["candidate_pool_json"], []))
            candidate_pool = set(explicit_pool or corpus)
            candidate_pool.discard(anchor_track_id)
            expected = min(requested_k, len(candidate_pool))
            for configuration in configurations:
                rows = self.conn.execute(
                    """
                    select candidate_track_id, rank
                    from evaluation_neighbor_results
                    where evaluation_run_id = ? and anchor_track_id = ?
                      and configuration_id = ?
                    order by rank
                    """,
                    (evaluation_run_id, anchor_track_id, configuration["id"]),
                ).fetchall()
                ranks = [int(row["rank"]) for row in rows]
                candidates = {str(row["candidate_track_id"]) for row in rows}
                if (
                    len(rows) != expected
                    or ranks != list(range(1, expected + 1))
                    or not candidates.issubset(candidate_pool)
                ):
                    raise ConflictError(
                        "evaluation run has incomplete frozen candidates for "
                        f"anchor {anchor_track_id!r}, configuration {configuration['id']!r}"
                    )

    def _neighbor_groups(
        self,
        evaluation_set_id: str,
        evaluation_run_id: str,
        anchor_track_id: str,
        configuration_ids: Sequence[str],
        *,
        reveal_metadata: bool,
    ) -> list[dict[str, Any]]:
        if not configuration_ids:
            return []
        placeholders = ",".join("?" for _ in configuration_ids)
        rows = self.conn.execute(
            f"""
            select n.*, c.name, c.version, c.channel, t.id, t.title, t.artist,
                   t.album, t.duration_sec
            from evaluation_neighbor_results n
            join evaluation_configurations c on c.id = n.configuration_id
            join tracks t on t.id = n.candidate_track_id
            where n.evaluation_set_id = ? and n.evaluation_run_id = ?
              and n.anchor_track_id = ? and n.configuration_id in ({placeholders})
            order by c.name, c.version, n.rank
            """,
            (evaluation_set_id, evaluation_run_id, anchor_track_id, *configuration_ids),
        ).fetchall()
        groups: dict[str, dict[str, Any]] = {}
        for row in rows:
            config_id = str(row["configuration_id"])
            group = groups.setdefault(
                config_id,
                {
                    "configuration_id": config_id,
                    "name": row["name"],
                    "version": row["version"],
                    "channel": row["channel"],
                    "neighbors": [],
                },
            )
            group["neighbors"].append(
                {
                    **_track_payload(row, reveal_metadata=reveal_metadata),
                    "id": str(row["id"]),
                    "target_track_id": str(row["id"]),
                    "track": _track_payload(row, reveal_metadata=reveal_metadata),
                    "rank": row["rank"],
                    "score": row["score"],
                    "distance": row["distance"],
                    "components": _load(row["components_json"], {}),
                    "reason_codes": _load(row["reason_codes_json"], []),
                    "provenance": _load(row["provenance_json"], {}),
                }
            )
        return [groups[key] for key in configuration_ids if key in groups]

    def _compute_judgment_metrics(self, evaluation_set_id: str, run_id: str) -> None:
        evaluation_run = self.conn.execute(
            "select requested_k from evaluation_runs where id = ?", (run_id,)
        ).fetchone()
        requested_k = int(evaluation_run["requested_k"]) if evaluation_run else 0
        configs = self.conn.execute(
            "select id from evaluation_configurations where evaluation_set_id = ?",
            (evaluation_set_id,),
        ).fetchall()
        now = utc_now()
        for config in configs:
            config_id = str(config["id"])
            dimensions = self.conn.execute(
                """
                select distinct dimension from similarity_judgments
                where evaluation_set_id = ? and candidate_configuration_id = ?
                  and evaluation_run_id = ?
                """,
                (evaluation_set_id, config_id, run_id),
            ).fetchall()
            for dimension_row in dimensions or [{"dimension": "overall"}]:
                dimension = str(dimension_row["dimension"])
                topk = self.conn.execute(
                    """
                    select judgment, ordinal_rating, rank_position from similarity_judgments
                    where evaluation_set_id = ? and candidate_configuration_id = ?
                      and evaluation_run_id = ? and dimension = ?
                      and judgment_type = 'top_k' and judgment <> 'skip'
                    """,
                    (evaluation_set_id, config_id, run_id, dimension),
                ).fetchall()
                accepted = sum(row["judgment"] == "similar" for row in topk)
                self._upsert_metric(
                    run_id, config_id, "accepted_at_k", dimension, requested_k,
                    accepted / len(topk) if topk else None, len(topk), {}, now,
                )
                graded = [row for row in topk if row["ordinal_rating"] is not None and row["rank_position"]]
                ndcg = self._ndcg(graded, k=10)
                self._upsert_metric(
                    run_id, config_id, "ndcg", dimension, 10, ndcg,
                    len(graded), {}, now,
                )
                triplets = self.conn.execute(
                    """
                    select j.*, a.rank as a_rank, b.rank as b_rank
                    from similarity_judgments j
                    left join evaluation_neighbor_results a
                      on a.evaluation_run_id = ? and a.configuration_id = j.candidate_configuration_id
                     and a.anchor_track_id = j.anchor_track_id and a.candidate_track_id = j.candidate_a_track_id
                    left join evaluation_neighbor_results b
                      on b.evaluation_run_id = ? and b.configuration_id = j.candidate_configuration_id
                     and b.anchor_track_id = j.anchor_track_id and b.candidate_track_id = j.candidate_b_track_id
                    where j.evaluation_set_id = ? and j.candidate_configuration_id = ?
                      and j.evaluation_run_id = ? and j.dimension = ?
                      and j.judgment_type = 'triplet'
                      and j.judgment in ('a_closer', 'b_closer')
                    """,
                    (run_id, run_id, evaluation_set_id, config_id, run_id, dimension),
                ).fetchall()
                comparable = [row for row in triplets if row["a_rank"] and row["b_rank"]]
                correct = sum(
                    (row["judgment"] == "a_closer" and row["a_rank"] < row["b_rank"])
                    or (row["judgment"] == "b_closer" and row["b_rank"] < row["a_rank"])
                    for row in comparable
                )
                self._upsert_metric(
                    run_id, config_id, "triplet_accuracy", dimension, 0,
                    correct / len(comparable) if comparable else None,
                    len(comparable), {}, now,
                )

    def _upsert_metric(
        self,
        run_id: str,
        config_id: str,
        metric_name: str,
        dimension: str,
        k: int,
        value: float | None,
        sample_count: int,
        details: Mapping[str, Any],
        now: str,
    ) -> None:
        self.conn.execute(
            """
            insert into evaluation_run_metrics values (?, ?, ?, ?, ?, ?, ?, ?, ?)
            on conflict (evaluation_run_id, configuration_id, metric_name, dimension, k)
            do update set value = excluded.value, sample_count = excluded.sample_count,
                          details_json = excluded.details_json,
                          computed_at = excluded.computed_at
            """,
            (run_id, config_id, metric_name, dimension, k, value, sample_count, _json(details), now),
        )

    @staticmethod
    def _ndcg(rows: Sequence[sqlite3.Row], *, k: int) -> float | None:
        if not rows:
            return None
        relevance = sorted(
            ((int(row["rank_position"]), int(row["ordinal_rating"])) for row in rows),
            key=lambda item: item[0],
        )[:k]
        dcg = sum((2**grade - 1) / math.log2(rank + 1) for rank, grade in relevance)
        ideal = sorted((grade for _, grade in relevance), reverse=True)
        idcg = sum((2**grade - 1) / math.log2(index + 2) for index, grade in enumerate(ideal))
        return dcg / idcg if idcg else 0.0

    @staticmethod
    def _comparisons(metric_rows: Sequence[sqlite3.Row], configs: Sequence[sqlite3.Row]) -> list[dict[str, Any]]:
        names = {str(row["id"]): f"{row['name']}@{row['version']}" for row in configs}
        buckets: dict[tuple[str, str, int], list[sqlite3.Row]] = defaultdict(list)
        for row in metric_rows:
            if row["value"] is not None:
                buckets[(str(row["metric_name"]), str(row["dimension"]), int(row["k"]))].append(row)
        comparisons: list[dict[str, Any]] = []
        for (metric, dimension, k), rows in buckets.items():
            ranked = sorted(rows, key=lambda row: float(row["value"]), reverse=True)
            winner = ranked[0]
            runner_up = ranked[1] if len(ranked) > 1 else None
            comparisons.append(
                {
                    "metric_name": metric,
                    "dimension": dimension,
                    "k": k or None,
                    "winner_configuration_id": winner["configuration_id"],
                    "winner": names.get(str(winner["configuration_id"])),
                    "value": winner["value"],
                    "delta_to_runner_up": (
                        float(winner["value"]) - float(runner_up["value"])
                        if runner_up is not None else None
                    ),
                    "sample_count": winner["sample_count"],
                }
            )
        return comparisons

    def _require_library_tracks(self, library_id: str, track_ids: Sequence[str]) -> None:
        if not track_ids:
            return
        placeholders = ",".join("?" for _ in track_ids)
        rows = self.conn.execute(
            f"select id from tracks where library_id = ? and id in ({placeholders})",
            (library_id, *track_ids),
        ).fetchall()
        missing = set(track_ids) - {str(row["id"]) for row in rows}
        if missing:
            raise ValueError(f"tracks do not belong to the library: {sorted(missing)}")

    def _require_evaluation_tracks(self, evaluation_set_id: str, values: Sequence[Any]) -> None:
        track_ids = {str(value) for value in values if value}
        if not track_ids:
            return
        placeholders = ",".join("?" for _ in track_ids)
        rows = self.conn.execute(
            f"select track_id from evaluation_set_tracks where evaluation_set_id = ? and track_id in ({placeholders})",
            (evaluation_set_id, *track_ids),
        ).fetchall()
        missing = track_ids - {str(row["track_id"]) for row in rows}
        if missing:
            raise ValueError(f"judgment tracks are outside the evaluation corpus: {sorted(missing)}")

    @staticmethod
    def _validate_split(split: str) -> None:
        if split not in {"train", "validation", "test", "evaluation"}:
            raise ValueError(f"unsupported evaluation split: {split}")

    @staticmethod
    def _validate_judgment(
        judgment_type: str, decision: str, candidate_b: Any, ordinal: Any
    ) -> None:
        if judgment_type == "triplet":
            if not candidate_b or decision not in {"a_closer", "b_closer", "tie", "skip"}:
                raise ValueError("triplets require candidate B and a triplet decision")
        elif judgment_type == "top_k":
            if candidate_b or decision not in {
                "accepted", "rejected", "similar", "not_similar", "skip"
            }:
                raise ValueError("top-K judgments require accepted, rejected, or skip")
        elif judgment_type == "pair_rating":
            if candidate_b or decision not in {"accepted", "rejected", "similar", "not_similar", "skip"}:
                raise ValueError("pair ratings require a pair decision")
            if ordinal is not None and not 0 <= int(ordinal) <= 4:
                raise ValueError("ordinal rating must be between 0 and 4")
        else:
            raise ValueError(f"unsupported judgment type: {judgment_type}")

    @staticmethod
    def _require_evaluator(evaluation_set: sqlite3.Row, evaluator_id: str) -> None:
        members = _load(evaluation_set["evaluator_membership_json"], [])
        if members and evaluator_id not in members:
            raise ValueError("evaluator is not a member of this evaluation set")

    @staticmethod
    def _metadata_hidden(evaluation_set: sqlite3.Row) -> bool:
        policy = _load(evaluation_set["hidden_metadata_policy_json"], {})
        return bool(policy.get("hide_during_primary_judgment", True))

    @staticmethod
    def _set_summary(row: sqlite3.Row) -> dict[str, Any]:
        policy = _load(row["hidden_metadata_policy_json"], {})
        return {
            "contract_version": CONTRACT_VERSION,
            "id": row["id"],
            "library_id": row["library_id"],
            "name": row["name"],
            "version": row["version"],
            "description": row["description"],
            "purpose": row["purpose"],
            "hidden_metadata_policy": policy,
            "hidden_metadata": bool(policy.get("hide_during_primary_judgment", True)),
            "split_policy": _load(row["split_policy_json"], {}),
            "evaluator_ids": _load(row["evaluator_membership_json"], []),
            "anchor_count": int(row["anchor_count"]) if "anchor_count" in row.keys() else None,
            "track_count": int(row["track_count"]) if "track_count" in row.keys() else None,
            "configuration_count": int(row["configuration_count"]) if "configuration_count" in row.keys() else None,
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    @staticmethod
    def _anchor(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "track_id": row["track_id"],
            "track": {
                "id": row["track_id"],
                "track_id": row["track_id"],
                "title": row["title"],
                "artist": row["artist"],
                "preview_url": f"/audio/{row['track_id']}",
            },
            "title": row["title"],
            "artist": row["artist"],
            "label": row["label"],
            "notes": row["notes"],
            "split": row["split"],
            "held_out": _bool(row["held_out"]),
            "candidate_track_ids": _load(row["candidate_pool_json"], []),
        }

    @staticmethod
    def _configuration(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "name": row["name"],
            "version": row["version"],
            "analysis_run_id": row["analysis_run_id"],
            "channel": row["channel"],
            "channels": [row["channel"]],
            "role": "retrieval",
            "description": "",
            "status": "ready",
            "parameters": _load(row["parameters_json"], {}),
        }

    @staticmethod
    def _configuration_report(
        config: sqlite3.Row,
        metrics: Sequence[dict[str, Any]],
        failures: Sequence[dict[str, Any]],
    ) -> dict[str, Any]:
        values = {
            (str(metric["metric_name"]), int(metric["k"] or 0)): metric
            for metric in metrics
            if metric["dimension"] == "overall"
        }
        accepted = next(
            (metric for metric in metrics if metric["metric_name"] == "accepted_at_k" and metric["dimension"] == "overall"),
            None,
        )
        ndcg = values.get(("ndcg", 10))
        triplet = values.get(("triplet_accuracy", 0))
        runtime = values.get(("runtime_per_audio_minute", 0))
        failure = values.get(("failure_rate", 0))
        artifact = values.get(("artifact_bytes_per_track", 0))
        failure_counts: dict[str, int] = defaultdict(int)
        for item in failures:
            failure_counts[str(item["extractor_name"])] += 1
        return {
            **EvaluationService._configuration(config),
            "accepted_at_10": accepted["value"] if accepted else None,
            "ndcg_at_10": ndcg["value"] if ndcg else None,
            "triplet_accuracy": triplet["value"] if triplet else None,
            "runtime_per_audio_minute": runtime["value"] if runtime else None,
            "failure_rate": failure["value"] if failure else None,
            "bytes_per_track": artifact["value"] if artifact else None,
            "judgment_count": max(
                (int(metric["sample_count"]) for metric in metrics), default=0
            ),
            "metrics": list(metrics),
            "failures_by_extractor": [
                {"extractor_name": name, "failure_count": count}
                for name, count in sorted(failure_counts.items())
            ],
            "failures_by_file": list(failures),
        }

    @staticmethod
    def _run(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "contract_version": CONTRACT_VERSION,
            "id": row["id"],
            "evaluation_set_id": row["evaluation_set_id"],
            "evaluation_set_version": row["evaluation_set_version"],
            "status": row["status"],
            "requested_k": row["requested_k"],
            "configuration_ids": _load(row["configuration_ids_json"], []),
            "created_at": row["created_at"],
            "finished_at": row["finished_at"],
        }

    @staticmethod
    def _judgment(row: sqlite3.Row) -> dict[str, Any]:
        decision = row["judgment"]
        if row["judgment_type"] == "top_k":
            decision = {"similar": "accepted", "not_similar": "rejected"}.get(decision, decision)
        return {
            "contract_version": CONTRACT_VERSION,
            "id": row["id"],
            "evaluation_set_id": row["evaluation_set_id"],
            "evaluation_run_id": row["evaluation_run_id"],
            "evaluator_id": row["evaluator_id"],
            "judgment_type": row["judgment_type"],
            "dimension": row["dimension"],
            "anchor_track_id": row["anchor_track_id"],
            "candidate_a_track_id": row["candidate_a_track_id"],
            "candidate_b_track_id": row["candidate_b_track_id"],
            "configuration_id": row["candidate_configuration_id"],
            "rank_position": row["rank_position"],
            "decision": decision,
            "ordinal_rating": row["ordinal_rating"],
            "confidence": row["confidence"],
            "blind": _bool(row["blind"]),
            "notes": row["notes"],
            "created_at": row["created_at"],
        }

    @staticmethod
    def _metric(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "metric_name": row["metric_name"],
            "dimension": row["dimension"],
            "k": row["k"] or None,
            "value": row["value"],
            "sample_count": row["sample_count"],
            "details": _load(row["details_json"], {}),
            "computed_at": row["computed_at"],
        }


__all__ = ["CONTRACT_VERSION", "DIMENSIONS", "EvaluationService"]
