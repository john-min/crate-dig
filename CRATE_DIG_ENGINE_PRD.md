# Crate Dig Engine PRD

Status: Implementation draft
Last updated: 2026-08-25
Owner: Crate Dig
Package: `packages/engine/cratedig_engine`
Related strategy: `sonic_analysis_engine.md`

## 1. Purpose

This PRD defines the buildable product and engineering requirements for the Crate Dig sonic-analysis engine.

The engine turns a user's audio library into explainable DJ discovery evidence:

- exact-recording identity
- full-mix and source-conditioned sonic representations
- rhythm, timbre, palette, and production descriptors
- segment-aware evidence
- nearest neighbors and component scores
- stable map coordinates
- reason codes suitable for Q and the product UI

The engine does not choose tracks solely because they share BPM, key, genre, or one embedding. Its primary job is to answer:

> Which records in this library live in the same sonic world, and why?

## 2. Product decisions

The following decisions are locked for the first implementation:

1. The engine is multi-vector. There is no universal final embedding.
2. Exactly one versioned embedding owns the map `layout` role.
3. Retrieval uses a selected primary embedding; separate channels rerank and explain candidates.
4. Every track receives fast provisional analysis before or independently of deep analysis.
5. Every track scheduled for completed analysis must attempt reproducible four-stem separation: drums, bass, vocals, and `other`.
6. Separation is asynchronous and must not block import, playback, or provisional discovery.
7. HT-Demucs `htdemucs_ft` is the first pinned separator.
8. Drum and bass embeddings are required in the first deep fingerprint.
9. Vocal and `other` descriptors are required; their learned embeddings remain evaluation-gated.
10. Learned model outputs, deterministic physical measurements, and user corrections remain separate evidence.
11. Sonic similarity, groove similarity, and mix compatibility remain separate outputs.
12. Model selection and score weights are decided using DJ judgments, not public benchmark reputation alone.

## 3. Users and jobs

### 3.1 Primary user

A DJ or serious collector with hundreds to tens of thousands of local tracks who wants to:

- find records with similar drums, bass, instrumentation, texture, or production
- find a darker, warmer, drier, more percussive, or less vocal neighbor
- understand why two tracks were placed near each other
- discover overlooked records without outsourcing taste to generic streaming metadata
- keep local audio private while still receiving deep analysis

### 3.2 Product consumers

The engine serves:

- the Crate Dig map
- seed-track similarity search
- filters and Q structured retrieval
- track and candidate explanation cards
- crate building
- future transition search through a separate mix-compatibility layer

## 4. Goals

### G1. Reproducible analysis

The same audio hash, extractor identity, model weights, configuration, and window plan must produce traceable outputs that can be reused across tracks and libraries.

### G2. Source-conditioned timbre

The engine must represent drum and bass sound independently from the full mix and preserve cautious evidence for vocals and supporting instrumentation.

### G3. Useful retrieval

The engine must generate and rerank candidates using independently measurable channels instead of treating 2D map distance as similarity truth.

### G4. Explainability

Every recommendation must retain component contributions, confidence, and reason codes so Q can say “similar drum texture, darker supporting palette” without inventing evidence.

### G5. Local and cloud parity

The same logical pipeline and version contracts must run in a local sidecar and in batch cloud workers. Storage adapters may differ; feature semantics may not.

### G6. Incremental operation

Adding one track, changing one extractor, or upgrading one separator must not force unrelated features across the whole library to be recomputed.

## 5. Non-goals

The first engine release will not:

- identify exact drum machines, synthesizers, or production gear
- provide real-time separation
- replace Rekordbox beatgrid editing or deck controls
- train a new foundation model
- require approximate nearest-neighbor infrastructure for the 3,000-track demo
- infer reliable causal production settings from mastered audio
- expose separated audio for remixing unless a later product requirement explicitly adds stem audition
- collapse sonic similarity and transition compatibility into one score

## 6. Success criteria

The engine is product-ready when:

1. A 3,000-track web library can be processed incrementally and explored without refitting the map on every run.
2. A newly imported track becomes playable and receives provisional fast results without waiting for separation.
3. Deep processing creates a versioned four-stem bundle or reaches a terminal degraded state with an actionable error.
4. A model or separator upgrade invalidates only outputs that depend on it.
5. Top-K retrieval can return separate sonic, groove, drum, bass, and mix evidence.
6. Low-confidence stem evidence is excluded or down-weighted automatically.
7. Human evaluation shows the selected retrieval stack beats the current single-backend baseline on held-out DJ judgments.
8. Local analysis can operate without uploading source audio.
9. Every feature used in ranking is traceable to source hash, extractor version, and relevant configuration.

