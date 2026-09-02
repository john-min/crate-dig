# Crate Dig Desktop App Spec

Status: Scaffold contract; packaging deferred
Last updated: 2026-08-25

## Stack

The desktop shell will use Electron Forge with its Vite template and a React/TypeScript
renderer. It reuses platform-neutral application/domain/UI packages, not the Next.js
server runtime. The renderer must not require a local Next server in packaged builds.

## Security boundary

- Every `BrowserWindow` uses `contextIsolation: true`, `nodeIntegration: false`, and
  sandboxing where Electron support permits.
- Electron main owns windows, app lifecycle, updates, native dialogs, filesystem
  capabilities, and child processes.
- Preload uses `contextBridge` to expose a small, typed, allowlisted API. It does not
  expose raw `ipcRenderer`, filesystem, shell, process, or arbitrary command execution.
- Renderer code is treated as untrusted web content. It receives no Node globals,
  credentials, database handles, or arbitrary local paths.
- Navigation, new-window creation, external URL opening, and permission requests use
  explicit allowlists.

## Sidecar supervision

Electron main starts and supervises the packaged FastAPI sidecar and a separate local
analysis worker. It chooses an available loopback port, passes an authentication
capability/launch configuration, waits for health, records bounded logs, and performs
graceful then forced shutdown. Unexpected exits surface recoverable UI state; they do
not silently start duplicate workers. The worker remains single-concurrency until lease
heartbeats and multi-extractor batching are safe.

The Python engine and local API remain authoritative. Electron must not implement a
second analysis, similarity, migration, or import path.

## Loopback HTTP versus IPC

Use loopback HTTP for domain operations already owned by FastAPI: health, libraries,
tracks, imports after path selection, playback, analysis lifecycle, neighbors, and
evaluation. Use IPC only for native shell capabilities such as choosing a directory/file,
application lifecycle, update state, safe external-link opening, and sidecar diagnostics.
IPC returns the minimum information needed and validates every argument in main/preload.

The sidecar binds only to `127.0.0.1`, never `0.0.0.0`. Packaged builds add a per-launch
capability so unrelated local pages cannot invoke privileged mutations.

## Local persistence and offline behavior

SQLite at `${CRATE_DIG_HOME}/crate-dig.sqlite` is the desktop system of record. The same
versioned v2 local migrations, WAL/foreign-key/busy-timeout settings, worker repository,
and local-file references used by localhost mode apply. `CRATE_DIG_HOME` defaults to the
platform application-data location in packaged builds; development may explicitly use
`~/.crate-dig`.

The core import, analysis, neighbors, playback, and crate workflow must work with
networking disabled. Optional model downloads are explicit, checksum-verified, and
governed by the model-bundle policy. No local path, metadata, or audio is uploaded
implicitly.

## Optional sync authentication

Desktop sign-in is optional and exists only for explicit sync/share features. Supabase
owns identity; main/preload owns any secure browser/deep-link and token-storage mechanics.
The renderer receives a minimal session view, not refresh tokens or service-role secrets.
Sync copies versioned domain records through authenticated APIs, never the SQLite file,
and requires clear user consent for any audio upload.

## Packaging stages

1. Development Forge/Vite shell using an externally started API and worker.
2. Supervised development sidecars with isolated temporary `CRATE_DIG_HOME`.
3. Packaged Python API/worker and approved embedded models for macOS.
4. Signed/notarized distribution with migrations, crash recovery, uninstall/data
   retention, and tested upgrades.
5. Auto-update and optional model-download channels after rollback and checksum policy
   are proven.

The checksum-verified model-download channel in stage 5 is shared: it serves both the deep
analysis separator (HT-Demucs) and the offline Q assistant model. See
[Q_ASSISTANT_SPEC.md](./Q_ASSISTANT_SPEC.md) for Q's runtime, model policy, and grounding.

## Scaffold acceptance

- Forge/Vite/React starts without importing Next.js server code.
- Renderer has no Node integration; preload API is typed and allowlisted.
- Main can supervise one API and one worker, report health, and cleanly stop both.
- Domain traffic uses the generated local API contract; native path selection uses IPC.
- A temporary `CRATE_DIG_HOME` proves first-run and migration behavior without touching
  the user's real database.
- Offline smoke tests cover import, local playback, and sidecar restart.
- No shared/renderer bundle references Supabase secret/service-role keys, R2 credentials,
  Electron main modules, or unrestricted filesystem APIs.

## Shell selection (decision record)

Decision: 2026-09-02
Decision: **Electron Forge + Vite/React** is the desktop shell for now. A Rust-based
shell (Tauri v2) was considered and deferred, not rejected permanently.

### Context

The desktop architecture already isolates the window shell. The renderer performs every
domain operation (libraries, import, playback, analysis, neighbors, evaluation) over
loopback HTTP against the Python FastAPI sidecar, and uses a small typed IPC allowlist
only for native capabilities (directory/file picker, app lifecycle, update state,
external-link opening, sidecar diagnostics, optional sync session). That boundary is
shell-neutral, so the choice is comparatively low-stakes and reversible: a future shell
swap would reimplement main-process concerns without touching the engine, local API, or
most of the renderer.

### Options considered

- **Electron (chosen).** Chromium renderer gives consistent WebGL2 behavior for the
  deck.gl map. A security-reviewed main process already exists (window sandboxing,
  sidecar supervision, loopback bridge, IPC allowlist) with passing tests. Same language
  family (TypeScript) as the rest of the app. Cost: larger baseline binary and higher
  idle memory than a native-webview shell.
- **Tauri v2 / Rust (deferred).** Smaller shell binary and lower idle memory, Rust core.
  Risks for this app: the map runs on macOS **WKWebView** (Safari engine), so deck.gl
  WebGL2 performance must be proven rather than assumed; the main-process concerns above
  would be rewritten in Rust, adding a third language to a TypeScript + Python team.

### Rationale

For Crate Dig the **Python analysis runtime dominates footprint and complexity, not the
shell**. Fast analysis is librosa/numpy/scikit-learn; completed analysis adds torch +
HT-Demucs (and optionally essentia). Once those are bundled (packaging stage 3), the
distributable is large regardless of shell, which mutes Tauri's small-binary advantage.
Combined with the map's reliance on consistent WebGL2 and the existing working Electron
scaffold, Electron is the pragmatic default.

### Target hardware

Assume **recent Apple Silicon MacBook Air-class machines**: arm64, fanless, and
memory-constrained (design and test against an 8 GB configuration even where 16 GB is
expected). Consequences:

- Package **arm64-only**; do not invest in universal/x86_64 builds unless older Intel
  hardware becomes a requirement.
- Treat memory as the binding constraint. Electron/Chromium, the renderer, the FastAPI
  sidecar, and the Python worker are resident together; keep the worker
  single-concurrency, stream/segment audio decode, avoid holding whole libraries in
  renderer memory, and bound deck.gl GPU buffers.
- Respect fanless thermals. Sustained CPU deep analysis (Demucs/torch) throttles, so keep
  the fast tier fully usable while deep analysis runs asynchronously; prefer opt-in and
  AC-power-aware scheduling with visible progress and terminal-degraded failures; prefer
  Accelerate/MPS/CoreML-backed paths where a model supports them.

### Revisit if

- Idle or peak memory on an 8 GB Air is unacceptable and attributable to the shell.
- A slim "fast tier" install (no bundled deep models) becomes a priority where shell
  binary size dominates the download.
- Dedicated Rust capacity becomes available and a spike proves deck.gl on WKWebView meets
  the map's performance bar and the sidecar/IPC/packaging concerns port cleanly.
