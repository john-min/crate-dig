# Crate Dig Sonic Analysis Backend PRD

Status: Draft for implementation review  
Last updated: 2026-08-25  
Owner: Crate Dig  
Primary implementation: `packages/engine/cratedig_engine` and `apps/local-api`  
Technical strategy: `sonic_analysis_engine.md`  
Parent product requirements: `PRD.md`

## 1. Executive summary

Crate Dig helps DJs answer:

> Which record should I try next because it actually sounds like it belongs here?

The sonic-analysis backend turns a user's audio library into searchable, explainable evidence about:

- overall sound world
- drum timbre and drum pattern
- bass timbre and bass movement
- melodic instrumentation and texture
- groove
- production space
- mix compatibility, kept separate from sonic similarity

The backend must not reduce this problem to BPM, key, genre, metadata, one embedding, or 2D map distance. It will produce multiple versioned feature channels, compare candidate models using blind DJ judgments, and eventually train a small Crate Dig ranking model over the best frozen feature channels.

This PRD defines the product and delivery contract. Detailed model rationale, feature definitions, and research candidates remain in `sonic_analysis_engine.md`.

## 2. Problem

DJs often know the sonic character they want but cannot express it through conventional library fields.

Examples:

- “Find something with drums like this, but a darker melodic palette.”
- “Find the same rolling bass movement without the vocal.”
- “What else has this dry, tight percussion and warm production?”
- “Find a bridge record that belongs in the same sound world.”

Existing tools primarily organize by metadata, genre, BPM, key, listening behavior, or broad audio similarity. These signals are useful but insufficient for source-conditioned sonic retrieval.

The backend therefore needs to distinguish:

```txt
Exact identity
= Is this the same recording?

Sonic similarity
= Does this live in the same sound world?

Groove similarity
= Does this move rhythmically in a similar way?

Mix compatibility
= Can I plausibly transition between these tracks?
```

## 3. Target user and job to be done

### 3.1 Primary user

A DJ or serious music collector with hundreds to tens of thousands of local tracks who prepares sets by selecting anchors, searching for related records, arranging set sections, and testing transitions.

### 3.2 Core job

When preparing a set around one or more anchor tracks, the user wants to find overlooked records with a similar sonic palette so they can audition better candidates without manually opening every folder or relying on generic streaming recommendations.

### 3.3 Backend consumers

The backend serves:

- seed-track similarity search
- the library map and track list
- Q's structured retrieval and explanation actions
- component filters such as same drums or similar bass
- crate building
- blind model evaluation
- future personalized ranking

## 4. Product outcomes

The backend should produce three primary user-facing outputs:

1. **Sonic match** — similarity in sound world, including timbre, source palette, instrumentation, and production.
2. **Groove match** — similarity in rhythm feel, onset behavior, percussion, and bass movement.
3. **Mix safety** — BPM, key, energy, structure, and transition risk.

Every recommendation must also provide:

- confidence
- component scores
- evidence-backed reason codes
- analysis/model-set version

Example:

```txt
Sonic match: high
Groove match: high
Mix safety: medium

Why: similar dry drum texture, rolling bass movement,
warm supporting pads, and comparable low-mid weight.
```

## 5. Locked product decisions

1. The engine is multi-channel; there is no universal final embedding.
2. Sonic similarity, groove similarity, and mix compatibility remain separate.
3. UMAP or other 2D coordinates are presentation artifacts, not retrieval truth.
4. Exactly one versioned representation owns the map `layout` role for a given projection version.
5. Tracks become usable after provisional fast analysis; deep analysis is asynchronous.
6. Extractors succeed, fail, cache, and upgrade independently.
7. Computation identity is based on audio content and extractor configuration, not `track_id`.
8. Completed deep analysis attempts a reproducible drums/bass/vocals/other decomposition.
9. Low-confidence stem evidence is down-weighted or omitted from ranking and explanations.
10. Public model reputation does not determine production selection; blind DJ evaluation does.
11. Exact gear identification is not a launch promise.
12. The first Crate Dig ranking model will be a small model over frozen feature channels, not a newly trained audio foundation model.

## 6. Release plan and scope

### 6.1 Backend v0.1 — local similarity evaluation loop

This is the immediate release and the current implementation contract.

The release is complete when a user can:

