from __future__ import annotations

from pathlib import Path

import pytest

from cratedig_local_api import db
from cratedig_local_api.repository import Repository


def _completed_retrieval_run(
    tmp_path: Path, vector_values: list[list[float]] | None = None
) -> tuple[Repository, str, list[str]]:
    conn = db.connect(tmp_path / "similarity.sqlite")
    repository = Repository(conn)
    library_id = db.get_or_create_library(conn, "Similarity library", "folder")
    track_ids = [
        db.upsert_track(
            conn,
            library_id=library_id,
            title=f"Track {index}",
            artist="Artist",
            location=str(tmp_path / f"track-{index}.wav"),
        )
        for index in range(4)
    ]
    manifest = repository.upsert_model_set_manifest(
        "retrieval-test",
        "1",
        {
            "name": "retrieval-test",
            "version": "1",
            "extractors": [{"name": "retrieval-model", "version": "1"}],
        },
    )
    run = repository.create_analysis_run(
        library_id,
        manifest["id"],
        stages=[{"name": "retrieval-model", "version": "1"}],
    )
    vector_values = vector_values or [
        [1.0, 0.0],
        [1.0, 0.0],
        [1.0, 0.0],
        [0.0, 1.0],
    ]
    assert len(vector_values) == len(track_ids)
    vectors = dict(zip(track_ids, vector_values, strict=True))
    while stage := repository.claim_next_stage(worker_id="test", run_id=run["id"]):
        repository.complete_stage(
            stage["id"],
            worker_id="test",
            embeddings=[
                {
                    "embedding_key": "retrieval:track",
                    "embedding": vectors[str(stage["track_id"])],
                    "model_name": "retrieval-model",
                    "model_version": "1",
                    "scope": "track",
                }
            ],
        )
    assert repository.get_analysis_run(run["id"])["status"] == "completed"
    return repository, str(run["id"]), track_ids


def test_exact_cosine_materialization_is_deterministic_and_replaces_one_channel(
    tmp_path: Path,
):
    repository, run_id, track_ids = _completed_retrieval_run(tmp_path)
    try:
        result = repository.materialize_exact_neighbors(run_id, top_k=2)
        assert result["source_count"] == 4
        assert result["neighbor_count"] == 8
        assert result["normalization"] == "none"
        assert result["normalization_zero_variance_dimensions"] == 0

        rows = repository.conn.execute(
            """
            select source_track_id, target_track_id, rank, score, distance
            from similarity_neighbors
            where analysis_run_id = ? and channel = 'global'
            order by source_track_id, rank
            """,
            (run_id,),
        ).fetchall()
        assert all(row["source_track_id"] != row["target_track_id"] for row in rows)
        source_rows = [row for row in rows if row["source_track_id"] == track_ids[0]]
        assert [row["target_track_id"] for row in source_rows] == sorted(track_ids[1:3])
        assert [row["rank"] for row in source_rows] == [1, 2]
        assert all(row["score"] == pytest.approx(1.0) for row in source_rows)
        assert all(row["distance"] == pytest.approx(0.0) for row in source_rows)

        repository.materialize_exact_neighbors(run_id, channel="alternate", top_k=2)
        repository.materialize_exact_neighbors(run_id, channel="global", top_k=1)
        counts = dict(
            repository.conn.execute(
                """
                select channel, count(*) from similarity_neighbors
                where analysis_run_id = ? group by channel
                """,
                (run_id,),
            ).fetchall()
        )
        assert counts == {"alternate": 8, "global": 4}
    finally:
        repository.conn.close()


def test_zscore_v1_normalizes_corpus_features_and_zeroes_constant_dimensions(
    tmp_path: Path,
):
    repository, run_id, track_ids = _completed_retrieval_run(
        tmp_path,
        [
            [1000.0, 1.0, 5.0],
            [1000.0, 2.0, 5.0],
            [1000.0, 10.0, 5.0],
            [1000.0, 11.0, 5.0],
        ],
    )
    try:
        repository.materialize_exact_neighbors(
            run_id, channel="global", normalization="none", top_k=2
        )
        result = repository.materialize_exact_neighbors(
            run_id,
            channel="librosa-zscore-v1",
            normalization="zscore-v1",
            top_k=2,
        )

        assert result["normalization"] == "zscore-v1"
        assert result["normalization_zero_variance_dimensions"] == 2
        assert result["neighbor_count"] == 8
        neighbors = repository.list_neighbors(
            track_ids[0],
            run_id=run_id,
            channel="librosa-zscore-v1",
        )
        assert neighbors is not None
        assert neighbors[0]["target_track_id"] == track_ids[1]
        assert neighbors[0]["score"] == pytest.approx(1.0)
        provenance = neighbors[0]["explanation_json"]["provenance"]
        assert provenance["normalization"] == "zscore-v1"
        assert provenance["normalization_corpus_size"] == 4
        assert provenance["normalization_zero_variance_dimensions"] == 2

        channel_counts = dict(
            repository.conn.execute(
                """
                select channel, count(*) from similarity_neighbors
                where analysis_run_id = ? group by channel
                """,
                (run_id,),
            ).fetchall()
        )
        assert channel_counts == {"global": 8, "librosa-zscore-v1": 8}
    finally:
        repository.conn.close()


