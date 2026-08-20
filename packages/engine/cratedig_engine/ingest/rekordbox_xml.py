"""Rekordbox XML collection import.

Keeps pathless and streaming-service locations so the analysis pipeline can
mark them skipped/failed instead of silently dropping them.
"""

from __future__ import annotations

import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path

from cratedig_engine.schemas import Crate, CrateTrack, Track


def tracks_from_xml(xml_path: str | Path) -> list[Track]:
    return parse_rekordbox_xml(xml_path).tracks


def parse_rekordbox_xml(xml_path: str | Path) -> "RekordboxLibrary":
    tree = ET.parse(xml_path)
    root = tree.getroot()
    collection = root.find("COLLECTION")
    if collection is None:
        raise ValueError("No <COLLECTION> node found — is this a rekordbox XML export?")

    tracks: list[Track] = []
    for node in collection.findall("TRACK"):
        attrs = node.attrib
        tracks.append(
            Track(
                track_id=str(attrs.get("TrackID", "")),
                title=attrs.get("Name", "") or "",
                artist=attrs.get("Artist", "") or "",
                album=attrs.get("Album", "") or "",
                genre=attrs.get("Genre", "") or "",
                label=attrs.get("Label", "") or "",
                bpm=_to_float(attrs.get("AverageBpm")),
                key=attrs.get("Tonality", "") or "",
                duration_sec=_to_float(attrs.get("TotalTime")),
                location=_normalize_location(attrs.get("Location", "")),
                rating=_rating_from_xml(attrs.get("Rating")),
                date_added=attrs.get("DateAdded", "") or "",
            )
        )

    crates = _playlists_from_xml(root)
    return RekordboxLibrary(tracks=tracks, crates=crates)


class RekordboxLibrary:
    def __init__(self, tracks: list[Track], crates: list[Crate]):
        self.tracks = tracks
        self.crates = crates


def _playlists_from_xml(root: ET.Element) -> list[Crate]:
    playlists = root.find("PLAYLISTS")
    if playlists is None:
        return []
    crates: list[Crate] = []

    def walk(node: ET.Element, prefix: str = "") -> None:
        name = node.attrib.get("Name", "")
        node_type = node.attrib.get("Type")
        if node_type == "1":
            crate_name = f"{prefix}{name}" if prefix else name
            tracks = [
                CrateTrack(track_id=t.attrib.get("Key", ""), position=i)
                for i, t in enumerate(node.findall("TRACK"))
            ]
            crates.append(
                Crate(
                    crate_id=f"xml:{crate_name}",
                    name=crate_name,
                    tracks=tracks,
                )
            )
            return
        child_prefix = ""
        if name and name.upper() != "ROOT":
            child_prefix = f"{prefix}{name}/" if prefix else f"{name}/"
        for child in node.findall("NODE"):
            walk(child, child_prefix)

    root_node = playlists.find("NODE")
    if root_node is not None:
        walk(root_node)
    return crates


def _normalize_location(loc: str | None) -> str:
    if not loc:
        return ""
    if loc.startswith("file://"):
        loc = loc[len("file://") :]
        loc = urllib.parse.unquote(loc)
        if loc.startswith("localhost"):
            loc = loc[len("localhost") :]
    return loc


def _to_float(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _rating_from_xml(value) -> int:
    parsed = _to_float(value)
    if parsed is None:
        return 0
    return int(round(parsed / 51.0))