1. Import a local evaluation library.
2. Play supported tracks without waiting for analysis.
3. Start a versioned analysis run.
4. Run at least three enabled analysis configurations through a common extractor contract.
5. Select an anchor and retrieve the top 10–25 candidates from each configuration.
6. Listen blind without artist, label, genre, BPM, or key influencing the primary judgment.
7. Save overall and component-specific pair, triplet, or top-K judgments.
8. Compare model quality, runtime, failures, memory, and artifact size.

Required v0.1 configurations:

- the existing librosa physical-feature baseline
- the existing CLAP implementation ported to the extractor contract
- Discogs-EffNet as the first music-specific retrieval baseline

The architecture must permit MuQ, MERT, MAEST, MERIT, stem analysis, and DAC to be added without changing the evaluation data model.

### 6.2 Backend v0.2 — fast discovery baseline

Add:

- exact duplicate evidence
- production fast extractor set
- canonical feature and embedding persistence
- exact-cosine top-K retrieval
- precomputed neighbors
- frozen/versioned map projection
- 3,000-track web-demo support
- real waveform artifacts

### 6.3 Backend v0.3 — deep source-conditioned analysis

Add:

- pinned four-stem separation
- required drum and bass evidence
- vocal-treatment descriptors
- supporting-instrument evidence
- segment/window evidence
- CLAP palette probes
- candidate deep global and factored embeddings
- confidence-aware reranking and explanations

### 6.4 Backend v0.4 — Crate Dig similarity model

Add, after enough explicit judgments exist:

- a shared linear or pairwise-ranking baseline over frozen features
- separate target heads or outputs for overall, drums, bass, melodic palette, production, and groove
- held-out comparison against the best single embedding and manual weighted composite
- conservative personalization only after the shared model is stable

### 6.5 Out of scope for v0.1

- training or fine-tuning a large audio encoder
- mandatory source separation
- production cloud GPU deployment
- personalized ranking
- automatic Q prose generation
- transition planning
- Rekordbox export
- approximate-nearest-neighbor infrastructure
- exact synth, drum-machine, or producer identification
- Mac application packaging

## 7. User stories

### US-01 — Import and play

As a DJ, I can import a folder of supported local audio and play tracks immediately so analysis does not block library use.

### US-02 — Analyze reproducibly

As a tester, I can run named analysis configurations and see their versions, progress, warnings, failures, and cache behavior.

### US-03 — Compare neighbors

As a tester, I can choose an anchor and compare the top candidates returned by different models without metadata bias.

### US-04 — Judge components

As a DJ, I can rate overall sonic similarity separately from drums, bass, melodic palette, groove, production space, and mix compatibility.

### US-05 — Understand a result

As a DJ, I can see which stored feature evidence contributed to a recommendation without being shown unsupported claims.

### US-06 — Resume work

As a user, interrupted or partially failed analysis resumes from valid cached stages instead of starting the library over.

### US-07 — Stay local

As a desktop/local user, I can complete the v0.1 workflow without uploading source audio.

## 8. Functional requirements

Priority meanings:

- **Must** — required for the named release.
- **Should** — expected unless evidence or a documented constraint causes deferral.
- **Could** — optional experiment.

### 8.1 Ingest and identity

#### SONIC-ING-001 — Supported local import — Must, v0.1

The backend shall import MP3, WAV, AIFF, FLAC, and M4A files from an explicitly selected local folder.

Acceptance:

- Supported readable files create track records.
- Unsupported or corrupt files terminate with a structured error.
- One failed file does not fail the entire import.
- The original file is not copied by default.

#### SONIC-ING-002 — Immediate playback — Must, v0.1

Imported supported tracks shall be playable from the stored local path before analysis completes.

Acceptance:

- Playback supports HTTP Range requests.
- Missing or moved files return a recoverable missing-file state.
- Analysis jobs never hold a lock that prevents playback.

#### SONIC-ING-003 — Content identity — Must, v0.1

The backend shall compute a stable audio/file content hash suitable for cache identity.

Acceptance:

- Reimporting unchanged content can reuse eligible outputs.
- Cache lookup does not depend solely on library or track ID.
- A changed source invalidates content-derived outputs.

#### SONIC-ING-004 — Duplicate evidence — Must, v0.2

The backend shall distinguish exact duplicate files from likely equivalent recordings through file/content hashes and a Chromaprint-style fingerprint.

