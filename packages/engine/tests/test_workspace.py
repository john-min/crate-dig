from cratedig_engine.storage.local_workspace import LocalWorkspace


def test_local_workspace_has_no_dashboard_html(tmp_path):
    ws = LocalWorkspace(tmp_path / "run")
    assert not hasattr(ws, "dashboard_html")
    names = dir(ws)
    assert "audio_cache" in names
    assert "dashboard" not in "".join(names).lower()
