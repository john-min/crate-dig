# Crate Dig Implementation Plan

Status: Draft for engineering handoff  
Last updated: 2026-08-25  
Primary scope: Sonic-analysis backend, local evaluation loop, web integration, and path to Mac desktop  
Branch reviewed: `codex/engine-foundation`
Branch strategy: use short-lived, descriptive feature branches from the agreed baseline. Keep one implementation slice per branch; do not use a permanent personal or catch-all implementation branch. Example sequence: `feature/engine-extractor-foundation`, `feature/local-analysis-worker`, `feature/similarity-lab`, and `feature/fast-map-integration`.

## 1. Source documents reviewed

This plan reconciles three PRDs:

1. `PRD.md` — canonical product PRD for the full Crate Dig experience.
2. `sonic_analysis_prd.md` — canonical delivery contract for the sonic-analysis backend.
3. `CRATE_DIG_ENGINE_PRD.md` — earlier engine implementation draft; useful technical material, superseded where it conflicts with `sonic_analysis_prd.md`.

Technical rationale and model research remain in `sonic_analysis_engine.md`.

## 2. Canonical document hierarchy

Use the documents in this order when decisions conflict:

| Priority | Document | Authority |
|---|---|---|
| 1 | `PRD.md` | Product promise, users, surfaces, platform decisions, and full-product scope |
| 2 | `sonic_analysis_prd.md` | Backend releases, functional requirements, SLOs, evaluation gates, and definition of done |
| 3 | `CRATE_DIG_ENGINE_PRD.md` | Residual engine requirements that do not conflict with either canonical PRD |

`sonic_analysis_engine.md` is non-authoritative technical guidance. It may clarify implementation and research methodology, but it cannot override any PRD requirement.

Before implementation starts, build a requirement-by-requirement disposition table for `CRATE_DIG_ENGINE_PRD.md`. Merge every retained normative requirement into `sonic_analysis_prd.md` (or a clearly labeled canonical annex to it), then replace/archive the older file only after the table shows no unowned requirement. Technical rationale may move to `sonic_analysis_engine.md`, but normative requirements may not.

## 3. PRD synthesis and conflict resolution

### 3.1 What all three PRDs agree on

- Crate Dig finds records in the same sonic world, not merely tracks with compatible BPM/key.
- The engine must keep sonic match, groove match, and mix safety separate.
- Similarity is multi-channel and explainable.
- The map is a projection, not the source of retrieval truth.
- Local audio remains local unless the user explicitly selects cloud behavior.
- Web uses Next.js/Vercel, Supabase, R2, FastAPI/Cloud Run, and Cloud Run Jobs.
- Desktop should reuse the React/TypeScript UI and Python engine through a local sidecar.
- Model choices must be decided through human DJ evaluation.

### 3.2 Resolved sequencing decisions

| Topic | Earlier engine draft | Canonical resolution |
|---|---|---|
| First milestone | Moves quickly toward full engine v1 | Build the local similarity-evaluation loop first |
| Source separation | Mandatory throughout completed engine | Not required for v0.1/v0.2; mandatory only for the active `ready_deep` manifest starting v0.3 |
| Evaluation corpus | Begin with 300–500 tracks and 50 anchors | Begin with 45–65 tracks and 8 anchors; expand after the harness works |
| Model selection | Large stack described up front | Compare current CLAP, librosa baseline, and Discogs-EffNet first; add candidates sequentially |
| Learned ranker | Follow-up/out of scope | Data contract is required now; training is v0.4 after enough judgments exist |
| Map | Core early experience | Existing UI remains, but actual sonic geometry waits for validated embeddings and frozen projection |
| Q | Product requirement | Q retrieval/actions follow stable similarity APIs; no LLM backend blocks v0.1 |
| Cloud | Existing foundation available | Validate locally first, then port selected manifests to cloud adapters |

### 3.3 Model-policy resolution

- `htdemucs_ft` is the first pinned deep separator, not a v0.1 dependency.
- BS-RoFormer and MelBand-RoFormer are challengers only after a documented separation failure slice exists.
- MuQ, MERT, MAEST, MERIT, DAC, PaSST/PANNs/OpenMIC, and other candidates enter through the evaluation harness one at a time.
- No research-only or noncommercial checkpoint enters a production model manifest.
- Beat/pitch models such as Beat This or CREPE remain evaluation candidates rather than locked dependencies.

## 4. Verified current state

### 4.1 Working foundations

- Next.js application shell, authentication routes, access-code gating, and Supabase clients exist.
- Deck.gl map and refined studio UI exist.
- Supabase has initial tables for users, libraries, tracks, audio objects, analysis runs, features, embeddings, clusters, crates, and Q records.
- Python engine package exists with librosa, CLAP, and Essentia backends.
- Cloud Run `analyze-run` job exists with injected Supabase and R2 adapters.
- Rekordbox XML import and XML/M3U/CSV export exist.
- Local FastAPI imports folders, lists tracks, and serves local audio with Range support.
- Existing test baseline passes:
  - engine: 33 tests
  - local API: 3 tests, with one Starlette/httpx deprecation warning
  - web: ESLint passes

### 4.2 Critical gaps

