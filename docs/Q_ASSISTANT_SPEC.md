# Crate Dig Q Assistant Spec

Status: Proposed; offline-first, smallest-model-first
Last updated: 2026-09-02
Related: [DESKTOP_APP_SPEC.md](./DESKTOP_APP_SPEC.md), [PRD.md](../PRD.md), [sonic_analysis_prd.md](../sonic_analysis_prd.md)

Q is the Crate Dig assistant. Its promise is to help a DJ *find the next record*: take a
natural-language ask ("something warmer around 124, after this one"), and return fitting
tracks with an explanation grounded in real analysis evidence.

## Current state

Q today is a **deterministic regex intent-parser**, not a model:
`apps/web/src/lib/studio/q-intent.ts` (`interpretQPrompt`) maps a prompt to
`StudioFilters` (BPM window, Camelot key, moods, textures, energies) plus short "evidence"
strings, and `looksLikeQAsk` decides when a text box entry is a Q ask. There is no LLM in
the repository. This spec defines how to evolve Q into an **offline local model** on the
desktop app while keeping that deterministic parser as a fast fallback.

## Goals

- Offline-first: Q works with networking disabled, on the packaged desktop app.
- Grounded: Q never invents tracks. It orchestrates the existing deterministic retrieval
  (similarity/neighbors/filters) and explains matches from stored evidence.
- Small: default to the smallest model that can reliably drive intent + tool selection on
  an 8 GB Apple Silicon MacBook Air (the ADR target hardware). Bigger models are opt-in.
- Consistent: reuse the sidecar + loopback-HTTP boundary and the mock/local/cloud provider
  pattern already in the codebase; keep the renderer thin.

## Non-goals (for now)

- Open-ended chat or general knowledge Q&A.
- Cloud/hosted Q (a `cloud` provider is left as a future seam, not built here).
- Voice input / ASR.
- Bundling model weights in the installer (weights are downloaded post-install).

## Architecture

Q runs on the **Python side**, never in the renderer or Electron main:

- A `q` service lives with the local runtime (in `apps/local-api`, reusing its DB,
  similarity, and neighbor code, or a dedicated supervised sidecar). It is exposed over
  **loopback HTTP** and binds only to `127.0.0.1`, like the rest of the local API.
- Responses **stream** to the renderer via Server-Sent Events (SSE) so tokens and
  intermediate tool steps appear incrementally.
- The renderer consumes Q through the existing adapter seam. A `Q provider` abstraction
  mirrors the `mock` / `local` / `cloud` runtime split: `local` = offline model on the
  sidecar; `mock` = today's `interpretQPrompt`; `cloud` = reserved, unbuilt.
- Electron main/preload only supplies native capabilities already in the allowlist; Q adds
  no new privileged IPC surface.

This keeps the "engine + local API are authoritative; no second analysis/similarity path"
rule from `DESKTOP_APP_SPEC.md`: Q calls the same retrieval APIs, it does not reimplement them.

## Grounded tool-use design

Q is an **orchestrator over deterministic retrieval**, not a generator of results:

1. **Interpret** the ask into a structured intent (filters + relation to the current seed
   track). The local model produces a constrained, schema-validated intent; if the model
   is unavailable or output fails validation, fall back to `interpretQPrompt`.
2. **Retrieve** by calling existing local-API tools with that intent: neighbor lookup
   (`/tracks/{id}/neighbors`), library filtering, BPM/key windows. The candidate set comes
   only from real analyzed tracks.
3. **Explain** each suggestion from stored evidence (BPM, Camelot key, energy, mood/texture
   descriptors, similarity channel/score) — the model phrases the rationale, it does not
   supply the facts. Every claim traces to a retrieved field.

The intent and tool schemas are validated (Pydantic) so a small model cannot produce an
unsafe or malformed action; invalid tool calls are rejected and retried or fall back.

## API contract (sketch)

- `POST /q/ask` (loopback, SSE) — body: `{ prompt, seed_track_id?, library_id, filters? }`.
  Streams events: `intent` (validated structured intent), `candidates` (retrieved track
  ids + evidence), `token` (explanation deltas), `done` (final structured result), `error`.
- The typed contract is generated into `packages/contracts` like the rest of the local API
  (`contracts:generate`), so web/desktop consume a shared type.

## Model policy — smallest first