### 8.2 Analysis orchestration

#### SONIC-RUN-001 — Asynchronous runs — Must, v0.1

Heavy analysis shall execute outside synchronous HTTP request handlers.

Acceptance:

- Starting a run returns a run identifier promptly.
- Progress is queryable by run, track, stage, and extractor.
- The user can continue playback and browsing while analysis runs.

#### SONIC-RUN-002 — Stage state — Must, v0.1

Each track/extractor stage shall reach a terminal state:

```txt
pending | running | succeeded | failed | skipped | cached
```

Acceptance:

- Failures include stable error codes and safe messages.
- Terminal failures do not retry forever.
- One extractor failure does not erase unrelated successful outputs.

#### SONIC-RUN-003 — Idempotency — Must, v0.1

Reissuing the same run or task identity shall not create conflicting feature records or repeat valid expensive computation.

#### SONIC-RUN-004 — Independent cache invalidation — Must, v0.1

Changing one extractor or prompt bank shall invalidate only the dependent outputs.

Canonical extractor cache identity:

```txt
audio_content_hash
extractor_name
extractor_version
model/checkpoint hash where applicable
window_plan_version
relevant configuration or prompt-bank version
separator identity when stem-dependent
```

#### SONIC-RUN-005 — Decode once — Must, v0.1

The engine shall expose a shared `DecodedAudio` substrate and deterministic sample-rate views so enabled extractors do not independently reopen and decode the same track.

#### SONIC-RUN-006 — Versioned windows — Must, v0.1

Window selection, duration, hop, boundaries, and pooling shall be identified by a `window_plan_version`. Window-level evidence shall not be destroyed when a whole-track aggregate is created.

### 8.3 Feature and embedding outputs

#### SONIC-FEAT-001 — Common extractor contract — Must, v0.1

Every extractor shall declare:

- name and version
- model/checkpoint identity where applicable
- required sample rate and channel policy
- supported scope: track, window, segment, or stem
- output role
- configuration/prompt-bank version

Every extractor shall return a common feature bundle containing embeddings, scalar features, tags, warnings, and provenance.

#### SONIC-FEAT-002 — Canonical records — Must, v0.1

Embedding records shall retain model, role, scope, stem, time range, dimension, pooling strategy, confidence, and version metadata.

Scalar/tag records shall retain namespace, feature name, value, scope, time range, confidence, source, and version metadata.

#### SONIC-FEAT-003 — Physical baseline — Must, v0.1

The initial physical extractor shall include the reliable subset of:

- duration
- loudness/energy
- spectral centroid and bandwidth
- low/mid/high or finer band energy
- onset density
- transient/crest evidence
- tempo where confidence is sufficient

These features support baselines and explanations; they must not silently become the sole sonic score.

#### SONIC-FEAT-004 — Multi-model evidence — Must, v0.1

The data model shall store simultaneous outputs from multiple extractor/model versions without overwriting previous evidence.

#### SONIC-FEAT-005 — Source-conditioned evidence — Must, v0.3

Deep analysis shall keep timbre, pattern, and movement separately addressable for drums, bass, and melodic/supporting instrumentation as defined in `sonic_analysis_engine.md`.

#### SONIC-FEAT-006 — Neural-codec experiment — Could, v0.3

The bake-off may evaluate continuous DAC latents on whole-mix and same-stem pairs. DAC receives a production role only if it adds held-out fine-timbre retrieval value beyond the selected music embeddings and physical features.

### 8.4 Retrieval and map outputs

#### SONIC-RET-001 — Named retrieval configurations — Must, v0.1

The backend shall retrieve top-K candidates using an explicitly named model/configuration version.

Acceptance:

- Results contain rank, score, source configuration, and analysis version.
- Results never use 2D map distance as the underlying similarity score.
- The anchor is excluded from its own candidate list unless explicitly requested.

#### SONIC-RET-002 — Exact search — Must, v0.1

Use exact cosine or its normalized inner-product equivalent at the initial library scale. ANN infrastructure is deferred until measured latency requires it.

#### SONIC-RET-003 — Component outputs — Must, v0.3

The query layer shall expose independently versioned component scores for the evidence available, including:

- global sound world
- drum timbre
- drum pattern
- bass timbre
- bass movement
- instrumentation/melodic palette
- production space
- groove
- mix compatibility

