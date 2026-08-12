# djvibe — an electronic-musicology engine for your rekordbox library

Analyze ~3000 tracks with audio ML, discover the natural *vibe* clusters in your
collection, and explore them in an interactive map where you drop in a few seed
songs and instantly surface the tracks that flow with them. Built for house/techno
DJs who want their library to suggest sets — beach-club afternoons, golden-hour
sunsets, peak-time, afterhours — instead of scrolling 3000 rows.

It runs **locally on your machine** because that's where your audio files and
rekordbox database live. Nothing is uploaded anywhere.

---

## What it does, end to end

1. **extract** — reads your rekordbox collection (BPM, key, genre, file paths).
2. **analyze** — runs each track through an audio neural net to produce a 1280-d
   *vibe vector* plus human-readable tags (mood/theme, danceability, genre).
3. **cluster** — projects those vectors with UMAP and finds natural groupings with
   HDBSCAN, then auto-names each cluster and tags every track with a suggested
   DJ moment.
4. **dashboard** — builds a single self-contained `dashboard.html`: a 2-D map of
   your whole library colored by cluster, with a *seed-song similarity search*.
5. **writeback** *(optional)* — exports those clusters back to rekordbox as
   playlists via a non-destructive XML import.

---

## Quickstart

```bash
# 1. install (Python 3.9–3.11 recommended)
pip install -r requirements.txt
pip install essentia-tensorflow      # the recommended audio backend (see notes)

# 2. read your rekordbox collection
python -m djvibe extract             # reads the live rekordbox 6/7 database
#   ...or, if that can't find/unlock the DB:
python -m djvibe extract --xml /path/to/rekordbox_export.xml

# 3. analyze the audio (the long step — see timing below; it's resumable)
python -m djvibe analyze --backend essentia

# 4. discover clusters and build the dashboard
python -m djvibe cluster
python -m djvibe dashboard
open djvibe_data/dashboard.html      # double-click it; opens in your browser
```

Or run analyze → cluster → dashboard in one go after extracting: `python -m djvibe all`.

All intermediate files land in `./djvibe_data/` (override with `--workdir`).

### Chord progressions (optional extra pass)

Add a beat-synced **chord progression** and estimated key to every track card. This
runs as a *separate, non-destructive pass* — it does not touch your embeddings or
re-run the main analysis, and it's resumable (Ctrl-C safe):

```bash
pip install librosa soundfile        # if you're not already on the librosa backend
python3 extract_chords.py            # writes djvibe_data/chords.csv (resumable)
python3 extract_chords.py --rebuild  # ...and rebuild dashboard.html when done
```

The dashboard picks up `chords.csv` automatically: each track row shows its
progression (e.g. `A minor: Am F C G`). Detection uses librosa — a CQT chromagram
matched against 24 major/minor triad templates, beat-synchronized. It's strongest
on clear, beat-driven harmonic material and noisier on dense or atonal tracks.

> **Try the dashboard right now without any audio:** a working demo built from
> 600 synthetic tracks ships in `demo_data/dashboard.html`. Open it to learn the
> UX before you run the real thing.

---

## The dashboard — how you'll actually use it

Open `dashboard.html` and you get a map where every dot is a track and color = cluster.

- **Seed search.** Type a title/artist in the box and press Enter (or click any dot)
  to add it as a *seed*. Add a few seeds that share the feeling you want, set "Show
  top N", and hit **Find similar**. It computes cosine similarity over the audio
  embeddings and ranks the closest tracks in your library — the heart of building a
  set that flows. Matches are highlighted on the map (pink) and listed with a %
  similarity score; seeds show as gold stars.
- **Clusters.** The legend lists each discovered cluster with its auto-name
  (e.g. *"deep / hypnotic / soulful · 119 BPM"*). Click a legend entry to toggle it.
- **Filter by BPM** to keep similarity results inside a mixable tempo window.
- Every track also carries a **suggested moment** (Sunrise, Daytime beach club,
  Sunset, Peak time, Deep/afterhours, Main floor) shown on hover and in results.

Workflow for a set: seed with 2–3 tracks you know open well for "sunset", find the
50 most similar, filter to 120–124 BPM, and you've got a candidate pool that hangs
together sonically — then sequence by energy.

---

## The musicology under the hood

**Why a learned embedding, not just BPM + key?** BPM and Camelot key tell you what
*mixes*, not what *belongs together*. Two 124-BPM tracks can feel like different
planets. The embedding captures timbre, texture, rhythm feel, production
character and mood — the things you actually mean by "vibe" — in one vector, so
"distance in vector space" ≈ "sounds/feels similar."

**The backbone — Discogs-EffNet (Essentia).** Each track is decoded to mono 16 kHz
and passed through Essentia's `discogs-effnet` model; we mean-pool its penultimate
layer to a single **1280-dimension embedding**. This model was trained on a huge
Discogs catalog, so its representation is unusually good at electronic-music
distinctions (deep vs. tech vs. melodic house, etc.).

**Interpretable heads — so clusters have names.** On top of the same embedding we
run lightweight classifier heads:
- **mood/theme** (MTG-Jamendo, 56 tags: groovy, uplifting, dark, dreamy, hypnotic…),
- **danceability**, **approachability**, **engagement**,
- **genre** (Discogs-400).
These don't drive the clustering; they *describe* it, so each cluster gets a label
like *"groovy / uplifting · 122 BPM"* instead of *"cluster 7."*

