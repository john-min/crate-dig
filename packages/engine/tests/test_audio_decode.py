from __future__ import annotations

import hashlib
import wave

import numpy as np

from cratedig_engine.audio.decode import DecodedAudio


def _write_stereo_wav(path, *, sample_rate: int = 8_000, seconds: float = 1.0):
    frames = int(sample_rate * seconds)
    t = np.arange(frames, dtype=np.float32) / sample_rate
    left = 0.5 * np.sin(2 * np.pi * 220 * t)
    right = 0.25 * np.sin(2 * np.pi * 440 * t)
    pcm = np.column_stack((left, right))
    integers = np.round(pcm * 32767.0).astype("<i2")
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(integers.tobytes())
    return pcm


def test_decode_records_canonical_pcm_and_source_metadata(tmp_path):
    path = tmp_path / "stereo.wav"
    _write_stereo_wav(path)

    audio = DecodedAudio.from_file(path)

    assert audio.path == path.resolve()
    assert audio.source_hash == hashlib.sha256(path.read_bytes()).hexdigest()
    assert audio.original_sample_rate == 8_000
    assert audio.original_channels == 2
    assert audio.frame_count == 8_000
    assert audio.duration_sec == 1.0
    assert audio.pcm.shape == (8_000, 2)
    assert audio.pcm.dtype == np.float32
    assert not audio.pcm.flags.writeable


def test_views_are_memoized_without_decoding_again(tmp_path, monkeypatch):
    import soundfile as sf

    path = tmp_path / "stereo.wav"
    _write_stereo_wav(path)
    real_read = sf.read
    decode_calls = 0

    def counted_read(*args, **kwargs):
        nonlocal decode_calls
        decode_calls += 1
        return real_read(*args, **kwargs)

    monkeypatch.setattr(sf, "read", counted_read)
    audio = DecodedAudio.from_file(path)
    mono_a = audio.view(4_000, "mono")
    mono_b = audio.view(4_000, "mono")
    left_a = audio.view(channel_policy="left")
    left_b = audio.view(channel_policy="left")

    assert decode_calls == 1
    assert mono_a is mono_b
    assert left_a is left_b
    assert mono_a.shape == (4_000,)
    assert left_a.shape == (8_000,)
    assert not mono_a.flags.writeable


def test_normalized_and_raw_views_share_one_resampling_operation(tmp_path, monkeypatch):
    path = tmp_path / "stereo.wav"
    _write_stereo_wav(path)
    audio = DecodedAudio.from_file(path)
    real_resample = audio._resample
    resample_calls = 0

    def counted_resample(*args, **kwargs):
        nonlocal resample_calls
        resample_calls += 1
        return real_resample(*args, **kwargs)

    monkeypatch.setattr(audio, "_resample", counted_resample)
    normalized = audio.view(4_000, "mono", normalize=True)
    raw = audio.view(4_000, "mono")

    assert resample_calls == 1
    assert normalized is audio.view(4_000, "mono", normalize=True)
    assert raw is audio.view(4_000, "mono")


def test_channel_policy_and_normalization_do_not_mutate_canonical_pcm(tmp_path):
    path = tmp_path / "stereo.wav"
    _write_stereo_wav(path)
    audio = DecodedAudio.from_file(path)
    canonical = audio.pcm.copy()

    mono = audio.mono()
    normalized = audio.mono(normalize=True)

    np.testing.assert_allclose(mono, audio.pcm.mean(axis=1), atol=1e-7)
    assert np.max(np.abs(normalized)) == np.float32(1.0)
    np.testing.assert_array_equal(audio.pcm, canonical)
    assert audio.view(channel_policy="preserve") is audio.pcm


def test_stereo_policy_has_exactly_two_channels(tmp_path):
    stereo_path = tmp_path / "stereo.wav"
    _write_stereo_wav(stereo_path)
    stereo = DecodedAudio.from_file(stereo_path)
    np.testing.assert_array_equal(stereo.view(channel_policy="stereo"), stereo.pcm)

    mono_pcm = np.linspace(-0.25, 0.25, 100, dtype=np.float32)
    mono = DecodedAudio(
        path=tmp_path / "virtual.wav",
        source_hash="a" * 64,
        pcm=mono_pcm,
        sample_rate=8_000,
    )
    stereo_view = mono.view(channel_policy="stereo")
    assert stereo_view.shape == (100, 2)
    np.testing.assert_array_equal(stereo_view[:, 0], mono_pcm)
    np.testing.assert_array_equal(stereo_view[:, 1], mono_pcm)
