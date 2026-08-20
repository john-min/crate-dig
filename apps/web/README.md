# Crate Dig web

Next.js App Router shell for Crate Dig. Phase 5: landing, access-code gate, auth, import, analysis status, and the main studio layout. Phase 6 replaces `src/components/map/*` with Deck.gl.

## Package manager

This app is set up for **pnpm**. npm also works.

```bash
cd apps/web
pnpm install
pnpm dev
```

```bash
cd apps/web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Vercel root directory should be `apps/web`.

## Env

Copy `.env.example` to `.env.local`. Never commit `.env` or `.env.local`.

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (not `ANON_KEY`)
- `SUPABASE_SECRET_KEY` (server only; access-code validation)
- `NEXT_PUBLIC_SITE_URL`

Values can be copied from the repo-root `.env.example`. The publishable key is the browser/Supabase client key. The secret key is used only in server actions and route handlers to read/redeem `access_codes`.

Local seed code (after applying migrations + seed): `CRATEDIG-DEV`.

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
