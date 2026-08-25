# Localhost App Spec

Status: Draft  
Last updated: 2026-08-20  
Goal: Build a useful local Crate Dig web app immediately for music stored on this machine.

## 1. Why this exists

The cloud/web architecture is still the right product direction, but a local-hosted app is the fastest way to make Crate Dig useful now:

- The user already has music stored locally.
- The extracted `cratedig_engine` can analyze local file paths.
- Localhost de-risks the future Mac desktop app.
- We can validate import → analyze → map → play → crate without waiting for R2/Cloud Run/Vercel.

This is not a throwaway. It should become the development bridge to the Mac desktop app.

## 2. Product goal

Run Crate Dig locally at:

```txt
http://localhost:3000
```

with a local API at:

```txt
http://localhost:8000
```

The user should be able to:

1. Select/import local music files or a Rekordbox XML export.
2. Analyze the local library with `cratedig_engine`.
3. See analysis progress.
4. Explore tracks on a Deck.gl similarity map.
5. Search/filter/find similar tracks.
6. Play local audio files in the browser.
7. Save local crates.

## 3. Recommended local architecture

Use a local-first stack:

```txt
apps/web
  Next.js + TypeScript
  Deck.gl map
  React UI
  talks to localhost FastAPI

apps/local-api
  FastAPI
  SQLite
  cratedig_engine
  local file playback endpoints
  background analysis worker

packages/engine
  cratedig_engine
  audio analysis
  import/export
  clustering
```

Do not require Supabase, Cloud Run, R2, Google OAuth, or Vercel for the localhost MVP.

Cloud services can remain configured for the later hosted web demo. Localhost should work offline except for optional model downloads.

## 4. Why FastAPI + SQLite for localhost

Use FastAPI because:

- The eventual backend is Python/FastAPI.
- It can call `cratedig_engine` directly.
- It can serve local audio with Range requests.
- It maps well to the future Cloud Run backend.

Use SQLite because:

- It is local, simple, and desktop-compatible.
- It avoids requiring Supabase for local music.
- It mirrors the future Mac desktop storage model.
- It is enough for 3k–50k track metadata rows.

## 5. Local data storage

Default local app data directory:

```txt
~/.crate-dig/
```

Suggested contents:

```txt
~/.crate-dig/
  crate-dig.sqlite
  audio_cache.jsonl
  models/
  artifacts/
    waveforms/
    previews/
```

The app should also allow overriding this via:

```env
CRATE_DIG_HOME=/path/to/local/data
```

Do not store copied audio files by default. Store references to local file paths.

## 6. Local database schema

Create SQLite tables that roughly mirror the Supabase schema, but keep them simpler.

Minimum tables:

### libraries

```sql
id text primary key
name text not null
source text not null -- folder | rekordbox_xml
created_at text not null
updated_at text not null
```

### tracks

```sql
id text primary key
library_id text not null
external_track_id text
title text not null default ''
artist text not null default ''
album text not null default ''
genre text not null default ''
label text not null default ''
bpm real
key text not null default ''
duration_sec real
rating integer not null default 0
date_added text not null default ''
location text not null default ''
location_kind text not null default 'file'
created_at text not null
```

### analysis_runs

```sql
id text primary key
library_id text not null
mode text not null default 'fast'
backend_name text not null default 'librosa'
status text not null default 'pending'
pipeline_version text not null
model_version text not null default ''
feature_schema_version text not null
tracks_total integer not null default 0
tracks_done integer not null default 0
error text
started_at text
finished_at text
created_at text not null
```

### track_features

```sql
id text primary key
track_id text not null
analysis_run_id text not null
audio_file_hash text
status text not null -- ok | failed | skipped
failure_reason text
features_json text not null default '{}'
created_at text not null
unique(track_id, analysis_run_id)
```

### track_embeddings

```sql
id text primary key
track_id text not null
analysis_run_id text not null
model_name text not null
dimensions integer not null
embedding_json text not null
created_at text not null
unique(track_id, analysis_run_id, model_name)
```

### cluster_members

```sql
id text primary key
analysis_run_id text not null
track_id text not null
cluster_index integer not null
cluster_name text not null default ''
umap_x real not null
umap_y real not null
suggested_moment text not null default ''
reduced_embedding_json text not null default '[]'
created_at text not null
unique(analysis_run_id, track_id)
```

### crates

```sql
id text primary key
library_id text
name text not null
notes text not null default ''
created_at text not null
updated_at text not null
```

