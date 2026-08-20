"""Minimal CLI. Cloud Run `analyze-run` lands in a later phase."""

from __future__ import annotations

import argparse
import sys


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="cratedig-engine")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("version", help="print package version")
    args = parser.parse_args(argv)
    if args.cmd == "version":
        from cratedig_engine import __version__

        print(__version__)
        return 0
    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