## 7. Analysis lifecycle

### 7.1 User-visible states

```txt
imported
  -> processing_fast
  -> ready_fast
  -> processing_deep
       -> ready_deep
       -> degraded
       -> failed
```

- `ready_fast`: the track is usable for playback and provisional discovery.
- `ready_deep`: required separation and required deep extractors succeeded.
- `degraded`: processing reached terminal state but one or more required deep stages failed or produced unreliable evidence. Fast results remain usable.
- `failed`: no usable analysis result could be produced.

Progress must identify the active stage: decode, fast features, global embedding, separation, stem features, window features, projection, or neighbors.

### 7.2 Completion policy

A track reaches `ready_deep` only when:

- source identity is known
- required full-mix extractors have terminal successful outputs
- the pinned four-stem separation has succeeded
- required drum and bass outputs have succeeded
- required vocal and `other` descriptors have succeeded
- all outputs include current version metadata

Failure must terminate as `degraded` rather than retrying forever. A new source hash, extractor version, separator version, or explicit retry may reopen the relevant stage.

## 8. Target architecture

```txt
Audio source
  -> identity and content hash
  -> DecodedAudio
  -> WindowPlan
  -> fast extractors
  -> StemSeparator -> StemBundle
  -> full-mix and per-stem extractors
  -> FeatureBundle
  -> versioned persistence
  -> candidate generation
  -> component reranking
  -> frozen map projection
  -> reason codes and API outputs
```

### 8.1 Shared audio substrate

`DecodedAudio` must:

- decode a local or downloaded source once
- retain source hash, duration, channel count, and source sample rate
- expose deterministic sample-rate views
- preserve an unnormalized stereo view for physical measurements
- expose model-specific normalized views without mutating source evidence
- clean temporary files safely after all dependent stages finish

`WindowPlan` must:

- have an explicit version
- define whole-track pooling separately from fixed windows
- initially support 10-second windows with a 5-second hop as a benchmarkable default
- define boundary and short-track behavior
- preserve window outputs when producing track aggregates

### 8.2 Extractor contract

Every extractor declares:

- stable name and semantic version
- model/checkpoint identity and weight hash where applicable
- required sample rate and channel policy
- supported scopes: track, window, segment, or stem
- output role: layout, retrieval, rhythm, timbre, palette, explanation, scalar, or tag
- configuration or prompt-bank version
- dependencies, including separator identity for stem extractors

Every extractor:

- succeeds, fails, caches, and upgrades independently
- emits structured warnings instead of silently substituting values
- returns records through a common `FeatureBundle`
- supports deterministic test fixtures or a fake adapter

### 8.3 Separator contract

`StemSeparator` returns a `StemBundle` containing:

- drums, bass, vocals, and `other`
- source content hash
- separator name and version
- exact weight SHA-256
- parameter/configuration hash
- per-stem sample rate, channels, and duration
- quality diagnostics and confidence

The initial implementation uses HT-Demucs `htdemucs_ft`.

Requirements:

- process complete tracks using overlap/chunk handling
- preserve stem gain relative to the source
- use unnormalized outputs for physical descriptors
- cache separation independently of feature extractors
- invalidate dependent stem features when separator identity changes
- avoid model ensembles in the initial production path

BS-RoFormer and MelBand-RoFormer are bake-off challengers, not simultaneous production dependencies.

### 8.4 Runtime boundaries

Heavy separation and model inference run in a dedicated worker process/environment.

- The FastAPI service must not execute separation in request handlers.
- Cloud execution uses GPU-capable batch jobs when cost/throughput warrants it.
- Local execution prefers available Apple Silicon acceleration and falls back to CPU.
- Local concurrency defaults to one separation task to protect playback and system responsiveness.
- Jobs should process enough tracks per worker lifetime to amortize model loading.

## 9. Functional requirements

### ENG-001: Identity and ingest

The engine shall:

- hash local and cloud-backed audio content
- distinguish local files, missing files, remote objects, and unsupported pseudo-locations
- retain imported metadata without treating it as model truth
- support duplicate detection through content hash and Chromaprint-style identity
- reuse content-derived results across libraries and track IDs

### ENG-010: Fast analysis

Fast analysis shall produce:

- duration and source metadata
- BPM, key/Camelot key, loudness, and energy
- waveform data
- basic spectral, onset, and rhythm descriptors
- one selected practical full-mix embedding
- broad instrument and palette probabilities

