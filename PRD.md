# Crate Dig PRD

Status: Draft  
Last updated: 2026-08-20  
Product name: Crate Dig  
Tagline: Find the next record.

## 1. Summary

Crate Dig is a music-library intelligence tool for DJs and serious music collectors. It helps users import a local or cloud music library, analyze tracks, cluster songs by musical similarity and vibe, explore the collection visually, audition tracks, and build crates/playlists for specific set moments.

The product should start as a web demo and evolve into a Mac desktop app for serious local-library use.

The core promise is simple:

> Find the next record.

## 2. Target users

Primary users:

- DJs with large local music libraries.
- Electronic music collectors.
- People building crates/playlists for lounges, parties, radio shows, warm-up sets, peak-time sets, afterhours sets, and other specific listening contexts.

User needs:

- Understand a large library by vibe, energy, key, BPM, texture, and similarity.
- Find tracks that go well together.
- Find overlooked tracks hiding in the library.
- Build crates around moments, not just genres.
- Audition quickly without opening heavyweight DJ software.
- Eventually run analysis locally and privately on macOS.

## 3. Product principles

- Make the music library feel spatial and explorable.
- Organize around moments and intent, not only metadata.
- Make playback central.
- Make the map explainable, not decorative.
- Make AI feel native to crate digging, not bolted on as a generic chatbot.
- Keep the interface more minimal and polished than Rekordbox while retaining professional depth.
- For desktop, preserve user trust by keeping local music local unless they explicitly choose cloud upload/sync.

## 4. Product surfaces

### 4.1 Web app demo

Purpose:

- Show the core Crate Dig experience online.
- Allow upload/import of a demo library.
- Run batch analysis in the cloud.
- Present analyzed tracks in an interactive map.
- Support search, playback, filtering, similarity discovery, Q assistant, and crate building.

### 4.2 Mac desktop app

Purpose:

- Make Crate Dig useful for real DJs with local libraries.
- Analyze local folders without uploading full audio by default.
- Support offline analysis and playback.
- Provide a native-feeling desktop workflow around local files, imports, crates, and model settings.

## 5. Core flows

### 5.1 Landing page

Requirements:

- Explain Crate Dig in one screen.
- Use the tagline: “Find the next record.”
- Show an abstract music-map visual.
- Explain the loop: upload/import → analyze → explore clusters → ask Q → build crate.
- Position both web and Mac desktop:
  - Web: demo/shareable/cloud analysis.
  - Mac: local/offline/professional library workflow.

### 5.2 Authentication

Requirements:

- Support Google SSO.
- Support email/password auth.
- Require a valid access code before a new user can enter the product.
- Provide sign up, login, password reset, and logout.
- Include privacy reassurance around music files.

Implementation decision:

- Use a Google Cloud Project to configure OAuth consent screen and Google OAuth client credentials.
- Use Supabase Auth for MVP to manage Google SSO and email/password sessions.
- Store user/account metadata in Supabase Postgres.
- Implement access-code gating at the application layer with an `access_codes` table.

Access-code flow:

- User enters an access code before sign-up.
- Server validates the code against Supabase Postgres.
- If valid, the user can continue with Google SSO or email/password sign-up.
- The access code is marked redeemed and associated with the created user.

Auth alternatives considered:

- Auth.js/NextAuth provides more custom Next.js-owned auth logic, but email/password requires more custom password/reset/rate-limit work and adds plumbing against Supabase.
- Clerk provides excellent hosted auth UX and invite/team flows, but is not necessary for the MVP.
- Supabase Auth is the best MVP fit because the product already uses Supabase Postgres/pgvector and will benefit from straightforward database/RLS integration.

### 5.3 Import / upload

Requirements:

- Web users can upload files or folders for the demo.
- Desktop users can select local folders/files.
- Supported file types:
  - MP3
  - WAV
  - AIFF
  - FLAC
  - M4A
- Optional import support:
  - Rekordbox XML export
  - Playlist metadata
- Detect unsupported files, duplicate tracks, missing metadata, and failed imports.

Implementation decision:

- Web uploads should go directly to object storage using signed upload URLs. The frontend should not proxy audio through Vercel Functions.
- Desktop imports should keep file paths local and avoid uploading original audio unless the user explicitly enables cloud mode.
- Web demo playback should support full-track playback from private R2-hosted audio using signed/access-controlled playback URLs.
- YouTube/YouTube Music may be explored later as an external reference/embed layer, but should not be the primary playback or storage system.

