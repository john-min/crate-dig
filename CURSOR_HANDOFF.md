# Cursor Engineering Handoff

Status: Ready for implementation planning  
Last updated: 2026-08-20  
Primary product docs:

- [PRD.md](./PRD.md)
- [design.md](./design.md)
- [JEFF_BRANCH_REVIEW.md](./JEFF_BRANCH_REVIEW.md)
- [EXTERNAL_SETUP.md](./EXTERNAL_SETUP.md)

## 1. Mission

Build Crate Dig: a web-first, later Mac-desktop music intelligence app for DJs.

The product promise:

> Find the next record.

The immediate engineering goal is to turn the Jeff branch prototype into a clean product foundation:

1. Clean repo/worktree hygiene.
2. Extract the reusable Python music engine.
3. Prepare the foundation for Supabase, Cloudflare R2, Google Cloud Run Jobs, Vercel, and a future Mac desktop app.

## 2. Important context

The current main repo is intentionally sparse and documentation-led. The Jeff branch review worktree contains the useful prototype:

```txt
/Users/lj/code/personal/projects/crate-digger-jeff-review
```

That worktree is based on the old repository name and its `.git` pointer references the old `crate-digger` path. Before doing any serious merge/cherry-pick work, repair or recreate the worktree from the renamed repo.

The current canonical repo path is:

```txt
/Users/lj/code/personal/projects/crate-dig
```

The GitHub repository has been renamed to:

```txt
john-min/crate-dig
```

## 3. Product/architecture decisions already made

Do not re-litigate these unless new evidence appears.

- App name: Crate Dig.
- Tagline: Find the next record.
- AI assistant name: Q.
- Web frontend: Next.js + TypeScript + React.
- Frontend hosting: Vercel.
- Backend API: Python + FastAPI on Google Cloud Run.
- Batch analysis: Google Cloud Run Jobs.
- Web database: Supabase Postgres.
- Vector search: pgvector.
- Auth: Supabase Auth for MVP.
- Sign-up gate: required access code.
- Google SSO: configured through Google Cloud / Google Auth Platform and Supabase Auth.
- Audio/artifact storage: Cloudflare R2.
- Web demo playback: full-track playback from private R2-hosted audio using signed/access-controlled URLs.
- Map visualization: Deck.gl with `OrthographicView`.
- Desktop app: Mac app later, likely Electron + React/TypeScript + Python sidecar + SQLite.

## 4. What to keep from Jeff branch

Keep/refactor these ideas and modules:

- `djvibe/features.py`
  - `core_excerpt`
  - backend abstraction
  - librosa fallback
  - CLAP experiment
  - Essentia experiment
- `djvibe/analyze.py`
  - resumable per-track analysis concept
- `djvibe/cluster.py`
  - UMAP/PCA projection
  - HDBSCAN/agglomerative fallback
  - reduced normalized embeddings
  - suggested DJ moment heuristic
- `djvibe/library.py`
  - Rekordbox XML import
  - metadata normalization
- `djvibe/writeback.py`
  - Rekordbox-compatible XML export
- `player_server.py`
  - range-request playback behavior
  - AIFF transcoding concern

Treat `dashboard_studio.py` as a behavioral prototype only. It should not become the production frontend.

## 5. What not to merge

Do not merge these generated/personal artifacts:

- `djvibe_data/`
- `djvibe_clap/`
- generated `dashboard.html`
- `*.npy`
- `audio_cache.jsonl`
- personal absolute file paths
- full-library CSVs
- downloaded model files
- local virtualenvs
- `__pycache__/`

Only keep small synthetic fixtures that are safe to commit.

## 6. Desired repo shape

Proposed near-term structure:

```txt
apps/
  web/
    Next.js app

packages/
  engine/
    pyproject.toml
    cratedig_engine/
      __init__.py
      audio/
      backends/
      ingest/
      pipeline/
      export/
      storage/
      schemas.py
    tests/

supabase/
  config.toml
  migrations/
  seed.sql

docs/
  optional future docs
```