Initial candidates:

- `ffmpeg` / `ffprobe`
- librosa and/or Essentia
- Discogs-EffNet-multi
- Essentia/MTG instrument heads
- Chromaprint

### ENG-020: Mandatory asynchronous separation

For every track entering deep analysis, the engine shall:

- enqueue four-stem separation after source identity is available
- use pinned `htdemucs_ft` weights
- expose stage progress and terminal errors
- produce separation provenance and quality diagnostics
- preserve fast results if separation fails
- avoid repeating separation when its content-addressed cache is valid

### ENG-021: Stem retention

During extraction, stems shall use temporary float PCM or an equivalently lossless representation.

- Derived features and provenance are retained.
- Temporary stem audio is deleted after dependent extractors complete.
- Persisted stem audio, when explicitly enabled, uses lossless FLAC.
- Lossy stem derivatives must not feed physical measurements.

### ENG-022: Stem quality

The separator stage shall emit:

- stem energy ratios
- reconstruction error between source and summed stems
- silence and clipping diagnostics
- spectral-overlap or bleed proxies
- per-stem confidence

Confidence must affect downstream ranking and explanation eligibility.

### ENG-030: Full-mix embeddings

The engine shall store full-mix and window-level embeddings separately.

Initial selection process:

- Discogs-EffNet-multi is the production baseline.
- MuQ is the principal retrieval challenger.
- MAEST and MERT may enter the bake-off if they add measurable value.
- Exactly one validated embedding owns `role = layout`.

### ENG-031: Palette-language evidence

CLAP-style audio-text models shall be used for:

- controlled prompt scores
- text-to-library retrieval
- filters and explanation candidates

CLAP shall not be the only map or similarity backbone. Prompt scores must include prompt-bank version and be calibrated against the target library or reference corpus.

### ENG-032: Rhythm evidence

The engine shall preserve:

- beat and downbeat locations
- beat-relative onset patterns
- onset density and inter-onset intervals
- swing, shuffle, syncopation, repetition, and accent evidence where reliable

Beat This is the preferred learned beat/downbeat candidate. MERIT rhythm remains evaluation-gated.

### ENG-033: Drum features

Required drum-stem outputs:

- selected learned timbre embedding
- relative energy and loudness
- spectral shape
- attack, transient strength, crest factor, and decay evidence
- onset/rhythm representation
- calibrated language probes such as dry/wet, tight/loose, bright/dark, and acoustic/electronic

The engine must not claim exact drum-machine identity.

### ENG-034: Bass features

Required bass-stem outputs:

- selected learned timbre embedding
- sub, bass, and low-mid energy ratios
- fundamental strength and harmonic/noise evidence
- envelope, pumping, onset density, and movement descriptors
- optional pitch track when confidence is sufficient

CREPE or an equivalent pitch estimator may be evaluated. Pitch failure must not invalidate the remaining bass fingerprint.

### ENG-035: Vocal features

Required vocal-stem outputs:

- presence and persistence
- relative energy
- brightness and spectral treatment
- stereo width
- reverb-tail/wetness evidence
- dynamics and crest-factor evidence

Vocal embeddings and fine-grained technique labels are not required until validated. The engine must not identify singers.

### ENG-036: Other/instrument features

Required `other`-stem outputs:

- broad instrument-family probabilities
- relative energy and persistence
- spectral texture and flatness
- stereo width and production-space descriptors

The `other` stem is a residual and must be treated as lower-confidence by default. A melodic-timbre embedding may be evaluated but does not receive a ranking role without measured lift.

### ENG-040: Canonical persistence

The engine shall store:

- embeddings as separate records with model, role, scope, stem, time range, dimension, pooling strategy, and versions
- scalar/tag features as namespaced records with scope, stem, time range, confidence, and source
- separator provenance independently from individual stem features
- job/run status and structured warnings/errors
- projection coordinates with `projection_version`

Computation identity is based on audio content and extractor configuration, not `track_id`. `track_id` associates reusable evidence with a library record.

### ENG-041: Cache identity

Extractor cache keys shall contain:

```txt
audio_content_hash
extractor_name
extractor_version
window_plan_version
relevant configuration or prompt-bank version
separator identity when stem-dependent
```

Separator cache keys shall contain:

```txt
audio_content_hash
separator_name
separator_version
weights_sha256
parameters_hash
```

Terminal successful, failed, and skipped states remain sticky until an identity component changes or an explicit retry is requested.

### ENG-050: Candidate generation

