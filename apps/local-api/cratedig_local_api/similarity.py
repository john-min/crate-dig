"""Command-line entry point for deterministic local similarity materialization."""

from __future__ import annotations

import json
from argparse import ArgumentParser

from . import db
from .repository import Repository
from .settings import Settings


def main() -> None:
    parser = ArgumentParser(
        description="Materialize exact cosine neighbors from retrieval embeddings"
    )
    parser.add_argument("--run-id", required=True, help="Completed analysis run id")
    parser.add_argument("--channel", default="global")
    parser.add_argument("--embedding-key", default="retrieval:track")
    parser.add_argument("--top-k", type=int, default=25)
    parser.add_argument(
        "--normalization",
        choices=("none", "zscore-v1"),
        default="none",
        help="Versioned corpus feature normalization applied before cosine",
    )
    args = parser.parse_args()

    settings = Settings.from_env()
    conn = db.connect(settings.sqlite_path)
    try:
        result = Repository(conn).materialize_exact_neighbors(
            args.run_id,
            channel=args.channel,
            embedding_key=args.embedding_key,
            top_k=args.top_k,
            normalization=args.normalization,
        )
    finally:
        conn.close()
    print(json.dumps(result, sort_keys=True))


__all__ = ["main"]
