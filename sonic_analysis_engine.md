# Crate Dig Sonic Analysis Engine

Status: Draft
Last updated: 2026-08-25
Purpose: Define the technical strategy for Crate Dig’s sonic similarity engine.
Implementation contract: `CRATE_DIG_ENGINE_PRD.md`

## 1. Product goal

Crate Dig is a DJ music-library intelligence tool. The core need is not generic playlist generation, Shazam-style recognition, or simple DJ compatibility. The core need is sonic similarity discovery inside a user’s own music library.

The product question is:

> What tracks in my library live in the same sonic world as this track?

By “sonically similar,” Crate Dig means similarity in sound palette: rhythm feel, drum character, bass weight, instrumentation, vocal treatment, texture, atmosphere, harmonic color, and production space.

The goal is not merely:

> Can these tracks mix?

It is:

> Do these records sound like they belong near each other?

## 2. Key distinction

Crate Dig must separate three related but different concepts:

```txt
Exact identity
= Is this the same recording?

Sonic similarity
= Does this live in the same sound world?

Mix compatibility
= Can I plausibly transition between these?
```

### 2.1 Exact identity

This is the Shazam / Pixel Now Playing class of problem.

It answers:

> What exact song or recording is this?

Use this layer for:

- duplicate detection
- matching different encodings of the same recording
- identifying imported tracks
- avoiding duplicate map entries
- future external catalog lookup

Recommended tool:

- Chromaprint-style local acoustic fingerprinting

This layer is useful, but it should not drive sonic similarity. Fingerprinting tells us whether two files are the same recording. It does not tell us whether two different records share a sound palette.

### 2.2 Mix compatibility

This is traditional DJ compatibility.

Signals:

- BPM
- key / Camelot key
- phrase structure
- intro/outro shape
- energy curve
- transition safety

Two tracks can be mix-compatible without sounding similar.

Example:

> Two tracks are both 122 BPM and in compatible keys, but one has acoustic guitar, organic percussion, warm pads, and a soft low-end, while the other has a hard electronic kick, metallic synth stabs, and peak-time compression.

Those tracks may mix cleanly, but they do not live in the same sonic world.

### 2.3 Sonic similarity

This is Crate Dig’s primary product promise.

Signals:

- rhythm and groove feel
- drum pattern and drum texture
- kick/bass relationship
- bass weight and bass texture
- instrumentation
- acoustic vs electronic character
- synth/pad/guitar/piano/percussion presence
- vocal presence and vocal treatment
- harmonic texture
- atmosphere and production space
- brightness, warmth, roughness, density
- segment-level sound

Sonic similarity should answer:

> Which records share the same sound palette?

## 3. Technical thesis

Crate Dig should not be built as a single genre classifier, instrument classifier, or one-vector recommendation system.

It should be built as a multi-vector sound-world retrieval engine.

The backend should produce a versioned sonic fingerprint for every track:

```txt
exact fingerprint
+ global music embedding
+ rhythm embedding
+ timbre embedding
+ CLAP / text-audio palette scores
+ segment embeddings
+ mandatory four-stem decomposition for completed analysis
+ selected stem embeddings and physical descriptors
+ handcrafted audio features
+ user corrections
= sound-world retrieval
```

The big decision: Crate Dig should support a deeper, feature-rich analysis path from the start. Fast analysis can exist for iteration, but the product’s differentiator is deep sonic understanding, not generic metadata sorting.

### 3.1 Canonical sonic fingerprint channels

The engine should treat a track as a set of named channels, not as one universal vector. Each channel has a distinct retrieval or explanation job.

| Channel | Representation | Default comparison | Captures |
|---|---|---|---|
| A. Global style | Pooled Discogs-EffNet, MAEST, MuQ, or MERT-family embedding | Cosine similarity | Same shelf, scene, and overall musical gestalt |
| B. Physical audio | Spectral centroid, band energy, LUFS, dynamic range, onset density, stereo width, and related scalars | Per-feature normalized distance; consider Mahalanobis only after enough reference data exists | Brightness, low-end weight, density, compression, transience, and space |
| C. Palette language | Calibrated CLAP or music-text prompt-score vector | Cosine similarity or correlation | Human DJ vocabulary such as warm pads, dry drums, sub-heavy bass, organic percussion, and washed-out vocals |
| D. Factored music | Separate MERIT rhythm and timbre vectors; melody is secondary for the initial DJ use case | Cosine similarity per factor | Groove similarity separated from sound-world similarity |
| E. Stems | A selected encoder applied separately to drums, bass, vocals, and other stems | Strictly stem-to-same-stem cosine similarity | Drum palette, bass texture, vocal treatment, and supporting instrumentation |
| F. Structure | Time-window embeddings plus an energy curve and later validated section labels | Window/segment similarity; dynamic time warping for curves where useful | Intro, outro, main-groove, breakdown, and temporal-shape similarity |
| G. Mix compatibility | BPM ratios, Camelot graph distance, energy/structure alignment, and transition heuristics | Discrete compatibility rules plus normalized scalar scores | Transition safety; deliberately excluded from the core sonic score |

Channels A through F form the sonic fingerprint. Channel G is a separate DJ-compatibility layer. BPM and key may be filters or query constraints, but they must not quietly redefine what “sounds similar” means.

The product should translate these internal channels into three understandable scores:

1. **Sonic match** — overall sound-world similarity across global style, timbre, palette, physical audio, and relevant stems/segments.
2. **Groove match** — rhythm feel, onset behavior, percussion, and MERIT rhythm similarity.
3. **Mix safety** — BPM, key, energy curve, phrase/section alignment, and transition risk.

The model-selection goal is therefore not to crown one embedding as the universal winner. It is to select the best representation for each channel and then learn how those channels should be combined for a particular DJ intent.

## 4. Recommended architecture shape

Think of the backend as three concerns wired together, not one monolithic script.

### 4.1 Ingest and identity

Responsibilities:

- discover audio files
- decode metadata
- hash files
- compute acoustic fingerprints
- identify duplicates
- normalize audio for model inference
- create analysis jobs

This layer should be deterministic and local-first.

### 4.2 Shared audio substrate

Decode each file once with `ffmpeg`, then expose deterministic sample-rate views to extractors. Models may require 16 kHz, 24 kHz, or 48 kHz audio, but they should not each reopen and independently decode the source file.

Core concepts:

```txt
DecodedAudio
  source_hash
  duration_ms
  channels
  at(sample_rate) -> normalized waveform view

WindowPlan
  version
  whole_track_strategy
  window_length_ms
  hop_length_ms
  boundary_policy

Extractor
  name
  version
  required_sample_rate
  supported_scopes
  output_role
  extract(audio, window_plan) -> feature records

FeatureBundle
  embeddings[]
  scalars[]
  tags[]
  warnings[]
```

The first versioned window plan should include a whole-track view plus fixed overlapping windows. A reasonable experiment starting point is 10-second windows with a 5-second hop, but this is a benchmark parameter rather than a permanent product assumption.

Extractors must emit window-level results when the model supports them. Whole-track pooling may be stored as an additional record, but it must not destroy the underlying temporal evidence.

### 4.3 Versioned separation substrate

Every track that reaches `analysis_complete` must have a reproducible four-stem decomposition:

```txt
StemBundle
  source_hash
  separator_name
  separator_version
  weights_sha256
  parameters_hash
  stems
    drums
    bass
    vocals
    other
  diagnostics
    reconstruction_error
    energy_ratios
    silence_and_clipping
    spectral_overlap
    confidence_by_stem
```

Separation is mandatory for completed analysis but asynchronous from import. A track may be imported, played, and shown with provisional fast features while separation and stem-dependent extractors remain queued. The product must distinguish `usable` from `analysis_complete`; it must not make the user wait for separation before using the library.

The first production separator should be HT-Demucs `htdemucs_ft`. Benchmark BS-RoFormer when bass leakage limits downstream results and MelBand-RoFormer when drum, vocal, or `other` quality is the larger problem. Pin one separator and weight hash for each pipeline version. Do not silently ensemble or swap separators because downstream feature distributions change with the separator.

