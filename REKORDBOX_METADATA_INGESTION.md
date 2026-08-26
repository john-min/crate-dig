# Rekordbox metadata ingestion

Crate Dig treats DJ-curated library metadata and waveform-derived estimates as
different facts with different provenance.

## Origin

Jeff's prototype implemented this boundary in `jeff:djvibe/library.py`:

- `pyrekordbox` read the encrypted desktop `master.db`.
- Rekordbox XML was the fallback interchange format.
- Rekordbox BPM was normalized from its internal BPM ×100 representation.
- Rekordbox key, title, artist, album, genre, label, rating, duration, date added,
  and location were written to `tracks.csv`.
- `features.csv.est_bpm` remained a separate waveform estimate.

The production implementation is
`apps/local-api/cratedig_local_api/rekordbox_metadata.py`.

## Current USB import

For a folder named `Contents`, Crate Dig looks for the sibling file:

`PIONEER/rekordbox/export.pdb`

The read-only `rekordbox-pdb` adapter parses the legacy DeviceSQL database and
joins each Rekordbox record to the local audio file using its canonical
`/Contents/...` path. This is deterministic and does not depend on fuzzy
title/artist matching.

If no Rekordbox record is available, Crate Dig can fall back to portable audio
container tags through `ffprobe`. Embedded BPM/key are marked `audio_tag`, not
`rekordbox_usb`.

## SQLite contract

The local SQLite `tracks` table owns imported/user-editable metadata:

- `location`, `audio_content_hash`
- `title`, `artist`, `album`, `genre`, `label`
- `bpm`, `musical_key`
- `rating`, `date_added`, `rekordbox_track_id`
- `bpm_source`, `key_source`

The API serializes `musical_key` as `key` for the frontend.

Legacy Rekordbox CSV exports can be imported through:

`POST /libraries/{library_id}/metadata/import-csv`

Full DJ-library exports are private local inputs and must not be committed. A
developer may keep one under the ignored `data/private/` directory. The
importer matches only a unique, normalized `title + artist` pair. It skips
ambiguous identities, records every successful join in
`track_metadata_sources`, reports BPM/key disagreements, and fills only missing
values on the canonical `tracks` row. Re-running the same source is idempotent.

Waveform analysis does **not** overwrite these columns. Model output such as
`librosa.est_bpm:track` remains in `track_features`, with its own model/version
provenance. Product code can use an estimate only as a fallback or comparison:

1. user override
2. current Rekordbox USB metadata (exact device-path match)
3. legacy Rekordbox CSV metadata (normalized title + artist match)
4. portable audio tag
5. model estimate

This preserves the DJ's curated BPM/key while allowing Crate Dig to flag or
investigate disagreement with an audio-derived estimate.
