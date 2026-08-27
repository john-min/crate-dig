"""Minimal CLI. `analyze-run` is the Cloud Run Job entrypoint."""

from __future__ import annotations

import argparse
import logging
import os
import sys


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="cratedig-engine")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("version", help="print package version")
    analyze = sub.add_parser(
        "analyze-run",
        help="process one analysis_run_id (Cloud Run Job)",
    )
    analyze.add_argument(
        "--analysis-run-id",
        default=os.environ.get("ANALYSIS_RUN_ID"),
        help="analysis_runs.id (or set ANALYSIS_RUN_ID)",
    )
    args = parser.parse_args(argv)
    if args.cmd == "version":
        from cratedig_engine import __version__

        print(__version__)
        return 0
    if args.cmd == "analyze-run":
        if not args.analysis_run_id:
            parser.error("--analysis-run-id or ANALYSIS_RUN_ID is required")
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s %(levelname)s %(name)s %(message)s",
        )
        from cratedig_engine.job import (
            AnalyzeRunError,
            JobConfigError,
            run_analyze_run,
        )

        try:
            return run_analyze_run(args.analysis_run_id)
        except (JobConfigError, AnalyzeRunError) as exc:
            print(str(exc), file=sys.stderr)
            return 1
    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