The separator must:

- consume the shared decoded stereo audio rather than independently reopening the source where the implementation permits
- process the complete track using overlap/chunk behavior that avoids hard segment boundaries
- preserve stem gain relative to the original mix
- emit unnormalized stems for physical measurements
- permit normalized inference views for learned encoders without overwriting the unnormalized evidence
- cache by source hash, separator identity, weight hash, and relevant parameters
- invalidate only downstream stem-dependent outputs when its identity changes

Use temporary float PCM during extraction. Persist lossless FLAC stems only when stem audition, debugging, or an explicit retention policy requires them; otherwise persist the derived features and reproducibility metadata, then remove temporary audio.

Stem confidence is part of the feature contract, not optional telemetry. Low-confidence stem evidence must be down-weighted or omitted from ranking and explanations.

### 4.4 Analysis extractor fan-out

Responsibilities:

- compute handcrafted features
- compute whole-track embeddings
- compute segment-level embeddings
- compute CLAP prompt scores
- compute rhythm/timbre/melody factor embeddings when available
- consume the canonical four-stem bundle
- compute selective stem-level embeddings and descriptors
- store all outputs with model/version metadata

This layer should be batch-oriented and reproducible. Each extractor should succeed, fail, cache, and be upgraded independently; one failed or upgraded model should not invalidate unrelated features.

Exactly one embedding record in a selected model set should have `role = layout`. That explicit choice prevents the map vector from changing accidentally when other models are added.

### 4.5 Query and scoring

Responsibilities:

- generate nearest-neighbor candidates from precomputed vector indexes
- re-rank candidates using weighted scoring
- expose different scoring modes by intent
- generate explanations for Q and the UI
- cache top-K neighbors for fast map/list interactions

Exact cosine search is acceptable for the 3,000-track web demo and likely remains practical well beyond that scale. Keep the schema compatible with future pgvector HNSW or FAISS indexes, but do not add approximate-nearest-neighbor complexity until measured latency requires it. The enduring product architecture is candidate generation + channel-aware re-ranking.

## 5. Analysis modes

Crate Dig should support at least two modes.

### 5.1 Fast mode

Purpose:

- quick local iteration
- initial web demo
- cheap background re-analysis
- reasonable results while deep models are still being integrated

Fast mode computes:

- file hash
- Chromaprint duplicate fingerprint
- BPM/key/duration/loudness
- spectral/rhythm features
- one practical global music embedding
- broad instrumentation/sound-palette tags

Recommended fast stack:

- `ffmpeg` / `ffprobe`
- `librosa`
- `essentia`
- Essentia Discogs-EffNet embeddings
- Essentia/MTG-style classifiers
- Chromaprint

### 5.2 Deep mode

Purpose:

- best available sonic similarity
- strong DJ discovery value
- detailed explanations
- local desktop analysis where time/compute is acceptable
- cloud batch re-analysis for curated/demo libraries

Deep mode computes everything in fast mode plus:

- stronger self-supervised music embeddings
- CLAP text-audio palette probes
- rhythm/timbre/melody factor embeddings where practical
- structural/segment embeddings
- Demucs stem separation
- stem-specific embeddings and descriptors
- deeper explanation features for drums, bass, vocals, atmosphere, and harmonic texture

Recommended deep stack:

- MuQ or MERT-family music embeddings
- MERIT rhythm/timbre/melody embeddings, if stable enough in practice
- LAION-CLAP music/music+speech checkpoint for named palette tags and Q
- Demucs or equivalent source separation
- Essentia/librosa scalar descriptors
- pgvector or FAISS for vector retrieval

Deep mode is the completed-analysis state. Fast mode is the immediately usable provisional state while mandatory separation and deeper extractors run asynchronously.

## 6. Model roles

The engine should not ask one model to do every job. Each model family has a different role.

### 6.1 Chromaprint

Job:

- exact or near-exact recording identity
- duplicate detection

Use for:

- “Is this the same file/recording?”
- “Do not show duplicates as separate map points unless the user wants that.”

Do not use for:

- “Does this sound similar?”

### 6.2 Essentia Discogs-EffNet

Job:

- practical music embedding
- catalog-style sonic neighborhood
- map layout candidate
- first-pass nearest neighbors

Why it matters:

Discogs-EffNet is fast and music-specific. It tends to understand “same shelf / same scene / same release-world” better than generic audio features.

Use for:

- MVP embedding
- first-pass map geometry
- fast nearest-neighbor candidate generation
- genre/style/instrument classifier heads where useful

Limitation:

Discogs-world similarity is not the same as drum/bass/timbre similarity. It may group tracks by style context while missing subtle differences in kick, room, or low-end texture.

### 6.3 MuQ / MERT-family self-supervised music embeddings

Job:

- strong general music understanding
- deep sonic representation
- structure, instrumentation, timbre, rhythm, and musical content

Use for:

- deep global embedding
- stronger map layout experiments
- candidate generation
- segment embeddings
- long-term “best backbone” evaluation

Current recommendation:

Treat MuQ and MERT-family models as the serious deep-analysis backbone candidates. Benchmark them directly against Discogs-EffNet on Jeff’s library and human-labeled similarity sets.

### 6.4 MERIT

Job:

- disentangled similarity by melody, rhythm, and timbre

Use for:

- “same groove, different sound world”
- “same timbre, different melody”
- “same melodic contour, different production”
- explanatory scores for Q

For Crate Dig, the most important MERIT dimensions are:

- rhythm
- timbre

Melody is useful, but secondary for DJ crate discovery unless the user is finding covers, hooks, or melodic callbacks.

Current recommendation:

Prototype MERIT in deep mode. If it works reliably on electronic music libraries, keep it as a named component rather than burying it inside a generic similarity score.

### 6.5 LAION-CLAP / music CLAP-style text-audio embeddings

Job:

- connect human language to audio
- named sound-palette tags
- Q explanations
- text queries like “sub-heavy dubby rollers with dry percussion”

Use for:

- palette probe scores
- Q retrieval and filtering
- sound description matching
- text-to-library search
- explanation candidates

Examples of CLAP prompt probes:

- “warm pad texture”
- “dry drum mix”
- “sub-heavy bass”
- “rolling percussion”
- “spoken vocal chops”
- “washed-out reverb”
- “organic percussion”
- “bright metallic synth lead”
- “minimal hypnotic groove”
- “raw drum-machine house”

Important limitation:

CLAP should help name sound. It should not be the only map backbone. Text-audio alignment is powerful for Q and tags, but one CLAP cosine score is too blunt for the whole Crate Dig similarity engine.

### 6.6 Demucs / source separation

Job:

- isolate drums, bass, vocals, and other stems
- improve drum/bass/vocal texture comparison

Use for:

- drum stem embeddings
- bass stem embeddings
- vocal presence/treatment
- kick/percussion character
- bass weight and movement
- separating “same groove” from “same mixdown”

Recommendation:

Use HT-Demucs `htdemucs_ft` as the pinned initial four-stem separator. Every fully analyzed track should produce drums, bass, vocals, and `other`; separation remains asynchronous so it does not block import, playback, or provisional fast-mode discovery.

Separate all four sources, but do not assume they deserve equal downstream compute or trust:

- drums and bass receive the first deep embeddings and source-specific physical descriptors
- vocals initially receive presence and treatment measurements plus carefully validated probes
- `other` initially receives broad instrument probabilities, physical texture/space features, and experimental embeddings because it is a separator-dependent residual

Demucs is slower and can create artifacts on dense mastered club music. Persist separator provenance and quality diagnostics, reduce the contribution of unreliable stems, and benchmark BS-RoFormer or MelBand-RoFormer only where downstream DJ judgments show a material problem.

### 6.7 Librosa / Essentia scalar descriptors

Job:

- deterministic audio measurements
- mix compatibility
- explanations
- feature sanity checks