- **Default to the smallest useful instruct model** for the 8 GB Air floor: start with a
  **Qwen2.5-0.5B-Instruct or 1.5B-Instruct, quantized (Q4_K_M GGUF)**. 0.5B minimizes RAM
  and disk and is the initial target; 1.5B is the fallback if 0.5B cannot hold the
  intent/tool schema reliably. Larger tiers (3B/7B) are **opt-in**, not default.
- Because Q is constrained to schema-validated intent + tool selection (not free-form
  reasoning), a tiny model is a reasonable fit; robustness comes from validation + the
  deterministic fallback, not model size.
- **Weights are downloaded post-install**, not bundled: use the shared, checksum-verified
  model-download channel defined for deep analysis in `DESKTOP_APP_SPEC.md` stage 5. The
  download is consented, disk-accounted, and version-pinned.
- **RAM-tiered selection with a small default:** detect available memory and default to the
  smallest tier; allow the user to opt into a larger model only when RAM headroom allows.
- **Licensing:** confirm the specific Qwen variant's license (Qwen instruct models are
  generally Apache-2.0) before redistribution/auto-download.

## Runtime ADR (decision record)

Decision: 2026-09-02
Decision: **Run Q via llama.cpp (GGUF) embedded in the Python sidecar** (e.g.
`llama-cpp-python`), starting with the smallest quantized Qwen instruct model. MLX is
deferred as an Apple-Silicon performance optimization; Ollama is not adopted.

### Options considered

- **llama.cpp / GGUF, embedded (chosen).** Minimal dependency, no extra background daemon,
  tiny quantized models run well, and it runs **headless on Linux** as well as with Metal
  on Apple Silicon. That cross-platform property matters: Cloud Agents (Linux VMs) can run
  real Q inference tests with a tiny model, so the Q logic is testable in CI/agents even
  though MLX/Metal and packaging are Mac-only.
- **MLX / `mlx-lm` (deferred).** Best raw performance on Apple Silicon via unified memory +
  Metal, but Apple-only (cannot run on the Linux Cloud Agent VM) and adds framework weight.
  Revisit as an optional accelerated backend behind the same Q provider interface once the
  feature works.
- **Ollama (not adopted).** Easiest HTTP integration but ships a separate Go daemon and its
  own model store — another supervised moving part and larger footprint, against the
  "as small as possible" goal.

### Rationale

Smallest footprint, no extra daemon, and — critically — it keeps Q **testable by Cloud
Agents on Linux**, aligning with the build-with-agents workflow. The Q provider interface
isolates the runtime so MLX can be added later without touching callers.

### Revisit if

- On-device latency on the target Air is unacceptable and MLX measurably fixes it.
- A larger default model becomes necessary and a different runtime packages it better.

## Memory, thermal, and offline behavior

- **Lazy load** the model only on first Q use; **idle-evict** to reclaim RAM; cap context
  length. Never hold the model resident alongside a deep-analysis run on an 8 GB machine.
- Treat inference as **bursty CPU/GPU**, like deep analysis: keep the fast product path
  responsive, show progress, and degrade gracefully (fall back to the regex parser) rather
  than blocking the UI.
- The full ask → retrieve → explain loop must work **offline**; no prompt, library data, or
  audio leaves the device.

## Testing

- **Cloud Agent / Linux (headless):** unit + integration tests for intent parsing, schema
  validation, tool orchestration, SSE streaming, and fallback — run with the smallest GGUF
  model so real inference is exercised in the environment we set up.
- **macOS only:** MLX/Metal backend (if/when added), packaged-sidecar model loading,
  and model-download/checksum flows — validated on macOS CI runners or a real Mac.
- Golden asks: a fixed set of prompts with expected intents/candidates to catch regressions
  as models or prompts change.

## Phased rollout

1. Define the `/q/ask` contract + provider interface; keep `interpretQPrompt` as the
   `mock`/fallback provider.
2. Add the embedded llama.cpp backend with the smallest Qwen model behind the `local`
   provider; wire schema-validated intent + tool orchestration over existing retrieval.
3. Grounded explanations from stored evidence; SSE streaming to the renderer.
4. Model-download/checksum channel + RAM-tiered selection (shared with deep analysis).
5. (Optional, later) MLX accelerated backend; (future) `cloud` provider.