- `pyrekordbox>=6.0` is not a valid available dependency and blocks a clean engine resolution path.
- `AudioBackend.analyze(path)` returns one pooled embedding and one feature dictionary.
- Each backend decodes and resamples independently.
- Window-level evidence is pooled away.
- Cache identity includes `track_id` and invalidates a whole backend at once.
- UMAP/clustering is refit rather than using a frozen projection artifact.
- Local SQLite only stores libraries and tracks.
- Local API cannot create, run, inspect, cancel, or retry analysis jobs.
- There is no evaluation-set or pair/triplet judgment persistence.
- Local UI tracks receive placeholder coordinates.
- Frontend “similarity” is derived partly from 2D map position, BPM, key, and mock tags rather than backend sonic evidence.

## 5. Delivery strategy

The critical path is:

```txt
Clean environment
  -> Engine extractor foundation
  -> Local persistence and worker
  -> Blind similarity lab
  -> Three-model pilot
  -> Larger held-out promotion + fast discovery baseline
  -> Deep source-conditioned bake-off
  -> Fast cloud productization + product workflows
  -> Deep cloud/component-Q activation
  -> Crate Dig ranker
  -> Mac packaging after deep/workflow contracts stabilize
```

Do not begin with all deep models, cloud GPU optimization, Q's LLM, or desktop packaging. First make model quality observable.

## 6. Phase 0 — Canonicalize and unblock

Goal: establish one implementation contract and a reproducible development baseline.

Estimated size: Phase 0A documentation/dependency cleanup, 1–2 engineering days; Phase 0B registry/environment foundation, 3–5 engineering days. ADR decisions may be researched early but are gated by the named downstream phase, not rushed into the cleanup PR.

### Work

1. Make `sonic_analysis_prd.md` the only active sonic backend PRD.
2. Create a disposition matrix for every `CRATE_DIG_ENGINE_PRD.md` requirement; merge retained normative content into `sonic_analysis_prd.md`, move rationale only into the strategy document, and archive the old PRD only after zero normative items remain solely there.
3. Update `README.md`, `CURSOR_HANDOFF.md`, and related-doc links.
4. Remove the unused `rekordbox-db` optional dependency from `packages/engine/pyproject.toml`; current MVP uses Rekordbox XML and does not need direct database access.
5. Add a clean dependency-resolution check for engine, local API, and web.
6. Create a safe synthetic evaluation manifest fixture and schema tests.
7. Record current runtime/test baselines.
8. Create a model-artifact registry schema before downloading or loading additional checkpoints.
9. Open four bounded decision spikes, each ending in an ADR before its dependent phase starts:
   - Q typed-intent/action contract before Phase 8;
   - supported Rekordbox XML import/export subset and golden fixtures before Phase 8;
   - R2 originals/normalized-audio/preview layout, retention, and deletion contract before Phase 7;
   - desktop embedded-versus-downloadable model bundle policy before Phase 10.

The registry must record:

- model/code license and weights license
- commercial-use status
- attribution and redistribution/bundling restrictions
- source URL and SHA-256
- trusted-loading policy; remote custom code is disabled by default
- runtime, sample rate, dimensions, and supported device/profile
- evaluation-only versus production/bundle eligibility

Define locked dependency profiles and images separately for:

- local/CPU fast evaluation
- cloud CPU fast analysis
- local accelerated deep evaluation
- cloud GPU deep analysis

### Files

- `PRD.md`
- `sonic_analysis_prd.md`
- `CRATE_DIG_ENGINE_PRD.md`
- `README.md`
- `CURSOR_HANDOFF.md`
- `packages/engine/pyproject.toml`
- `packages/engine/cratedig_engine/models/registry.py`
- `packages/engine/cratedig_engine/models/manifest.py`
- `packages/engine/tests/fixtures/`

### Exit criteria

- A clean environment can install `cratedig-engine[fast,dev]` and run tests.
- Engine tests, local API tests, and web lint pass.
- Only one document is labeled as the active sonic backend PRD.
- The old-engine-PRD disposition matrix has no retained normative requirement pointing only to a non-authoritative document.
- No personal audio or library paths are committed.
- Every enabled external checkpoint has a validated registry entry and checksum policy before use.
- Each bounded spike has an owner, decision deadline, fixtures where applicable, and a named downstream phase gate.
- Baseline commands and date are recorded: `packages/engine/.venv/bin/pytest` (33 passed on 2026-08-25), `apps/local-api/uv run pytest` (3 passed with one Starlette/httpx warning), and `apps/web/pnpm lint` (passed).

## 7. Phase 1 — Engine v2 extractor foundation

Goal: replace one-backend/one-vector execution with reusable, versioned feature extraction while keeping current behavior working.

Estimated size: 5–8 engineering days.

Requirements: `SONIC-ING-003`, `SONIC-RUN-003` through `SONIC-RUN-006`, `SONIC-FEAT-001` through `SONIC-FEAT-004`.

### Workstream 1A — Shared audio substrate

Create:

```txt
packages/engine/cratedig_engine/audio/decode.py
packages/engine/cratedig_engine/audio/windows.py
```

Implement:

- `DecodedAudio` with source hash, original metadata, canonical decoded PCM, and cached resampled/mono views.
- `WindowPlan` with stable name/version and explicit boundary/pooling behavior.
- explicit legacy manifests that reproduce each current backend's window/excerpt behavior for golden-output comparison
- `sampled-v1`: three representative 10-second windows as a separately named challenger for initial library runs
- `full-overlap-v1`: 10-second windows with 5-second hop for the small evaluation corpus only.
- deterministic short-track behavior.