The first production retrieval path shall:

- use one selected primary retrieval embedding
- use exact cosine search at demo scale
- retain support for additional named candidate sources
- avoid treating UMAP coordinates as retrieval truth

Approximate nearest-neighbor indexing is added only after measured latency requires it.

### ENG-051: Component reranking

Each candidate pair may receive separate normalized scores for:

- global sound world
- timbre
- groove
- physical production
- palette-language overlap
- drum similarity
- bass similarity
- instrumentation
- segment similarity
- mix compatibility

Raw embeddings from unrelated models must not be concatenated into an undocumented “final embedding.” Combine normalized component scores through late fusion and eventually a small learned ranking head.

### ENG-052: Product outputs

The query layer shall expose:

```txt
sonic_match
groove_match
mix_safety
confidence
component_scores
reason_codes
model_set_version
```

Reason codes must derive from retained evidence and thresholds. Generative copy may phrase reasons but may not create unsupported ones.

### ENG-053: Stable map

Map generation shall:

- use exactly one explicit layout embedding
- fit standardization, optional PCA, and UMAP on a versioned reference corpus
- persist the projection artifact
- transform new tracks without refitting the map
- store `projection_version`

## 10. Model-set baseline

The first integrated model set is:

| Role | Initial choice | Challenger |
|---|---|---|
| Separation | HT-Demucs `htdemucs_ft` | BS-RoFormer / MelBand-RoFormer |
| Layout/retrieval | Discogs-EffNet-multi | MuQ |
| Palette language | LAION-CLAP music-capable checkpoint | MuQ-MuLan |
| Rhythm | Beat This plus explicit onset features | MERIT rhythm |
| Drum/bass timbre | Baseline encoder reused on stems | MuQ/MERT layers, DAC experiment |
| Instrument evidence | Essentia MTG-Jamendo instrument head | OpenMIC/PANNs/PaSST |
| Physical evidence | Essentia/librosa/scipy | N/A |

Checkpoint licenses and redistribution terms must be reviewed before bundling models in a desktop release.

## 11. Human evaluation

### 11.1 Gold set

Create:

- a representative 300–500-track evaluation corpus
- at least 50 anchor tracks
- pair or triplet judgments for overall sonic world
- component judgments for drums, bass, groove, melodic palette, and production space
- difficult examples including dense masters, vinyl rips, vocal tracks, sparse tracks, and low-quality encodes

### 11.2 Bake-off measures

For retrieval:

- top-K accept rate
- triplet preference accuracy
- component-specific preference accuracy
- failure slices by genre, source quality, and arrangement

For operations:

- real-time factor by device
- peak memory and VRAM
- artifact/cache size
- failure rate
- estimated cloud cost per track-hour

For separation, judge downstream retrieval and descriptor stability in addition to listening quality or SDR.

### 11.3 Promotion rule

A challenger replaces a baseline only when it:

- wins on held-out DJ judgments or fixes a documented failure slice
- has acceptable runtime, memory, license, and packaging characteristics
- has deterministic versioned inference
- does not materially destabilize existing explanations without a migration plan

## 12. Local and cloud requirements

### 12.1 Local

- Source audio remains local unless the user explicitly selects cloud processing.
- Model downloads are managed and checksummed.
- Analysis works offline after dependencies and weights are installed.
- Playback remains responsive during analysis.
- Interrupted jobs resume from stage-level caches.
- The local store uses the same semantic records as cloud persistence.

### 12.2 Cloud

- Source files are fetched from private object storage through worker credentials.
- Jobs run outside Vercel and outside synchronous API requests.
- Secrets are supplied through environment/secret management.
- Temporary source and stem files are removed after each job.
- Persisted artifacts remain private and access-controlled.
- Batch sizing and GPU selection are driven by measured throughput and cost.

## 13. Reliability and observability

Every stage shall record:

- start/end time
- cache hit/miss
- source hash
- extractor or separator identity
- runtime device
- duration and real-time factor
- peak memory where measurable
- output record count and artifact size
- structured warnings and terminal errors

Jobs must be idempotent. One extractor failure must not erase successful unrelated outputs.

## 14. Security and privacy

- Local paths and audio must never be logged to shared telemetry in full.
- Cloud audio and artifacts are private by default.
- Signed or authenticated access is required for playback artifacts.
- Temporary files use per-job directories and are deleted on success or failure.
- Model loading must not execute untrusted remote code.
- Weight files must be pinned and checksummed.
- User corrections remain scoped to the owning user/library unless explicitly shared.

