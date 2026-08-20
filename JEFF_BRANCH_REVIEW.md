# Jeff Branch Review

Status: Draft review  
Review date: 2026-08-20  
Reviewed worktree: `/Users/lj/code/personal/projects/crate-digger-jeff-review`  
Target product direction: [PRD.md](./PRD.md)

## Executive summary

Jeff's branch is a strong local prototype and a useful proof of concept. It proves that a 3k-track DJ library can be extracted from Rekordbox, analyzed into embeddings/features, clustered, visualized, searched by seed tracks, played locally, and exported back toward Rekordbox-style playlists.

The branch should not be merged as-is. It is currently a local script/workspace artifact, not a product architecture. The valuable work is the analysis pipeline and product-learning embedded in the dashboard, not the committed generated data or static HTML implementation.

Recommended strategy:

1. Keep the analysis concepts and refactor them into a clean Python package/API boundary.
2. Drop committed local/generated data artifacts from source control.
3. Replace the static Plotly dashboard with the planned Next.js + Deck.gl product UI.
4. Convert file-based CSV/NPY/JSONL outputs into database/object-storage-backed records for the web app, while preserving local-file outputs as a desktop/offline adapter.
5. Use this branch as the seed for the Cloud Run Jobs analysis worker and later Mac desktop Python sidecar.

## What is good and worth keeping

### 1. The core analysis pipeline is directionally right

Files:

- `djvibe/features.py`
- `djvibe/analyze.py`
- `djvibe/cluster.py`
- `djvibe/io.py`

Keep these product ideas:

- Multiple analysis backends: librosa fallback, Essentia, CLAP.
- Central/core excerpt selection to avoid over-weighting DJ intros/outros.
- Per-track resumable analysis cache.
- Human-readable feature outputs alongside embeddings.
- UMAP/PCA projection for map coordinates.
- HDBSCAN/agglomerative fallback clustering.
- Reduced, normalized embeddings for fast similarity search.
- Suggested DJ moments as product language.

This is the closest thing we have to the future Cloud Run Jobs analysis worker.

### 2. Rekordbox XML import/export exists and aligns with the PRD

Files:

- `djvibe/library.py`
- `djvibe/writeback.py`

The branch already handles:

- Rekordbox XML parsing.
- Rekordbox live database extraction through `pyrekordbox`.
- Track metadata normalization.
- Rekordbox-compatible XML playlist export.

This should be formalized with fixtures/tests rather than discarded.

### 3. The local player proves real playback behavior

File:

- `player_server.py`

Good ideas:

- Streams local files from stable track IDs.
- Supports HTTP Range requests for seeking.
- Transcodes AIFF to MP3 via ffmpeg when needed.
- Keeps local playback bound to `127.0.0.1`.

This is useful for the future Mac desktop local playback model and for understanding what the web playback service must provide from R2.

### 4. The dashboard demonstrates product interaction ideas

File:

- `dashboard_studio.py`

Keep the concepts:

- Vibe tag filters.
- BPM/artist/genre/label filters.
- Seed track similarity.
- Similarity search within the filtered pool.
- Track auditioning.
- Feedback signals.
- Chord metadata hook.

Do not keep the implementation as the product UI. Treat it as a behavior prototype.

## What needs to be refactored

### 1. Remove generated data and personal-library artifacts from source control

Current branch includes:

- `djvibe_data/*`
- `djvibe_clap/*`
- `*.npy`
- generated dashboard HTML
- audio cache JSONL
- feature CSVs
- tracks CSVs with absolute `/Users/jeffzhao/...` paths
- Spotify/SoundCloud pseudo-locations

Measured state:

- `djvibe_data`: 2,838 tracks, 2,773 features, 65 error cache rows.
- `djvibe_clap`: 2,951 tracks, 2,939 features, 340 error cache rows, 271 duplicate cache rows.

Required change:

- Add generated workspaces to `.gitignore`.
- Keep only small synthetic fixtures.
- Move real analysis outputs to local ignored folders or object storage.

### 2. Split the analysis engine from workspace/file persistence

Right now the pipeline is tightly coupled to:

- CSV input/output.
- JSONL cache.
- NPY files.
- a single local `Workspace`.

Target architecture needs adapters:

- Web/cloud adapter:
  - Supabase tables for tracks, analysis runs, features, embeddings, clusters.
  - R2 for audio and waveform/preview artifacts.
  - Cloud Run Jobs for analysis.
- Desktop/local adapter:
  - SQLite for metadata/cache.
  - local file paths for playback.
  - packaged Python sidecar.

Keep the math/model code, but move persistence behind interfaces.

### 3. Fix failure caching and idempotency

Current behavior only treats successful analysis rows as done, so permanent failures are retried every run. This already produced duplicate error cache rows in `djvibe_clap`.

Required behavior:

- Store success, failure, and skipped states.
- Include failure reason and retry policy.
- Do not retry permanent failures like `spotify:`/`soundcloud:` pseudo-locations or missing local files unless the source changes.
- Make finalization dedupe by `track_id` and prefer the latest successful record.

### 4. Replace static dashboard generation with product UI

Current dashboard:

- embeds all data into a generated HTML file;
- uses Plotly;
- stores behavior in a huge string template;
- has no route/component/API boundaries.

Target:

- Next.js + TypeScript app.
- Deck.gl `OrthographicView` map.
- React/DOM overlays for controls, legends, Q, drawers, crate builder, and player.
- Supabase/API-backed data access.

The prototype UI teaches us what interactions matter; the implementation should not be carried forward.

### 5. Repair or remove broken/legacy scripts

`build_multi.py` imports names from `dashboard_studio.py` that do not exist:

- `GRAN`
- `_hdbscan`
- `_absorb`
- `_preset`

This script should either be repaired as a real multi-engine benchmark tool or removed from the product path.

### 6. Formalize dependencies and packaging

Current state:

- `requirements.txt` only captures core Python dependencies.
- CLAP/PyTorch/transformers are described in docs but not packaged.
- Essentia requires special handling.
- ffmpeg is assumed externally installed.

Target:

- Separate dependency groups:
  - `analysis-fast`
  - `analysis-deep`
  - `desktop`
  - `dev/test`
- Container image for Cloud Run Jobs.
- Separate desktop packaging plan for Python sidecar + ffmpeg + optional model bundle.

### 7. Add real tests

Current tests:

- `tests/make_synthetic.py` is a data generator, not a test suite.

Needed tests:

- Rekordbox XML import fixtures.
- Rekordbox XML export fixtures.
- Cache idempotency and failure handling.
- Analysis-run state transitions.
- Embedding dimension/schema validation.
- Cluster output schema validation.
- Similarity query correctness.
- Range playback behavior, at least at utility level.

## Distance from PRD target

### What is close

- 3k-track analysis proof.
- Local batch pipeline.
- Basic import/export path.
- Similarity and clustering concepts.
- Local playback proof.
- DJ-oriented product vocabulary.

### What is missing

- Next.js/TypeScript frontend.
- Deck.gl map implementation.
- Supabase schema and auth.
- Access-code gated signup.
- Cloud Run backend/API.
- Cloud Run Jobs worker container.
- R2 storage/playback integration.
- Q assistant architecture.
- Crate persistence model.
- Desktop app shell.
- SQLite local desktop adapter.
- Production-grade tests and CI.

### Rough distance estimate

- From prototype to web MVP foundation: medium-large refactor.
- From prototype to polished web MVP: large product build.
- From prototype to Mac desktop app: substantial second product surface, but the Python engine can be reused if refactored correctly.

The branch probably gets us 25-35% of the way to the hard audio-intelligence core, but only 10-15% of the way to the full PRD product.

## Recommended next steps

### Phase 0: Repository hygiene

- Repair/recreate the Jeff worktree after the repo rename.
- Remove generated analysis outputs from source control.
- Update `.gitignore` for workspaces, caches, NPYs, generated dashboards, model downloads, local envs.
- Remove or relocate personal-path docs/examples.
- Update naming from `djvibe`/`crate-digger` to `Crate Dig` where appropriate.

### Phase 1: Extract the analysis engine

- Create a clean Python package boundary, e.g. `cratedig_analysis`.
- Keep:
  - `core_excerpt`
  - backend interface
  - librosa backend
  - CLAP experiment code
  - clustering/reduction code
  - Rekordbox XML import/export utilities
- Introduce typed models for:
  - `Track`
  - `AudioFile`
  - `AnalysisRun`
  - `TrackFeatures`
  - `TrackEmbedding`
  - `ClusterAssignment`
  - `Crate`

### Phase 2: Define database/storage schema

- Supabase migrations:
  - users/profiles
  - access_codes
  - libraries
  - tracks
  - audio_objects
  - analysis_runs
  - track_features
  - track_embeddings
  - clusters
  - crates
  - crate_tracks
  - q_actions/conversations
- R2 object-key conventions for originals, previews, waveform artifacts.

### Phase 3: Build Cloud Run Job MVP

- Containerize the Python analysis worker.
- Input: analysis run ID.
- Read track/audio object references from Supabase/R2.
- Analyze only changed tracks.
- Write features/embeddings/clusters back to Supabase.
- Write artifacts to R2.
- Persist progress/errors.

### Phase 4: Build the web product shell

- Next.js + TypeScript + Supabase Auth.
- Access-code gated sign-up.
- Upload/import flow to R2 signed URLs.
- Analysis status screen.
- Main map with Deck.gl.
- Track list, player, filters, seed search, crate save.

### Phase 5: Scope Q v1

- Define Q tool/function contract.
- Start with deterministic retrieval/actions:
  - find similar
  - filter by vibe
  - build mini crate
  - explain cluster
  - transition candidates
- Return typed cards/actions, not freeform chat only.

### Phase 6: Desktop architecture spike

- Electron + React shell.
- Python sidecar proof.
- SQLite adapter.
- Local folder permissions.
- Local playback and offline analysis.
- Packaging experiment with ffmpeg and minimal model bundle.

## Merge recommendation

Do not merge the Jeff branch wholesale.

Instead:

1. Cherry-pick/refactor the analysis package ideas.
2. Recreate the data pipeline under the new architecture.
3. Keep the dashboard as a behavioral reference only.
4. Delete generated/personal artifacts before any PR.