#### SONIC-RET-004 — Evidence-backed reasons — Must, v0.2

Reason codes shall derive from stored evidence and calibrated thresholds. Generative systems may phrase reasons but may not invent them.

#### SONIC-RET-005 — Stable map projection — Must, v0.2

The map pipeline shall persist the fitted standardizer, optional PCA, and projection artifact. New tracks shall transform through a frozen version rather than refitting the entire map on every import.

### 8.5 Evaluation and learning

#### SONIC-EVAL-001 — Evaluation sets — Must, v0.1

The backend shall support versioned evaluation sets with tracks, anchors, candidate pools, hidden metadata policy, and evaluator membership.

#### SONIC-EVAL-002 — Structured judgments — Must, v0.1

Judgments shall support:

- pair ratings
- ABX/triplet choices
- top-K accept/reject
- optional freeform notes
- component dimension
- evaluator
- evaluation-set version
- candidate model/configuration version
- blind/non-blind state

Do not overload track-level tag feedback to represent pair or triplet judgments.

#### SONIC-EVAL-003 — Comparison reports — Must, v0.1

For each enabled configuration, report:

- Precision@K or accepted-at-K
- nDCG@10 when graded relevance exists
- triplet accuracy when triplets exist
- failures by file and extractor
- runtime per audio minute
- peak memory when measurable
- artifact/cache bytes per track

#### SONIC-EVAL-004 — Crate Dig ranker — Must, v0.4

The first learned ranker shall:

- use frozen extractor outputs
- train only on an explicit training split
- evaluate on held-out anchors
- expose component contributions where the model class permits
- compare against the best individual embedding and manual weighted baseline
- remain versioned and reversible

### 8.6 Local and cloud parity

#### SONIC-PLAT-001 — Local-first semantics — Must, v0.1

The full v0.1 loop shall run locally without Supabase, R2, Cloud Run, Vercel, or source-audio upload.

#### SONIC-PLAT-002 — Adapter boundaries — Must, v0.1

Local SQLite/file storage and cloud Supabase/R2 storage may use different adapters, but they shall preserve the same logical feature, embedding, run, and judgment semantics.

#### SONIC-PLAT-003 — Cloud batch execution — Must, v0.3 web deployment

Cloud deep analysis shall run in batch workers or jobs, never in Vercel Functions or synchronous FastAPI request handlers.

#### SONIC-PLAT-004 — Local database and retrieval boundary — Must, v0.1

SQLite shall be the local system of record for product metadata and durable workflow state. The implementation shall:

- use versioned migrations, foreign-key enforcement, WAL mode, short write transactions, and a bounded busy timeout
- keep the live database on a local application-data volume rather than a network-mounted music drive
- persist audio/artifact paths, content hashes, provenance, and lifecycle state without storing original audio, checkpoints, temporary stems, previews, or large waveform payloads inside SQLite
- store embeddings at native declared dimensions in a versioned typed representation
- begin with exact local cosine retrieval over NumPy arrays and optionally cached neighbors
- add a local ANN index only after named 10,000/50,000-track benchmarks demonstrate that exact retrieval misses the latency budget

SQLite vector extensions are not required for v0.1. DuckDB may support evaluation/reporting but shall not become the local product system of record.

Supabase Postgres shall remain the cloud system of record. Promoted pgvector representations shall use dimension-compatible columns/indexes or explicit versioned projections; implementations shall not silently pad or truncate vectors to fit a shared column.

Any future local/cloud synchronization shall exchange logical domain records through versioned APIs. It shall not synchronize the SQLite database file.

## 9. Analysis lifecycle

### 9.1 User-visible track states

```txt
imported
  -> processing_fast
  -> ready_fast
  -> processing_deep
       -> ready_deep
       -> degraded
       -> failed
```

- `imported`: track metadata and a playable source are registered.
- `ready_fast`: provisional evidence is available for discovery.
- `ready_deep`: all required stages for the active deep model set succeeded.
- `degraded`: usable evidence exists, but at least one required deep stage failed or was suppressed.
- `failed`: no usable analysis evidence could be produced; playback may still work.

### 9.2 Completion policy

Completion is evaluated against a versioned model-set manifest. Adding an experimental extractor must not prevent a track from reaching `ready_deep` unless that extractor is explicitly marked required in the active manifest.

### 9.3 Retry policy

A stage may reopen only when:

