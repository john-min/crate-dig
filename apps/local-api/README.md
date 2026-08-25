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

Current boundary: stages are claimed per extractor. Keep `local-fast@1`
single-extractor until track-level batch claims can share one `DecodedAudio`
across every extractor in a multi-model manifest. The worker does not yet renew
leases from inside a long extractor call, so do not enable slow/deep extractors
or multiple workers until heartbeat renewal is implemented.