Use for:

- BPM
- key / chroma
- LUFS/loudness
- RMS
- spectral centroid / brightness
- spectral bandwidth
- rolloff
- MFCCs
- onset density
- low/mid/high band energy
- dynamic range
- energy curves

Important scoring rule:

These scalars should heavily influence mix compatibility and explanations. They should not dominate sonic similarity.

### 6.8 DAC / EnCodec neural-codec representations

Job:

- preserve fine acoustic evidence required to reconstruct audio
- provide a deliberately low-level timbre candidate alongside semantic music embeddings
- capture transient, envelope, harmonic, saturation, and room detail that a global style model may discard

Why this is interesting:

Music foundation models are commonly optimized to understand musical or semantic content. A high-fidelity neural codec is optimized to retain enough local acoustic information to reconstruct the signal. Its internal representation may therefore be more sensitive to kick attacks, bass distortion, oscillator texture, reverb tails, and other production details that matter to Crate Dig's source-conditioned similarity thesis.

Recommended experiment:

- begin with continuous encoder latents from the 44.1 kHz Descript Audio Codec (DAC)
- compare whole-mix and same-stem-to-same-stem representations
- test drums, bass, vocals, and other/instrument stems separately
- retain time-indexed latent evidence before pooling
- compare multiple temporal and latent-depth pooling strategies
- explicitly control for loudness, pitch/register, and section selection
- compare DAC with EnCodec only if DAC shows useful retrieval signal

Important limitation:

A codec latent is not automatically a perceptual-similarity embedding. Raw distance may overreact to pitch, loudness, phase, mastering, or separation artifacts. Treat DAC as a candidate feature channel, not a drop-in replacement for MuQ, MERT, MERIT, or CLAP. It earns a product role only if it improves blind drum, bass, melodic-timbre, or production-space judgments.

### 6.9 Instrument and sound-event models

Candidate families:

- PaSST or PANNs AudioSet representations
- OpenMIC-trained multi-instrument heads
- Essentia/MTG instrument classifiers
- lightweight musicnn/OpenL3 baselines where local inference cost matters

Job:

- identify broad instrument families and audible source materials
- estimate when and how persistently an instrument is present
- provide interpretable evidence for filters and explanations

Use for:

- acoustic guitar versus electric guitar
- piano/Rhodes/organ versus generic keys
- drums, cymbals, percussion, bass, voice, strings, brass, and synthesizer presence
- section-level instrumentation changes
- validating or constraining CLAP prompt scores

Important limitation:

Instrument presence is not itself sonic similarity. Two tracks can contain the same broad instruments and sound very different. These models should supply instrumentation evidence and explanation features, while timbre embeddings and physical descriptors determine how those sources sound.

### 6.10 Separation challengers and layer probing

Demucs is the initial practical separator, but separation quality constrains every downstream stem score. Benchmark MelBand-RoFormer or BS-RoFormer on a small, difficult club-music subset when drum/bass leakage materially changes retrieval results. The separator is infrastructure, not a similarity embedding.

Before adding too many unrelated models, also probe intermediate layers from MuQ, MERT, and MAEST. Earlier and middle representations may preserve more local acoustic or instrumental evidence than a final pooled semantic vector. Layer selection and pooling strategy should be treated as bake-off variables with their own version metadata.

## 7. Important libraries

### 7.1 Core audio processing

Use:

- `ffmpeg`
- `ffprobe`
- `soundfile`
- `numpy`
- `scipy`
- `librosa`
- `essentia`
- `pyloudnorm`

Purpose:

- decode audio robustly
- normalize sample rates
- extract features
- create waveform previews
- compute LUFS and energy curves

### 7.2 Model inference

Use:

- PyTorch
- Hugging Face Transformers where supported
- ONNX Runtime where models are available in ONNX
- Essentia TensorFlow wrappers for Essentia model zoo
- `laion-clap`
- Demucs

Purpose:

- run embeddings
- run classifiers
- run stem separation
- support GPU acceleration in cloud
- support local acceleration on Mac where feasible

### 7.3 Vector search

For the web app:

- Supabase Postgres + pgvector

For local desktop:

- SQLite for metadata
- FAISS or a SQLite vector extension for local search

Use cosine distance for normalized embeddings. Use HNSW indexes where appropriate.

### 7.4 Job orchestration

For web/cloud:

- Cloud Run Jobs for batch analysis
- Cloud Run service for API
- R2 for audio/artifact storage
- Supabase for metadata, auth, and vector records

For desktop/local:

- Python sidecar process
- local job queue
- local SQLite
- local file paths
- optional local vector index

## 8. Instrumentation and sound-palette methodology

Crate Dig should identify broad sound ingredients and sound traits, not overclaim specific gear.

### 8.1 Broad instrumentation

Target labels:

- acoustic guitar
- electric guitar
- piano
- Rhodes
- strings
- vocal / voice
- drums
- drum machine
- percussion
- synth
- pad
- bass
- sampler

Essentia/MTG-style instrumentation models are a good first source for these broad labels.

### 8.2 Sound-palette and production traits

Target labels:

- organic vs synthetic
- warm vs bright
- dark vs euphoric
- dry vs reverbed
- raw vs polished
- sparse vs dense
- soft vs sharp transient
- vocal-heavy vs instrumental
- sub-heavy vs light low-end
- atmospheric vs direct
- washed-out vs upfront
- rolling vs broken
- hypnotic vs hook-led

CLAP-style prompt probes are the best early path for these human-language traits.

### 8.3 Drum and bass descriptors

Target descriptors:

- rolling percussion
- four-on-the-floor kick
- broken percussion
- dry hats
- shuffled hats
- metallic percussion
- sub-heavy bass
- mid-bass growl
- acid-like bass
- round low-end
- hard transient kick
- soft/blurred kick

Best approach:

- use mixdown embeddings for global candidate retrieval
- create a versioned four-stem bundle for every completed analysis
- prioritize drums/bass stem evidence in the first ranking implementation
- embed stems separately
- compute scalar features on stems
- generate cautious natural-language explanations

### 8.4 Source-conditioned feature decomposition

Crate Dig's central sonic-similarity thesis is that a track should not be represented only by genre, tempo, key, or one whole-mix embedding. The engine should separately represent the sound and behavior of its important sources, especially drums, bass, and melodic instrumentation.

For each source, keep three concepts distinct:

1. **Timbre** — what the sound itself sounds like.
2. **Pattern** — when events occur relative to the beat.
3. **Movement** — how amplitude, duration, accents, spectrum, and modulation evolve through that pattern.

Do not store `rhythmic_movement` as one unexplained scalar. Represent it through measurable evidence and use the phrase only as an explanation assembled from that evidence.

#### Amplitude-envelope vocabulary

- **Attack**: the time from a sound's onset to its peak or effective full level. Fast attacks feel sharp, punchy, clicked, or plucked; slow attacks feel soft, bowed, or swelling.
- **Decay**: the initial fall from the peak toward the sustained level.
- **Sustain**: the level or behavior maintained while a note remains active.
- **Release**: the time a sound takes to fade after its note, gate, or excitation ends. Short releases feel tight and dry; long releases feel sustained, spacious, or trailing.

These source-envelope meanings are distinct from compressor attack and release, which describe how quickly gain reduction engages and disengages.

#### Drum representation

Keep the following separately addressable:

- pattern family: four-on-the-floor, broken, halftime, syncopated, rolling, or sparse
- onset positions and inter-onset intervals
- onset density by drum role where detectable
- swing, shuffle, syncopation, repetition, and accent pattern
- kick fundamental and low-frequency decay
- transient sharpness and attack-time distribution
- hit decay/release and perceived tightness
- acoustic-kit, electronic, or hybrid character
- snare, clap, hat, cymbal, tom, and auxiliary-percussion presence
- metallic, woody, noisy, tonal, or saturated material character
- room, reverb, distortion, and compression character
- stereo width and spatial placement

This enables distinctions such as **same pattern, different drum sound** and **similar drum sound, different pattern**.

