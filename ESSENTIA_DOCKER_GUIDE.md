# Essentia upgrade via Docker (Apple Silicon)

Goal: run Essentia's music-AI analysis (mood/genre/danceability) inside a small
Linux environment where it works reliably, then view the upgraded dashboard with
your normal launcher. Your folder is `/Users/jeffzhao/Downloads/djvibe 3`.

Do STEPS 1–3, then report the smoke-test output before STEP 4 (the long run).

---

## STEP 1 — Install Docker Desktop (one time, ~10 min)

1. Go to **https://www.docker.com/products/docker-desktop/**
2. Download **Docker Desktop for Mac — Apple Silicon**.
3. Open the `.dmg`, drag **Docker** into Applications, then open Docker from
   Applications. Accept the prompts. Wait until the whale icon in your menu bar
   stops animating (means it's running). Leave it running.
   (Needs a few GB of free disk space.)

---

## STEP 2 — Back up the librosa analysis and clear the workspace

We must not mix librosa and Essentia results (different formats). This keeps your
old results safe in a backup folder and clears the working files. In Terminal:

```
cd "/Users/jeffzhao/Downloads/djvibe 3"
mkdir -p djvibe_data/_librosa_backup
mv djvibe_data/audio_cache.jsonl djvibe_data/embeddings.npy djvibe_data/embeddings_ids.json djvibe_data/features.csv djvibe_data/reduced_emb.npy djvibe_data/_librosa_backup/ 2>/dev/null
echo "cleared — tracks.csv kept, librosa results backed up"
```

(To undo later: move those files back out of `_librosa_backup`.)

---

## STEP 3 — Smoke test: analyze just 3 tracks (~5–10 min)

This downloads the AI models and proves Essentia runs before committing hours.
Paste as ONE line:

```
docker run --rm -it --platform linux/amd64 -v /Users/jeffzhao:/Users/jeffzhao -w "/Users/jeffzhao/Downloads/djvibe 3" python:3.11-slim bash -lc "apt-get update -qq && apt-get install -y -qq libsndfile1 ffmpeg >/dev/null && pip install -q essentia-tensorflow numpy pandas && python -m djvibe analyze --backend essentia --limit 3"
```

WHAT SUCCESS LOOKS LIKE: after the downloads, lines like
`[analyze] backend = essentia`, some model-download messages, then
`3/3 ... [Artist - Title]` and `[analyze] finalized 3 tracks`.

IF IT FAILS with **"Illegal instruction"** (the most likely Apple-Silicon snag):
  - Open Docker Desktop → Settings (gear) → **General**
  - Turn **OFF** "Use Rosetta for x86_64/amd64 emulation", click **Apply & Restart**
  - Re-run the same command. (This switches to slower-but-compatible emulation.)

IF IT FAILS mentioning **a file not found / your music path**: your tracks may
live on an external drive — tell Jeff's helper and we'll add that drive to the
command.

➡️ Stop here and report what the smoke test printed.

---

## STEP 4 — Build the analysis image (so the long run starts fast & resumes)

Create a Dockerfile (paste the whole block):

```
cd "/Users/jeffzhao/Downloads/djvibe 3"
cat > Dockerfile.essentia <<'EOF'
FROM --platform=linux/amd64 python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends libsndfile1 ffmpeg && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir essentia-tensorflow numpy pandas
EOF
docker build --platform linux/amd64 -t djvibe-essentia -f Dockerfile.essentia .
```

(First build takes a few minutes; it's cached afterward.)

---

## STEP 5 — Full analysis of all tracks (resumable; leave it running)

```
docker run --rm -it --platform linux/amd64 -v /Users/jeffzhao:/Users/jeffzhao -w "/Users/jeffzhao/Downloads/djvibe 3" djvibe-essentia python -m djvibe analyze --backend essentia
```

This processes every track. Under emulation it may take several hours — it's safe
to stop (Control+C) and re-run the exact same line to resume where it left off.
The 3 tracks from the smoke test are already cached and will be skipped.

---

## STEP 6 — View the upgraded dashboard (back to normal)

When STEP 5 prints `[analyze] finalized … tracks`, you're done with Docker. On
your Mac as usual:

```
python3 player_server.py
```

Your clusters will now be named by mood/genre (e.g. "groovy / uplifting · 122
BPM"), and groupings will be more musical. The slider, absorb toggle, seed
search, and player all work exactly the same.
```
