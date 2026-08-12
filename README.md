# djvibe

An electronic-musicology toolkit for DJs. It analyzes the audio in your rekordbox
library with a music-audio neural net, turns every track into a "vibe" fingerprint
plus human-readable tags, and gives you an interactive dashboard to explore your
collection by feel — filter by vibe + BPM + genre/label, drop in seed tracks to
find what flows next, audition with a built-in player, and thumbs-up/down to teach
it your taste.

Everything runs **locally** on your machine. Nothing is uploaded anywhere.

---

## Table of contents
1. [What it does](#what-it-does)
2. [How it works (the pipeline)](#how-it-works-the-pipeline)
3. [The three analysis engines](#the-three-analysis-engines)
4. [Directory structure](#directory-structure)
5. [The data workspace](#the-data-workspace)
6. [Setup](#setup)
7. [Usage, start to finish](#usage-start-to-finish)
8. [The dashboard, explained](#the-dashboard-explained)
9. [Updating with new music](#updating-with-new-music)
10. [Tuning knobs](#tuning-knobs)
11. [Honest limitations](#honest-limitations)

---

## What it does

Given a rekordbox library of a few thousand tracks, djvibe:

- **reads** your collection (titles, artists, BPM, key, genre, label, file paths),
- **listens** to each track and encodes it as a 512-dimension "vibe vector,"
- **tags** each track with descriptive vibe words (hypnotic, driving, warm, dark,
  vocal, …), calibrated to your own library,
- **serves an interactive dashboard** where you filter by vibe/attributes, seed-
  search for similar tracks, play audio, and give feedback that re-ranks results.

The purpose is set-building: quickly assemble a pool of tracks that share a feel
and flow together for a specific moment.

---

## How it works (the pipeline)

```
rekordbox library
      │  1. extract
      ▼
 tracks.csv  ──────────────────────────────┐
      │  2. analyze (audio → neural net)     │ (metadata)
      ▼                                      │
 embeddings.npy  (512-d vibe vector/track)   │
      │  3. re-tag (cosine to vibe words,    │
      │            calibrated per library)   │
      ▼                                      ▼
 features.csv  (vibe:: tag scores)  +  moments (peak-time/sunset/…)
      │  4. build + serve
      ▼
 dashboard.html  ──►  browser (filter · seed-search · play · 👍/👎)
```

1. **Extract** — read the rekordbox database (or an XML export) into a normalized
   `tracks.csv`.
2. **Analyze** — decode each audio file, take a representative *core excerpt*
   (skip intro/outro), and run it through the audio encoder to get a unit-length
   512-d embedding. Cached track-by-track so it's resumable.
3. **Re-tag** — score each track against a vocabulary of vibe words via cosine
   similarity, then **calibrate** those scores across your library (z-score) so no
   single word dominates. Each track's top-5 calibrated words become its tags.
4. **Explore** — a self-contained HTML dashboard, served by a tiny local web
   server that also streams your audio and records feedback.

The math for step 3 is documented in full in **`CLAP_TAXONOMY.md`**. Short version:
`score = cosine(audio_vector, word_vector)`, then `calibrated = (score − μ_word) /
σ_word` across your library. Similarity search (step 4) ignores tags entirely and
ranks directly on the embeddings (`query · track`), refined by your 👍/👎 (Rocchio
relevance feedback).

---

## The three analysis engines

`analyze` supports three backends (`--backend`). They differ only in *how a track
becomes a vector + tags*; everything downstream is identical.

| Engine | Install | Gives you | Notes |
|---|---|---|---|
| **clap** (recommended) | PyTorch + transformers (native, GPU) | 512-d embedding + open-vocabulary vibe tags | best results; tags are editable text prompts |
| **essentia** | Docker (Linux) | Discogs genre + mood tags | fiddly on Apple Silicon; use Docker |
| **librosa** | pip, installs everywhere | MFCC/spectral vector, tempo/energy names | fastest to set up; no semantic tags |

Each engine writes to its own workspace folder (e.g. `djvibe_clap/`), so you can
run several and compare them in `build_multi.py`.

---

## Directory structure

```
djvibe/                         ← project root (this repo)
├── README.md                   this file
├── CLAP_TAXONOMY.md            the math behind the vibe tags
├── CLAP_GUIDE.md               how to set up + run the CLAP engine
├── ESSENTIA_DOCKER_GUIDE.md    how to run the Essentia engine in Docker
├── RUN_FROM_SCRATCH.md         beginner, copy-paste setup walkthrough
├── requirements.txt            core Python packages
│
├── player_server.py            ★ builds the dashboard, serves it, streams audio,
│                                 saves 👍/👎 feedback  (the thing you run daily)
├── dashboard_studio.py         ★ builds the interactive discovery dashboard HTML
├── build_multi.py              alt dashboard: toggle between engines + a fused view
├── retag_clap.py               recompute CLAP vibe tags from cached embeddings
├── update_library.py           refresh flow after adding/removing tracks
├── tag_report.py               export a per-track tag report + tag distribution
├── retune_clusters.py          (legacy) re-cluster helper
│
├── djvibe/                     the engine (a Python package)
│   ├── __main__.py / cli.py    the `python -m djvibe <command>` interface
│   ├── io.py                   workspace paths + load/save helpers
│   ├── library.py              read rekordbox (live DB via pyrekordbox, or XML)
│   ├── features.py             audio backends: librosa / essentia / CLAP,
│   │                             the vibe vocabulary, core-excerpt logic
│   ├── models.py               downloads Essentia model weights
│   ├── analyze.py              resumable per-track analysis runner
│   ├── cluster.py              UMAP projection, calibration helpers,
│   │                             suggested-moment heuristic, cluster naming
│   ├── dashboard.py            (legacy) basic dashboard builder
│   └── writeback.py            export tag/cluster playlists back to rekordbox XML
│
└── tests/
    └── make_synthetic.py       generate fake data to test the dashboard offline
```

The **★** files are the two you actually run day to day. The `djvibe/` package is
the machinery they call.

---

## The data workspace

Analysis output lives in a **workspace folder** (default `./djvibe_data`; the CLAP
setup uses `./djvibe_clap`). It is *not* committed to git — it holds your personal
library data. Contents:

```
djvibe_clap/
├── tracks.csv            your collection: id, title, artist, bpm, key, genre, label, path
├── audio_cache.jsonl     per-track analysis cache (resumable; one JSON per line)
├── embeddings.npy        [N, 512] the vibe vectors        embeddings_ids.json (row order)
├── features.csv          per-track vibe:: tag scores + energy/warmth proxies
├── reduced_emb.npy       (optional) small embedding used by older builders
├── dashboard.html        the built dashboard (regenerated on each run)
└── feedback.jsonl        your 👍/👎 votes, with seed context
```

You point tools at a workspace with `--workdir djvibe_clap` (CLI) or
`DJVIBE_WORKDIR=djvibe_clap` (the server).

---

## Setup

macOS on Apple Silicon. There are **two Python environments** because PyTorch
(CLAP) needs Python 3.12, while everything else runs on your system Python:

- **System `python3`** — used for `extract`, building/serving the dashboard, and
  the clustering/UMAP math. Needs: `numpy pandas scikit-learn pyrekordbox librosa
  soundfile umap-learn hdbscan`.
- **`clap_env` (Python 3.12 venv)** — used only for CLAP `analyze` + `retag`.
  Needs: `torch transformers librosa soundfile numpy pandas`.

Full beginner instructions are in `RUN_FROM_SCRATCH.md` (system tools) and
`CLAP_GUIDE.md` (the CLAP environment). One-time gist:

```bash
# system python
python3 -m pip install numpy pandas scikit-learn pyrekordbox librosa soundfile umap-learn hdbscan

# CLAP env (Python 3.12)
python3.12 -m venv clap_env
source clap_env/bin/activate
pip install torch transformers librosa soundfile numpy pandas
deactivate
```

---

## Usage, start to finish

Quit rekordbox before reading its database. Run from the project folder.

**Step 1 — read your library** (system python):
```bash
python3 -m djvibe --workdir djvibe_clap extract
```
If the encrypted DB won't unlock: `python3 -m pyrekordbox download-key`, or export
a rekordbox XML and use `extract --xml path/to/export.xml`.

**Step 2 — analyze the audio with CLAP** (in `clap_env`; resumable, ~30–60 min):
```bash
source clap_env/bin/activate
python -m djvibe --workdir djvibe_clap analyze --backend clap
```

**Step 3 — tag from the embeddings** (still in `clap_env`; seconds — no re-analysis):
```bash
python retag_clap.py --workdir djvibe_clap --mode zscore
deactivate
```

**Step 4 — open the dashboard** (system python; this is the daily command):
```bash
DJVIBE_WORKDIR=djvibe_clap python3 player_server.py
```
Your browser opens automatically. Press Control+C in the terminal to stop.

After the first run, day-to-day is just **Step 4**. Steps 1–3 only come back when
you add music (see [Updating](#updating-with-new-music)).

---

## The dashboard, explained

A two-pane layout: controls on the left, a 2-D map of your library on top-right,
and a track list beneath it.

- **Vibe tags** (left, grouped into Energy / Mood / Texture / Instrumentation) —
  click chips to keep only tracks with those vibes. "match ALL" toggles between
  needing every selected tag vs. any of them.
- **Filters** — BPM range, Artist (contains), Genre, Label. Combined with the tags
  they define your **working pool**; the map dims everything outside it.
- **Seed search** — add seed tracks (type a name, or click a dot on the map), then
  **Find similar within pool** ranks the closest-sounding tracks *inside* your
  filtered pool.
- **👍 / 👎 on results** — 👍 = more like this, 👎 = less. The list re-ranks live
  (it nudges the search toward your thumbs-up and away from thumbs-down), and every
  vote is saved to `feedback.jsonl`.
- **Player** — every row and the map have play controls; single-click a dot to seed
  it, double-click to audition it. Audio streams from your local files.
- **The map** — each dot is a track, positioned so similar-sounding tracks sit near
  each other, colored by its top vibe.

The suggested "moment" per track (peak time / sunset / beach club / …) is a
heuristic from BPM + calibrated energy/warmth percentiles; treat it as a hint.

---

## Updating with new music

Quit rekordbox, then (this spans both environments):
```bash
rm "djvibe_clap/tracks.csv"
python3 -m djvibe --workdir djvibe_clap extract          # re-read library
source clap_env/bin/activate
python -m djvibe --workdir djvibe_clap analyze --backend clap   # only new tracks
python retag_clap.py --workdir djvibe_clap --mode zscore
deactivate
DJVIBE_WORKDIR=djvibe_clap python3 player_server.py
```
`analyze` is incremental (it skips everything already cached), so adding a handful
of tracks takes seconds.

---

## Tuning knobs

- **The vibe vocabulary** — `VIBES = [...]` in `djvibe/features.py`. Add/remove
  words freely (CLAP is open-vocabulary), then re-run `retag_clap.py`. Keep it to
  words CLAP reliably hears in *your* music; a noisy tag is worse than none.
- **Precise prompts** — `PROMPT_TEXT` in `features.py` lets a tag use a longer,
  sharper prompt phrase while keeping a short chip label.
- **Calibration mode** — `retag_clap.py --mode {zscore,centered,mixed,raw}`.
  `zscore` (library-relative) is the recommended default and avoids "attractor"
  tags that over-spread.
- **Moment logic** — `ENERGY` / `VALENCE` sets in `features.py` (which tags feed
  energy vs. warmth) and `_suggested_moment` in `djvibe/cluster.py` (BPM cutoffs +
  thresholds + the moment names).

---

## Honest limitations

- The audio model's read of "vibe" is a good but imperfect proxy for *your* ear.
- Tags are **library-relative** — they mean "…for your collection," not absolute.
- Narrow concepts (e.g. "acid") the model can't isolate reliably; curate the vocab.
- The "moment" labels are the softest layer — a rule-of-thumb, not ground truth.
- Grouping/similarity work on sonic feel, not mixability — BPM/key are shown but
  don't drive similarity; sequence a set with your own ears.

---

*Built locally, for one crate at a time.*
