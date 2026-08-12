"""Read a rekordbox collection into a normalized track table.

Two sources, in priority order:

1. ``pyrekordbox`` — reads the live, encrypted rekordbox 6/7 database
   (``master.db``, SQLCipher). It auto-extracts the key on most installs.
   This is the richest source: it carries your real file paths, BPM, key,
   rating, colour, and existing My-Tags.

2. A **rekordbox XML export** — File ▸ Export Collection in XML format, or set
   Preferences ▸ Advanced ▸ Database ▸ "rekordbox xml" and export. This always
   works regardless of version and needs no key. Use it if (1) fails.

The output is a pandas DataFrame / tracks.csv with a stable schema:
    track_id, title, artist, album, genre, bpm, key, duration_sec,
    location (absolute file path), rating, date_added
"""
from __future__ import annotations

import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path

import pandas as pd

COLUMNS = [
    "track_id", "title", "artist", "album", "genre", "label",
    "bpm", "key", "duration_sec", "location", "rating", "date_added",
]


# --------------------------------------------------------------------------
# Source 1: live database via pyrekordbox
# --------------------------------------------------------------------------
def from_pyrekordbox(db_dir: str | None = None) -> pd.DataFrame:
    """Read the live rekordbox 6/7 database.

    Parameters
    ----------
    db_dir : optional path to the rekordbox application-data folder. Leave None
             to let pyrekordbox auto-detect the default install location.
    """
    try:
        from pyrekordbox import Rekordbox6Database
    except Exception as exc:  # pragma: no cover - import guard
        raise RuntimeError(
            "pyrekordbox is not installed. Run `pip install pyrekordbox`, or "
            "use the XML export path (from_xml). If the key can't be read "
            "automatically, run `python -m pyrekordbox download-key` once."
        ) from exc

    db = Rekordbox6Database(db_dir) if db_dir else Rekordbox6Database()

    rows = []
    for c in db.get_content():
        try:
            key_name = c.Key.ScaleName if getattr(c, "Key", None) else None
        except Exception:
            key_name = None
        try:
            genre_name = c.Genre.Name if getattr(c, "Genre", None) else None
        except Exception:
            genre_name = None
        try:
            label_name = c.Label.Name if getattr(c, "Label", None) else None
        except Exception:
            label_name = None
        rows.append({
            "track_id": str(c.ID),
            "title": c.Title or "",
            "artist": (c.Artist.Name if getattr(c, "Artist", None) else "") or "",
            "album": (c.Album.Name if getattr(c, "Album", None) else "") or "",
            "genre": genre_name or "",
            "label": label_name or "",
            # rekordbox stores BPM x100 in some columns; the ORM exposes the float
            "bpm": float(c.BPM) / 100.0 if c.BPM and c.BPM > 1000 else (float(c.BPM) if c.BPM else None),
            "key": key_name or "",
            "duration_sec": float(c.Length) if c.Length else None,
            "location": _normalize_location(c.FolderPath),
            "rating": int(c.Rating) if c.Rating is not None else 0,
            "date_added": str(c.created_at) if getattr(c, "created_at", None) else "",
        })
    df = pd.DataFrame(rows)
    return _finalize(df)


# --------------------------------------------------------------------------
# Source 2: rekordbox XML export
# --------------------------------------------------------------------------
def from_xml(xml_path: str | Path) -> pd.DataFrame:
    """Parse a rekordbox-exported collection XML file."""
    tree = ET.parse(xml_path)
    root = tree.getroot()
    collection = root.find("COLLECTION")
    if collection is None:
        raise ValueError("No <COLLECTION> node found — is this a rekordbox XML export?")

    rows = []
    for t in collection.findall("TRACK"):
        g = t.attrib
        rows.append({
            "track_id": g.get("TrackID", ""),
            "title": g.get("Name", ""),
            "artist": g.get("Artist", ""),
            "album": g.get("Album", ""),
            "genre": g.get("Genre", ""),
            "label": g.get("Label", ""),
            "bpm": _to_float(g.get("AverageBpm")),
            "key": g.get("Tonality", ""),
            "duration_sec": _to_float(g.get("TotalTime")),
            "location": _normalize_location(g.get("Location", "")),
            "rating": _rating_from_xml(g.get("Rating")),
            "date_added": g.get("DateAdded", ""),
        })
    return _finalize(pd.DataFrame(rows))


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def _normalize_location(loc: str | None) -> str:
    """rekordbox XML stores locations as file:// URIs; the DB stores plain paths."""
    if not loc:
        return ""
    if loc.startswith("file://"):
        loc = loc[len("file://"):]
        loc = urllib.parse.unquote(loc)
        # macOS exports as file://localhost/Users/...
        if loc.startswith("localhost"):
            loc = loc[len("localhost"):]
    return loc


def _to_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _rating_from_xml(v):
    # rekordbox XML rating is 0/51/102/153/204/255 for 0–5 stars
    f = _to_float(v)
    if f is None:
        return 0
    return int(round(f / 51.0))


def _finalize(df: pd.DataFrame) -> pd.DataFrame:
    for col in COLUMNS:
        if col not in df.columns:
            df[col] = None
    df = df[COLUMNS].copy()
    # drop rows with no resolvable file path — we can't analyze those
    df["location"] = df["location"].fillna("")
    n_before = len(df)
    df = df[df["location"].str.len() > 0].reset_index(drop=True)
    df.attrs["dropped_no_path"] = n_before - len(df)
    return df


def load_or_extract(ws, db_dir=None, xml=None) -> pd.DataFrame:
    """Build tracks.csv if missing; otherwise load it."""
    if ws.tracks_csv.exists():
        return pd.read_csv(ws.tracks_csv, dtype={"track_id": str})
    if xml:
        df = from_xml(xml)
    else:
        df = from_pyrekordbox(db_dir)
    df.to_csv(ws.tracks_csv, index=False)
    return df