Do not default the 3,000-track library to full-overlap analysis. At an average six-minute duration, it would produce roughly 200,000+ windows per model.

### Workstream 1B — Extractor contracts

Create:

```txt
packages/engine/cratedig_engine/extractors/base.py
packages/engine/cratedig_engine/extractors/legacy.py
packages/engine/cratedig_engine/extractors/registry.py
packages/engine/cratedig_engine/records.py
packages/engine/cratedig_engine/pipeline/extract.py
```

Define:

- `ExtractorSpec`
- `Extractor`
- `EmbeddingRecord`
- `ScalarFeatureRecord`
- `TagFeatureRecord`
- `FeatureBundle`
- `ModelSetManifest`

Required provenance:

- audio content hash
- extractor/model/checkpoint identity
- configuration and weight hash
- window plan and pooling strategy
- scope, time range, and optional stem
- role and confidence

### Workstream 1C — Content-addressed cache

Refactor `pipeline/cache.py` so cache identity excludes `track_id` and includes extractor identity and relevant configuration.

Preserve:

- sticky terminal success/failure/skipped behavior
- explicit retry support
- safe reuse across two logical tracks pointing to identical audio

### Workstream 1D — Compatibility and tests

- Adapt current `AudioBackend` implementations through `LegacyBackendExtractor`.
- Port librosa first.
- Port CLAP and Essentia without changing their outputs initially.
- Add golden-output equivalence tests for the current librosa central excerpt, current CLAP three-window strategy, and current Essentia central excerpt before changing their window manifests.
- Add fake extractors to verify independent success, failure, cache, and version behavior.
- Keep the old API only as a temporary compatibility layer.

### Exit criteria

- One track is decoded once for multiple enabled extractors.
- Two extractors can fail/cache/version independently.
- Window records remain queryable after pooled output is produced.
- Identical audio under different track IDs reuses cached computation.
- Existing 33 engine tests remain green and new extractor/cache tests pass.

### Implementation status — 2026-08-25

Implemented on `codex/analysis-runtime-foundation`:

- removal of the unused, unresolvable `rekordbox-db` optional dependency;
- immutable extractor, feature, model-artifact, and model-set manifest contracts;
- decode-once `DecodedAudio` with cached channel/sample-rate views;
- explicit legacy, sampled, and overlapping window plans with retained evidence;
- manifest-driven file extraction with exact registry resolution and a distinct plan per extractor;
- content-addressed extractor cache with independent success/failure/skip, retry, and overwrite behavior;
- a native shared-audio librosa extractor with golden legacy embedding equivalence, physical scalars, and explicit BPM confidence;
- a compatibility adapter that fingerprints known semantic configuration, declares each legacy backend's actual internal plan, and rejects false window provenance.

Deliberately deferred to Phase 2: cross-process claiming and durable cache uniqueness. The JSONL cache is process-local and transitional; SQLite migrations, unique constraints, WAL, and atomic worker claims own those requirements. CLAP and Essentia remain compatibility adapters until their native shared-audio ports receive real-model golden fixtures.

## 8. Phase 2 — Local persistence and asynchronous analysis

Goal: make the local API the durable backend for the evaluation loop and future desktop sidecar.

Estimated size: 5–8 engineering days.

Requirements: `SONIC-ING-001` through `SONIC-ING-003`, `SONIC-RUN-001` through `SONIC-RUN-004`, `SONIC-PLAT-001`, `SONIC-PLAT-002`, `SONIC-PLAT-004`.

### Workstream 2A — SQLite migrations

Replace the single inline bootstrap schema with versioned local migrations.

Add logical tables for:

- `analysis_runs`
- `analysis_stages`
- `track_features`
- `track_embeddings`
- `model_set_manifests`
- `similarity_neighbors`
- `projection_artifacts`
- `evaluation_sets`
- `evaluation_anchors`
- `similarity_judgments`

Do not overload `user_tag_feedback` for pair or triplet evaluation.

SQLite implementation rules:

- Treat SQLite as the durable local system of record, not a disposable cache.
- Enable WAL, foreign-key enforcement, a bounded busy timeout, and versioned migrations; keep worker writes short and atomically claimed.
- Create the database under the app's local application-data directory, not alongside music on an external/network volume.
- Store original audio, checkpoints, temporary stems, previews, and large waveform artifacts on the filesystem; persist only paths, hashes, versions, provenance, and lifecycle state in SQLite.
- Store each embedding in a native-dimensional typed binary representation with model/version/dimension metadata.
- Keep local/cloud schema semantics aligned, but sync domain records through APIs rather than copying the SQLite file.

### Workstream 2B — Worker boundary

Create a separate local worker process rather than running model inference inside FastAPI handlers.

Suggested files:

```txt
apps/local-api/cratedig_local_api/jobs.py
apps/local-api/cratedig_local_api/worker.py
apps/local-api/cratedig_local_api/repository.py
```

Behavior:

- API writes queued stages to SQLite.
- One development worker claims stages atomically.
- Worker runs enabled engine extractors.
- Progress and terminal errors persist.
- Restarting the worker resumes from terminal/cache state.
- Default heavy-task concurrency is one.
- Cancellation is cooperative at window/extractor boundaries and records canonical terminal state `skipped` with stable reason code `cancelled_by_user`; do not introduce a local-only `cancelled` enum.
- Retries use stable machine-readable error codes, classify retryable versus terminal failures, and enforce a finite retry ceiling.
- Corrupt/unsupported audio becomes a per-track terminal result; it never stalls the containing run.
- Persist enough progress detail for the API to reflect a completed stage within two seconds under normal local load.