- the source content changes
- a dependency identity changes
- an explicit retry is requested
- a transient failure is classified as retryable and remains under the configured retry limit

## 10. Required data concepts

The backend needs the following logical entities. Physical schemas may differ between SQLite and Supabase.

### 10.1 Existing/core entities

- libraries
- tracks/audio locations
- analysis runs
- track analysis stages
- track features
- track embeddings
- projection artifacts and coordinates
- precomputed similarity neighbors
- user tag corrections

### 10.2 Evaluation entities

#### `evaluation_sets`

Stores the named corpus, version, purpose, hidden-metadata policy, and train/validation/test split policy.

#### `evaluation_anchors`

Associates anchor tracks with candidate pools and held-out status.

#### `similarity_judgments`

Stores:

- evaluator and timestamp
- anchor, candidate A, and optional candidate B
- judgment type: pair, triplet, or top-K
- component dimension
- ordinal rating or selected candidate
- model/configuration shown
- rank position where relevant
- blind/non-blind state
- optional notes

### 10.3 Model-set manifest

Every production or evaluation configuration shall identify:

- manifest name and version
- required and optional extractors
- checkpoint sources and hashes
- code and weights licenses
- commercial-use status
- window/pooling configuration
- active retrieval/layout roles
- component normalization and weighting version

## 11. Target API contracts

These are target contracts, not claims about currently implemented routes. Exact payloads will be defined during engineering planning.

### 11.1 Analysis

```txt
POST /libraries/{library_id}/analysis-runs
GET  /analysis-runs/{run_id}
GET  /analysis-runs/{run_id}/tracks
POST /analysis-runs/{run_id}/cancel
POST /analysis-stages/{stage_id}/retry
```

### 11.2 Features and retrieval

```txt
GET  /tracks/{track_id}/analysis
GET  /tracks/{track_id}/neighbors
POST /similarity/search
GET  /projections/{projection_version}/coordinates
```

Neighbor/search responses must include scores, ranks, confidence, components, reason codes, and model-set version where available.

### 11.3 Evaluation

```txt
POST /evaluation-sets
GET  /evaluation-sets/{evaluation_set_id}
GET  /evaluation-sets/{evaluation_set_id}/next
POST /evaluation-sets/{evaluation_set_id}/judgments
GET  /evaluation-sets/{evaluation_set_id}/report
```

### 11.4 API behavior

- Heavy work returns a job/run identifier instead of holding the request open.
- Mutation endpoints support idempotency keys where duplicate submission is possible.
- Errors use stable machine-readable codes.
- Local and cloud APIs enforce library ownership according to their authentication context.

## 12. Nonfunctional requirements and initial SLOs

These are initial product budgets. Throughput and artifact-size thresholds must be locked after the v0.1 pilot measures real hardware.

| Area | Requirement |
|---|---|
| Required web scale | 3,000 analyzed tracks in one demo library |
| Desktop design target | Tens of thousands of tracks without schema redesign; not a v0.1 performance gate |
| Neighbor-query latency | p95 at or below 500 ms for top-25 exact retrieval on a 3,000-track indexed library, excluding cold process startup |
| API behavior | No model inference or separation in synchronous request handlers |
| Import resilience | At least 95% of readable supported fixtures reach `imported`; failures are per-file |
| Run resilience | Every stage reaches a terminal state; no infinite retry loop |
| Cache correctness | A second identical run reuses all eligible successful outputs |
| Playback | Local playback remains usable during analysis |
| Progress freshness | Local status visible within 2 seconds of a recorded stage change; cloud within 10 seconds |
| Reproducibility | Every ranked output resolves to source, extractor/model, configuration, and projection versions |
| Privacy | No source audio leaves local mode without explicit user action |

Before v0.3 model lock, record and approve budgets for:

- fast-analysis real-time factor
- deep-analysis real-time factor by supported device
- peak RAM/VRAM
- local battery/thermal impact
- derived bytes per track
- cloud cost per 1,000 average-length tracks

## 13. Evaluation plan and promotion gates

### 13.1 Pilot set — v0.1

Start with:

- 8 anchor tracks
- approximately 8 comparisons per anchor
- approximately 45–65 unique tracks after overlap

For each anchor, aim for:

- 3 strong sonic matches
- 2 similar-groove/different-palette examples
- 2 mix-compatible but sonically different hard negatives
- 1 unexpected but convincing match

