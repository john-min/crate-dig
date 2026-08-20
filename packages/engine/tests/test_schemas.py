from cratedig_engine.schemas import AnalysisResult, AnalysisStatus, Track


def test_analysis_result_cache_key_includes_versions_and_hash():
    result = AnalysisResult(
        track_id="T1",
        audio_file_hash="abc",
        status=AnalysisStatus.ok,
        analysis_pipeline_version="1.0.0",
        model_version="librosa-core-excerpt-v1",
        feature_schema_version="1.0.0",
    )
    assert result.cache_key[0] == "T1"
    assert result.cache_key[1] == "abc"
    assert result.terminal is True


def test_track_defaults():
    track = Track(track_id="x")
    assert track.location == ""
    assert track.rating == 0
