# Crate Dig

Find the next record.

Crate Dig is a web-first, later Mac-desktop music intelligence app for DJs. It helps you import a library, analyze tracks, explore them on a map, and build crates around a set moment.

This repository is documentation-led on `main`. Implementation lives on feature branches. Jeff’s original local prototype is kept as a review worktree and is **not** merged wholesale.

## Docs

- [PRD](./PRD.md)
- [Engine PRD](./CRATE_DIG_ENGINE_PRD.md)
- [Sonic analysis strategy](./sonic_analysis_engine.md)
- [Design prompt](./design.md)
- [Jeff branch review](./JEFF_BRANCH_REVIEW.md)
- [External services setup](./EXTERNAL_SETUP.md)
- [Cursor engineering handoff](./CURSOR_HANDOFF.md)

## Layout

```txt
apps/web/          Next.js app (Vercel root directory)
packages/engine/   Python analysis engine (`cratedig_engine`)
supabase/          migrations
```

The engine package name is `cratedig_engine` under `packages/engine`. Do not introduce `cratedig_analysis` or `packages/analysis`.

## Web app

```bash
cd apps/web
pnpm install   # npm install also works; see apps/web/README.md
pnpm dev
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

The implemented baseline uses a single librosa/CLAP/Essentia backend per run. The target engine keeps fast analysis lightweight, then completes asynchronous versioned stem and deep-feature stages. See the engine PRD for the migration contract; mandatory completed analysis does not mean import or playback waits for PyTorch.

Cloud Run Job MVP:

```bash
pip install -e ".[job]"
cratedig-engine analyze-run --analysis-run-id <uuid>
```

See `packages/engine/README.md` for env vars, Docker, and waveform/preview stubs.

## What does not belong in Git

Generated analysis workspaces, embeddings, personal library CSVs, model downloads, virtualenvs, and `.env` files are gitignored. Keep only small synthetic fixtures.