### Workstream 2C — Analysis API

Implement:

```txt
POST /libraries/{library_id}/analysis-runs
GET  /analysis-runs/{run_id}
GET  /analysis-runs/{run_id}/tracks
POST /analysis-runs/{run_id}/cancel
POST /analysis-stages/{stage_id}/retry
GET  /tracks/{track_id}/analysis
GET  /tracks/{track_id}/neighbors
```

Add engine as an explicit local API dependency through the package manager/workspace configuration.

Return per-file import outcomes for imported, duplicate, unsupported, corrupt, missing-metadata, and failed files with stable error/reason codes and remediation hints. Use the same outcome schema for local and cloud imports.

### Workstream 2D — Reliability tests

Test:

- duplicate job submission
- worker interruption/resume
- failed extractor with successful siblings
- explicit retry
- missing local file
- content change invalidation
- playback during active analysis
- corrupt and unsupported files
- retry ceiling and non-retryable errors
- cooperative cancellation
- progress visibility within the two-second SLO

### Exit criteria

- Folder import and Range playback continue to work.
- API creates a run without executing inference synchronously.
- Worker processes and persists extractor outputs.
- Every stage reaches a terminal state.
- Every failure response has a stable error code and retryability flag.
- Restarting API/worker does not lose progress.
- Local API tests cover the new lifecycle.

## 9. Phase 3 — Blind similarity lab

Goal: make model quality observable and collect the data required for future ranking.

Estimated size: 5–8 engineering days.

Requirements: `SONIC-RET-001`, `SONIC-RET-002`, `SONIC-EVAL-001` through `SONIC-EVAL-003`.

### Workstream 3A — Evaluation API

Implement:

```txt
POST /evaluation-sets
GET  /evaluation-sets/{id}
GET  /evaluation-sets/{id}/next
POST /evaluation-sets/{id}/judgments
GET  /evaluation-sets/{id}/report
```

Support:

- pair ratings
- ABX/triplet choices
- top-K accept/reject
- component dimension
- blind/non-blind state
- model/configuration shown
- train/validation/test membership

### Workstream 3B — Similarity lab UI

Create:

```txt
apps/web/src/app/lab/similarity/page.tsx
apps/web/src/components/lab/SimilarityLab.tsx
apps/web/src/components/lab/BlindCandidate.tsx
apps/web/src/components/lab/JudgmentControls.tsx
apps/web/src/components/lab/ModelComparison.tsx
apps/web/src/lib/evaluation/local-api.ts
apps/web/src/lib/evaluation/types.ts
```

Reuse the existing audio player and track presentation primitives, but enforce blind mode:

- candidate aliases instead of title/artist
- no artwork, label, genre, BPM, or key during primary judgment
- reveal metadata only after submission when requested

Introduce the web verification stack here: Vitest + Testing Library for state, payload, and blindness contracts; Playwright for the import → retrieve → blind judgment → report flow. Record runnable commands in the web README/package scripts.

### Workstream 3C — Reports

Compute:

- accepted-at-K / Precision@K
- nDCG@10 for graded ratings
- triplet accuracy
- evaluator agreement when multiple evaluators exist
- runtime per audio minute
- failures and cache hits
- peak memory when available
- stored bytes per track

### Exit criteria

- An anchor can return top 10–25 candidates from any enabled configuration.
- A user can listen blind and save overall plus component judgments.
- Submitted judgments round-trip with the correct model/configuration and evaluation-set version.
- Reports separate retrieval quality from runtime/cost.
- Vitest/Testing Library and Playwright tests prove metadata remains hidden before blind submission and that judgments persist against the correct configuration.

## 10. Phase 4 — Three-model pilot and v0.1 gate

Goal: complete the first evidence loop, validate the harness, and nominate candidates for the larger fast-baseline promotion study.

Estimated size: 3–6 engineering days plus Jeff's curation/review time.

### Product work

Jeff/user creates:

- 8 anchors
- approximately 8 comparisons per anchor
- approximately 45–65 unique tracks
- hard negatives that mix well but sound different
- explicit overall, drum, bass, melodic-palette, groove, production, and mix judgments

Audio stays outside Git. Commit only IDs/manifests that contain no private absolute paths.

### Engineering work

Compare through the common harness:

1. librosa/physical baseline
2. current CLAP implementation
3. Discogs-EffNet

Use `full-overlap-v1` only where the experiment requires it. Record both window and pooled outputs.

### v0.1 release gate

Backend v0.1 is complete only when:

- import → analyze → retrieve → listen → judge → report works locally;
- all three configurations use the common extractor contract;
- repeated unchanged runs demonstrate cache reuse;
- judgments are exportable and versioned;
- source audio never leaves the machine.

### Decision output

Write a short bake-off report that selects:

- a provisional retrieval candidate for the larger promotion study
- a provisional layout candidate for the larger promotion study
- the initial prompt/physical explanation channels
- failure slices that justify the next model experiment

The 45–65-track pilot validates the harness and eliminates obviously weak configurations. It does **not** promote a production retrieval model, map layout, cloud manifest, or desktop bundle.

