# Crate Dig Web App Spec

Status: Scaffold contract
Last updated: 2026-08-25

## Stack and runtime

The hosted web runtime is Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4,
Deck.gl, and Supabase's SSR/browser clients. Vercel builds `apps/web`; the root pnpm
workspace must not require changing that Vercel root directory.

The same Next UI may run in fixture or localhost mode. Platform-specific clients are
composed at the app boundary; reusable domain/UI packages remain platform-neutral.

## Authentication and data ownership

- Supabase Auth owns Google and email/password identity.
- `@supabase/ssr` owns server/client session exchange. Next server code owns cookies,
  route protection, and access-code flow.
- Supabase Postgres is the cloud system of record. RLS must protect every user-owned
  library, track, analysis, embedding, crate, and playback record.
- `SUPABASE_SECRET_KEY` is server-only. It may be used by Next server actions/handlers
  for privileged access-code operations until those operations move behind an atomic
  database RPC. It must never appear in shared packages or client components.

## Cloud audio flow

The browser asks the authenticated cloud API for a short-lived signed upload session,
uploads the audio object directly to private R2, then registers/completes the object with
the API. Vercel and Cloud Run do not proxy full audio bodies. Playback likewise uses an
authenticated API to issue a short-lived signed R2 URL that supports Range requests.
Object ownership, expiry, completion, retention, and deletion are server concerns.

## Cloud API boundary

The cloud API owns upload signing/completion, analysis orchestration/status, retrieval,
playback signing, deletion, and explicit sync. Next server code may mediate session-aware
small requests but must not become an alternate analysis backend or use a service-role
key from the browser. The cloud API accepts object identifiers, never local filesystem
paths.

## Environment names

Browser-safe:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_APP_MODE=mock|local|cloud`
- `NEXT_PUBLIC_LOCAL_API_URL` (local mode only)
- `NEXT_PUBLIC_CLOUD_API_URL` (cloud mode only)

Server-only:

- `SUPABASE_SECRET_KEY`
- cloud API/R2/Google credentials used by the service that owns them

Do not use the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` name. No R2 credential or Supabase
secret/service-role credential may use a `NEXT_PUBLIC_` prefix.

## Fixture mode

`mock` mode uses checked-in synthetic data and deterministic fake adapters. It does not
require Supabase, FastAPI, R2, or user audio. Visual tests must remain runnable in this
mode. Fixture behavior must not silently fall back to real local/cloud services.

## Scaffold acceptance

- `pnpm --filter web lint`, `typecheck`, and `build` run from the workspace.
- Vercel can still install/build with `apps/web` as its root.
- Missing or invalid mode-specific public configuration fails clearly.
- Supabase SSR code stays in `apps/web`; no shared package imports it.
- Mock and local modes preserve current UI behavior and visual tests.
- Cloud uploads/playback are represented as signed direct R2 flows, not proxy routes for
  large audio.