#### Bass representation

Keep the following separately addressable:

- sub, bass, and low-mid energy balance
- fundamental strength and harmonic richness
- clean, saturated, distorted, growling, round, plucked, sustained, or acid-like character
- attack, decay, sustain, and release behavior
- note-event density and inter-onset pattern
- sustained, offbeat, syncopated, rolling, pulsed, or stab-like behavior
- note-duration and articulation profile
- amplitude pumping or sidechain-like modulation
- spectral/filter movement through time
- stereo width and mono compatibility
- temporal and spectral relationship to the kick

This enables distinctions such as **same bass texture, different bassline movement** and **same rhythmic bassline, different sound design**.

#### Melodic and supporting-instrument representation

Keep the following separately addressable:

- broad family: piano, Rhodes, organ, acoustic guitar, electric guitar, strings, brass, mallet, pad, pluck, lead, arpeggio, or other synth
- acoustic, electronic, sampled, or hybrid character
- attack and articulation: struck, plucked, bowed, sustained, gated, or swelling
- brightness, harmonic richness, noisiness, and spectral shape
- smooth, glassy, metallic, woody, warm, brittle, or distorted texture
- chordal, melodic, arpeggiated, droning, or textural function
- note density, register, duration, and repetition
- filter, tremolo, vibrato, chorus, and other modulation behavior
- reverb, delay, stereo width, and foreground/background placement
- prominence and persistence across track sections

The initial system should identify broad instrument families and perceptual traits, not exact synthesizer models or production gear.

#### Production-space representation

Some perceived similarity belongs to the production rather than a single source. Track and retain:

- overall dryness versus reverberance
- room size and reverb-tail evidence
- stereo width and center-versus-side energy
- dynamic range and compression density
- transient-to-sustain balance
- saturation/distortion evidence
- spectral balance and brightness
- arrangement density and masking

#### Canonical similarity components

The deep-analysis fingerprint should make the following independently queryable and explainable:

| Component | Primary evidence |
|---|---|
| Drum timbre | Drum-stem embeddings, transient/envelope descriptors, spectral and production traits |
| Drum pattern | Beat-relative onsets, inter-onset intervals, density, accents, swing, and syncopation |
| Bass timbre | Bass-stem embeddings, harmonic/spectral descriptors, envelope, saturation, and low-end balance |
| Bass movement | Note/onset timing, duration, repetition, pumping, and spectral modulation |
| Instrumentation | Instrument-presence models, calibrated audio-text probes, and section persistence |
| Melodic timbre | Supporting-stem embeddings, articulation, spectral texture, modulation, and effects |
| Production space | Reverb, stereo, dynamics, saturation, density, and whole-mix physical descriptors |
| Global sound world | Music foundation/style embeddings and aggregate palette evidence |

The product can combine these components into an overall **Sonic Match**, but it must retain the component scores so users can ask for records with, for example, the same drum character but a different melodic palette.

### 8.5 What not to claim early

Avoid confident labels such as:

- “909 kick”
- “Juno-106 pad”
- “Moog bass”
- “LinnDrum”
- “definitely acoustic kick”

Safer copy:

- “909-like transient”
- “acid-like bass movement”
- “analog-pad texture”
- “acoustic-kit feel”
- “drum-machine feel”

Specific synth and drum-machine identification is not reliable from mastered tracks without custom labeled data and validation.

## 9. Segment-level analysis

Crate Dig should not only embed entire tracks.

For DJ use, similarity is often segment-level:

- intro
- main groove
- breakdown
- outro
- 10–15 second overlapping windows

For each segment, store:

- embedding
- time range
- energy
- dominant tags
- instrumentation probabilities
- rhythm density
- vocal presence
- synth/pad/guitar/percussion confidence

This enables:

- “Find tracks whose intro sounds like this outro.”
- “Find tracks with the same rolling percussion.”
- “Find darker tracks with the same groove.”
- “Find similar main-groove sections.”
- “Find a bridge record between these two tracks.”

Segment-level similarity is likely one of Crate Dig’s strongest differentiators for DJs.

## 10. Stem-level analysis

Every fully analyzed track should use source separation to create a versioned four-stem bundle. Separation is asynchronous from import and playback: fast-mode results may appear first, but the analysis is not `complete` until the required stem bundle and required downstream stem features have reached a terminal state.

Candidate stems:

- drums
- bass
- vocals
- other
- guitar/piano only if model quality is acceptable

Initial per-stem requirements:

- drums: stem embedding, relative energy, transient/envelope descriptors, spectral shape, onset/rhythm representation, and calibrated drum-language probes
- bass: stem embedding, relative energy, sub/bass/low-mid balance, harmonic profile, envelope/movement descriptors, and optional pitch evidence
- vocals: presence, relative energy, spectral treatment, width/reverb/dynamics evidence, and validated treatment probes
- other: broad instrument probabilities, relative energy, melodic-timbre experiment, spectral texture, and production-space evidence

Do not normalize stems before relative-energy, loudness, dynamics, or low-end measurements. Learned models may consume normalized copies when required.

Per-stem embeddings are not automatically required merely because the stem exists. Drums and bass are required in the first complete deep fingerprint. Vocal and `other` embeddings must earn a ranking role through the gold-set evaluation; their cheaper descriptors remain required.

Stem-level analysis improves:

- drum palette detection
- kick character
- bass texture
- vocal density
- synth/pad/guitar presence
- explanations

Required provenance and diagnostics:

- separator name and semantic version
- exact weight SHA-256
- separator parameter/configuration hash
- source audio content hash
- stem energy ratios
- reconstruction error between the source mix and summed stems
- silence/clipping diagnostics
- spectral-overlap or bleed proxies
- confidence per stem

Known limitation:

Stem separation can be messy on dense club masters. The engine should store stem confidence and avoid overconfident explanations when stems are noisy.

## 11. Similarity scoring strategy

Do not use one cosine score as the product’s only answer.

Use:

1. candidate generation
2. component scoring
3. query-specific re-ranking
4. explanation generation

### 11.1 Candidate generation

Generate candidates from multiple indexes:

- global music embedding nearest neighbors
- Discogs-EffNet nearest neighbors
- MuQ/MERT nearest neighbors
- MERIT rhythm nearest neighbors
- MERIT timbre nearest neighbors
- segment embedding nearest neighbors
- CLAP embedding nearest neighbors
- optional stem embedding nearest neighbors
- tag-filtered pools

For a 3,000-track web demo, exact cosine in Postgres or Python is the preferred starting point. Add pgvector HNSW or FAISS approximate search only when a measured library-size or latency threshold justifies it.

### 11.2 Component scores

For each candidate pair, compute separate component scores.

Suggested deep sonic components:

```txt
sonic_similarity_score =
  0.20 ssl_music_embedding_similarity
+ 0.15 discogs_effnet_similarity
+ 0.15 merit_timbre_similarity
+ 0.12 merit_rhythm_similarity
+ 0.10 clap_palette_similarity
+ 0.10 segment_similarity
+ 0.08 stem_drums_similarity
+ 0.05 stem_bass_similarity
+ 0.03 instrumentation_similarity
+ 0.02 production_space_similarity
```

These weights are hypotheses for experiments, not a default to ship before evaluation. The bake-off should first establish which channels add independent retrieval value; human DJ judgments should then tune or learn the weights.

The important principle:

> Use embeddings for retrieval; use components for control and explanation.

### 11.3 Mix compatibility score

Suggested mix compatibility components:

```txt
mix_compatibility_score =
  BPM compatibility
+ key compatibility
+ phrase/intro/outro compatibility
+ energy curve compatibility
+ transition risk
+ optional sonic continuity
```

BPM and key should live here. They can lightly influence sonic search when requested, but they should not define sonic similarity.

### 11.4 Query-specific weighting

The scoring weights should change based on user intent.

For:

> Find tracks that sound like this.

Weight heavily:

- timbre
- rhythm
- drum/bass palette
- global music embeddings
- segment embeddings
- CLAP palette overlap

Weight lightly:

- BPM
- key

For:

> Find transition options.

Weight heavily:

- intro/outro segment embeddings
- BPM
- key
- energy curve
- phrase/structure

Still include:

- sonic similarity

For:

> Find darker nearby tracks.

Weight:

- global embedding
- mood/timbre tags
- brightness
- energy
- vocal density
- rhythm similarity

For:

> Find tracks with acoustic guitar texture.

Weight:

- instrumentation tag probability
- CLAP text/audio score
- segment-level tags
- user-confirmed tags

### 11.5 Similarity metrics

Use different metrics for different feature families.

Dense embeddings:

- L2-normalize vectors.
- Use cosine similarity.
- Store/query with pgvector cosine distance or FAISS cosine/inner-product equivalent.

Probability/tag vectors:

- Use weighted cosine similarity or Jensen-Shannon distance.
- Weight higher-confidence tags more heavily.

Scalar audio features:

- Normalize per library or reference corpus.
- Use Gaussian/RBF similarity for “close enough” values.
- Use hard penalties only where musically necessary.

Text/prompt scores:

- Use cosine similarity between audio and text embeddings.
- Calibrate scores against the user’s own library distribution.

Map layout:

- Use UMAP only for visualization, not retrieval or scoring.
- Fit the standardizer, optional PCA, and UMAP on a versioned reference corpus; persist the projection artifact.
- Transform new tracks through that frozen artifact instead of refitting the map for every library run.
- Store `projection_version` with every 2D coordinate.
- Do not treat 2D map distance as the actual similarity truth.

### 11.6 Crate Dig's learned similarity model

The long-term product should not end at a hand-written weighted sum of public embeddings. Crate Dig should learn its own similarity function from DJ listening judgments while retaining the pretrained extractors as frozen evidence providers.

The target is not a new giant foundation model. The first Crate Dig model can be a small, versioned ranking head trained over normalized channel features:

```txt
global music embeddings
+ rhythm/timbre factors
+ drum-stem features
+ bass-stem features
+ melodic/instrument features
+ neural-codec acoustic features
+ palette probes
+ physical production descriptors
+ segment/structure evidence
-> Crate Dig similarity ranker
```

Train and evaluate separate targets rather than collapsing all judgments immediately:

- overall sonic-world similarity
- drum-timbre similarity
- drum-pattern similarity
- bass-timbre similarity
- bass-movement similarity
- melodic/instrument-palette similarity
- production-space similarity
- groove similarity
- mix compatibility, as a deliberately separate head

Initial supervision should come from explicit listening tasks:

- pair ratings
- ABX/triplet choices
- top-K accept/reject review
- component-specific judgments such as “closer drums” or “closer bass”

Saved-to-crate, preview duration, skips, and Q interactions can become secondary signals later, after the product has enough usage and their ambiguity is understood.

Start with an interpretable linear or pairwise-ranking model over frozen features. Compare it against the best single model and the manually weighted composite. Only consider a nonlinear MLP or end-to-end fine-tuning when the labeled set is large enough and cross-validation shows a repeatable gain.

Why this is more interesting than searching indefinitely for one public embedding:

1. **The target is product-specific.** Public models were not trained specifically on the DJ judgment “which record sounds like it belongs next to this one?”
2. **It can learn the distinction Crate Dig cares about.** The ranker can separate drum sound, bass character, instrumentation, production space, groove, and mix safety rather than averaging them invisibly.
3. **It converts feedback into measurable improvement.** Jeff's ABX choices can tune the shared model; a larger future dataset can support genre- or user-specific calibration.
4. **It remains explainable and controllable.** The system can retain component contributions and answer “same drums, darker melodic palette” rather than returning an opaque score.
5. **It creates proprietary product value.** The defensible asset becomes the DJ-oriented judgment data, feature ontology, evaluation set, and learned ranking behavior—not merely access to the same open model weights as everyone else.
6. **It is computationally realistic.** Expensive extractors can run once during analysis; the learned ranker can be small, fast, offline-capable, and inexpensive at query time.

The first shared Crate Dig ranker should learn a general DJ-oriented definition from the curated evaluation set. Personalization should be a later calibration layer with conservative defaults, minimum-feedback thresholds, and an easy reset path.

## 12. Explainability requirements

The product needs to explain why a recommendation is similar.

Do not show only:

> Similarity: 0.91

Show:

> Sonic match: 0.91  
> Same warm pad bed, low vocal presence, rolling percussion, similar low-mid bass weight, and dry drum mix.

For mixed cases:

> This will mix cleanly, but it does not sound very similar: same BPM/key range, but brighter synth lead, harder kick, and more peak-time compression.

Or:

> This lives in the same sound world, but the transition may need care: similar acoustic percussion and warm pads, but the key move is wide and the intro is short.

Q and the UI should expose reason codes such as:

- shared warm pads
- similar low vocal presence
- rolling percussion match
- similar low-mid bass weight
- dry drum mix
- compatible key
- BPM within target range
- darker but same groove
- more organic texture
- higher-energy bailout option

## 13. Database representation

The concepts below describe the complete long-term feature model. The first implementation should keep the physical schema smaller and use namespaced feature records rather than creating a dedicated table for every possible tag family.

Minimum useful MVP tables:

```txt
tracks
analysis_jobs
analysis_runs
track_features
track_embeddings
similarity_neighbors
user_tag_feedback
```

`track_embeddings` should hold whole-track, window, segment, and stem vectors through explicit scope/time/stem fields. `track_features` should hold namespaced scalar and calibrated tag outputs. The more specialized entities described later are logical views that may become physical tables only when query patterns justify them.

### 13.1 tracks

Core track identity and display metadata.

Example fields:

- `id`
- `library_id`
- `title`
- `artist`
- `album`
- `label`
- `genre`
- `duration_ms`
- `created_at`
- `updated_at`

### 13.2 Audio identity fields

Physical or stored audio-object metadata may live on `tracks` initially or move to `audio_files` if the product needs multiple encodings/locations per logical track.

Example fields:

- `id`
- `track_id`
- `storage_provider`
- `storage_key`
- `local_path`
- `file_hash`
- `chromaprint`
- `format`
- `bitrate`
- `sample_rate`
- `channels`
- `file_size_bytes`
- `is_preferred_duplicate`

### 13.3 analysis_jobs

Queued work units for local or cloud analysis.

Example fields:

- `id`
- `library_id`
- `track_id`
- `analysis_mode`
- `pipeline_version`
- `status`
- `priority`
- `attempt_count`
- `created_at`
- `started_at`
- `completed_at`
- `error_code`
- `error_message`

### 13.4 analysis_runs

Tracks pipeline execution and reproducibility.

Example fields:

- `id`
- `library_id`
- `pipeline_version`
- `status`
- `analysis_mode`
- `extractor_set`
- `started_at`
- `completed_at`
- `error_count`
- `warning_count`

### 13.5 track_features

Handcrafted feature summary for the whole track.

Example fields:

- `track_id`
- `analysis_run_id`
- `extractor_name`
- `extractor_version`
- `namespace`
- `feature_name`
- `value_number` or `value_text`
- `confidence`
- `scope`: `track`, `window`, `segment`, or `stem`
- `start_ms` and `end_ms`, when time-bounded
- `stem`, when stem-scoped

Example namespaced features include `mix.bpm`, `mix.camelot_key`, `physical.loudness_lufs`, `physical.spectral_centroid_hz`, `physical.onset_density`, `palette.warm_pad`, and `instrument.acoustic_guitar`.

### 13.6 track_embeddings

All vector embeddings. Whole-track vectors and time-bounded/stem vectors use the same record shape.

Example fields:

- `track_id`
- `analysis_run_id`
- `extractor_name`
- `extractor_version`
- `role`: `layout`, `retrieval`, `rhythm`, `timbre`, `palette`, or `explanation`
- `scope`: `track`, `window`, `segment`, or `stem`
- `start_ms`
- `end_ms`
- `stem`
- `embedding`
- `embedding_dim`
- `pooling_strategy`
- `window_plan_version`
- `content_hash`

