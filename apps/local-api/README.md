# Crate Dig local API

Play files from their path on disk. Binds to `127.0.0.1` only. Does not copy the library.

```bash
cd apps/local-api
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cratedig-local-api
```

Then in the web app (`pnpm dev`), open `/import`, paste an absolute folder path, and play from `/map`.

Indexed extensions: `.mp3` `.mp4` `.m4a` `.aac` `.wav` `.flac` `.ogg` `.oga` `.aif` `.aiff` `.webm`.

Folder import hashes every supported file and reports a structured outcome for
each examined path. Identical bytes are retained as separate library records
but marked `duplicate`; unsupported paths are reported without being imported.
The queued analysis stage snapshots the content hash so an edited or replaced
file fails with `source_changed` instead of attaching stale evidence.

AIFF is transcoded with ffmpeg when present. Everything else is streamed with HTTP Range from the stored `location`.

## Offline analysis

The API registers the versioned `local-fast@1` model-set manifest at startup.
It intentionally contains only the native Librosa extractor so the first
local runtime keeps one decode per track. Queue work through the API:

```http
POST /libraries/{library_id}/analysis-runs
Content-Type: application/json

{
  "manifest_name": "local-fast",
  "manifest_version": "1",
  "mode": "fast",
  "idempotency_key": "library-import-2026-08-25"
}
```

Run analysis in a separate process, never inside the FastAPI request:

```bash
cratedig-local-worker --run-id <analysis-run-id>
```

Without `--run-id`, the worker drains queued work across libraries and exits
when idle. SQLite is the durable local system of record: WAL mode, foreign
keys, bounded lock waits, atomic stage claims, finite retries, cooperative
cancellation, expired-worker leases, and content-addressed extractor reuse are
enabled. Cache hits copy immutable typed evidence into the requesting run and
record the source stage in `cache_hit_from_stage_id`; their terminal lifecycle
status remains `succeeded`.

After a retrieval analysis run completes, materialize its deterministic exact
cosine cache from track-scoped `retrieval:track` embeddings:

```bash
cratedig-materialize-neighbors --run-id <analysis-run-id> --top-k 25
```

The command atomically replaces only that run's `global` channel. Use
`--channel` to maintain an independently versioned channel or
`--embedding-key` for an explicitly named track-level retrieval role. Invalid,
zero-norm, non-finite, ambiguous, or dimension-incompatible vectors abort the
operation and preserve the previous cache. Evaluation runs likewise refuse to
complete when any requested anchor/configuration candidate list is absent or
shorter than the available corpus requires.

Learned embeddings retain raw cosine behavior through the default
`--normalization none`. For physical feature vectors with common offsets or
incompatible dimension scales, materialize a separate, explicitly named
channel with the versioned corpus transform:

```bash
cratedig-materialize-neighbors \
  --run-id <analysis-run-id> \
  --channel librosa-zscore-v1 \
  --normalization zscore-v1 \
  --top-k 25
```

`zscore-v1` uses corpus population mean and standard deviation per dimension,
maps zero-variance dimensions to zero, and then L2-normalizes each transformed
track vector before exact cosine ranking. The method, corpus size, and number
of zero-variance dimensions are persisted in each neighbor's provenance.

Current boundary: stages are claimed per extractor. Keep `local-fast@1`
single-extractor until track-level batch claims can share one `DecodedAudio`
across every extractor in a multi-model manifest. The worker does not yet renew
leases from inside a long extractor call, so do not enable slow/deep extractors
or multiple workers until heartbeat renewal is implemented.
