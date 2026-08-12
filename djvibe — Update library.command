#!/bin/bash
cd "$(dirname "$0")"
echo "== djvibe: update library =="
echo "Make sure rekordbox is fully QUIT, then press Enter (Ctrl-C to cancel)."
read
cp djvibe_clap/tracks.csv djvibe_clap/tracks.csv.bak 2>/dev/null
rm -f djvibe_clap/tracks.csv
python3 -m djvibe --workdir djvibe_clap extract || { echo "extract failed - is rekordbox closed?"; read; exit 1; }
source clap_env/bin/activate
python -m djvibe --workdir djvibe_clap analyze --backend clap
python retag_clap.py --workdir djvibe_clap
deactivate
DJVIBE_WORKDIR=djvibe_clap python3 player_server.py