Embedding families:

- `discogs_effnet`
- `muq`
- `mert`
- `clap`
- `merit_melody`
- `merit_rhythm`
- `merit_timbre`

### 13.7 Optional track_segments view/table

Time-bounded track sections/windows.

Example fields:

- `id`
- `track_id`
- `segment_type`
- `start_ms`
- `end_ms`
- `confidence`

Segment types:

- `intro`
- `main_groove`
- `breakdown`
- `outro`
- `window`

### 13.8 Segment embeddings

Segment embeddings should use the canonical `track_embeddings` record with `scope = segment` or `scope = window`. A separate table is optional and should not be required by the extractor interface.

Example fields:

- `segment_id`
- `track_id`
- `analysis_run_id`
- `model_name`
- `model_version`
- `embedding_family`
- `embedding`
- `embedding_dim`

### 13.9 Instrument tags

Model-derived instrumentation probabilities should begin as namespaced `track_features` rows. Promote them to a dedicated table only if product queries or annotation workflows require it.

Example fields:

- `track_id`
- `segment_id`
- `stem`
- `tag`
- `confidence`
- `model_name`
- `model_version`
- `source`

Examples:

- `acoustic_guitar`
- `electric_guitar`
- `piano`
- `rhodes`
- `voice`
- `drums`
- `drum_machine`
- `percussion`
- `synthesizer`
- `pad`
- `bass`

### 13.10 Sound-palette tags

Higher-level timbre/production tags should also begin as namespaced `track_features` rows.

Example fields:

- `track_id`
- `segment_id`
- `stem`
- `tag`
- `score`
- `source`
- `model_name`
- `model_version`

Examples:

- `warm`
- `bright`
- `dark`
- `organic`
- `synthetic`
- `dry`
- `reverbed`
- `raw`
- `polished`
- `sparse`
- `dense`
- `rolling`
- `atmospheric`
- `sub_heavy`
- `acid_like`

### 13.11 Stem features

Scalar and tag features for separated stems should use the canonical `track_features` shape with `scope = stem`.

Example fields:

- `track_id`
- `analysis_run_id`
- `stem`
- `stem_energy_ratio`
- `stem_loudness_lufs`
- `spectral_centroid`
- `onset_density`
- `transient_strength`
- `confidence`
- `model_name`
- `model_version`

### 13.12 Stem embeddings

Stem embeddings should use the canonical `track_embeddings` shape with `scope = stem`; comparisons must remain stem-to-same-stem.

Example fields:

- `track_id`
- `analysis_run_id`
- `stem`
- `model_name`
- `model_version`
- `embedding_family`
- `embedding`
- `embedding_dim`
- `confidence`

### 13.13 similarity_neighbors

Precomputed top-K neighbors for fast UI retrieval.

Example fields:

- `track_id`
- `neighbor_track_id`
- `similarity_type`
- `score`
- `rank`
- `model_version`
- `pipeline_version`

Similarity types:

- `sonic`
- `mix_compatibility`
- `rhythm`
- `instrumentation`
- `timbre`
- `segment_intro_outro`
- `stem_drums`
- `stem_bass`

### 13.14 Similarity explanations

Generate human-readable reason codes from stored component deltas first. Do not create a dedicated explanations table until explanations need durable editorial review, caching, or user feedback.

Example fields:

- `track_id`
- `neighbor_track_id`
- `reason_code`
- `reason_text`
- `weight`
- `confidence`

Examples:

- `shared_warm_pads`
- `low_vocal_presence`
- `rolling_percussion`
- `similar_low_mid_weight`
- `dry_drum_mix`
- `compatible_key`
- `bpm_close`
- `darker_same_groove`
- `similar_bass_weight`
- `similar_drum_texture`

### 13.15 user_tag_feedback

Human-in-the-loop corrections.

Example fields:

- `track_id`
- `user_id`
- `tag`
- `feedback_type`
- `value`
- `created_at`

Examples:

- not acoustic guitar
- more organic
- too peak-time
- good bailout
- works at sunset
- bad transition
- sure-fire track

## 14. Versioning requirements

Every model-derived feature should include:

- `analysis_pipeline_version`
- `extractor_name`
- `extractor_version`
- `feature_schema_version`
- `window_plan_version`
- `confidence`
- `source`: model / heuristic / user / imported metadata
- `audio_content_hash`
- `track_id` as the library association, not the computation identity
- `segment_id`, if segment-level
- `stem`, if stem-level
- `time_range_start`
- `time_range_end`

Every stem-derived feature must additionally be traceable to:

- `separator_name`
- `separator_version`
- `separator_weights_sha256`
- `separator_parameters_hash`
- per-stem confidence

This allows Crate Dig to re-run analysis safely when the feature pipeline improves.

Cache independently per extractor. The canonical cache key is:

- audio content hash
- extractor name
- extractor version
- window-plan version
- relevant extractor configuration or prompt-bank version

Do not key expensive feature computation on `track_id`: the same audio imported into two libraries should reuse the same analysis. Do not use one pipeline-wide model version that invalidates every extractor when only one model changes.

Map coordinates require a separate `projection_version` tied to a persisted standardizer/PCA/UMAP artifact.

## 15. Implementation phases

### Phase 0: Analysis harness and model bake-off infrastructure

Goal:

Make model comparisons cheap, reproducible, and visible before committing the product to a default embedding.

Build:

- `DecodedAudio` with decode-once, deterministic resampling
- versioned `WindowPlan`
- extractor protocol and `FeatureBundle`
- `StemSeparator` protocol and versioned `StemBundle`
- asynchronous analysis-stage state machine that distinguishes imported/usable from analysis-complete
- per-extractor content-addressed caching
- content-addressed separator caching and stem-dependent invalidation
- window-level embedding storage without forced pooling
- explicit embedding roles, including exactly one selected `layout` role
- a neighbor-review UI or report that can compare top 10/top 25 results across extractors
- persisted, versioned map projections
- timing, memory, artifact-size, and estimated cloud-cost instrumentation
- compatibility shim for the current `AudioBackend` API while extractors are ported

Port the existing scalar/librosa and CLAP implementations first. Preserve terminal success/failure caching, location handling, version metadata, and injected-adapter patterns that already work.

### Phase 1: Fast baseline map

Goal:

Make the map useful for a 3,000-track web demo.

Build:

- duplicate detection
- BPM/key/loudness/duration
- waveform preview
- basic spectral/rhythm features
- Discogs-EffNet whole-track embedding
- broad instrumentation tags
- broad sound-palette tags
- pgvector nearest-neighbor search
- precomputed top-K neighbors per track
- explanation reasons from feature differences
- queued `htdemucs_ft` four-stem separation for every track
- separator provenance and per-stem quality diagnostics

Models/libraries to test first:

1. `ffmpeg` / `ffprobe`
2. `librosa`
3. `essentia`
4. Essentia Discogs-EffNet embeddings
5. Essentia/MTG-style instrument classifiers
6. CLAP-style audio-text embeddings
7. Chromaprint for duplicates

The Phase 1 decision is not “Discogs-EffNet forever.” It is the first useful baseline and one contestant in the formal layout/retrieval bake-off. Likewise, `htdemucs_ft` is the pinned first separator, not an assumption that it will remain best after downstream evaluation.

### Phase 2: Deep embedding backbone

Goal:

Upgrade the similarity backbone beyond the practical baseline.

Build:

- MuQ or MERT-family global embeddings
- CLAP music/music+speech palette probes
- model-versioned embedding storage
- multi-index candidate generation
- query-time weighted re-ranking
- validation harness against human DJ labels

Decision:

Benchmark Discogs-EffNet, MAEST, MuQ, and MERT-family embeddings on Jeff’s actual library. Evaluate MERIT as separate rhythm/timbre channels and compare LAION-CLAP with MuQ-MuLan for palette-language retrieval. Pick each channel default from DJ evaluation, not benchmark claims alone.