Do not create `packages/analysis/cratedig_analysis`. The preferred name is:

```txt
packages/engine/
Python package: cratedig_engine
```

Rationale: the engine owns analysis, embeddings, clustering, similarity, import/export, and eventually desktop-side local execution. “Analysis” is too narrow.

## 7. Phase 1: repo/worktree hygiene

Goal: prepare a safe branch for implementation without carrying generated artifacts.

Tasks:

1. Confirm canonical repo path and remote:

   ```bash
   git remote -v
   git status --short --branch
   ```

2. Repair or recreate the Jeff review worktree.

   Preferred: recreate cleanly from `origin/jeff` instead of editing stale worktree metadata.

3. Create an implementation branch:

   ```bash
   git switch -c codex/engine-foundation
   ```

4. Add `.gitignore` entries for generated artifacts:

   ```gitignore
   # generated analysis workspaces
   djvibe_data/
   djvibe_clap/
   **/djvibe_data/
   **/djvibe_clap/

   # generated analysis artifacts
   *.npy
   *.npz
   audio_cache.jsonl
   feedback.jsonl
   dashboard.html
   features.csv
   clusters.csv
   embeddings_ids.json
   reduced_emb.npy

   # model/download/cache artifacts
   models/
   .cache/

   # Python/local env
   .venv/
   venv/
   __pycache__/
   *.pyc

   # secrets
   .env
   .env.*
   !.env.example
   ```

5. Update README naming:

   - `crate-digger` → `Crate Dig`
   - link to PRD/design/review/setup docs

6. Verify no private/personal library artifacts are in the branch.

Acceptance criteria:

- Main repo has clean docs and ignores generated artifacts.
- No personal-path CSVs are committed.
- Jeff prototype can be referenced, but not merged wholesale.
- `git status` only shows intentional source/doc changes.

## 8. Phase 2: extract Python engine

Goal: create a reusable Python package that can power both Cloud Run Jobs and the future Mac desktop app.

Create:

```txt
packages/engine/
  pyproject.toml
  cratedig_engine/
    __init__.py
    schemas.py
    audio/
      excerpt.py
    backends/
      base.py
      librosa_backend.py
      clap_backend.py
      essentia_backend.py
    ingest/
      rekordbox_xml.py
    pipeline/
      analyze.py
      cluster.py
      cache.py
    export/
      rekordbox_xml.py
      m3u.py
      csv.py
    storage/
      local_workspace.py
  tests/
```

### 8.1 Typed schemas

Use Pydantic or dataclasses. Prefer Pydantic if the same models may drive FastAPI.

Initial schemas:

- `Track`
- `AudioFile`
- `AnalysisRun`
- `AnalysisResult`
- `TrackFeatures`
- `TrackEmbedding`
- `ClusterAssignment`
- `Crate`
- `CrateTrack`

### 8.2 Backend interface

Define a stable interface:

```python
class AudioBackend(Protocol):
    name: str
    model_version: str

    def analyze(self, audio_path: str) -> AnalysisResult:
        ...
```

Initial backend priorities:

1. `librosa` fast backend.
2. CLAP deep backend behind an optional dependency group.
3. Essentia as an experimental/optional backend.

### 8.3 Analysis modes

Implement two modes:

- `fast`
  - metadata
  - BPM/key/loudness where feasible
  - waveform/previews later
  - classical features
  - basic clustering
- `deep`
  - embeddings
  - CLAP/semantic tags
  - richer similarity

Do not block the whole product on CLAP/PyTorch.

### 8.4 Cache/idempotency

Fix the Jeff branch behavior where failed files are retried forever.

Each analysis result should include:

- `track_id`
- `audio_file_hash`
- `status`: `ok | failed | skipped`
- `failure_reason`
- `analysis_pipeline_version`
- `model_version`
- `feature_schema_version`
- `created_at`

Permanent failures should not be retried unless source metadata changes.

### 8.5 Tests

Minimum test suite:

- Rekordbox XML import fixture.
- Rekordbox XML export fixture.
- M3U export fixture.
- Analysis cache idempotency.
- Failure cache behavior.
- Cluster output schema.
- Reduced embedding shape.
- Synthetic-data pipeline smoke test.

Acceptance criteria:

- `packages/engine` can run tests locally.
- Fast-analysis path works without CLAP/PyTorch.
- Rekordbox XML import/export behavior is covered by fixtures.
- Generated data remains out of Git.
- Engine has no dependency on static dashboard HTML.

## 9. Phase 3: Supabase schema foundation

Goal: create the initial database schema for the web app.

Expected tables:

- `profiles`
- `access_codes`
- `libraries`
- `tracks`
- `audio_objects`
- `analysis_runs`
- `track_features`
- `track_embeddings`
- `clusters`
- `crates`
- `crate_tracks`
- `q_conversations`
- `q_actions`

Use Supabase migrations, not dashboard-only schema drift.

Required extension:

```sql
create extension if not exists vector;
```

Initial vector dimensions may differ by model. Either:

- start with one fixed embedding column for the chosen model, or
- use separate embedding rows with `model_name`, `dimensions`, and a vector column per model family.

Cursor should propose the schema before applying migrations.

## 10. Phase 4: Cloud Run Job MVP

Goal: containerize the engine so a Cloud Run Job can process an `analysis_run_id`.

Target command:

```bash
cratedig-engine analyze-run --analysis-run-id <uuid>
```

Behavior:

1. Load analysis run from Supabase.
2. Fetch track/audio object references.
3. Download or stream audio from R2.
4. Analyze changed tracks.
5. Write features/embeddings/clusters to Supabase.
6. Write previews/waveforms/artifacts to R2 as needed.
7. Update progress and errors.

Do not build a huge orchestration system yet. Make one job work end-to-end.

## 11. Phase 5: Web app shell

Goal: create the web product frame.

Create:

```txt
apps/web/
  Next.js App Router
  TypeScript
  Tailwind
  Supabase client/server utils
```

Screens:

- Landing page.
- Access-code gate.
- Login/sign-up.
- Upload/import shell.
- Analysis status shell.
- Main app shell.

Auth:

- Supabase Auth.
- Google SSO.
- Email/password.
- Required access code before account access.

## 12. Phase 6: Deck.gl map

Goal: implement the first product-grade map using 3k analyzed tracks.

Use:

- `deck.gl`
- `@deck.gl/react`
- `@deck.gl/layers`
- `@deck.gl/core`
- `OrthographicView`

Features:

- Render 3k points.
- Fit to view.
- Hover tooltip.
- Click/select track.
- Color by cluster/mood.
- Highlight selected/playing/seed tracks.
- Basic filter integration.
- React/DOM overlays for cards, controls, Q, and legends.

Do not use Plotly for the production map.

## 13. Definition of done for the next major milestone

The next major milestone is complete when:

- The repo is clean and named Crate Dig.
- The Python engine exists under `packages/engine`.
- Generated/private artifacts are ignored.
- Fast analysis can run on a synthetic fixture.
- Rekordbox XML import/export has fixtures/tests.
- Supabase schema migration exists.
- Web shell boots locally.
- Access-code auth flow is stubbed or implemented.
- Deck.gl map renders representative 3k-track fixture data.

## 14. Non-goals for this handoff

- Full desktop app.
- Full Q assistant implementation.
- Perfect CLAP model selection.
- Production-grade waveform generation.
- Direct Rekordbox database mutation.
- Public music hosting platform.
- Full visual polish from the Claude Design prompt.

## 15. Implementation notes

- Favor boring, testable module boundaries.
- Keep fast analysis working without large ML dependencies.
- Put deep-analysis dependencies behind optional extras.
- Preserve local/offline compatibility for the future desktop app.
- Keep environment variables out of Git.
- Prefer migration files over dashboard-only database changes.
- Do not commit real user music metadata or paths.
