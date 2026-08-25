# cratedig_engine

Python analysis engine for Crate Dig. Fast analysis (librosa) runs without CLAP or PyTorch. CLAP and Essentia are optional backends.

Implementation requirements:

- [`CRATE_DIG_ENGINE_PRD.md`](../../CRATE_DIG_ENGINE_PRD.md)
- [`sonic_analysis_engine.md`](../../sonic_analysis_engine.md)

## Current and target architecture

The current engine is an MVP:

- one `AudioBackend` runs per analysis
- each backend decodes independently
- one embedding and a JSON feature dictionary are emitted
- the Cloud Run job analyzes and clusters in one process
- waveforms/previews are stubs
- source separation is not implemented yet

`AudioBackend` remains a compatibility surface while the engine migrates to shared `DecodedAudio`, versioned windows, independent extractors, per-extractor caches, explicit embedding roles, a frozen map projection, and mandatory asynchronous four-stem processing for completed analysis.

The initial separator target is HT-Demucs `htdemucs_ft`. It belongs in a dedicated local/cloud worker environment; it must not be added to synchronous API handlers or make import/playback wait.

## Local tests

```bash
cd packages/engine
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e ".[fast,dev]"
pytest
```

## Cloud Run Job (`analyze-run`)

One job processes a single `analysis_runs.id`:

```bash
pip install -e ".[job]"
set -a && source ../../.env && set +a
cratedig-engine analyze-run --analysis-run-id <uuid>
```

`ANALYSIS_RUN_ID` can replace the flag (useful for Cloud Run Jobs).

Required env (see repo `.env.example`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SECRET_KEY` (service role; `SUPABASE_SERVICE_ROLE_KEY` also accepted)
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_AUDIO`
- `R2_ENDPOINT` or `R2_ACCOUNT_ID` (endpoint becomes `https://<account>.r2.cloudflarestorage.com`)

Optional: `CRATEDIG_JOB_WORKDIR` (default `/tmp/cratedig-analyze`).

### Docker

```bash
docker build -t cratedig-engine -f packages/engine/Dockerfile packages/engine
docker run --rm --env-file .env cratedig-engine analyze-run --analysis-run-id <uuid>
```

The current image is Python 3.12 with librosa extras, ffmpeg (for later preview work), and libsndfile. It does not yet contain CLAP, Essentia, PyTorch, or Demucs. The stem worker requires a separate image/dependency profile and GPU-capable cloud configuration where benchmarks justify it.

### Stubs

Waveforms and normalized previews are **not** generated in this MVP. The job uploads JSON placeholders to R2 and inserts `audio_objects` rows with `kind` `waveform` / `preview`:

```txt
{library_id}/{track_id}/{analysis_run_id}/waveform.stub.json
{library_id}/{track_id}/{analysis_run_id}/preview.stub.json
```

Fast embeddings are stored on `track_embeddings.embedding_raw` (`real[]`). The pgvector `embedding vector(512)` column is filled only when the backend emits 512-d (CLAP). Map coordinates use `cluster_members.reduced_embedding vector(64)`.