## 15. Current implementation gap

The current engine has:

- an `AudioBackend.analyze(audio_path) -> BackendOutput` contract
- one embedding plus a feature dictionary
- whole-backend cache invalidation
- independent decoding inside backends
- librosa, Essentia, and CLAP backend paths
- a Cloud Run job with injected storage/repository adapters
- clustering and export support

It does not yet have:

- decode-once audio views
- window-level evidence
- independent extractor records
- explicit embedding roles
- a separator contract or stem bundle
- stem provenance and diagnostics
- per-extractor cache identity
- a frozen reusable map projection
- channel-aware retrieval/reranking

Existing terminal-cache behavior, location handling, version fields, and injected adapters must be preserved during migration.

## 16. Delivery plan

### Milestone 0: Evaluation and contracts

Deliver:

- gold-set schema and initial labels
- `DecodedAudio`
- versioned `WindowPlan`
- `Extractor` and `FeatureBundle`
- `StemSeparator` and `StemBundle`
- compatibility adapter for existing `AudioBackend`
- timing and artifact instrumentation

Acceptance:

- existing fast tests still pass through the compatibility adapter
- two extractors can fail/cache/version independently
- decoded audio is reused across extractors

### Milestone 1: Fast baseline and stable map

Deliver:

- real waveform output
- deterministic scalar extractors
- Discogs-EffNet baseline
- canonical feature/embedding persistence
- explicit layout role
- persisted standardizer/PCA/UMAP projection
- exact-cosine top-K retrieval

Acceptance:

- new tracks transform into an existing map without refitting
- the 3,000-track fixture can be queried by primary embedding and filters

### Milestone 2: Separation foundation

Deliver:

- asynchronous `htdemucs_ft` worker
- local CPU/MPS execution path
- cloud GPU-capable batch path
- content-addressed separator cache
- stem retention/cleanup policy
- diagnostics, confidence, and degraded-state behavior

Acceptance:

- every selected deep-analysis track reaches `ready_deep` or a terminal degraded state
- reruns hit the separator cache
- changing the weight hash invalidates stem-dependent outputs but not full-mix outputs

### Milestone 3: Timbre fingerprint

Deliver:

- required drum and bass embeddings/descriptors
- required vocal treatment descriptors
- required `other` instrumentation/texture descriptors
- CLAP prompt bank with versioning and calibration
- Beat This/onset-derived groove evidence
- window-level full-mix and selected stem outputs

Acceptance:

- drum and bass comparisons are independently queryable
- low-confidence stem evidence is suppressed
- no exact gear-identification language is emitted

### Milestone 4: Retrieval and explanations

Deliver:

- primary candidate generation
- normalized component scores
- query-intent reranking
- sonic/groove/mix outputs
- reason-code generation
- top-K caching

Acceptance:

- users can request same sound world, same drums, same bass, or same groove as separate intents
- every returned reason maps to stored evidence

### Milestone 5: Bake-off and model lock

Deliver:

- EffNet versus MuQ retrieval report
- HT-Demucs versus selected RoFormer report on difficult tracks
- CLAP prompt evaluation
- MERIT and optional DAC/instrument-model experiments
- selected model-set manifest and migration notes

Acceptance:

- production defaults are justified on held-out DJ judgments
- runtime, memory, license, and cost are documented

## 17. Out-of-scope follow-ups

- learned Crate Dig ranking head trained from product feedback
- labeled intro/outro/main-groove segmentation
- transition planner
- stem audition or export
- six-stem guitar/piano separation
- ANN indexes before measured need
- exact source/gear recognition

## 18. Open decisions

These require evidence, not preference:

- Does MuQ beat Discogs-EffNet-multi for primary retrieval?
- Does `htdemucs_ft` produce stable enough bass evidence, or is BS-RoFormer required?
- Which encoder layer and pooling strategy best represent drum and bass timbre?
- Do vocal or `other` embeddings add value beyond cheaper descriptors?
- Does MERIT reliably separate rhythm and timbre on mastered club music?
- Which prompt bank produces stable DJ-language features?
- What confidence thresholds should suppress stem evidence?
- When does exact cosine become too slow for the desktop target?

## 19. Definition of done

The Crate Dig engine v1 is done when it can ingest a track, make it quickly usable, complete asynchronous four-stem analysis, persist independent versioned evidence, place the track through a frozen projection, retrieve and rerank neighbors, and return explainable sonic/groove/mix outputs—with repeatable tests and without requiring source audio to leave the user's machine.