### crate_tracks

```sql
crate_id text not null
track_id text not null
position integer not null default 0
created_at text not null
primary key(crate_id, track_id)
```

## 7. API surface

Create a local FastAPI app under:

```txt
apps/local-api/
```

Recommended endpoints:

### Health

```txt
GET /health
```

Returns:

```json
{ "ok": true }
```

### Libraries

```txt
GET /libraries
POST /libraries
GET /libraries/{library_id}
```

### Import

For localhost MVP, browser folder selection is tricky because browsers restrict raw folder path access. Use one of these approaches:

Preferred immediate approach:

```txt
POST /imports/rekordbox-xml
```

Payload:

```json
{ "xml_path": "/absolute/path/to/rekordbox.xml", "library_name": "Main Library" }
```

Also support:

```txt
POST /imports/folder
```

Payload:

```json
{ "folder_path": "/absolute/path/to/Music", "library_name": "Local Music" }
```

The folder importer should recursively scan supported file extensions:

- `.mp3`
- `.wav`
- `.aiff`
- `.aif`
- `.flac`
- `.m4a`
- `.aac`
- `.ogg`

Metadata extraction can be basic at first. Filename-based title/artist is acceptable for folder import v0.

### Tracks

```txt
GET /libraries/{library_id}/tracks
GET /tracks/{track_id}
```

Support filters as query params:

```txt
?q=
?artist=
?genre=
?bpm_min=
?bpm_max=
?key=
?limit=
?offset=
```

### Analysis

```txt
POST /libraries/{library_id}/analysis-runs
GET /analysis-runs/{analysis_run_id}
POST /analysis-runs/{analysis_run_id}/cancel
```

Start payload:

```json
{
  "mode": "fast",
  "backend_name": "librosa"
}
```

The API should run analysis in a background task/thread/process so the request returns quickly.

### Map data

```txt
GET /analysis-runs/{analysis_run_id}/map
```

Returns:

```json
{
  "tracks": [
    {
      "id": "...",
      "title": "...",
      "artist": "...",
      "bpm": 122.0,
      "key": "8A",
      "genre": "Deep House",
      "clusterId": 3,
      "clusterName": "Warm Rollers",
      "x": 1.23,
      "y": -0.44,
      "mood": ["warm", "hypnotic"],
      "suggestedMoment": "Sunset / golden hour"
    }
  ]
}
```

### Similarity

```txt
POST /analysis-runs/{analysis_run_id}/similar
```

Payload:

```json
{
  "seed_track_ids": ["..."],
  "limit": 25,
  "filters": {
    "bpm_min": 118,
    "bpm_max": 124,
    "tags": ["warm", "hypnotic"]
  }
}
```

### Audio playback

```txt
GET /audio/{track_id}
```

Must support HTTP Range requests for browser seeking.

Only serve files from track IDs stored in SQLite. Do not expose arbitrary path reads.

### Crates

```txt
GET /crates
POST /crates
GET /crates/{crate_id}
POST /crates/{crate_id}/tracks
DELETE /crates/{crate_id}/tracks/{track_id}
```

### Export

```txt
GET /crates/{crate_id}/export/m3u
GET /crates/{crate_id}/export/csv
GET /crates/{crate_id}/export/rekordbox-xml
```

Use `cratedig_engine.export`.

## 8. Frontend app

Create:

```txt
apps/web/
```

Use:

- Next.js App Router.
- TypeScript.
- Tailwind.
- Deck.gl.
- React Query or SWR.
- Local API base URL:

```env
NEXT_PUBLIC_LOCAL_API_URL=http://localhost:8000
```

For localhost MVP, do not require login.

Screens:

1. Local welcome / library setup.
2. Import from Rekordbox XML.
3. Import from local folder path.
4. Analysis progress.
5. Map/discovery screen.
6. Track detail drawer.
7. Crates panel.

## 9. User flow v0

### Flow A: Rekordbox XML

```txt
Open localhost app
  → Create local library
  → Enter/path-pick Rekordbox XML path
  → Import tracks
  → Start fast analysis
  → Watch progress
  → Open map
  → Play tracks
  → Find similar
  → Save crate
```

### Flow B: Folder scan

```txt
Open localhost app
  → Create local library
  → Enter/path-pick music folder path
  → Scan files
  → Start fast analysis
  → Open map
```

## 10. Analysis behavior

Use `cratedig_engine` directly.

