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
- `NEXT_PUBLIC_APP_MODE` (`mock`, `local`, or `cloud`)

Mode-specific:

- `NEXT_PUBLIC_LOCAL_API_URL` in local mode
- `NEXT_PUBLIC_CLOUD_API_URL` in cloud mode

Values can be copied from the repo-root `.env.example`. The publishable key is the browser/Supabase client key.

Prototype access: set `ACCESS_CODE` in `.env.local` and on Vercel (example value `THONGLOR`). Do not put it in `NEXT_PUBLIC_*`. Existing `validate_access_code` / `redeem_access_code` RPCs remain unused for this gate.

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

`/import`, `/analysis`, and `/app` require a Supabase session and a redeemed access code on `profiles.access_code_id`.

## Map slot (Phase 6)

The studio center pane renders `src/components/map/MapCanvas.tsx`. Phase 6 owns `src/components/map/*` (Deck.gl). The shell passes `MapCanvasProps` (`tracks`, `selectedTrackId`, `playingTrackId`, `seedTrackIds`, `onSelectTrack`).