## 11. Phase 5 — Fast discovery and real map integration

Goal: replace placeholder geometry and UI-derived similarity with backend evidence for a 3,000-track demo.

Estimated size: Workstream 5A is a separate 1–2 product-week evaluation milestone with Jeff/evaluator time; Workstreams 5B–5E require approximately 7–10 engineering days after promotion.

Requirements: `SONIC-ING-004`, `SONIC-RET-004`, `SONIC-RET-005`, v0.2 scope.

### Workstream 5A — Production promotion gate

Expand the non-stem evaluation corpus to 300–500 tracks with at least 50 anchors, held-out anchors, hard negatives, and representative genre/library slices. Compare the Phase 4 finalists without changing weights from held-out results.

Promote the fast retrieval and layout manifests only when the bake-off records:

- at least 10% relative held-out nDCG@10 improvement **or** at least 5 percentage points of held-out triplet-accuracy improvement over the physical/librosa baseline;
- no unexplained regression greater than 10 percentage points (normalized delta 0.10) on any critical declared slice;
- evaluator agreement or uncertainty intervals sufficient to distinguish the candidates;
- runtime, peak-memory, stored-bytes, and 3,000-track cost estimates;
- approved code/weights licensing and model-artifact registry entries.

If a candidate misses those thresholds or evidence is inconclusive, it remains experimental and cannot become the production retrieval role, production layout role, cloud default, or desktop bundle. Retain the simplest deterministic baseline and continue evaluation.

### Workstream 5B — Retrieval

- Implement exact local cosine top-K over NumPy arrays loaded from native-dimensional SQLite records.
- Precompute/cache neighbors for map/list responsiveness.
- Return model-set version, component evidence, and confidence.
- Keep BPM/key out of the core sonic score.
- Compute and persist Chromaprint evidence for exact/near-duplicate handling; fingerprints are duplicate evidence, never the sonic score.
- Implement `POST /similarity/search` for one or multiple seeds, component selection, filters, exclusions, and top-K.
- Benchmark the exact path at 10,000 and 50,000 analyzed tracks. Add FAISS or another versioned local ANN sidecar only if measured latency/memory misses the declared target; do not require `sqlite-vec` for v1.
- Use promoted, dimension-compatible pgvector indexes for the cloud implementation of the same logical search contract.

### Workstream 5C — Projection

Create a projection service/artifact that:

- fits standardization and optional PCA/UMAP on a versioned reference corpus;
- persists the fitted artifact;
- transforms new tracks without refitting;
- stores `projection_version` with coordinates.
- serves coordinates through `GET /projections/{version}/coordinates`.

### Workstream 5D — Evidence-backed explanations

- Replace frontend-invented reason strings with backend reason codes.
- Keep generative phrasing optional.
- Suppress reasons below calibrated confidence thresholds.

### Workstream 5E — Waveforms and web integration

- Generate and persist real waveform/overview artifacts; remove the current waveform stubs from production data paths.
- Add Vitest + Testing Library for web state/contracts and Playwright for browser-level local map/search/playback flows; keep lint and production build as separate gates.

Update:

- `apps/web/src/lib/studio/from-local.ts`
- `apps/web/src/lib/studio/similarity.ts`
- `apps/web/src/lib/studio/local-api.ts`
- `apps/web/src/components/studio/StudioProvider.tsx`
- map/track-drawer consumers

Rules:

- analyzed tracks use backend coordinates and similarity;
- only `ready_fast` and `ready_deep` tracks enter the sonic map;
- imported, queued, and `processing_fast` tracks remain in list/status views until fast analysis completes;
- visually distinguish `ready_fast` from `ready_deep` without implying that either is unanalyzed;
- 2D distance never becomes the returned similarity score;
- mock-library behavior remains isolated from real local data.
- Wire BPM, Camelot key, genre, label, mood, energy, texture, date-added, readiness, and hidden-state filters to the server-side search contract.
- Wire one- and multi-seed search, filtered-pool reranking, playback, and add-to-crate from both map and accessible list views.

### Exit criteria

- A 3,000-vector fixture returns top 25 at p95 ≤500 ms excluding cold startup.
- New tracks enter an existing projection without refitting it.
- The promoted retrieval/layout manifests satisfy the larger held-out evaluation, operational, and license gates.
- The UI no longer claims placeholder local geometry is sonic similarity.
- Duplicate evidence and real waveform artifacts are available to the UI.
- The similarity-search and projection-coordinate contracts have integration tests.
- Every displayed explanation maps to stored evidence.

## 12. Phase 6 — Deep source-conditioned bake-off

Goal: test the central product thesis that explicit drum, bass, and supporting-instrument evidence improves sonic retrieval.

Estimated size: 3–6 engineering weeks, intentionally experiment-gated.

Requirements: `SONIC-FEAT-005`, `SONIC-FEAT-006`, `SONIC-RET-003`, v0.3 scope.

### Workstream 6A — Separation substrate

Implement:

- `StemSeparator` and versioned `StemBundle`
- `htdemucs_ft` as the first pinned implementation
- content-addressed separator cache
- drums/bass/vocals/other provenance
- reconstruction, energy, silence/clipping, bleed-proxy, and confidence diagnostics
- terminal `degraded` state
- temporary lossless stem cleanup

Separation is required only for manifests whose completion policy marks it required.