The pilot validates the harness, vocabulary, failure handling, and whether judgments are usable. It is not large enough to declare a universal winning model.

### 13.2 Model-selection set — v0.2/v0.3

Expand to:

- 300–500 representative tracks
- at least 50 anchors
- held-out anchors never used to tune weights
- target house/techno subgenres and production varieties
- difficult files such as dense masters, sparse arrangements, vocals, and lower-quality encodes

### 13.3 Promotion rules

A challenger receives a production channel role only when it:

1. improves the relevant held-out DJ judgment metric or fixes a documented failure slice;
2. adds value not explained by BPM, key, artist, label, genre, or an existing channel;
3. has acceptable runtime, memory, artifact size, licensing, and deployment characteristics;
4. produces reproducible, versioned output; and
5. does not create unacceptable regressions in important library slices.

Provisional practical-effect thresholds for the larger evaluation set:

- at least 10% relative nDCG@10 improvement **or** 5 percentage points of held-out triplet accuracy for its intended task; and
- no unexplained regression greater than 10 percentage points on a critical target slice.

These thresholds must be revisited after measuring evaluator agreement and confidence intervals. A result from the pilot set alone remains experimental.

### 13.4 Required comparisons

Every proposed composite or learned ranker must be compared against:

- the current single-backend behavior
- the best single retrieval embedding
- a deterministic physical-feature baseline
- a manually weighted late-fusion baseline

Use ablations to determine whether drum, bass, palette, codec, or other channels add independent value.

## 14. Privacy, security, and licensing

### 14.1 Local mode

- Source audio remains local by default.
- Local paths are not sent to shared telemetry or written unredacted to cloud logs.
- Analysis works offline after dependencies and model weights are installed.
- Model files are checksummed and managed explicitly.

### 14.2 Cloud mode

- Audio and artifacts remain private.
- Workers use scoped credentials to fetch private R2 objects.
- Playback uses signed or authenticated access.
- Temporary source and stem files are deleted after success or failure.
- Retention and user-deletion behavior must be defined before external-user upload launches.

### 14.3 Model governance

No model may enter a production manifest without recorded:

- code license
- weights/checkpoint license
- commercial-use status
- attribution obligations
- redistribution/bundling restrictions
- checkpoint source and checksum
- supported runtime and sample rate

Research-only/noncommercial checkpoints may be used in an isolated bake-off but may not silently enter the shipping web or desktop pipeline.

## 15. Current implementation baseline

Verified current capabilities include:

- `packages/engine/cratedig_engine`
- one-backend/one-vector `AudioBackend` contract
- librosa, CLAP, and Essentia backend paths
- whole-backend cache behavior
- Cloud Run analysis-run job with injected storage adapters
- Supabase analysis-run, feature, embedding, cluster, and member schema
- local FastAPI folder import, track listing, and HTTP Range playback
- placeholder local map coordinates and 2D UI similarity rather than analyzed sonic retrieval

Known implementation gaps for v0.1:

- clean dependency resolution is blocked by the invalid optional `pyrekordbox>=6.0` requirement
- there is no decode-once substrate
- there is no extractor/feature-bundle contract
- window evidence is pooled away or absent
- cache identity is backend-wide and associated with track IDs
- local SQLite has no canonical run/feature/embedding/judgment model
- local API cannot start or monitor analysis
- the UI has no blind model-comparison lab
- local map positions and similarity are placeholders

Existing terminal cache handling, file-location behavior, version metadata, tests, and injected adapters should be preserved during refactoring.

## 16. Delivery sequence

### Milestone 0 — Evaluation contract and clean environment

Deliver:

- fix the invalid Rekordbox dependency constraint
- pilot evaluation manifest and judgment schema
- synthetic test fixtures
- model-set manifest schema
- runtime/cost instrumentation contract

Acceptance:

- a clean engine environment installs and runs tests
- an evaluation set and structured judgment can round-trip locally

### Milestone 1 — Engine v2 extractor foundation

Deliver:

- `DecodedAudio`
- versioned `WindowPlan`
- `Extractor` and `FeatureBundle`
- content-addressed per-extractor cache
- compatibility adapter for current `AudioBackend`
- canonical local records for features and embeddings

Acceptance:

- existing backends work through the adapter
- two extractors cache and fail independently
- a track is decoded once per compatible run
- window outputs remain queryable after pooling