def test_zscore_v1_rejects_post_normalization_zero_norm_atomically(tmp_path: Path):
    repository, run_id, _track_ids = _completed_retrieval_run(
        tmp_path,
        [
            [1.0, 1.0],
            [2.0, 2.0],
            [3.0, 3.0],
            [6.0, 6.0],
        ],
    )
    try:
        repository.materialize_exact_neighbors(
            run_id, channel="candidate", normalization="none", top_k=1
        )
        before = repository.conn.execute(
            """
            select source_track_id, target_track_id, rank, score, explanation_json
            from similarity_neighbors
            where analysis_run_id = ? and channel = 'candidate'
            order by source_track_id, rank
            """,
            (run_id,),
        ).fetchall()

        with pytest.raises(
            ValueError, match="zero or invalid norm after zscore-v1 normalization"
        ):
            repository.materialize_exact_neighbors(
                run_id,
                channel="candidate",
                normalization="zscore-v1",
                top_k=1,
            )

        after = repository.conn.execute(
            """
            select source_track_id, target_track_id, rank, score, explanation_json
            from similarity_neighbors
            where analysis_run_id = ? and channel = 'candidate'
            order by source_track_id, rank
            """,
            (run_id,),
        ).fetchall()
        assert [tuple(row) for row in after] == [tuple(row) for row in before]
    finally:
        repository.conn.close()


def test_exact_cosine_rejects_unknown_normalization_mode(tmp_path: Path):
    repository, run_id, _track_ids = _completed_retrieval_run(tmp_path)
    try:
        with pytest.raises(ValueError, match="normalization must be"):
            repository.materialize_exact_neighbors(
                run_id, normalization="zscore-latest"
            )
    finally:
        repository.conn.close()


@pytest.mark.parametrize(
    ("vector", "message"),
    [
        ([0.0, 0.0], "zero or invalid norm"),
        ([float("nan"), 1.0], "non-finite values"),
        ([float("inf"), 1.0], "non-finite values"),
    ],
)
def test_exact_cosine_rejects_invalid_vectors_without_destroying_prior_cache(
    tmp_path: Path, vector: list[float], message: str
):
    repository, run_id, track_ids = _completed_retrieval_run(tmp_path)
    try:
        repository.materialize_exact_neighbors(run_id, top_k=1)
        before = repository.conn.execute(
            "select count(*) from similarity_neighbors where analysis_run_id = ?",
            (run_id,),
        ).fetchone()[0]
        stage_id = repository.conn.execute(
            "select stage_id from track_embeddings where analysis_run_id = ? and track_id = ?",
            (run_id, track_ids[0]),
        ).fetchone()[0]
        # Reuse the persistence boundary to obtain the canonical float32 bytes,
        # then restore the run's terminal status for materialization.
        repository.conn.execute(
            "update analysis_stages set status = 'running', worker_id = 'test' where id = ?",
            (stage_id,),
        )
        repository.complete_stage(
            stage_id,
            worker_id="test",
            embeddings=[
                {
                    "embedding_key": "retrieval:track",
                    "embedding": vector,
                    "model_name": "retrieval-model",
                    "model_version": "1",
                }
            ],
        )

        with pytest.raises(ValueError, match=message):
            repository.materialize_exact_neighbors(run_id, top_k=1)
        after = repository.conn.execute(
            "select count(*) from similarity_neighbors where analysis_run_id = ?",
            (run_id,),
        ).fetchone()[0]
        assert after == before == 4
    finally:
        repository.conn.close()


def test_exact_cosine_requires_dimension_compatible_track_embeddings(tmp_path: Path):
    repository, run_id, track_ids = _completed_retrieval_run(tmp_path)
    try:
        row = repository.conn.execute(
            "select stage_id from track_embeddings where analysis_run_id = ? and track_id = ?",
            (run_id, track_ids[0]),
        ).fetchone()
        repository.conn.execute(
            "update analysis_stages set status = 'running', worker_id = 'test' where id = ?",
            (row["stage_id"],),
        )
        repository.complete_stage(
            row["stage_id"],
            worker_id="test",
            embeddings=[
                {
                    "embedding_key": "retrieval:track",
                    "embedding": [1.0, 0.0, 0.0],
                    "model_name": "retrieval-model",
                    "model_version": "1",
                }
            ],
        )
        with pytest.raises(ValueError, match="one model, version, pooling strategy, and dimension"):
            repository.materialize_exact_neighbors(run_id, top_k=1)
    finally:
        repository.conn.close()