### Phase 3: Segment intelligence

Goal:

Make Crate Dig more DJ-native.

Build:

- segment-level embeddings
- intro/outro matching
- main-groove matching
- breakdown texture matching
- energy curve matching
- section detection

Enables:

- “Find tracks whose intro sounds like this outro.”
- “Find similar main grooves.”
- “Find a bridge record.”
- “Find a darker track with the same percussion feel.”

### Phase 4: Deep stem feature analysis

Goal:

Turn the mandatory four-stem bundle introduced earlier into reliable, source-conditioned retrieval and explanation evidence.

Build:

- required drum embedding, transient/spectral descriptors, rhythm representation, and calibrated language probes
- required bass embedding, sub/harmonic measurements, and envelope/rhythm descriptors
- required vocal presence and treatment descriptors; embedding remains evaluation-gated
- required `other` instrument probabilities and texture/space descriptors; embedding remains evaluation-gated
- kick/percussion character tags
- synth/pad/bass texture tags
- confidence-aware ranking and explanation suppression
- DAC continuous-latent experiments on drums, bass, and other/instrument stems
- HT-Demucs `htdemucs_ft` versus MelBand/BS-RoFormer comparison on difficult representative tracks
- PaSST/PANNs or OpenMIC instrument-presence experiments

Potential tags:

- electronic kick
- acoustic-kit feel
- drum-machine feel
- rolling percussion
- acid-like bass
- analog-pad texture
- organic texture
- dry drum mix
- sub-heavy bass

Stem feature analysis is required for the completed-analysis state. It must not block import, playback, or provisional fast-mode discovery.

### Phase 5: Human-in-the-loop learning

Goal:

Make the engine adapt to real DJ taste.

Build:

- user correction UI
- tag acceptance/rejection
- “works / does not work” feedback
- saved-to-crate signals
- preview engagement signals
- bailout / anchor / section labels
- blind pair, triplet, and top-K similarity judgments
- component judgments for drums, bass, melodic palette, groove, and production space
- versioned Crate Dig ranking-head training and offline evaluation
- explicit comparison against the best single embedding and manual weighted baseline

Examples:

- “not acoustic guitar”
- “more organic”
- “too peak-time”
- “good bailout”
- “works at sunset”
- “bad transition”
- “sure-fire track”

Human corrections may outperform generic pretrained models for DJ taste.

The first learned model should use frozen extractor outputs and an interpretable linear or pairwise-ranking head. Do not begin by fine-tuning every audio encoder. Earn additional model complexity through held-out evaluation.

## 16. Validation plan

Validate sonic similarity like a DJ, not only like an academic benchmark.

### 16.1 Gold set

Create a 300–500-track evaluation corpus representing the actual target library: melodic house, progressive, organic, techno, ambient edges, vocals/non-vocals, acoustic/electronic palettes, and both sparse and dense production.

Within that corpus, create a human-labeled gold set:

- 50 anchor tracks from Jeff’s library
- For each anchor:
  - 5 same-sonic-world positives
  - 5 compatible-but-not-sonically-similar tracks
  - 5 not-similar tracks
  - 2–3 unexpected-but-good matches

### 16.2 Evaluation tasks

Run:

- pair rating: “Do these live in the same sonic world?”
- triplet test: “Is A closer to B or C?”
- top-k retrieval review: “How many of the top 10 feel sonically similar?”
- blind listening: hide metadata/artists and judge by ear
- Q explanation review: “Does the reason match what you hear?”
- set-prep usefulness review: “Would you actually audition this?”

Metadata must be hidden during the primary sonic judgment. Artist, label, release, genre, BPM, and key can otherwise make a style embedding appear more perceptually accurate than it is.

### 16.3 Candidate matrix

Evaluate models by job rather than asking for one overall winner.

| Decision | First-pass candidates | What wins |
|---|---|---|
| Map/layout vector | Discogs-EffNet, MAEST, MuQ, MERT | Stable neighborhoods, perceptual coherence, useful global map, reproducible projection |
| Primary sonic retrieval | Discogs-EffNet, MAEST, MuQ, MERT | Best blind top-K and triplet performance for “same sound world” |
| Groove factor | MERIT rhythm, rhythm-oriented scalar baseline | Independent improvement on groove queries without collapsing into BPM |
| Timbre factor | MERIT timbre, selected SSL layers, physical scalar baseline | Independent improvement on sound-palette judgments |
| Palette/Q language | LAION-CLAP prompt bank, MuQ-MuLan | Human-readable tags that listeners accept and that improve text-to-audio retrieval |
| Stem similarity | Demucs on a 50–100-track subset plus the leading global/palette encoder | Measurable improvement in drum, bass, melodic-instrument, and vocal retrieval that justifies artifacts and runtime |
| Fine acoustic/timbre evidence | DAC continuous latents on mixdown and same-stem pairs; EnCodec only as a follow-up | Independent lift on blind drum, bass, melodic-timbre, or production judgments after controlling for loudness/pitch |
| Instrument presence | PaSST/PANNs AudioSet, OpenMIC head, Essentia/MTG classifiers | Accurate broad-family evidence that improves filters/explanations without dominating sonic distance |
| Separation backbone | Demucs versus MelBand/BS-RoFormer on representative difficult tracks | Cleaner source-conditioned evidence and better downstream retrieval, balanced against runtime and artifacts |
| Learned similarity | Linear/pairwise Crate Dig ranker over frozen channels; manual weighted composite baseline | Held-out top-K and triplet gains with stable, explainable component contributions |
| Physical explanation | Librosa/Essentia scalars | Stable, calibrated, audible differences suitable for explanations |

For dense encoders, record both whole-track pooled and window-level output. Evaluate pooling strategies separately rather than letting each model’s convenience wrapper silently define the product.

### 16.4 Metrics

Track:

- Precision@10
- nDCG@10
- triplet accuracy
- mean reciprocal rank
- cluster purity by human labels
- explanation acceptance rate
- saved-to-crate rate
- preview >20 seconds rate
- manual correction rate
- map neighborhood stability across projection runs
- inference time per track
- peak memory and accelerator requirements
- stored bytes per analyzed track
- estimated local battery/thermal cost and cloud cost per 1,000 tracks

### 16.5 Decision gates

A candidate becomes the default for a channel only when it:

1. beats the existing baseline on blind human retrieval metrics;
2. adds value that is not already explained by BPM, key, artist, label, or genre metadata;
3. behaves consistently across the target house/techno subgenres;
4. has acceptable runtime, memory, licensing, and deployment characteristics; and
5. produces a versioned, reproducible output that can run in both the chosen cloud tier and the planned Mac desktop tier.

Do not ship a weighted grand formula merely because all components exist. First establish the strongest candidate-generation vector, then demonstrate the incremental lift of each re-ranking channel through ablation tests.

### 16.6 Regression tests

Create a small regression set with:

- same-artist / same-EP smoke tests
- same-BPM but different-sound-world contrast pairs
- same-sound-world but different-BPM contrast pairs
- tracks with misleading metadata
- duplicates in different encodings
- vocal/non-vocal near misses
- organic/electronic contrast pairs

The human evaluation matters most. If the top result is technically close but a DJ says “different world,” the model is wrong for the product.

## 17. What to expose vs keep internal

### 17.1 Safe to expose

Expose confidently when confidence is high:

- “likely acoustic guitar”
- “low vocal presence”
- “drum-machine feel”
- “warm pad texture”
- “similar low-end weight”
- “shared rolling percussion”
- “brighter”
- “darker”
- “more organic”
- “more synthetic”
- “dry”
- “spacious”
- “sparse”
- “dense”

### 17.2 Expose cautiously

Use softer language:

- “909-like transient”
- “acid-like bass”
- “analog-pad texture”
- “acoustic-kit feel”
- “Juno-like pad”

### 17.3 Keep internal until validated

Avoid confident early claims like:

- “this is a 909 kick”
- “this contains a Juno-106”
- “this is a Moog bass”
- “this is a LinnDrum”
- “this is definitely acoustic kick”

Specific synths, drum machines, and instruments are difficult to identify reliably from mastered tracks without custom labeled data and validation.

## 18. Product examples

### 18.1 High sonic similarity, medium mix compatibility

```txt
Sonic similarity: 0.91
- same warm pad bed
- low vocal presence
- rolling percussion
- similar low-mid bass weight
- dry drum mix

Mix compatibility: 0.68
- similar tempo
- key move is risky
- intro is short
```

Product copy:

> This lives in the same sound world, but the transition may need care.

### 18.2 High mix compatibility, low sonic similarity

```txt
Sonic similarity: 0.42
- brighter synth lead
- harder kick
- more vocal-forward
- more peak-time compression

Mix compatibility: 0.88
- same BPM range
- compatible key
- clean intro/outro structure
```

Product copy:

> This will mix cleanly, but it does not live in the same sound world.

### 18.3 High sonic similarity and high mix compatibility

```txt
Sonic similarity: 0.93
- same drum-machine feel
- warm pads
- similar bass weight
- low vocal presence

Mix compatibility: 0.90
- BPM within 2
- compatible key
- aligned intro/outro energy
```

Product copy:

> Strong candidate. Similar sound palette and a clean transition path.

## 19. Relationship to other products

### 19.1 Shazam / Pixel Now Playing

These systems solve exact song recognition.

They are useful references for:

- acoustic fingerprinting
- duplicate detection
- catalog matching

They do not solve:

- same sonic world retrieval
- instrumentation similarity
- DJ sound-palette discovery
- transition explanation

### 19.2 Spotify

Spotify likely combines:

- user behavior
- playlists
- metadata
- catalog embeddings
- graph relationships
- ranking models
- audio features
- LLM interpretation

Crate Dig will not have Spotify-scale behavior data. It needs stronger audio understanding per local library.

### 19.3 Suno

Suno solves music generation.

Its audio understanding and text/audio representations are interesting, but Crate Dig is not trying to generate music. Crate Dig is trying to retrieve and explain similar existing tracks.

### 19.4 Djoid

Djoid validates the DJ-prep category, but Crate Dig’s wedge should be more specific:

> Find records in your own library that live in the same sonic world — then explain why.

### 19.5 DigDeeper.fm

DigDeeper.fm validates the public-catalog “find similar tracks by sound” use case.

Crate Dig should learn from that methodology:

- rhythm matters
- bass matters
- texture matters
- atmosphere matters
- drum patterns matter
- harmonic texture matters
- vector similarity is the right retrieval frame

But Crate Dig should differentiate on:

- personal/local library intelligence
- privacy-first analysis
- Mac desktop offline mode
- set-prep workflow
- anchor tracks
- intro/build/peak/end sections
- bailout records
- Rekordbox-oriented export
- Q as a contextual DJ assistant
- explainable similarity, not just a nearest-neighbor list

## 20. Deployment implications

### 20.1 Web demo

Use:

- R2 for hosted audio/artifacts
- Cloud Run Jobs for batch analysis
- Cloud Run API for Python backend
- Supabase Postgres/pgvector for metadata and vectors
- Vercel for Next.js frontend

The web demo can run deep analysis as a batch job when the library changes. It does not need to analyze tracks during every user interaction.

### 20.2 Mac desktop app

Use:

- Electron or equivalent desktop shell
- React/TypeScript UI reuse
- Python sidecar for analysis
- local SQLite
- local vector index
- local file access
- optional Apple Silicon acceleration through PyTorch MPS or ONNX/Core ML paths

Desktop deep analysis should be offline-capable. The user’s files should not leave the machine unless they explicitly choose cloud sync or cloud analysis.

## 21. Open technical questions

These need empirical testing:

- Does MuQ beat Discogs-EffNet on Jeff’s actual “same sonic world” judgments?
- Does MAEST improve either map coherence or blind sonic retrieval enough to earn a channel role?
- Does MERIT rhythm/timbre remain stable on mastered house/techno tracks?
- Does LAION-CLAP or MuQ-MuLan best match the controlled DJ vocabulary and text-to-audio retrieval task?
- Which stem-conditioned channels improve top-10 retrieval after accounting for their compute cost?
- Is `htdemucs_ft` reliable enough on dense club masters, or do bass/drum outcomes justify a pinned RoFormer alternative?
- Which single versioned representation should own the explicit `layout` role: Discogs-EffNet, MAEST, MuQ, MERT, or a validated composite?
- What is the right default weighting for melodic house/progressive/organic/techno libraries?
- How should user feedback update ranking without pretending to fine-tune large models immediately?
- Do DAC continuous latents contribute useful fine-timbre evidence beyond selected MuQ/MERT/MAEST layers?
- Which instrument-presence model is accurate enough on mastered electronic music to support product explanations?
- Does a small learned Crate Dig ranker outperform both the best individual encoder and a manually weighted composite on held-out DJ judgments?

## 22. Reference links

Primary/current references to keep close during implementation:

- [Essentia models](https://essentia.upf.edu/models.html)
- [LAION-CLAP](https://github.com/LAION-AI/CLAP)
- [MuQ / MuQ-MuLan](https://github.com/tencent-ailab/muq)
- [MERIT model card](https://huggingface.co/amaai-lab/merit)
- [MERIT paper page](https://huggingface.co/papers/2605.27346)
- [Demucs](https://github.com/facebookresearch/demucs)
- [Descript Audio Codec](https://github.com/descriptinc/descript-audio-codec)
- [EnCodec](https://github.com/facebookresearch/encodec)
- [OpenMIC-2018](https://github.com/cosmir/openmic-2018)
- [PANNs](https://github.com/qiuqiangkong/audioset_tagging_cnn)
- [MAEST](https://github.com/palonso/MAEST)
- [BS-RoFormer / MelBand-RoFormer](https://github.com/asriverwang/BS-RoFormer)
- [Interpretable and Perceptually-Aligned Music Similarity with Pretrained Embeddings](https://arxiv.org/abs/2601.19109)
- [Music Similarity Representation Learning Focusing on Individual Instruments](https://arxiv.org/abs/2503.18486)
- [pgvector](https://github.com/pgvector/pgvector)

## 23. Final recommendation

Build Crate Dig around a deep, multi-layer sonic fingerprint and select its components through a repeatable, human-labeled model bake-off.

The best practical path is:

```txt
Chromaprint
+ Essentia/librosa scalars
+ best validated global/layout embedding from Discogs-EffNet, MAEST, MuQ, or MERT
+ best validated palette model from LAION-CLAP or MuQ-MuLan
+ MERIT rhythm/timbre factors
+ segment embeddings
+ mandatory versioned four-stem decomposition for completed analysis
+ required drum and bass embeddings plus source-specific physical descriptors
+ vocal-treatment and other/instrument evidence, with their embeddings gated by measured retrieval lift
+ DAC/neural-codec stem features if they add independent fine-timbre signal
+ instrument-presence evidence from the best validated classifier
+ human DJ judgments
+ a small, versioned Crate Dig ranking model over frozen feature channels
= explainable sonic retrieval
```

The immediate engineering priority is the analysis harness: decode once, retain window-level evidence, cache each extractor by audio content and extractor version, produce a versioned asynchronous `StemBundle`, assign exactly one explicit layout vector, and freeze/version the map projection. Then use the 300–500-track corpus and 50-anchor gold set to decide which models earn each channel role and whether `htdemucs_ft` remains the separator default.

The first product-quality answer should look like:

```txt
Sonic similarity: high
Mix compatibility: medium
Why: warm pads, low vocal presence, rolling percussion, similar low-mid weight, dry drum mix.
```

That is meaningfully different from Shazam, Spotify, Suno, Djoid, and DigDeeper.

Crate Dig’s core engine should answer:

> Which record should I try next because it actually sounds like it belongs here?
