from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import Final


@dataclass(frozen=True)
class Migration:
    version: int
    name: str
    statements: tuple[str, ...]


MIGRATIONS: Final[tuple[Migration, ...]] = (
    Migration(
        1,
        "library_and_tracks",
        (
            """
            create table if not exists libraries (
              id text primary key,
              name text not null,
              source text not null,
              created_at text not null,
              updated_at text not null
            )
            """,
            """
            create table if not exists tracks (
              id text primary key,
              library_id text not null references libraries (id) on delete cascade,
              title text not null default '',
              artist text not null default '',
              album text not null default '',
              duration_sec real,
              location text not null default '',
              location_kind text not null default 'file',
              created_at text not null,
              unique (library_id, location)
            )
            """,
            "create index if not exists tracks_library_id_idx on tracks (library_id)",
        ),
    ),
    Migration(
        2,
        "durable_analysis",
        (
            """
            create table model_set_manifests (
              id text primary key,
              name text not null,
              version text not null,
              manifest_hash text not null,
              manifest_json text not null,
              created_at text not null,
              unique (name, version),
              unique (manifest_hash)
            )
            """,
            """
            create table analysis_runs (
              id text primary key,
              library_id text not null references libraries (id) on delete cascade,
              manifest_id text not null references model_set_manifests (id),
              mode text not null default 'fast' check (mode in ('fast', 'deep')),
              idempotency_key text not null unique,
              status text not null default 'queued'
                check (status in ('queued', 'running', 'cancel_requested', 'completed', 'failed', 'cancelled')),
              cancellation_requested integer not null default 0 check (cancellation_requested in (0, 1)),
              tracks_total integer not null default 0 check (tracks_total >= 0),
              stages_total integer not null default 0 check (stages_total >= 0),
              stages_done integer not null default 0 check (stages_done >= 0),
              error_code text,
              error_message text,
              created_at text not null,
              started_at text,
              finished_at text,
              updated_at text not null
            )
            """,
            "create index analysis_runs_library_idx on analysis_runs (library_id, created_at)",
            """
            create table analysis_stages (
              id text primary key,
              run_id text not null references analysis_runs (id) on delete cascade,
              track_id text not null references tracks (id) on delete cascade,
              stage_name text not null,
              extractor_name text not null,
              extractor_version text not null,
              status text not null default 'queued'
                check (status in ('queued', 'running', 'succeeded', 'failed', 'skipped')),
              attempt_count integer not null default 0 check (attempt_count >= 0),
              max_attempts integer not null default 3 check (max_attempts > 0),
              retryable integer not null default 1 check (retryable in (0, 1)),
              progress real not null default 0 check (progress >= 0 and progress <= 1),
              worker_id text,
              lease_expires_at text,
              error_code text,
              error_message text,
              reason_code text,
              reason_message text,
              created_at text not null,
              started_at text,
              finished_at text,
              updated_at text not null,
              unique (run_id, track_id, stage_name, extractor_name, extractor_version)
            )
            """,
            "create index analysis_stages_claim_idx on analysis_stages (status, retryable, lease_expires_at, created_at)",
            "create index analysis_stages_run_idx on analysis_stages (run_id, track_id)",
            """
            create table track_features (
              id text primary key,
              track_id text not null references tracks (id) on delete cascade,
              analysis_run_id text not null references analysis_runs (id) on delete cascade,
              stage_id text references analysis_stages (id) on delete set null,
              feature_key text not null,
              evidence_key text not null,
              extractor_name text not null,
              extractor_version text not null,
              scope text not null default 'track',
              start_ms integer,
              end_ms integer,
              stem text,
              value_json text not null,
              unit text,
              confidence real,
              provenance_json text not null default '{}',
              created_at text not null,
              unique (track_id, analysis_run_id, evidence_key, extractor_name, extractor_version)
            )
            """,
            "create index track_features_run_track_idx on track_features (analysis_run_id, track_id)",
            """
            create table track_embeddings (
              id text primary key,
              track_id text not null references tracks (id) on delete cascade,
              analysis_run_id text not null references analysis_runs (id) on delete cascade,
              stage_id text references analysis_stages (id) on delete set null,
              embedding_key text not null,
              evidence_key text not null,
              model_name text not null,
              model_version text not null,
              scope text not null default 'track',
              start_ms integer,
              end_ms integer,
              stem text,
              pooling_strategy text,
              dimensions integer not null check (dimensions > 0),
              dtype text not null default 'float32-le' check (dtype in ('float32', 'float32-le')),
              embedding_blob blob not null,
              provenance_json text not null default '{}',
              created_at text not null,
              unique (track_id, analysis_run_id, evidence_key, model_name, model_version)
            )
            """,
            "create index track_embeddings_run_track_idx on track_embeddings (analysis_run_id, track_id)",
            """
            create table similarity_neighbors (
              analysis_run_id text not null references analysis_runs (id) on delete cascade,
              source_track_id text not null references tracks (id) on delete cascade,
              target_track_id text not null references tracks (id) on delete cascade,
              channel text not null default 'global',
              rank integer not null check (rank > 0),
              distance real not null,
              score real,
              explanation_json text not null default '{}',
              created_at text not null,
              primary key (analysis_run_id, source_track_id, target_track_id, channel),
              unique (analysis_run_id, source_track_id, channel, rank),
              check (source_track_id <> target_track_id)
            )
            """,
            "create index similarity_neighbors_lookup_idx on similarity_neighbors (source_track_id, analysis_run_id, channel, rank)",
            """
            create table projection_artifacts (
              id text primary key,
              analysis_run_id text not null references analysis_runs (id) on delete cascade,
              projection_name text not null,
              projection_version text not null,
              artifact_path text not null,
              artifact_hash text,
              parameters_json text not null default '{}',
              created_at text not null,
              unique (analysis_run_id, projection_name, projection_version)
            )
            """,
            """
            create table evaluation_sets (
              id text primary key,
              library_id text not null references libraries (id) on delete cascade,
              name text not null,
              description text not null default '',
              version text not null default '1',
              created_at text not null,
              updated_at text not null,
              unique (library_id, name, version)
            )
            """,
            """
            create table evaluation_anchors (
              id text primary key,
              evaluation_set_id text not null references evaluation_sets (id) on delete cascade,
              track_id text not null references tracks (id) on delete cascade,
              label text not null default '',
              notes text not null default '',
              created_at text not null,
              unique (evaluation_set_id, track_id)
            )
            """,
            """
            create table similarity_judgments (
              id text primary key,
              evaluation_set_id text not null references evaluation_sets (id) on delete cascade,
              anchor_track_id text not null references tracks (id) on delete cascade,
              candidate_a_track_id text not null references tracks (id) on delete cascade,
              candidate_b_track_id text references tracks (id) on delete cascade,
              judgment text not null check (judgment in ('similar', 'not_similar', 'a_closer', 'b_closer', 'tie', 'skip')),
              confidence real,
              notes text not null default '',
              created_at text not null,
              check (anchor_track_id <> candidate_a_track_id),
              check (candidate_b_track_id is null or anchor_track_id <> candidate_b_track_id)
            )
            """,
            "create index similarity_judgments_set_anchor_idx on similarity_judgments (evaluation_set_id, anchor_track_id)",
        ),
    ),
    Migration(
        3,
        "audio_content_identity",
        (
            "alter table tracks add column audio_content_hash text",
            "alter table tracks add column file_size_bytes integer",
            "alter table tracks add column file_mtime_ns integer",
            "alter table analysis_stages add column audio_content_hash text",
            "alter table analysis_stages add column cache_key text",
            "alter table analysis_stages add column cache_hit_from_stage_id text references analysis_stages (id)",
            "create index tracks_audio_content_hash_idx on tracks (audio_content_hash)",
            "create index analysis_stages_audio_content_hash_idx on analysis_stages (audio_content_hash)",
            "create index analysis_stages_cache_key_idx on analysis_stages (cache_key, status)",
        ),
    ),
)


LATEST_SCHEMA_VERSION: Final[int] = MIGRATIONS[-1].version


def migrate(conn: sqlite3.Connection) -> int:
    """Apply each pending schema migration in its own explicit transaction."""

    current = int(conn.execute("pragma user_version").fetchone()[0])
    if current > LATEST_SCHEMA_VERSION:
        raise RuntimeError(
            f"database schema {current} is newer than supported {LATEST_SCHEMA_VERSION}"
        )

    for migration in MIGRATIONS:
        if migration.version <= current:
            continue
        conn.execute("begin immediate")
        try:
            for statement in migration.statements:
                conn.execute(statement)
            conn.execute(f"pragma user_version = {migration.version}")
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        current = migration.version
    return current
