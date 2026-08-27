from __future__ import annotations

import xml.etree.ElementTree as ET

from cratedig_engine.export import export_csv, export_m3u, export_rekordbox_xml
from cratedig_engine.schemas import ClusterAssignment, Crate, CrateTrack, Track


def _tracks() -> list[Track]:
    return [
        Track(
            track_id="1001",
            title="Sunset Line",
            artist="Ada",
            bpm=122.0,
            key="8A",
            duration_sec=360,
            location="/Users/test/Music/sunset-line.wav",
        ),
        Track(
            track_id="1002",
            title="Peak Driver",
            artist="Bram",
            bpm=126.5,
            duration_sec=412,
            location="/Users/test/Music/peak-driver.aiff",
        ),
    ]


def _crate() -> Crate:
    return Crate(
        crate_id="warm-up",
        name="Warm Up",
        tracks=[CrateTrack(track_id="1001", position=0), CrateTrack(track_id="1002", position=1)],
    )


def test_rekordbox_xml_export_fixture(tmp_path):
    assignments = [
        ClusterAssignment(
            track_id="1001",
            cluster_id=0,
            cluster_name="deep & warm · 122 BPM",
            umap_x=0.1,
            umap_y=0.2,
            suggested_moment="Sunset / golden hour",
        ),
        ClusterAssignment(
            track_id="1002",
            cluster_id=0,
            cluster_name="deep & warm · 122 BPM",
            umap_x=0.3,
            umap_y=0.4,
            suggested_moment="Peak time",
        ),
    ]
    out = tmp_path / "crate-dig.xml"
    text = export_rekordbox_xml(_tracks(), crates=[_crate()], assignments=assignments, out_path=out)
    assert out.exists()
    root = ET.fromstring(text)
    product = root.find("PRODUCT")
    assert product is not None
    assert product.attrib["Name"] == "Crate Dig"
    tracks = root.find("COLLECTION").findall("TRACK")
    assert {t.attrib["TrackID"] for t in tracks} == {"1001", "1002"}
    names = [n.attrib.get("Name") for n in root.iter("NODE")]
    assert "Crate Dig — crates" in names
    assert "Warm Up" in names
    assert "Crate Dig — clusters" in names
    assert "Crate Dig — moments" in names


def test_m3u_export_fixture():
    text = export_m3u(_tracks(), crate=_crate())
    assert text.startswith("#EXTM3U\n")
    assert "#PLAYLIST:Warm Up" in text
    assert "#EXTINF:360,Ada - Sunset Line" in text
    assert "/Users/test/Music/sunset-line.wav" in text
    assert "/Users/test/Music/peak-driver.aiff" in text


def test_csv_export_fixture():
    text = export_csv(_tracks(), crate=_crate())
    lines = text.strip().splitlines()
    assert lines[0].startswith("track_id,")
    assert "1001,Sunset Line,Ada" in lines[1]
    assert "Warm Up" in lines[1]
