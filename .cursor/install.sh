#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for the Crate Dig monorepo.
# Prepares the Node/pnpm workspace and the two Python runtimes
# (packages/engine and apps/local-api) after the source checkout.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

export PATH="$HOME/.local/bin:$PATH"

# 1. uv (Python package/venv manager) — install only when missing.
if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi
uv --version

# 2. Node workspace dependencies (pnpm is pinned via packageManager).
corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile

# 3. Python analysis engine (fast + dev extras) in its own venv.
if [ ! -x packages/engine/.venv/bin/python ]; then
  uv venv --python 3.12 packages/engine/.venv
fi
uv pip install --python packages/engine/.venv -e "packages/engine[fast,dev]"

# 4. Local FastAPI + SQLite runtime (resolved from its uv.lock).
(cd apps/local-api && uv sync --extra dev)

# 5. Web dev env file for mock mode (gitignored; created only if absent).
if [ ! -f apps/web/.env.local ]; then
  cat > apps/web/.env.local <<'ENV'
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_APP_MODE=mock
NEXT_PUBLIC_LOCAL_API_URL=http://127.0.0.1:8000
ACCESS_CODE=THONGLOR
ENV
fi

echo "Crate Dig environment bootstrap complete."
