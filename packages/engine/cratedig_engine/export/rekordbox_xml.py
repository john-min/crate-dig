"""Rekordbox-compatible XML playlist export. Does not mutate master.db."""

from __future__ import annotations

import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path

from cratedig_engine.schemas import ClusterAssignment, Crate, Track


def export_rekordbox_xml(
    tracks: list[Track],
    crates: list[Crate] | None = None,
    assignments: list[ClusterAssignment] | None = None,
    out_path: str | Path | None = None,
) -> str:
    by_id = {t.track_id: t for t in tracks}
    included_ids = _included_ids(tracks, crates, assignments)

    root = ET.Element("DJ_PLAYLISTS", Version="1.0.0")
    ET.SubElement(root, "PRODUCT", Name="Crate Dig", Version="0.1.0", Company="Crate Dig")
    collection = ET.SubElement(root, "COLLECTION", Entries=str(len(included_ids)))
    for tid in included_ids:
        track = by_id.get(tid)
        if track is None:
            continue
        attrs = {
            "TrackID": str(track.track_id),
            "Name": track.title,
            "Artist": track.artist,
            "Location": _loc_to_uri(track.location),
        }
        if track.bpm is not None:
            attrs["AverageBpm"] = f"{float(track.bpm):.2f}"
        if track.key:
            attrs["Tonality"] = track.key
        if track.genre:
            attrs["Genre"] = track.genre
        ET.SubElement(collection, "TRACK", **attrs)

    playlists = ET.SubElement(root, "PLAYLISTS")
    rootnode = ET.SubElement(playlists, "NODE", Type="0", Name="ROOT", Count="0")

    crate_groups = []
    if crates:
        crate_groups = [(crate.name, [ct.track_id for ct in crate.tracks]) for crate in crates]
        _add_folder(rootnode, "Crate Dig — crates", crate_groups)

    if assignments:
        by_cluster: dict[int, list[ClusterAssignment]] = {}
        for item in assignments:
            if item.cluster_id == -1:
                continue
            by_cluster.setdefault(item.cluster_id, []).append(item)
        cluster_groups = [
            (
                f"{cid} · {items[0].cluster_name}",
                [item.track_id for item in items],
            )
            for cid, items in sorted(by_cluster.items())
        ]
        _add_folder(rootnode, "Crate Dig — clusters", cluster_groups)

        by_moment: dict[str, list[str]] = {}
        for item in assignments:
            by_moment.setdefault(item.suggested_moment or "Unassigned", []).append(item.track_id)
        _add_folder(
            rootnode,
            "Crate Dig — moments",
            list(by_moment.items()),
        )

    xml_bytes = ET.tostring(root, encoding="UTF-8", xml_declaration=True)
    text = xml_bytes.decode("UTF-8")
    if out_path is not None:
        Path(out_path).write_text(text, encoding="UTF-8")
    return text


def _included_ids(
    tracks: list[Track],
    crates: list[Crate] | None,
    assignments: list[ClusterAssignment] | None,
) -> list[str]:
    if crates or assignments:
        ids: list[str] = []
        seen: set[str] = set()
        for crate in crates or []:
            for item in crate.tracks:
                if item.track_id not in seen:
                    seen.add(item.track_id)
                    ids.append(item.track_id)
        for item in assignments or []:
            if item.track_id not in seen:
                seen.add(item.track_id)
                ids.append(item.track_id)
        return ids
    return [t.track_id for t in tracks]


def _add_folder(parent: ET.Element, name: str, groups: list[tuple[str, list[str]]]) -> None:
    folder = ET.SubElement(parent, "NODE", Type="0", Name=name, Count=str(len(groups)))
    for group_name, ids in groups:
        node = ET.SubElement(
            folder,
            "NODE",
            Name=str(group_name),
            Type="1",
            KeyType="0",
            Entries=str(len(ids)),
        )
        for tid in ids:
            ET.SubElement(node, "TRACK", Key=str(tid))


def _loc_to_uri(path: str) -> str:
    if not path:
        return ""
    if path.startswith("file://"):
        return path
    quoted = urllib.parse.quote(str(path))
    if quoted.startswith("/"):
        return f"file://localhost{quoted}"
    return f"file://localhost/{quoted}"
