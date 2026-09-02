# Crate Dig desktop

Electron Forge + Vite/React shell for the local FastAPI sidecar. This package does **not**
embed the Next.js app or its `/app` route gate.

## Commands

From the repo root:

```bash
pnpm install
pnpm --filter desktop start
pnpm --filter desktop typecheck
pnpm --filter desktop test
pnpm --filter desktop lint
pnpm --filter desktop package
```

The repo `.npmrc` sets `node-linker=hoisted` because Electron Forge packaging cannot use pnpm's default isolated linker. Dev start, typecheck, and tests use the same install.

`pnpm desktop` is an alias for `pnpm --filter desktop start`.

## Sidecar

Main either connects to a healthy loopback API or supervises one:

| `CRATE_DIG_SIDECAR_MODE` | Behavior |
|---|---|
| `auto` (default) | Connect to `CRATE_DIG_SIDECAR_URL` or `http://127.0.0.1:8000` when `/health` is ok; otherwise spawn `apps/local-api` |
| `connect` | Connect only |
| `supervise` | Always spawn a development sidecar |

Electron sets `CRATE_DIG_HOME`, `CRATE_DIG_API_HOST=127.0.0.1`, and `CRATE_DIG_API_PORT`. SQLite at
`${CRATE_DIG_HOME}/crate-dig.sqlite` is opened only by FastAPI. Audio files stay at their original
paths; previews live under `${CRATE_DIG_HOME}/artifacts/previews`.

Use `CRATE_DIG_ISOLATED_HOME=1` for a temporary home that does not touch `~/.crate-dig`.

The worker is launched on demand (`cratedig-local-worker --run-id …`) and is single-concurrency:
a second launch is refused until the owned worker exits.

Domain traffic (health, libraries, import, playback, analysis, neighbors) is loopback HTTP from
the renderer. Native dialogs, sidecar diagnostics, and optional cloud-sync session state use the
preload IPC allowlist.

Neighbors always request `librosa-zscore-v1` (`LOCAL_ANALYSIS_NEIGHBOR_CHANNEL`).

To load the same demo library and Cloud Run analysis that web-dev uses:

```bash
CRATE_DIG_HOME="$HOME/.crate-dig" uv run --project apps/local-api cratedig-hydrate-cloud-library
```

Desktop and localhost web both read that SQLite file. Use `--audio-root` when the Rekordbox
USB (or a copy of `Contents/`) is on disk so playback resolves. Secrets stay in
`apps/web/.env.local`; the renderer never receives the service-role key.

## Auth

Cloud sync is off until the user enables it. Only then may main load `@supabase/supabase-js` with
`CRATE_DIG_SUPABASE_URL` and `CRATE_DIG_SUPABASE_PUBLISHABLE_KEY`. The renderer receives
`{ userId, email, expiresAt }` and never a refresh token or secret/service-role key.

## Packaging gaps (later gates)

Documented in `forge.config.ts` and the sidecar snapshot `packaging` field:

1. Development Forge/Vite shell — this package.
2. Supervised development sidecars / isolated `CRATE_DIG_HOME` — implemented.
3. Bundled Python API/worker and approved models — **not implemented**.
4. Signing, notarization, crash recovery, uninstall/data retention — **not implemented**.
5. Auto-update and optional model-download channels — **not implemented**.
