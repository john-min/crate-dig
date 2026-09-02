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
    Migration(
        4,
        "similarity_evaluation_v1",
        (
            "alter table evaluation_sets add column purpose text not null default ''",
            "alter table evaluation_sets add column hidden_metadata_policy_json text not null default '{}'",
            "alter table evaluation_sets add column split_policy_json text not null default '{}'",
            "alter table evaluation_sets add column evaluator_membership_json text not null default '[]'",
            "alter table evaluation_anchors add column split text not null default 'evaluation' check (split in ('train', 'validation', 'test', 'evaluation'))",
            "alter table evaluation_anchors add column held_out integer not null default 0 check (held_out in (0, 1))",
            "alter table evaluation_anchors add column candidate_pool_json text not null default '[]'",
            """
            create table evaluation_set_tracks (
              evaluation_set_id text not null references evaluation_sets (id) on delete cascade,
              track_id text not null references tracks (id) on delete cascade,
              split text not null default 'evaluation'
                check (split in ('train', 'validation', 'test', 'evaluation')),
              created_at text not null,
              primary key (evaluation_set_id, track_id)
            )
            """,
            "create index evaluation_set_tracks_split_idx on evaluation_set_tracks (evaluation_set_id, split, track_id)",
            """
            create table evaluation_configurations (
              id text primary key,
              evaluation_set_id text not null references evaluation_sets (id) on delete cascade,
              name text not null,
              version text not null,
              analysis_run_id text references analysis_runs (id) on delete restrict,
              channel text not null default 'global',
              parameters_json text not null default '{}',
              created_at text not null,
              unique (evaluation_set_id, name, version)
            )
            """,
            "create index evaluation_configurations_set_idx on evaluation_configurations (evaluation_set_id, name, version)",
            """
            create table evaluation_runs (
              id text primary key,
              evaluation_set_id text not null references evaluation_sets (id) on delete cascade,
              evaluation_set_version text not null,
              idempotency_key text not null unique,
              status text not null default 'completed'
                check (status in ('queued', 'running', 'completed', 'failed')),
              requested_k integer not null default 25 check (requested_k > 0),
              configuration_ids_json text not null default '[]',
              created_at text not null,
              finished_at text,
              updated_at text not null
            )
            """,
            "create index evaluation_runs_set_idx on evaluation_runs (evaluation_set_id, created_at)",
            """
            create table evaluation_neighbor_results (
              evaluation_run_id text not null references evaluation_runs (id) on delete cascade,
              evaluation_set_id text not null references evaluation_sets (id) on delete cascade,
              anchor_track_id text not null references tracks (id) on delete cascade,
              configuration_id text not null references evaluation_configurations (id) on delete cascade,
              candidate_track_id text not null references tracks (id) on delete cascade,
              rank integer not null check (rank > 0),
              score real,
              distance real,
              components_json text not null default '{}',
              reason_codes_json text not null default '[]',
              provenance_json text not null default '{}',
              created_at text not null,
              primary key (evaluation_run_id, anchor_track_id, configuration_id, candidate_track_id),
              unique (evaluation_run_id, anchor_track_id, configuration_id, rank),
              check (anchor_track_id <> candidate_track_id)
            )
            """,
            "create index evaluation_neighbors_lookup_idx on evaluation_neighbor_results (evaluation_set_id, anchor_track_id, configuration_id, rank)",
            """
            create table evaluation_run_metrics (
              evaluation_run_id text not null references evaluation_runs (id) on delete cascade,
              configuration_id text not null references evaluation_configurations (id) on delete cascade,
              metric_name text not null,
              dimension text not null default 'overall',
              k integer not null default 0 check (k >= 0),
              value real,
              sample_count integer not null default 0 check (sample_count >= 0),
              details_json text not null default '{}',
              computed_at text not null,
              primary key (evaluation_run_id, configuration_id, metric_name, dimension, k)
            )
            """,
            "alter table similarity_judgments add column evaluator_id text not null default 'local'",
            "alter table similarity_judgments add column judgment_type text not null default 'pair_rating' check (judgment_type in ('pair_rating', 'triplet', 'top_k'))",
            "alter table similarity_judgments add column dimension text not null default 'overall'",
            "alter table similarity_judgments add column ordinal_rating integer check (ordinal_rating is null or (ordinal_rating >= 0 and ordinal_rating <= 4))",
            "alter table similarity_judgments add column candidate_configuration_id text references evaluation_configurations (id) on delete set null",
            "alter table similarity_judgments add column evaluation_run_id text references evaluation_runs (id) on delete set null",
            "alter table similarity_judgments add column rank_position integer check (rank_position is null or rank_position > 0)",
            "alter table similarity_judgments add column blind integer not null default 1 check (blind in (0, 1))",
            "alter table similarity_judgments add column idempotency_key text",
            "alter table similarity_judgments add column updated_at text",
            "create unique index similarity_judgments_idempotency_idx on similarity_judgments (evaluation_set_id, idempotency_key) where idempotency_key is not null",
            "create index similarity_judgments_config_idx on similarity_judgments (evaluation_set_id, candidate_configuration_id, dimension, judgment_type)",
        ),
    ),
    Migration(
        5,
        "curated_track_metadata",
        (
            "alter table tracks add column genre text not null default ''",
            "alter table tracks add column label text not null default ''",
            "alter table tracks add column bpm real",
            "alter table tracks add column musical_key text not null default ''",
            "alter table tracks add column rating integer",
            "alter table tracks add column date_added text not null default ''",
            "alter table tracks add column rekordbox_track_id text not null default ''",
            "alter table tracks add column bpm_source text not null default ''",
            "alter table tracks add column key_source text not null default ''",
            "create index tracks_rekordbox_track_id_idx on tracks (rekordbox_track_id)",
            "create index tracks_bpm_idx on tracks (bpm)",
            "create index tracks_musical_key_idx on tracks (musical_key)",
        ),
    ),
    Migration(
        6,
        "track_metadata_sources",
        (
            """
            create table track_metadata_sources (
              id text primary key,
              track_id text not null references tracks (id) on delete cascade,
              source_type text not null,
              source_ref text not null default '',
              source_track_id text not null default '',
              match_method text not null,
              title text not null default '',
              artist text not null default '',
              album text not null default '',
              genre text not null default '',
              label text not null default '',
              bpm real,
              musical_key text not null default '',
              duration_sec real,
              rating integer,
              date_added text not null default '',
              imported_at text not null,
              updated_at text not null,
              unique (track_id, source_type, source_ref, source_track_id)
            )
            """,
            "create index track_metadata_sources_track_idx on track_metadata_sources (track_id, source_type)",
            "create index track_metadata_sources_source_track_idx on track_metadata_sources (source_type, source_track_id)",
        ),
    ),
    Migration(
        7,
        "cloud_import_projection",
        (
            "alter table tracks add column energy_rating integer",
            "alter table tracks add column external_track_id text not null default ''",
            "create index tracks_external_track_id_idx on tracks (library_id, external_track_id)",
            """
            create table clusters (
              id text primary key,
              analysis_run_id text not null references analysis_runs (id) on delete cascade,
              cluster_index integer not null,
              name text not null default '',
              suggested_moment text not null default '',
              track_count integer not null default 0,
              created_at text not null,
              unique (analysis_run_id, cluster_index)
            )
            """,
            "create index clusters_run_idx on clusters (analysis_run_id, cluster_index)",
            """
            create table cluster_members (
              analysis_run_id text not null references analysis_runs (id) on delete cascade,
              track_id text not null references tracks (id) on delete cascade,
              cluster_id text references clusters (id) on delete set null,
              umap_x real not null,
              umap_y real not null,
              suggested_moment text not null default '',
              created_at text not null,
              primary key (analysis_run_id, track_id)
            )
            """,
            "create index cluster_members_track_idx on cluster_members (track_id, analysis_run_id)",
            "create index cluster_members_cluster_idx on cluster_members (cluster_id)",
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
