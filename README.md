# Crate Dig

Find the next record.

Crate Dig is a web-first, later Mac-desktop music intelligence app for DJs. It helps you import a library, analyze tracks, explore them on a map, and build crates around a set moment.

This repository is documentation-led on `main`. Implementation lives on feature branches. Jeff’s original local prototype is kept as a review worktree and is **not** merged wholesale.

## Docs

- [PRD](./PRD.md)
- [Design prompt](./design.md)
- [Jeff branch review](./JEFF_BRANCH_REVIEW.md)
- [External services setup](./EXTERNAL_SETUP.md)
- [Cursor engineering handoff](./CURSOR_HANDOFF.md)

## Layout

```txt
apps/web/          Next.js app (later)
packages/engine/   Python analysis engine (`cratedig_engine`)
supabase/          migrations (later)
```

The engine package name is `cratedig_engine` under `packages/engine`. Do not introduce `cratedig_analysis` or `packages/analysis`.

## Engine (local)

```bash
cd packages/engine
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e ".[fast,dev]"
pytest
```

Fast analysis uses librosa and does not require CLAP or PyTorch. Deep analysis (CLAP) and Essentia are optional extras.

## What does not belong in Git

Generated analysis workspaces, embeddings, personal library CSVs, model downloads, virtualenvs, and `.env` files are gitignored. Keep only small synthetic fixtures.