### Milestone 2 — Local similarity lab

Deliver:

- local analysis-run API and background worker
- progress and terminal stage states
- anchor/model selection
- blind top-K playback and judgment capture
- comparison report

Acceptance:

- the 45–65-track pilot completes the full import → analyze → retrieve → listen → judge → report loop
- current CLAP, librosa baseline, and Discogs-EffNet can be compared through the same interface

### Milestone 3 — Fast discovery baseline

Deliver:

- production fast extractor set
- exact retrieval and precomputed neighbors
- evidence-backed reason codes
- frozen map projection
- 3,000-track fixture validation

### Milestone 4 — Deep source-conditioned bake-off

Deliver:

- pinned separator contract and stem bundle
- drum and bass evidence
- vocal and supporting-instrument descriptors
- MuQ/MERT/MAEST/MERIT candidates as justified
- DAC and instrument-model experiments
- channel ablation report

### Milestone 5 — Crate Dig ranker

Deliver only after the larger labeled set exists:

- training/evaluation pipeline over frozen features
- manual composite baseline
- learned pairwise ranker
- held-out results and model card
- reversible model-set migration

## 17. Definition of done for backend v0.1

Backend v0.1 is done when:

1. A clean checkout can install and run the engine and local API tests.
2. A local folder containing the pilot set can be imported and played.
3. Analysis runs asynchronously and exposes track/extractor progress.
4. Librosa, current CLAP, and Discogs-EffNet operate through the common extractor contract.
5. Outputs contain content, model, configuration, window, and run provenance.
6. Repeating an unchanged run demonstrates eligible cache reuse.
7. An anchor returns top candidates from each enabled configuration.
8. The reviewer can listen blind and save overall plus component judgments.
9. A report compares quality, runtime, failures, memory, and stored bytes.
10. No source audio leaves the machine.

The 2D map, Q, deep stem analysis, and learned ranker do not block v0.1 completion.

## 18. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Evaluation set reflects one person's taxonomy | Model overfits Jeff's taste | Preserve explicit dimensions, add evaluators later, keep held-out anchors |
| Metadata leaks into sonic judgments | Style model appears better than it sounds | Blind primary evaluation and record blind state |
| Too many models delay a usable loop | Research without product feedback | Require common harness first; add candidates sequentially |
| Stem leakage contaminates similarity | Misleading drum/bass evidence | Store separator provenance/confidence and compare downstream retrieval |
| Codec latents measure reconstruction rather than perception | False fine-timbre confidence | Treat DAC as an ablation-gated feature, not a default score |
| Noncommercial model weights block shipping | Rework late in development | License manifest before production selection |
| Full overlapping windows create excessive compute/storage | Deep analysis becomes impractical | Version sampled/full/section-aware plans and measure artifact cost |
| Local analysis harms playback or battery | Poor desktop experience | Background priority, bounded concurrency, pause/resume, device benchmarks |
| Learned ranker hides component behavior | Loss of trust/control | Start linear, retain component scores, version and ablate features |

## 19. Open decisions

These decisions require evaluation rather than preference:

- Which embedding owns primary retrieval and map layout?
- Which window plan is the v0.2 production default?
- Does source separation improve top-10 drum/bass retrieval enough to justify its cost?
- Is `htdemucs_ft` sufficient on dense club masters?
- Do DAC continuous latents add independent fine-timbre value?
- Which instrument-presence model is reliable on mastered electronic music?
- Which similarity dimensions produce acceptable evaluator agreement?
- How many explicit judgments are required before training the first shared ranker?
- What cloud throughput and cost budget is acceptable for 3,000 deep-analyzed tracks?
- Which model weights are commercially deployable in the web and Mac products?

## 20. References

- `PRD.md` — overall Crate Dig product requirements
- `sonic_analysis_engine.md` — technical strategy, model roles, and feature methodology
- `LOCALHOST_APP_SPEC.md` — local app architecture and current target endpoints
- `JEFF_BRANCH_REVIEW.md` — original prototype assessment
- `CURSOR_HANDOFF.md` — existing engineering handoff
- `supabase/migrations/20260820222209_initial_schema.sql` — current cloud schema
- `packages/engine/cratedig_engine` — current analysis implementation
- `apps/local-api/cratedig_local_api` — current local API implementation
