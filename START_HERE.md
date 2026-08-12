# djvibe — START HERE (complete, current build)

This is the full toolkit with every update folded in: core-excerpt analysis (skips
long intros/outros), electronic-music taxonomy, the librosa / Essentia / CLAP
engines, the interactive player dashboard, live cluster controls, multi-engine
toggle + combine, and the library-update flow.

Your Mac username is `jeffzhao`; examples assume the folder lives at
`/Users/jeffzhao/Downloads/djvibe`.

---

## A. Install this fresh copy (replaces ALL old files at once)

1. Unzip `djvibe-toolkit.zip` → a folder named **djvibe**.
2. **Keep your existing work:** from your old `djvibe 3` folder, drag the
   **`djvibe_data`** folder (and `djvibe_clap` if you made one) **into** this new
   `djvibe` folder. That carries over your track list and any analysis so you
   don't redo them. (If you have no prior analysis, skip this — you'll create it
   in Step C.)
3. From now on, this new `djvibe` folder is your working folder. Delete or ignore
   the old `djvibe 3`.

> Why a full replace: it guarantees every file is the latest version, regardless
> of which individual files were or weren't swapped in earlier.

---

## B. One-time Python setup (skip if already done)

Open Terminal, go into the folder (type `cd ` + a space, drag the **djvibe**
folder onto the window, press Enter), then:

```
python3 -m pip install numpy pandas scikit-learn pyrekordbox librosa soundfile umap-learn hdbscan
```

(Essentia and CLAP have their own setup — see the guides in section D.)

---

## C. The core workflow

### Step 1 — read your rekordbox library (once; quit rekordbox first)
```
python3 -m djvibe extract
```
Creates `djvibe_data/tracks.csv`. (If you already carried over `djvibe_data`, you
can skip this.) If it can't unlock the database, use the XML route:
`python3 -m djvibe extract --xml /path/to/export.xml`.

### Step 2 — analyze the audio (choose an engine)
All engines now focus on each track's **core** (skipping intro/outro) and use an
**electronic-music taxonomy**.

- **librosa** — quick, installs everywhere, no semantic genre names:
  ```
  python3 -m djvibe analyze --backend librosa
  ```
- **Essentia** — Discogs genre + mood, via Docker → see `ESSENTIA_DOCKER_GUIDE.md`
- **CLAP** — native + GPU, house/techno vocabulary you can edit → see `CLAP_GUIDE.md`

Analysis is resumable: stop with Control+C, rerun the same command to continue.

### Step 3 — explore
- One engine (uses `djvibe_data`):
  ```
  python3 player_server.py
  ```
- All engines you've run + a Combined view, with a dropdown to switch:
  ```
  python3 build_multi.py
  ```
Both open your browser with the map + seed-search + player. Press Control+C in
Terminal to stop the server.

---

## D. Detailed engine guides (in this folder / alongside it)
- **`ESSENTIA_DOCKER_GUIDE.md`** — install Docker, smoke-test, full run.
- **`CLAP_GUIDE.md`** — Python 3.12 environment, run into a separate `djvibe_clap`.

To view a specific engine's results:
- Essentia / librosa (in `djvibe_data`): `python3 player_server.py`
- CLAP (in `djvibe_clap`): `DJVIBE_WORKDIR=djvibe_clap python3 player_server.py`
- Everything together: `python3 build_multi.py`

---

## E. Keeping it current
- **Added/removed songs in rekordbox?** (quit rekordbox first)
  ```
  python3 update_library.py
  ```
  Re-reads the library, drops deleted tracks, analyzes only new ones, rebuilds.
- **Clusters too broad / too many outliers?** Use the **Detail** slider and
  **Absorb outliers** toggle right in the dashboard — no commands needed.
- **Want different genres in CLAP?** Edit the `PROMPTS = [...]` list inside
  `djvibe/features.py` (class `ClapBackend`) — that list *is* your taxonomy.

---

## F. What each file does
```
START_HERE.md          this file
README.md              background + the musicology rationale
requirements.txt       Python packages for the core (dashboard/clustering)

player_server.py       serve one engine's dashboard + stream audio
build_multi.py         multi-engine dashboard (toggle engines + Combined view)
update_library.py      refresh after adding/removing tracks
retune_clusters.py     (older helper) re-cluster from disk; build_multi supersedes it
dashboard_studio.py    builds the single-engine dashboard HTML

djvibe/                the engine (a Python package)
  library.py           read rekordbox (DB or XML)
  features.py          audio backends: librosa, Essentia, CLAP (+ core-excerpt)
  models.py            Essentia model downloader
  analyze.py           run a backend over the library (resumable)
  cluster.py           UMAP + HDBSCAN + electronic-genre cluster naming
  dashboard.py         (basic dashboard; player_server/build_multi are richer)
  writeback.py         export cluster playlists back to rekordbox XML
  cli.py / __main__.py the `python3 -m djvibe ...` commands
```

---

## G. Quick command reference
```
python3 -m djvibe extract                 # read rekordbox -> tracks.csv
python3 -m djvibe analyze --backend librosa
python3 -m djvibe analyze --backend clap  --workdir djvibe_clap
python3 player_server.py                  # view djvibe_data with player
DJVIBE_WORKDIR=djvibe_clap python3 player_server.py
python3 build_multi.py                    # toggle engines + Combined
python3 update_library.py                 # refresh after library changes
```