### Workstream 6B — Source-conditioned features

Drums:

- learned timbre embedding
- transient/envelope and spectral descriptors
- beat-relative onset/pattern representation
- cautious palette probes

Bass:

- learned timbre embedding
- sub/bass/low-mid balance
- envelope, onset, pumping, and spectral movement
- optional confident pitch evidence

Vocals and `other`:

- presence, persistence, energy, treatment, space, and broad instrument-family evidence
- embeddings only when they improve held-out retrieval

### Workstream 6C — Sequential model experiments

Recommended order:

1. leading v0.2 encoder on Demucs stems
2. CLAP stem palette probes
3. MERIT rhythm/timbre
4. MuQ versus MERT/MAEST selected layers
5. instrument-presence head
6. DAC continuous latents
7. separator challenger only if a failure slice justifies it

Do not install and operationalize all candidates simultaneously.

### Workstream 6D — Expanded evaluation

Expand to 300–500 tracks and at least 50 anchors with held-out anchors.

Promote a channel only when it meets the thresholds in `sonic_analysis_prd.md`, passes licensing review, and adds independent value in ablation.

### Exit criteria

- Same-drums, same-bass, and same-groove queries are independently measurable.
- Whole-mix versus stem-aware results have a documented held-out comparison.
- Low-confidence stems cannot generate confident explanations.
- Deep analysis reaches `ready_deep` or terminal `degraded` without infinite retries.

## 13. Phase 7 — Cloud productization

Goal: deploy the promoted fast manifest for the controlled web demo, then activate deep manifests only after Phase 6 promotes them.

Estimated size: 2–4 engineering weeks.

Requirements: `SONIC-PLAT-003` plus the parent PRD's signed upload, cloud status, playback, ownership, and deletion requirements.

### Workstream 7A — Supabase schema evolution

Add migrations for:

- canonical scoped feature records
- multi-model embeddings
- analysis stages/dependencies
- model-set manifests
- evaluation sets/judgments
- projection versions
- reason codes/component neighbors

Embedding persistence must preserve each raw vector at its native declared dimension. A representation receives a search role only through a versioned manifest that declares its dimension and index. Use per-dimension tables/indexes or an explicitly versioned projection—never silent padding/truncation into the existing fixed `vector(512)` column. Include backfill, rollback, and local/cloud parity tests.

Add RLS for all user-owned records and push the migration to the configured Supabase project before declaring the phase complete.

### Workstream 7B — Cloud worker

Refactor the Cloud Run Job to:

- execute a model-set manifest rather than one backend name;
- reuse R2 downloads and decoded audio;
- persist stage-level status;
- clean temporary sources/stems;
- emit cost/runtime telemetry;
- ship separate locked CPU-fast and GPU-deep images/profiles;
- deploy the CPU-fast path first;
- activate a GPU-deep manifest only after the Phase 6 held-out, licensing, cost, and reliability gates pass.

### Workstream 7C — Cloud API and playback

- Create/monitor analysis runs through Cloud Run FastAPI.
- Provide a signed upload-session endpoint, browser upload registration/completion, and cloud-analysis status endpoints.
- Use direct signed R2 uploads; never proxy large audio through Vercel.
- Use short-lived signed/authenticated full-track playback endpoints with Range support.
- Provide an authenticated delete flow that removes Supabase records and all owned R2 objects according to the storage ADR.
- Preserve the existing Supabase Auth/access-code flow.

### Workstream 7D — Web demo completion

- Verify and finish the landing loop: “Find the next record,” web/Mac positioning, and upload → analyze → explore → Q → crate explanation.
- Verify Google SSO, email/password sign-up/login, password reset, logout, privacy reassurance, and access-code-first onboarding in deployed preview and production environments.
- Connect browser upload, per-file errors, stage progress, retry/recovery, ready-state transition, map/list discovery, and signed playback to the cloud APIs.
- Keep cloud-demo consent explicit and explain what audio/metadata leaves the device before upload.
- Extend Playwright coverage through the deployed signed-upload/status/map/playback path and auth/access-code flow.

### Workstream 7E — Auth and access-code correctness

- Replace conditional application-side access-code redemption with one atomic Postgres RPC/transaction that validates expiry and remaining uses, increments exactly once, and associates the user profile.
- Treat a zero-row redemption as denial and roll back the whole operation if profile association fails.
- Test concurrent redemption, expiry, replay, rollback, and ownership isolation.

### Workstream 7F — Deployment gates

- License manifest approved for every shipped checkpoint.
- Secrets stored outside source control.
- 3,000-track cost estimate documented.
- Retention/deletion policy implemented.
- RLS and ownership tests pass.
- Vercel uses the Cloud API only for orchestration and retrieval.
- Local-to-cloud processing requires an explicit opt-in action; no local path or audio is uploaded implicitly.
- Logs, API payloads, and telemetry redact absolute local paths.

### Exit criteria

- An authenticated user can complete signed upload → register object → start job → observe stage progress → reach `ready_fast` → appear on the sonic map → use signed Range playback.
- RLS prevents cross-user access to tracks, analysis, embeddings, crates, and playback URLs.
- Deletion integration tests prove removal of the Supabase ownership graph and all required R2 objects.
- Access-code concurrency/rollback/expiry/replay tests pass.
- Deployed end-to-end tests cover Google SSO callback configuration, email/password/reset/logout, and access-code-first onboarding.
- CPU-fast and GPU-deep deployments have independent manifests, images, rollout controls, and cost reporting; deep activation remains off until Phase 6 promotion.
- A persisted cloud stage transition is visible through the authenticated status API and UI within ten seconds under the declared demo load.

