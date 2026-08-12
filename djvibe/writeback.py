"""(Optional) Export your clusters back into rekordbox as playlists.

This writes a rekordbox-importable XML. In rekordbox:
    Preferences ▸ View ▸ Layout ▸ enable "rekordbox xml"
    Preferences ▸ Advanced ▸ Database ▸ rekordbox xml ▸ choose this file
Then the playlists appear under the "rekordbox xml" tree, ready to drag into
your collection. This is non-destructive — it never modifies your master.db.

Creates one playlist per discovered cluster, plus one per suggested DJ moment
(Sunrise, Beach club, Sunset, Peak time, Afterhours, ...).
"""
from __future__ import annotations

import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path

import pandas as pd

from . import io


def _loc_to_uri(path: str) -> str:
    p = urllib.parse.quote(str(path))
    return f"file://localhost{p}"


def run(ws: io.Workspace, out_path: str | None = None):
    clusters = pd.read_csv(ws.clusters_csv, dtype={"track_id": str})
    tracks = pd.read_csv(ws.tracks_csv, dtype={"track_id": str}).set_index("track_id")

    root = ET.Element("DJ_PLAYLISTS", Version="1.0.0")
    ET.SubElement(root, "PRODUCT", Name="djvibe", Version="0.1.0", Company="djvibe")
    collection = ET.SubElement(root, "COLLECTION", Entries=str(len(clusters)))

    for tid in clusters["track_id"]:
        if tid not in tracks.index:
            continue
        t = tracks.loc[tid]
        attrs = {"TrackID": str(tid), "Name": str(t.get("title", "")),
                 "Artist": str(t.get("artist", "")), "Location": _loc_to_uri(t.get("location", ""))}
        if pd.notna(t.get("bpm")):
            attrs["AverageBpm"] = f"{float(t['bpm']):.2f}"
        ET.SubElement(collection, "TRACK", **attrs)

    playlists = ET.SubElement(root, "PLAYLISTS")
    rootnode = ET.SubElement(playlists, "NODE", Type="0", Name="ROOT", Count="0")

    def add_folder(parent, name, groups):
        folder = ET.SubElement(parent, "NODE", Type="0", Name=name,
                               Count=str(len(groups)))
        for gname, ids in groups:
            node = ET.SubElement(folder, "NODE", Name=str(gname), Type="1",
                                 KeyType="0", Entries=str(len(ids)))
            for tid in ids:
                ET.SubElement(node, "TRACK", Key=str(tid))

    cl_groups = [(f"{cid} · {grp['cluster_name'].iloc[0]}", list(grp["track_id"]))
                 for cid, grp in clusters.groupby("cluster") if cid != -1]
    add_folder(rootnode, "djvibe — clusters", cl_groups)

    if "suggested_moment" in clusters:
        mom_groups = [(m, list(grp["track_id"]))
                      for m, grp in clusters.groupby("suggested_moment")]
        add_folder(rootnode, "djvibe — moments", mom_groups)

    out = Path(out_path) if out_path else (ws.root / "djvibe_rekordbox.xml")
    ET.ElementTree(root).write(out, encoding="UTF-8", xml_declaration=True)
    print(f"[writeback] wrote {out} — import via Preferences ▸ Advanced ▸ rekordbox xml")
    return out
