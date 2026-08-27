# cratedig_engine

Python analysis engine for Crate Dig. Fast analysis (librosa) runs without CLAP or PyTorch. CLAP and Essentia are optional backends.

Implementation requirements:

- [`sonic_analysis_prd.md`](../../sonic_analysis_prd.md)
- [`IMPLEMENTATION_PLAN.md`](../../IMPLEMENTATION_PLAN.md)
- [`sonic_analysis_engine.md`](../../sonic_analysis_engine.md)

## Current and target architecture

The Engine v2 extractor foundation now runs alongside the original MVP path:

- `DecodedAudio` decodes once and memoizes deterministic sample-rate/channel views
- versioned window plans retain queryable window evidence after pooling
- independent extractors emit typed embeddings, scalars, tags, warnings, and provenance
- extractor cache identity is content-addressed and excludes logical `track_id`
- `LibrosaExtractor` keeps the 65-dimensional legacy baseline while adding physical evidence from the shared audio substrate
- `DiscogsEffnetExtractor` is a native decode-once retrieval adapter: it consumes 16 kHz mono windows from `DecodedAudio`, retains 1280-dimensional window evidence, and pools a track vector without reopening audio
- `extract_manifest_file` resolves exact extractor versions and per-extractor window plans, then shares one source decode across native extractors
- `LegacyBackendExtractor` keeps existing backends usable during migration, declares their actual internal window plan, and reports that they reopen audio

The existing `AudioBackend` and Cloud Run job remain compatibility paths. The job still analyzes and clusters in one process, and CLAP/Essentia still decode independently when used through the legacy adapter. The JSONL extractor cache is a process-local migration aid, not the durable/concurrent job store. Waveforms/previews are stubs, the map projection is not frozen, and source separation is not implemented yet.

Librosa tempo estimates include a tempogram-derived confidence score. Consumers must retain and apply that confidence; a product-facing sufficiency threshold will be frozen during the evaluation phase rather than guessed in the extractor.

The next milestone moves extractor records into durable SQLite analysis runs with atomic stage claims and a separate local worker. Native model extractors, frozen projection, and mandatory asynchronous four-stem processing follow through separately versioned manifests.

The initial separator target is HT-Demucs `htdemucs_ft`. It belongs in a dedicated local/cloud worker environment; it must not be added to synchronous API handlers or make import/playback wait.

## Discogs-EffNet artifact setup

The native adapter is present but is deliberately not enabled in the local worker. It has no download code. Provision `discogs-effnet-bs64-1.pb` outside the package from the [official Essentia model URL](https://essentia.upf.edu/models/feature-extractors/discogs-effnet/discogs-effnet-bs64-1.pb), independently review and record its SHA-256, and pass both the local path and exact digest through `DiscogsEffnetArtifactConfig`. The extractor verifies every checkpoint byte before constructing the runtime; a missing or mismatched file fails closed. Frozen-graph loading does not execute remote code.

The public model weights are `CC-BY-NC-SA-4.0`, while the pinned `essentia-tensorflow==2.1b6.dev1389` runtime declares `AGPL-3.0-only`. The public checkpoint is therefore evaluation-only for Crate Dig (`commercial_use=false`, `production_eligible=false`, `bundle_eligible=false`). A proprietary/commercial license from MTG/UPF would require a separately reviewed artifact identity and digest before production promotion. The configured model contract is 16 kHz mono, 1280-dimensional output, `TensorflowPredictEffnetDiscogs`, and TensorFlow-managed CPU/CUDA device selection. Install the optional runtime only where evaluation will run:

```bash
pip install -e ".[discogs-effnet]"
```

No checkpoint digest is copied from an unversioned web endpoint into source control. The configuration contract requires an independently verified digest, so upstream byte replacement cannot be accepted silently. Unit tests use an injected fake runtime and a tiny locally hashed fixture; they do not fetch model weights.

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
