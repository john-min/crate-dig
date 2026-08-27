# Crate Dig App Platform Architecture

Status: Canonical platform runtime contract
Last updated: 2026-08-25

## Runtime matrix

| Mode | UI and process | Authentication | Source of truth | Audio and playback |
|---|---|---|---|---|
| `mock` | Next.js UI with checked-in synthetic fixtures | None | In-memory/fixture data | Synthetic metadata; no private audio |
| `local` | Existing Next.js UI plus FastAPI and a separate worker on `127.0.0.1` | None | SQLite under `CRATE_DIG_HOME` | Existing local files served by track ID with HTTP Range support |
| `cloud` | Next.js 16 on Vercel plus authenticated Cloud Run APIs/jobs | Supabase SSR/Auth | Supabase Postgres with RLS | Private R2 objects; direct signed browser transfer and short-lived signed playback |
| `desktop` | Electron Forge main/preload/React renderer plus supervised FastAPI and worker sidecars | None offline; optional Supabase session for explicit sync | Local SQLite; cloud records only for opted-in sync | Local files through the loopback API; no implicit upload |

Modes describe runtime ownership, not separate products. Local and desktop use the same
local API contract and engine semantics. Mock mode exists for deterministic development
and visual tests. Cloud mode never receives a local path.

## Process and trust boundaries

- Shared TypeScript packages contain domain contracts, adapter interfaces, and reusable
  UI/application logic only. They must not import Next.js server modules, Supabase admin
  clients, Electron, Node filesystem/process APIs, or Python implementation details.
- Next.js owns web routing, Supabase SSR cookie handling, cloud session enforcement, and
  server-only credentials. Service-role/secret keys never enter browser bundles.
- FastAPI owns the local HTTP contract and SQLite access. Model inference runs in the
  separate local worker, not in request handlers.
- Electron main owns windows, lifecycle, sidecar supervision, native dialogs, and
  filesystem capabilities. A narrow preload bridge exposes approved native operations.
  The renderer is an unprivileged Vite/React browser context.
- Cloud APIs own signed R2 sessions, cloud orchestration, authorization, and cross-service
  coordination. Browsers transfer large audio directly to/from R2 using short-lived URLs.

## Adapter selection

Application composition chooses one core `CrateDigAdapter` at the platform entry point
and advertises only the capabilities that runtime actually supports:

- fixture, local, and desktop adapters may implement `LocalImportCapability`;
- the cloud adapter implements `CloudUploadCapability` for signed upload creation and
  registration/completion, and is never required to accept a local `folderPath`;
- crate and projection/map-feed capabilities are separate planned surfaces. A runtime
  composition may expose them when implemented; their types do not claim current local
  HTTP endpoints;
- desktop preload/IPC only for native capabilities that cannot be represented safely as
  local API calls, such as choosing a directory or reporting application lifecycle.

Shared modules do not inspect `window.electron`, environment secrets, or deployment
hostname to choose an adapter. Each entry point validates explicit public configuration
and injects the selected adapter.

## API and data ownership

The implemented FastAPI application is authoritative for the localhost/desktop HTTP
surface. It owns libraries, tracks, imports, playback, manifest-based analysis lifecycle,
neighbors, and evaluation endpoints. SQLite migrations and the worker repository define
local persistence semantics.

The future cloud API implements equivalent domain contracts where useful, but also owns
cloud-only signed upload/completion, authenticated playback, deletion, and sync. Supabase
RLS is the final authorization boundary for user-owned cloud records. SQLite files are
never copied to the cloud; sync exchanges versioned domain records through authenticated
APIs.

## Document authority

When documents conflict, use this order:

1. `PRD.md` — product promise and surface.
2. `docs/APP_PLATFORM_ARCHITECTURE.md` — runtime/process/platform ownership.
3. `sonic_analysis_prd.md` — backend delivery and evaluation requirements.
4. `IMPLEMENTATION_PLAN.md` — sequencing and current implementation status.

`docs/WEB_APP_SPEC.md`, `docs/DESKTOP_APP_SPEC.md`, and
`LOCALHOST_APP_SPEC.md` refine their named runtime without overriding that order.
`CRATE_DIG_ENGINE_PRD.md` is residual and superseded wherever it conflicts with the
canonical documents, as recorded in `IMPLEMENTATION_PLAN.md`.
