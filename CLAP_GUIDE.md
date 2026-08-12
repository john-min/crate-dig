# CLAP backend setup (native on your Mac — no Docker)

CLAP runs in PyTorch, which installs cleanly on Apple Silicon and uses your Mac's
GPU (MPS) — so this is faster than the Essentia/Docker route. We put CLAP results
in a SEPARATE workspace (`djvibe_clap`) so your Essentia results stay untouched
and you can compare the two.

One requirement: PyTorch doesn't support Python 3.14 yet, so we use Python 3.12
inside an isolated "virtual environment" (a self-contained Python that won't
affect anything else on your Mac).

First update three files (see the chat message), then:

---

## STEP 1 — Install Python 3.12 (one time)

Go to **https://www.python.org/downloads/** and download/install **Python 3.12.x**
(same click-through installer as before). Having both 3.12 and 3.14 is fine.

---

## STEP 2 — Create the CLAP environment and install it (one time, ~5–10 min)

In Terminal, in your toolkit folder:

```
cd "/Users/jeffzhao/Downloads/djvibe 3"
python3.12 -m venv clap_env
source clap_env/bin/activate
pip install --upgrade pip
pip install torch transformers librosa soundfile numpy pandas
```

After this, your prompt shows `(clap_env)` at the front — that means the CLAP
environment is active. (`torch` is a big download, a couple of GB; be patient.)

> If `python3.12` says "command not found", use the full path instead:
> `/Library/Frameworks/Python.framework/Versions/3.12/bin/python3 -m venv clap_env`

---

## STEP 3 — Point CLAP at your library (reuses your existing track list)

```
mkdir -p djvibe_clap
cp djvibe_data/tracks.csv djvibe_clap/
```

(If `djvibe_data/tracks.csv` was moved into `_librosa_backup`, copy it from there
instead. We only need the list of tracks + file paths — not the analysis.)

---

## STEP 4 — Run the CLAP analysis (fast, native, GPU-accelerated)

```
python -m djvibe analyze --backend clap --workdir djvibe_clap
```

- First run downloads the CLAP model (a few hundred MB, one time).
- You'll see `[clap] loading … on mps` (mps = your Mac's GPU). On MPS this is
  much faster than the Essentia run — roughly 15–45 minutes for ~2,800 tracks.
- Resumable: stop with Control+C and rerun the same line to continue.
- The 5 streaming tracks will error (no file) — expected.
- If an mp3 fails to load, install ffmpeg once: `brew install ffmpeg`.

When it finishes: `[analyze] finalized … tracks`.

---

## STEP 5 — View the CLAP dashboard

Leave the CLAP environment and open the dashboard pointed at the CLAP workspace:

```
deactivate
DJVIBE_WORKDIR=djvibe_clap python3 player_server.py
```

(`deactivate` returns you to your normal Python; the dashboard/player runs there
as usual. The `DJVIBE_WORKDIR=djvibe_clap` part just tells it to use the CLAP
results instead of the Essentia ones.)

To go back to your **Essentia** dashboard anytime, just run the normal
`python3 player_server.py` (no `DJVIBE_WORKDIR`).

---

## Comparing the two

You now have two independent maps from the same library:
- `djvibe_data`  → Essentia (mood/genre tags from a music-tagging net)
- `djvibe_clap`  → CLAP (language-aligned vibe; clusters named "deep / hypnotic",
  "energetic / driving", etc.)

They organize your collection differently — Essentia leans toward
genre/instrumentation, CLAP toward overall sonic "feel." Try seeding the same few
tracks in each and see which similar-track lists match your ear better.
