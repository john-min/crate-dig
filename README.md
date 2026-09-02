# Crate Dig

Find the next record.

Crate Dig is a web, localhost, and future Mac-desktop music intelligence app for DJs. It helps you import a library, analyze tracks, explore them on a map, and build crates around a set moment.

This repository is documentation-led on `main`. Implementation lives on feature branches. Jeff’s original local prototype is kept as a review worktree and is **not** merged wholesale.

## Docs

- [PRD](./PRD.md)
- [App platform architecture](./docs/APP_PLATFORM_ARCHITECTURE.md)
- [Web app spec](./docs/WEB_APP_SPEC.md)
- [Desktop app spec](./docs/DESKTOP_APP_SPEC.md)
- [Q assistant spec](./docs/Q_ASSISTANT_SPEC.md)
- [Localhost app spec](./LOCALHOST_APP_SPEC.md)
- [Sonic analysis PRD](./sonic_analysis_prd.md)
- [Implementation plan](./IMPLEMENTATION_PLAN.md)
- [Residual engine PRD](./CRATE_DIG_ENGINE_PRD.md)
- [Sonic analysis strategy](./sonic_analysis_engine.md)
- [Design prompt](./design.md)
- [Jeff branch review](./JEFF_BRANCH_REVIEW.md)
- [External services setup](./EXTERNAL_SETUP.md)
- [Cursor engineering handoff](./CURSOR_HANDOFF.md)

## Layout

```txt
apps/web/          Next.js app (Vercel root directory)
apps/local-api/    FastAPI + SQLite local API and worker
packages/contracts Shared generated API/domain contracts
packages/app-core  Platform-neutral application core
packages/ui        Shared UI boundary (Studio move is deferred)
packages/engine/   Python analysis engine (`cratedig_engine`)
supabase/          migrations
```

The engine package name is `cratedig_engine` under `packages/engine`. Do not introduce `cratedig_analysis` or `packages/analysis`.

## Web app

```bash
pnpm install
pnpm --filter web dev
```

Copy `apps/web/.env.example` to `apps/web/.env.local`. Use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, not `ANON_KEY`.

## Engine (local)

```bash
cd packages/engine
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e ".[fast,dev]"
pytest
```

The implemented local runtime uses manifest-based analysis runs, versioned SQLite migrations, and a separate worker. `local-fast@1` currently selects the safe native librosa extractor; deeper manifests remain evaluation-gated. See `sonic_analysis_prd.md` and `IMPLEMENTATION_PLAN.md`.

Cloud Run Job MVP:

```bash
pip install -e ".[job]"
cratedig-engine analyze-run --analysis-run-id <uuid>
```

See `packages/engine/README.md` for env vars, Docker, and waveform/preview stubs.

## What does not belong in Git

Generated analysis workspaces, embeddings, personal library CSVs, model downloads, virtualenvs, and `.env` files are gitignored. Keep only small synthetic fixtures.
