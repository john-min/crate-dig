# Localhost App Spec

Status: Implemented runtime contract with documented gaps
Last updated: 2026-08-25

## Runtime

Localhost mode is the existing Next.js UI at `http://localhost:3000`, FastAPI bound to
`http://127.0.0.1:8000`, a separate analysis worker, SQLite, and referenced local audio
files. It requires neither Supabase nor cloud services. `127.0.0.1` is the API security
boundary for development; do not bind to all interfaces.

```bash
cd apps/local-api
uv run cratedig-local-api

# separate terminal
uv run cratedig-local-worker
```

The web app selects this runtime with `NEXT_PUBLIC_APP_MODE=local` and
`NEXT_PUBLIC_LOCAL_API_URL=http://127.0.0.1:8000`.

## Ownership and storage

FastAPI owns local libraries, tracks, imports, audio playback, analysis lifecycle,
neighbors, and evaluation HTTP contracts. SQLite is the durable local source of truth.
The Python engine owns extraction semantics. The worker claims and executes durable
stages; request handlers never perform model inference.

`CRATE_DIG_HOME` overrides the default `~/.crate-dig` directory:

```txt
${CRATE_DIG_HOME}/
  crate-dig.sqlite
  artifacts/previews/
  models/                 # optional downloads
```

Audio remains at its original path. SQLite stores paths, content hashes, metadata,
manifests, runs/stages, typed float32 embeddings, features, neighbors, and evaluation
records. Playback resolves only a stored track ID; arbitrary path query parameters are
forbidden.

## Database and worker

The implemented v2 persistence uses ordered migrations in
`cratedig_local_api/migrations.py`, tracked with SQLite `user_version`. Connections
enable WAL, foreign keys, and a bounded busy timeout. The schema includes libraries,
tracks, immutable model-set manifests, analysis runs/stages, features, native-dimensional
embeddings, neighbors/projection records, evaluation sets/runs/anchors/judgments, and
operational metrics.

Analysis submission selects `manifest_name` plus `manifest_version` and requires an
idempotency key. `local-fast@1` is currently the safe installed manifest. The separate
worker atomically claims stages, leases work, persists progress/results/errors, applies a
finite retry ceiling, and supports cooperative cancellation as terminal `skipped` with
reason `cancelled_by_user`.

## Authoritative API surface

The reproducible OpenAPI export at `contracts/openapi/local-api.json` is the machine
contract. Current routes include:

### Core library, import, and playback

- `GET /health`
- `GET /libraries`
- `GET /tracks`
- `GET /tracks/{track_id}`
- `GET /libraries/{library_id}/tracks`
- `POST /imports/folder`
- `POST /libraries/{library_id}/metadata/import-csv`
- `GET /audio/{track_id}` with HTTP Range support

Folder import recursively indexes supported audio, uses Rekordbox USB metadata or audio
tags when available, hashes content, and reports per-file imported/duplicate/unsupported/
failed outcomes. The implemented metadata supplement is Rekordbox Tracks CSV; there is
no `/imports/rekordbox-xml` HTTP route today.

### Manifest-based analysis

- `POST /libraries/{library_id}/analysis-runs`
- `GET /analysis-runs/{run_id}`
- `GET /analysis-runs/{run_id}/tracks`
- `POST /analysis-runs/{run_id}/cancel`
- `POST /analysis-stages/{stage_id}/retry`
- `GET /tracks/{track_id}/analysis`
- `GET /tracks/{track_id}/neighbors`

### Similarity evaluation

- `GET|POST /evaluation-sets`
- `GET /evaluation-sets/{evaluation_set_id}`
- `POST /evaluation-sets/{evaluation_set_id}/runs`
- `GET /evaluation-sets/{evaluation_set_id}/next`
- `GET /evaluation-sets/{evaluation_set_id}/anchors/{track_id}/neighbors`
- `POST /evaluation-sets/{evaluation_set_id}/judgments`
- `POST /evaluation-sets/{evaluation_set_id}/runs/{run_id}/metrics`
- `GET /evaluation-sets/{evaluation_set_id}/report`

The local API implementation and generated OpenAPI document are authoritative over older
route sketches. There are currently no map, crate, export, generic similarity-search, or
analysis-run `/map`/`similar` routes. Do not build clients against those nonexistent
paths.

## Current web integration

The Next UI can health-check the API, list/import a folder, list tracks, and play stored
audio. Synthetic fixture mode remains available for deterministic visual tests. Backend
neighbors are available, while the main studio still contains placeholder/synthetic
geometry and client-derived similarity in parts of the experience.

## Known gaps

- Import does not decode every file up front into a dedicated `corrupt` outcome.
- Import outcomes do not yet share the full retryability/remediation schema with cloud.
- A long extractor invocation has no progress heartbeat.
- Multi-extractor manifests do not yet share one decode across worker stage claims;
  `local-fast@1` therefore remains single-extractor.
- Crates/exports, server-side similarity search, frozen projection coordinates, and real
  waveform generation are not implemented local API routes.
- Browser folder picking still needs a native shell bridge or explicit path workflow.
- Development localhost has no per-launch capability token; desktop packaging must add
  one while retaining loopback binding.

## Verification

Use temporary homes for tests and contract generation; never point automation at the
user's real `~/.crate-dig` database:

```bash
uv run --project apps/local-api python scripts/export_local_api_openapi.py
uv run --project apps/local-api --extra dev pytest apps/local-api/tests/test_openapi_export.py
```

See `docs/APP_PLATFORM_ARCHITECTURE.md` for cross-runtime ownership and
`docs/DESKTOP_APP_SPEC.md` for the packaged sidecar boundary.