### 5.4 Analysis

Requirements:

- Analyze tracks before they appear in the main map.
- Show progress by stage:
  - Reading metadata
  - Decoding audio
  - Extracting BPM/key/loudness
  - Generating audio features
  - Generating embeddings
  - Clustering by similarity
  - Creating waveform/previews
- Support resumable and incremental analysis.
- Avoid reprocessing unchanged tracks.
- Track analysis status, errors, model versions, and feature pipeline versions.

Implementation decision:

- Run cloud analysis through Google Cloud Run Jobs.
- Run the backend API through Cloud Run using Python/FastAPI.
- Use batch jobs because analysis is occasional: primarily when the demo library changes, when new tracks are added, or when the feature/model pipeline changes.
- Support two analysis modes:
  - Fast analysis: metadata, BPM, key, loudness, duration, waveform, classical audio features, basic clustering.
  - Deep analysis: embeddings, semantic/vibe tagging, CLAP or related audio-language model, richer similarity search.
- Do not make CLAP/PyTorch mandatory before the basic product loop works. Benchmark deep analysis separately and make it selectable per analysis run.

Analysis cache key should include:

- Audio file hash.
- Analysis pipeline version.
- Model version.
- Feature schema version.

### 5.5 Main discovery map

Requirements:

- Display analyzed tracks in a large interactive 2D map.
- Web MVP should comfortably support 3,000 analyzed tracks.
- Support coloring by:
  - Cluster
  - Mood
  - Energy
  - Genre
  - Key
  - Moment
  - Similarity to selected seed
- Support filters:
  - BPM range
  - Key / Camelot key
  - Genre
  - Label
  - Mood
  - Energy
  - Texture
  - Date added
- Support seed search:
  - Select one or more tracks.
  - Find similar tracks.
  - Re-rank by similarity within the filtered pool.
- Support playback from the map and track list.
- Support saving tracks into crates/playlists.

Implementation decision:

- Use Deck.gl with `OrthographicView` for the MVP map.
- Render track embeddings as a non-geographic WebGL scatterplot.
- Use Deck.gl layers for base points, selected/playing highlights, hover/picking, and cluster glow approximations.
- Use React/DOM overlays for controls, cards, legends, Q, track details, and side panels.
- Use D3 only for supporting utilities such as scales/legends if useful.
- Revisit PixiJS or custom WebGL only if the map needs more expressive shader/bloom effects than Deck.gl can reasonably provide.

### 5.6 Q assistant

Q is the AI assistant inside Crate Dig.

Requirements:

- Q should live as a right-side panel or collapsible sidecar.
- Q should understand current context:
  - selected track
  - selected cluster
  - active filters
  - active crate
  - current playback track
- Q should return actionable results, not generic chat.
- Q v1 should behave as a context-aware retrieval/action assistant, not a fully open-ended chat companion.
- Q should turn natural language into structured searches, filters, similarity queries, crate suggestions, and map actions.

Example requests:

- “Find me warm, percussive tracks around 122 BPM.”
- “What sounds similar to this track but darker?”
- “Build a 45-minute sunset lounge crate.”
- “Give me three transition options out of this song.”
- “Show me overlooked tracks in this cluster.”
- “What would work after this if I want to raise energy?”

Example actions:

- Preview all.
- Add these to crate.
- Show on map.
- Explain this cluster.
- Find darker.
- More percussive.
- Lower energy.

Expected Q response types:

- Track recommendation card.
- Mini crate card.
- Transition suggestion card.
- Cluster explanation card.
- Filter proposal card.
- Map action card.

Naming decision:

- The assistant is named “Q.”
- “Q” references both a DJ cue button and a clever technical aide.
- The product should not become spy-themed. The reference should remain subtle.

### 5.7 Track detail

Requirements:

- Open a drawer/panel from a map point or track row.
- Show:
  - title
  - artist
  - BPM
  - key
  - genre
  - label
  - waveform
  - energy / mood / texture tags
  - similar tracks
  - neighboring cluster
  - “works well with” suggestions
- Actions:
  - play
  - add to crate
  - find similar
  - ask Q
  - edit tags
  - hide from recommendations

### 5.8 Crates / playlists

Requirements:

- Save groups of tracks into crates.
- Show crate metadata:
  - total tracks
  - total runtime
  - BPM range
  - key compatibility hints
  - energy arc
  - notes / set intention
- Export options:
  - CSV
  - M3U playlist export
  - Rekordbox-compatible XML playlist export
  - shareable web preview

## 6. Technical architecture

### 6.1 High-level architecture

```txt
Vercel
  Next.js / TypeScript web app
  Lightweight API routes for frontend-adjacent glue

Supabase
  Postgres database
  pgvector embeddings
  Auth provider

Cloudflare R2
  Original uploaded audio for web demo
  Derived previews
  Waveform artifacts
  Analysis artifacts if needed

Google Cloud Run
  Python FastAPI backend
  Analysis control plane

Google Cloud Run Jobs
  Batch audio analysis
  Embedding generation
  Clustering
  Waveform/preview generation

Mac Desktop App
  React/TypeScript UI shell
  Local SQLite database
  Bundled Python analysis sidecar
  Local playback and local file access
```

### 6.2 Frontend

Decision:

- Use Next.js + TypeScript + React for the web app.
- Deploy the web frontend on Vercel.
- Reuse as much of the React UI as possible in the desktop app.

Expected libraries:

- Next.js App Router.
- React.
- TypeScript.
- Tailwind CSS.
- Radix UI or shadcn/ui for accessible primitives.
- TanStack Query or SWR for data fetching.
- Zustand or Jotai for local UI state.
- Deck.gl for the music map.

### 6.3 Backend

Decision:

- Use Python for the backend and analysis pipeline.
- Use FastAPI for the web API.
- Deploy the backend service on Google Cloud Run.
- Deploy long-running or batch analysis as Google Cloud Run Jobs.

Why:

- Python is the right ecosystem for audio analysis and ML.
- Cloud Run containers can package ffmpeg, librosa, PyTorch, CLAP, Essentia, and native dependencies more cleanly than lightweight serverless functions.
- Cloud Run Jobs match the batch nature of library analysis.

### 6.4 Database

Decision:

- Use Supabase Postgres for the web app database.
- Use pgvector for embeddings and similarity search.

Data categories:

- users
- libraries
- tracks
- artists
- albums
- audio files / storage objects
- analysis runs
- feature vectors
- embeddings
- clusters
- vibe tags
- crates
- crate tracks
- Q conversations / actions

Desktop decision:

- Use SQLite locally for the Mac app.
- Consider syncing metadata to Supabase later.
- Do not require internet for local analysis once dependencies/models are installed.
- Desktop library size is user-defined, but engineering should test:
  - 10,000 tracks as the comfortable v1 target.
  - 50,000 tracks as a stretch target.
  - 100,000 metadata rows as a stress target, not necessarily 100,000 fully analyzed audio files.

### 6.5 Storage

Decision:

- Use Cloudflare R2 for web-demo audio storage and generated artifacts.
- Store lossless files as FLAC where possible.
- Avoid sending audio bytes through Vercel.

Stored objects:

- uploaded source files
- normalized previews
- waveform data
- analysis artifacts
- optional thumbnails/artwork

### 6.6 Authentication

Decision:

- Use Google OAuth configured through a Google Cloud Project.
- Use Supabase Auth to manage Google SSO and email/password sessions for MVP.
- Require an application-level access code before account creation/access.

Required auth flows:

- Google SSO.
- Email/password sign-up.
- Email/password login.
- Password reset.
- Access-code validation.
- Logout.

### 6.7 Desktop app

Decision:

- Build a Mac desktop app after the web demo proves the product loop.
- Prefer Electron for the first desktop version if the priority is speed, React reuse, and mature process management.
- Keep Tauri as an alternative if app size, memory footprint, and native feel become higher priorities.

Desktop architecture:

```txt
Electron shell
  React / TypeScript UI
  Local file permissions
  Local playback integration

Python sidecar
  Audio analysis pipeline
  ffmpeg
  librosa
  ML models

SQLite
  Local library metadata
  Local analysis cache
  Local crates
```

Packaging requirements:

- Bundle Python runtime or packaged Python executable.
- Bundle ffmpeg/ffprobe.
- Bundle required model files or provide a managed first-run download.
- Support offline operation after setup.
- Code-sign and notarize the macOS app.
- Provide clear privacy messaging about local files.

### 6.8 Audio analysis libraries

Likely Python stack:

- librosa
- numpy
- scipy
- pandas
- scikit-learn
- soundfile
- audioread or ffmpeg-backed decoding
- pyloudnorm
- ffmpeg / ffprobe
- umap-learn
- hdbscan
- transformers / PyTorch for CLAP or related audio-language embeddings
- optional Essentia for deeper audio features

Analysis outputs:

- BPM
- key / Camelot key
- loudness
- energy
- spectral features
- chroma features
- timbral features
- embeddings
- similarity neighborhoods
- clusters
- mood / texture / energy tags
- waveform preview data

## 7. Serverless/backend decision

Crate Dig should use serverless where it matches the workload:

- Vercel Functions are appropriate for lightweight frontend-adjacent APIs.
- Cloud Run services are appropriate for Python APIs with heavier dependencies.
- Cloud Run Jobs are appropriate for occasional batch analysis.

Vercel should not proxy large audio files or run heavy analysis jobs.

## 8. Privacy and security requirements

Requirements:

- Music uploads must be private by default.
- Web demo uploads should use signed URLs.
- Desktop should keep files local by default.
- Users should understand when files are local vs. uploaded.
- Credentials must be stored in environment variables/secrets, not committed.
- Audio storage should not be publicly listable.
- Playback URLs should be signed or otherwise access-controlled.

## 9. MVP scope

### Web MVP

- Landing page.
- Google SSO and email/password login.
- Access-code gated sign-up.
- Upload/import flow.
- Cloud batch analysis trigger.
- Analysis status page.
- Main map view.
- Track playback.
- Basic filters.
- Seed similarity search.
- Save crate.
- Q assistant panel with constrained, actionable recommendations.
- 3,000-track target library.
- Full-track playback from R2-hosted private audio.

### Desktop MVP

- Select local folder.
- Scan local library.
- Analyze locally.
- Explore map.
- Play local tracks.
- Filter/search/find similar.
- Save local crates.
- Basic Q assistant using local metadata/features where possible.

## 10. Rekordbox interoperability

Crate Dig should support Rekordbox interoperability without pretending to replace Rekordbox in v1.

### 10.1 Import

MVP import should support Rekordbox XML export files and extract:

- Track metadata.
- Playlist folders/playlists.
- File locations.
- BPM/key/genre/comments/rating when present.

Later import support may include:

- Cue points.
- Memory cues.
- Hot cues.
- Beatgrid data.
- Color tags.
- My Tags.

### 10.2 Export

MVP export should support:

- Rekordbox-compatible XML playlist export.
- M3U playlist export.
- CSV export.

The app should not directly mutate Rekordbox’s internal database in MVP.

## 11. Non-goals for the first version

- Full Rekordbox replacement.
- Beatgrid editing.
- Live DJ performance/deck controls.
- Real-time stem separation.
- Collaborative multiplayer crates.
- Mobile app.
- Public music hosting platform.
- Marketplace or social network.

## 12. Resolved decisions

- Web demo playback: full-track playback from private R2-hosted audio. YouTube/YouTube Music is optional later as an external reference/embed layer, not core storage/playback.
- Web target library size: 3,000 tracks.
- Desktop target library size: user-defined, with engineering tests for 10k comfortable, 50k stretch, and 100k metadata-row stress scenarios.
- Q: context-aware retrieval/action assistant with typed recommendation/action cards.
- Cloud analysis: Cloud Run Jobs with fast/deep analysis tiers; CLAP/deep embeddings should be benchmarked before becoming mandatory.
- Auth: Supabase Auth for MVP with Google SSO, email/password, and application-level access-code gating.
- Visualization: Deck.gl with OrthographicView for the product map; React/DOM overlays for UI.
- Rekordbox: spec import/export separately; MVP import Rekordbox XML, MVP export Rekordbox-compatible XML plus M3U and CSV.

## 13. Open questions

- What is the exact Q v1 system design: prompt contract, tools/functions, retrieval boundaries, response schemas, and evaluation criteria?
- Which deep-analysis model stack should be used first: CLAP, Essentia models, MERT-style embeddings, or a staged combination?
- What is the exact Rekordbox XML subset required for MVP export compatibility?
- Should the web demo store original lossless files, FLAC-normalized copies, browser-friendly preview derivatives, or all three?
- What is the minimum useful desktop offline model bundle size?

## 14. Related docs

- [Design prompt](./design.md)