## 14. Phase 8 — Product workflows over stable retrieval

Goal: complete the set-prep loop after backend similarity is trustworthy.

Estimated size: 2–4 engineering weeks. Local crate/library UI may begin after Phase 5 contracts stabilize, but Phase 8 cannot complete and cloud/share behavior cannot activate until the Phase 7 fast cloud path, RLS, ownership, and signed-access gates pass.

### Crates

- Persist local and cloud crates.
- Add/reorder/remove tracks.
- Export M3U, CSV, and the validated Rekordbox XML subset.
- Preserve anchor, section, and bailout annotations.
- Edit and persist crate notes and set intention.
- Calculate and show runtime, BPM/key span, energy curve, section counts, and readiness metadata.
- Generate read-only, revocable web crate previews that expose only explicitly shared metadata/audio permissions.

### Library workflow

- Import the validated Rekordbox XML subset through local and cloud API contracts with golden round-trip fixtures.
- Add full library filters for BPM range, Camelot key, genre, label, mood, energy, texture, date added, tags/palette, analysis readiness, and hidden state.
- Support multi-seed similarity search through the Phase 5 API rather than combining results in the browser.
- Persist tag edits and `hide_from_recommendations`; hidden tracks remain in the library and are excluded by default from retrieval.
- Complete the track drawer with waveform, energy/mood/texture evidence, neighboring cluster, sonic neighbors, and a separately labeled mix-compatibility/“works well with” view.

### Q v1

Q is a typed retrieval/action layer, not generic chat.

Implement structured intents:

- find same sound world
- darker/warmer/drier/more organic
- build candidate crate
- show on map
- explain recommendation
- suggest transition options using the separate mix-compatibility channel

These global/palette intents may ship after Phase 5. Activate component intents—same drums, same bass, same groove—only after Phase 6 promotes their corresponding channels and APIs.

Q consumes retrieval APIs and returns typed cards/actions. An LLM may translate language into structured intent, but it may not invent similarity evidence.

### Set-prep workflow

- Anchor selection
- Intro/build/peak/end grouping
- Bailout markers
- Candidate audition history
- Export handoff to Rekordbox

### Exit criteria

- A crate persists across restart, supports deterministic reorder/remove/undo, and displays runtime/BPM/key/energy metadata.
- Crate notes/set intention, anchor, section, and bailout annotations persist and export where supported.
- M3U, CSV, and the approved Rekordbox XML subset export against golden fixtures; import round-trips the supported XML subset.
- A revocable preview link renders only explicitly shareable crate data.
- Multi-seed/filter/hidden-track behavior is enforced server-side and covered by integration tests.
- Every Q response resolves to a typed, schema-validated retrieval or crate action; no generated prose can invent evidence or mutate data without an explicit action.

## 15. Phase 9 — Crate Dig ranking model

Goal: convert explicit DJ judgment data into a small proprietary similarity layer.

Estimated size: 2–4 engineering weeks after sufficient labeled data exists.

Requirements: `SONIC-EVAL-004`, v0.4 scope.

### Work

- Freeze the selected public extractors.
- Create training/validation/test splits by held-out anchor.
- Train an interpretable linear/manual baseline.
- Train a pairwise ranking model.
- Evaluate overall and component targets.
- Compare against best single vector and manual composite.
- Store ranker/model-set version and reversible migration metadata.
- Add personalization only after the shared ranker is stable and feedback thresholds are defined.

### Exit criteria

- Held-out lift meets the PRD promotion gate.
- Component contributions remain inspectable.
- The previous deterministic ranking remains available for rollback.
- No implicit engagement signal is used without documented interpretation and privacy policy.

## 16. Phase 10 — Mac desktop packaging

Goal: package the validated local product for DJs with arbitrary local libraries.

Estimated size: 4–8 engineering weeks after Phases 6 and 8 establish stable deep-analysis and product-workflow contracts.

### Work

- Electron shell around the existing Next.js/React UI.
- Bundle the Python local API/worker as a signed sidecar.
- Package approved model manifests and manage optional model downloads.
- Reuse SQLite schema and local audio paths.
- Add offline install/upgrade/migration behavior.
- Add pause/resume, concurrency, battery, thermal, and disk controls.
- Implement macOS code signing, notarization, auto-update, crash recovery, and uninstall/data-retention behavior.

The desktop phase must not fork the engine semantics or create a separate similarity implementation.

### Exit criteria

- A signed and notarized build imports a folder, analyzes locally with networking disabled, searches/auditions neighbors, builds a crate, and exports the supported Rekordbox XML subset.
- Restart during import/analysis resumes safely; schema/model migrations preserve the library or provide a tested rollback.
- Offline tests assert no network request and no absolute-path leakage.
- Uninstall behavior clearly distinguishes application removal from optional user-library/cache deletion.
- Benchmarks document the complete import/analyze/search/map/crate workflow at 10,000 tracks, stretch behavior and bottlenecks at 50,000 analyzed tracks, and metadata/database/list UI stress only at 100,000 rows on named Mac hardware tiers. Full audio analysis of 100,000 tracks is not an MVP gate.
- Optional deep models follow the approved bundle/download policy and verify checksums before activation.

