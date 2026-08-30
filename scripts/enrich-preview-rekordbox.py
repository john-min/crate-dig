#!/usr/bin/env python3
"""Enrich the R2 preview catalog from a Rekordbox USB export.pdb.

Run with the local API environment so rekordbox-pdb is available:

  cd apps/local-api
  uv run python ../../scripts/enrich-preview-rekordbox.py \
    --usb-root "/path/to/Rekordbox USB"

The join is the normalized path inside Contents/, not a fuzzy title match.
"""

from __future__ import annotations

import argparse
import json
import sys
import unicodedata
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parents[1]
LOCAL_API = ROOT / "apps/local-api"
DEFAULT_CATALOG = ROOT / "apps/web/src/data/preview-track-studio.json"
sys.path.insert(0, str(LOCAL_API))

from cratedig_local_api.rekordbox_metadata import load_rekordbox_usb_index  # noqa: E402


def canonical_path(value: str) -> str:
    normalized = unicodedata.normalize("NFC", value.replace("\\", "/").strip())
    return PurePosixPath(normalized.lstrip("/")).as_posix().casefold()


def relative_audio_path(object_key: str) -> str:
    parts = PurePosixPath(object_key).parts
    for index, part in enumerate(parts):
        if part.casefold() == "contents":
            return "/".join(parts[index:])
    raise ValueError(f"R2 object has no Contents/ path: {object_key}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--usb-root", required=True, type=Path)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    catalog_path = args.catalog.expanduser().resolve()
    catalog = json.loads(catalog_path.read_text())
    index = load_rekordbox_usb_index(args.usb_root)
    if index is None:
        print("No PIONEER/rekordbox/export.pdb found under --usb-root", file=sys.stderr)
        return 1

    unmatched: list[str] = []
    for external_id, record in catalog.items():
        object_key = str(record.get("objectKey") or "")
        try:
            device_path = canonical_path(relative_audio_path(object_key))
        except ValueError:
            unmatched.append(external_id)
            continue
        metadata = index.tracks_by_path.get(device_path)
        if metadata is None:
            unmatched.append(external_id)
            continue
        record.update(
            {
                "title": metadata.title,
                "artist": metadata.artist,
                "album": metadata.album,
                "genre": metadata.genre,
                "label": metadata.label,
                "bpm": metadata.bpm,
                "key": metadata.musical_key,
                "durationSec": metadata.duration_sec,
                "rating": metadata.rating,
                "dateAdded": metadata.date_added,
                "rekordboxTrackId": metadata.rekordbox_track_id,
            }
        )

    if unmatched:
        print(
            f"Refusing a partial catalog update: {len(unmatched)} unmatched IDs "
            f"({', '.join(unmatched[:5])})",
            file=sys.stderr,
        )
        return 1

    catalog_path.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n")
    print(
        f"Enriched {len(catalog)} tracks from Rekordbox: "
        f"bpm={sum(row.get('bpm') is not None for row in catalog.values())}, "
        f"key={sum(bool(row.get('key')) for row in catalog.values())}, "
        f"genre={sum(bool(row.get('genre')) for row in catalog.values())}, "
        f"energy_rating={sum(row.get('energyLevel') is not None for row in catalog.values())}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