**Clustering — UMAP → HDBSCAN.** Clustering raw 1280-d vectors is unreliable
(everything is far from everything in high dimensions). So we standardize, use
**UMAP** to compress to ~10 dimensions while preserving neighborhood structure,
then run **HDBSCAN**, which finds clusters of *varying density* and is honest about
outliers (your true one-offs land in a "−1 / one-offs" group instead of being
forced somewhere). A separate 2-D UMAP gives the dashboard map. You chose
*data-driven* clusters: the algorithm decides how many groups exist, not a preset.

**Suggested moments** are a transparent heuristic layered on top (tempo + energy +
brightness/positivity percentiles → Sunrise/Beach/Sunset/Peak/Afterhours). They're
*starting suggestions* for set placement, not ground truth — tune the thresholds in
`djvibe/cluster.py:_suggested_moment` to taste.

---

## Choosing an audio backend

| Backend | Install | Gives you | Use when |
|---|---|---|---|
| **essentia** *(recommended)* | `pip install essentia-tensorflow` | Discogs-EffNet embedding **+** mood/genre/danceability tags → named clusters | You can install it (see Apple-Silicon note) |
| **librosa** *(fallback)* | `pip install librosa soundfile` | A compact MFCC/chroma/spectral/tempo vector. Similarity + clustering still work; clusters are named by tempo/energy/brightness instead of mood | Essentia won't install, or you want a fast first pass |

`--backend auto` picks Essentia if importable, else librosa.

**Apple Silicon (M-series) note.** `essentia-tensorflow` wheels can be fiddly on
arm64. Options, in order of preference:
1. Use a Python 3.10 environment (conda or pyenv) and `pip install essentia-tensorflow`.
2. Run the analyze step in Docker:
   ```bash
   docker run --rm -v "$PWD":/work -w /work mtgupf/essentia:latest \
     python3 -m djvibe analyze --backend essentia
   ```
   (Model files download into `djvibe_data/models/` and are reused.)
3. Fall back to `--backend librosa` — the clustering and seed-search dashboard work
   identically; you only lose the mood/genre cluster *names*.

The Essentia model weights (~hundreds of MB total) download automatically on first
run into `djvibe_data/models/`.

---

## Reading your rekordbox library

**Live database (default).** rekordbox 6 and 7 store everything in an encrypted
SQLite database (`master.db`, SQLCipher). `pyrekordbox` extracts the key
automatically on most installs. If extraction fails (Pioneer occasionally changes
where the key lives), run once:

```bash
python -m pyrekordbox download-key
```

then `python -m djvibe extract` again.

**XML fallback (always works).** In rekordbox: Preferences ▸ Advanced ▸ Database ▸
**rekordbox xml**, set a path, and export your collection. Then:

```bash
python -m djvibe extract --xml /path/to/collection.xml
```

This needs no key and is version-proof. Tracks with no resolvable file path are
skipped (you'll see a count).

**Quit rekordbox before running** — it locks the database.

---

## Sending clusters back into rekordbox (optional)

```bash
python -m djvibe writeback        # writes djvibe_data/djvibe_rekordbox.xml
```

This is **non-destructive** — it never touches `master.db`. It builds a rekordbox
XML containing one playlist per cluster and one per suggested moment. Import via
Preferences ▸ Advanced ▸ Database ▸ rekordbox xml; the playlists appear under the
"rekordbox xml" tree, ready to drag into your collection.

---

## Performance for ~3000 tracks

The analyze step is the only slow one and is **fully resumable** — every track is
checkpointed to `audio_cache.jsonl`, so you can stop with Ctrl-C and re-run to
continue. Rough order of magnitude on a laptop CPU: Essentia ≈ 1–3 s/track
(≈ 1–2.5 hours for 3000), librosa ≈ 0.5–1 s/track. cluster + dashboard take
seconds. The dashboard for 3000 tracks is a single ~2–4 MB HTML file.

---

## Files produced (in `djvibe_data/`)

```
tracks.csv          your collection, normalized
audio_cache.jsonl   per-track analysis cache (resumable)
embeddings.npy      [N, 1280] vibe vectors      embeddings_ids.json (row order)
features.csv        interpretable per-track tags
clusters.csv        cluster, cluster_name, umap_x/y, suggested_moment
reduced_emb.npy     [N, 64] L2-normalized, powers the dashboard's similarity search
dashboard.html      ← open this
djvibe_rekordbox.xml (only if you run writeback)
```

---

## Troubleshooting

- **"pyrekordbox could not read the key"** → `python -m pyrekordbox download-key`, or
  use `--xml`.
- **Essentia won't install** → use Docker or `--backend librosa` (see above).
- **A few tracks error during analyze** → they're logged in `audio_cache.jsonl`
  with `ok:false` and skipped; common causes are missing/moved files or DRM'd
  formats. Fix paths in rekordbox and re-run `analyze` to fill them in.
- **Clusters look too coarse/fine** → tune `--min-cluster-size` (smaller = more,
  tighter clusters).

---

## Roadmap ideas

- Harmonic-mix suggestions (Camelot-wheel-aware "next track" within a cluster).
- Energy-curve set sequencing (auto-order a selection into an arc).
- Re-run only newly-added tracks (incremental analyze) on a schedule.

Built as a starting point — the feature definitions, cluster naming, and moment
heuristics all live in plain Python and are meant to be tuned to your ear.