## 17. Dependency graph and parallelism

```txt
Phase 0
  -> Phase 1
      -> Phase 2
          -> Phase 3
              -> Phase 4 (backend v0.1)
                  -> Phase 5 (large promotion gate + fast discovery)
                      -> Phase 7 fast cloud path
                      -> Phase 8 local/UI crate work
                      Phase 7 fast + Phase 8 local/UI -> Phase 8 cloud crates/share + global Q completion
                      -> Phase 6 (deep source-conditioned analysis)
                          -> Phase 7 deep cloud activation
                          -> Phase 8 component Q activation
                          -> Phase 9 (Crate Dig ranker, with enough labels)
                  Phase 6 + Phase 8 -> Phase 10 (Mac desktop)
```

Safe parallel work:

- Jeff can curate the pilot during Phases 0–3.
- UI lab components can begin after Phase 2 API payloads are frozen.
- Cloud schema design can begin during Phase 5, but migration and fast deployment follow validated/promoted local semantics; deep activation waits for Phase 6.
- Crate/export UI can proceed after retrieval result contracts stabilize.
- Global Q intents can begin after Phase 5; component Q intents wait for Phase 6 channel promotion.
- License review can run continuously as models enter the bake-off.

Avoid parallel edits to shared engine schemas, SQLite migrations, or retrieval response types without one owner.

## 18. Ownership recommendation

| Area | Primary owner |
|---|---|
| PRD/evaluation vocabulary | Product + Jeff |
| Engine contracts/cache/audio | Python engine engineer |
| Local SQLite/job/API | Backend engineer |
| Similarity lab and map integration | Frontend engineer |
| Model bake-offs | ML/audio engineer + Jeff |
| Supabase/R2/Cloud Run | Platform/backend engineer |
| Q structured intents | Product + full-stack engineer |
| Mac packaging | Desktop engineer with Python packaging support |

For a single-engineer team, follow the critical path sequentially through Phase 5 before starting deep/cloud/desktop work.

## 19. Verification strategy

### Cross-PRD traceability

| Source requirement area | Delivery phase(s) |
|---|---|
| `PRD.md` landing and web/Mac positioning | 7D, 10 |
| `PRD.md` Google/email auth, access code, reset/logout | 7D–7E |
| `PRD.md` local import, duplicate/error handling, playback | 2, 8 |
| `PRD.md` signed cloud upload, analysis status, private playback | 7 |
| `PRD.md` fast/deep lifecycle and incremental analysis | 1–2, 5–7 |
| `PRD.md` 3,000-track map, filters, multi-seed discovery | 5 |
| `PRD.md` Q contextual actions | 8, with component intents after 6 |
| `PRD.md` track detail, tag edits, hidden recommendations | 5, 8 |
| `PRD.md` crates, set intention, exports, share preview | 8 |
| `PRD.md` Supabase/R2/Cloud Run/Vercel architecture | 7 |
| `PRD.md` local/offline Mac product | 2, 10 |
| `PRD.md` privacy, deletion, local/cloud boundary | 0, 2, 7, 10 |
| `PRD.md` Rekordbox XML interoperability | 0 decision spike, 8 implementation, 10 desktop validation |
| `sonic_analysis_prd.md` v0.1 contracts/evaluation | 0–4 |
| `sonic_analysis_prd.md` v0.2 promoted retrieval/map | 5 |
| `sonic_analysis_prd.md` v0.3 source-conditioned/cloud | 6–7 |
| `sonic_analysis_prd.md` v0.4 learned ranker | 9 |
| Retained `CRATE_DIG_ENGINE_PRD.md` normative requirements | Phase 0 disposition into canonical sonic PRD, then mapped through its requirement IDs |

Every phase requires:

- unit tests for new data transformations and state transitions;
- API integration tests for success, failure, ownership, and idempotency;
- deterministic synthetic audio fixtures safe for Git;
- migration tests for existing local/cloud data;
- explicit performance measurement when a PRD SLO applies;
- human evaluation for any claim about perceptual similarity;
- license manifest review before production model promotion.

Quality gates:

```txt
Code correctness
  -> operational reliability
  -> blind retrieval evaluation
  -> cost/runtime review
  -> license/privacy review
  -> production promotion
```

Passing unit tests alone is not sufficient to promote a model.

## 20. Immediate next actions

### Engineering

1. Complete Phase 0 and commit the documentation/dependency cleanup separately.
2. Implement Phase 1 as the first code PR; do not mix local API/UI work into the engine-contract PR.
3. Implement Phase 2 local persistence/worker/API.
4. Implement Phase 3 similarity lab.
5. Run Phase 4 with Jeff before choosing additional models.

### Product/Jeff

1. Select 8 anchors using Jeff's existing organization system.
2. Assemble the 45–65-track pilot without committing audio.
3. Review whether the proposed component dimensions are consistently judgeable.
4. Complete blind judgments only after the lab is ready; do not tune model weights from visible metadata.

### First engineering PR

The first PR should contain only:

- clean dependency fix
- `DecodedAudio`
- `WindowPlan`
- extractor/record contracts
- content-addressed extractor cache
- legacy adapter
- librosa port
- tests

CLAP and Essentia ports can follow immediately in a second PR after the contracts prove stable.