Initial backend:

```txt
librosa
```

Later:

```txt
CLAP deep analysis
Essentia optional
```

Start with fast analysis. The app should be useful before deep models are installed.

Run analysis in batches and update progress:

```txt
tracks_total
tracks_done
status
error
```

Use idempotent caching from `cratedig_engine.pipeline.cache` so already-analyzed files are skipped unless the file hash/model/pipeline version changes.

## 11. Audio playback behavior

The local API should implement the useful behavior from Jeff's `player_server.py`:

- Track ID resolves to stored local file path.
- Endpoint is bound to localhost.
- Supports Range requests.
- Serves common audio content types.
- Uses ffmpeg for problematic formats later.

Do not let the API read arbitrary paths from query params.

Good:

```txt
GET /audio/{track_id}
```

Bad:

```txt
GET /audio?path=/Users/...
```

## 12. Relationship to desktop app

This localhost app should be built as the future desktop app architecture without the shell:

```txt
Now:
  Browser + localhost FastAPI + SQLite + local files

Later:
  Electron + React + Python sidecar/FastAPI + SQLite + local files
```

If built carefully, the desktop app can reuse:

- `apps/web` UI components.
- Deck.gl map.
- `apps/local-api` API contract.
- SQLite schema.
- `cratedig_engine`.

## 13. Implementation phases

### Phase L1: Local API foundation

- Create `apps/local-api`.
- Add FastAPI app.
- Add SQLite connection/migrations.
- Add `/health`.
- Add library and track models.
- Add folder importer.
- Add Rekordbox XML importer using `cratedig_engine.ingest`.

Acceptance:

- API boots at `localhost:8000`.
- Can import a small local folder or Rekordbox XML fixture.
- Tracks persist in SQLite.

### Phase L2: Analysis runner

- Add background analysis runs.
- Use `cratedig_engine.backends.factory`.
- Use `AnalysisCache`.
- Persist features/embeddings.
- Run clustering and persist map coordinates.

Acceptance:

- Can analyze a small fixture library.
- Progress endpoint updates.
- Map data endpoint returns points.

### Phase L3: Local playback

- Add `/audio/{track_id}`.
- Implement Range request support.
- Add content type detection.

Acceptance:

- Browser can play/seek local MP3/FLAC/M4A/WAV where browser supports it.

### Phase L4: Web shell

- Create `apps/web`.
- Local welcome/import screens.
- Analysis progress screen.
- API client.

Acceptance:

- User can import and start analysis from UI.

### Phase L5: Deck.gl map

- Render map data.
- Hover tooltip.
- Click/select track.
- Highlight playing track.
- Basic color-by-cluster.
- Basic track list.

Acceptance:

- 3k points renders smoothly from local API.

### Phase L6: Crates and exports

- Save crates locally.
- Add/export tracks.
- Export CSV/M3U/Rekordbox XML.

Acceptance:

- User can build and export a crate.

## 14. Non-goals for localhost MVP

- Supabase auth.
- R2 upload.
- Cloud Run.
- Vercel deployment.
- Q assistant.
- Multi-user support.
- Production security beyond localhost binding and path-safety.
- Full desktop packaging.
- Deep CLAP analysis as a requirement.

## 15. Cursor prompt

Use this prompt to hand off implementation:

```txt
We are building an immediate localhost version of Crate Dig for local music files.

Read these docs first:
- LOCALHOST_APP_SPEC.md
- CURSOR_HANDOFF.md
- PRD.md
- JEFF_BRANCH_REVIEW.md

Repo:
/Users/lj/code/personal/projects/crate-dig

Current engine:
packages/engine/cratedig_engine

Implement the localhost app described in LOCALHOST_APP_SPEC.md.

Prioritize:
1. apps/local-api with FastAPI + SQLite
2. importing local folders and Rekordbox XML
3. running cratedig_engine fast analysis locally
4. persisting analysis results locally
5. serving local audio by track ID with Range support
6. apps/web Next.js shell
7. Deck.gl map using local API data

Do not require Supabase, R2, Cloud Run, Vercel, or auth for this localhost MVP.
Do not commit .env, local SQLite databases, generated analysis artifacts, caches, models, personal music paths, or full-library CSVs.

Keep the implementation aligned with the future desktop app:
React UI + local API + SQLite + cratedig_engine + local files.

Make small, testable commits. Add tests for local API import, analysis-run persistence, and audio path safety.
```
