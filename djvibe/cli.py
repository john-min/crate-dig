"""Command-line entry point.

    python -m djvibe extract   [--db-dir ... | --xml export.xml]
    python -m djvibe analyze   [--backend auto|essentia|librosa] [--limit N]
    python -m djvibe cluster   [--min-cluster-size 25]
    python -m djvibe dashboard
    python -m djvibe writeback
    python -m djvibe all       # analyze -> cluster -> dashboard (extract first)

Global: --workdir DIR  (default ./djvibe_data)
"""
from __future__ import annotations

import argparse

from . import analyze as analyze_mod
from . import cluster as cluster_mod
from . import dashboard as dashboard_mod
from . import library, writeback
from .io import Workspace


def main(argv=None):
    p = argparse.ArgumentParser(prog="djvibe", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--workdir", default="./djvibe_data")
    # let --workdir also work AFTER the subcommand (e.g. `analyze --workdir X`)
    base = argparse.ArgumentParser(add_help=False)
    base.add_argument("--workdir", default=argparse.SUPPRESS,
                      help="working directory (default ./djvibe_data)")
    sub = p.add_subparsers(dest="cmd", required=True)

    pe = sub.add_parser("extract", parents=[base], help="read the rekordbox collection")
    pe.add_argument("--db-dir", default=None, help="rekordbox app-data dir (auto if omitted)")
    pe.add_argument("--xml", default=None, help="path to a rekordbox XML export")

    pa = sub.add_parser("analyze", parents=[base], help="ML audio analysis")
    pa.add_argument("--backend", default="auto", choices=["auto", "essentia", "librosa", "clap"])
    pa.add_argument("--limit", type=int, default=None)

    pc = sub.add_parser("cluster", parents=[base], help="discover vibe clusters")
    pc.add_argument("--min-cluster-size", type=int, default=25)

    sub.add_parser("dashboard", parents=[base], help="build dashboard.html")
    pw = sub.add_parser("writeback", parents=[base], help="export cluster playlists to rekordbox XML")
    pw.add_argument("--out", default=None)

    pall = sub.add_parser("all", parents=[base], help="analyze -> cluster -> dashboard")
    pall.add_argument("--backend", default="auto", choices=["auto", "essentia", "librosa", "clap"])
    pall.add_argument("--db-dir", default=None)
    pall.add_argument("--xml", default=None)
    pall.add_argument("--min-cluster-size", type=int, default=25)

    args = p.parse_args(argv)
    ws = Workspace(args.workdir)

    if args.cmd == "extract":
        df = library.load_or_extract(ws, db_dir=args.db_dir, xml=args.xml)
        print(f"[extract] {len(df)} tracks -> {ws.tracks_csv}")
    elif args.cmd == "analyze":
        analyze_mod.run(ws, backend_name=args.backend, limit=args.limit)
    elif args.cmd == "cluster":
        cluster_mod.run(ws, min_cluster_size=args.min_cluster_size)
    elif args.cmd == "dashboard":
        dashboard_mod.run(ws, backend_label=_backend_label(ws))
    elif args.cmd == "writeback":
        writeback.run(ws, out_path=args.out)
    elif args.cmd == "all":
        library.load_or_extract(ws, db_dir=args.db_dir, xml=args.xml)
        analyze_mod.run(ws, backend_name=args.backend)
        cluster_mod.run(ws, min_cluster_size=args.min_cluster_size)
        dashboard_mod.run(ws, backend_label=args.backend)


def _backend_label(ws):
    # best-effort: 'essentia' if mood columns exist, else 'librosa'
    try:
        import pandas as pd
        cols = pd.read_csv(ws.features_csv, nrows=1).columns
        return "essentia" if any(c.startswith("mood::") for c in cols) else "librosa"
    except Exception:
        return "analysis"


if __name__ == "__main__":
    main()
