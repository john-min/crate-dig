from __future__ import annotations

from cratedig_engine.ingest.rekordbox_xml import parse_rekordbox_xml
from tests.conftest import FIXTURES


def test_rekordbox_xml_import_keeps_all_tracks_and_playlists():
    library = parse_rekordbox_xml(FIXTURES / "rekordbox_collection.xml")
    by_id = {t.track_id: t for t in library.tracks}

    assert [t.track_id for t in library.tracks] == ["1001", "1002", "1003", "1004"]
    assert by_id["1001"].title == "Sunset Line"
    assert by_id["1001"].artist == "Ada"
    assert by_id["1001"].bpm == 122.0
    assert by_id["1001"].key == "8A"
    assert by_id["1001"].rating == 3
    assert by_id["1001"].location == "/Users/test/Music/sunset-line.wav"
    assert by_id["1003"].location == "spotify:track:abc123"
    assert by_id["1004"].location == ""

    assert len(library.crates) == 1
    crate = library.crates[0]
    assert crate.name == "Sets/Warm Up"
    assert [ct.track_id for ct in crate.tracks] == ["1001", "1002"]
