# Crate Dig web

Next.js App Router shell for Crate Dig. Phase 5: landing, access-code gate, auth, import, analysis status, and the main studio layout. Phase 6 replaces `src/components/map/*` with Deck.gl.

## Package manager

This app belongs to the root **pnpm 9.15.0 workspace**.

```bash
pnpm install
pnpm --filter web dev
```

Open [http://localhost:3000](http://localhost:3000).

Vercel root directory should be `apps/web`.

## Runtime modes

- `mock`: checked-in synthetic fixtures; no Supabase, FastAPI, or private audio.
- `preview`: no auth, no Supabase. Lists audio under `demo/` (and `libraries/demo/`)
  in R2, signs short-lived GET URLs, and keeps crates in this tab only.
- `local`: the existing Next UI talks to FastAPI at `127.0.0.1` and needs no login.
- `cloud`: Supabase SSR/Auth/RLS plus authenticated cloud APIs and signed direct R2
  upload/playback.

Set `NEXT_PUBLIC_APP_MODE` explicitly when wiring a mode. Existing fixture behavior remains
the visual-test default while adapter composition is introduced.

## Env

Copy `.env.example` to `.env.local`. Never commit `.env` or `.env.local`.

Required:

- `ACCESS_CODE` (server only; never `NEXT_PUBLIC_*`. Compared with a constant-time check. Fail-closed if unset.)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (not `ANON_KEY`)
- `SUPABASE_SECRET_KEY` (server only; cloud APIs)
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_APP_MODE` (`mock`, `preview`, `local`, or `cloud`)

Mode-specific:

- `NEXT_PUBLIC_LOCAL_API_URL` in local mode
- `NEXT_PUBLIC_CLOUD_API_URL` in cloud mode

Values can be copied from the repo-root `.env.example`. The publishable key is the browser/Supabase client key.

Prototype access: set `ACCESS_CODE` in `.env.local` and on Vercel (example value `THONGLOR`). Do not put it in `NEXT_PUBLIC_*`. Existing `validate_access_code` / `redeem_access_code` RPCs remain unused for this gate.

## Preview playback (R2, no auth)

Vercel **Preview** (`web-dev`) and `/map` load the shared `source='demo'` library from
Supabase (`tracks` + `audio_objects.object_key`) and sign short-lived R2 GETs on play.
Set `NEXT_PUBLIC_APP_MODE=preview` plus the same `R2_*` and Supabase URL/secret keys as
Production. Production `/app` stays `cloud` (auth-gated). Seed with
`python3 scripts/seed-demo-library.py`.

The studio calls `GET /api/preview/catalog` then `GET /api/preview/playback?trackId=`.
Only `audio_objects` keys under `demo/` or `libraries/demo/` are signed. Audio still never
streams through Vercel.

That catalog is public on the Preview URL — only put demo audio in those prefixes.

CORS origins must include `http://localhost:3000`, `http://localhost:3001`, and the
Preview hostname (scheme+host only). Allow `GET` / `HEAD` / `Range`.

## Cloud playback (R2)

Studio play calls `GET /api/cloud/tracks/:id/playback`, which returns a short-lived signed **GET** against R2. Audio does not stream through Vercel. Set the R2 keys on Vercel (Production + Preview) and locally:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_AUDIO`
- `R2_ENDPOINT` (or omit and let the client build `https://<account>.r2.cloudflarestorage.com`)

The list API never embeds those URLs (`previewUrl` stays null; `previewState` is `ready` when an `audio_objects` row exists).

Shared demo catalog: apply `supabase/migrations/20260827000000_demo_library_rls.sql`, then seed one `libraries` row with `source = 'demo'` owned by an operator user, plus `tracks` and `audio_objects.object_key` matching keys in the bucket. Authenticated users can read that library; they cannot write it.

If `<audio>` fails in the browser with a CORS error, add the site origins (scheme+host only) on the R2 bucket CORS policy for `GET`/`HEAD` and `Range`. That is configured in the Cloudflare dashboard, not Wrangler.

## Routes

| Path | Screen |
| --- | --- |
| `/` | Landing |
| `/access` | Access-code gate |
| `/login` | Email/password + Google SSO |
| `/signup` | Create account (requires valid access cookie) |
| `/reset-password` | Password reset request |
| `/update-password` | Set a new password after recovery |
| `/auth/callback` | Google OAuth PKCE callback |
| `/auth/confirm` | Email confirm / recovery token |
| `/import` | Upload/import shell |
| `/analysis` | Analysis stages shell |
| `/app` | Main studio: filters, map slot, track list, Q, player |

`/import`, `/analysis`, and `/app` require a Supabase session and a redeemed access code on `profiles.access_code_id` in `cloud` mode. Preview and mock skip that gate.

## Map slot (Phase 6)

The studio center pane renders `src/components/map/MapCanvas.tsx`. Phase 6 owns `src/components/map/*` (Deck.gl). The shell passes `MapCanvasProps` (`tracks`, `selectedTrackId`, `playingTrackId`, `seedTrackIds`, `onSelectTrack`).
