"""Decode-once audio substrate with deterministic, cached waveform views."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Literal

import numpy as np
from numpy.typing import NDArray

from cratedig_engine.audio.hash import hash_audio_file

ChannelPolicy = Literal["preserve", "stereo", "mono", "left", "right"]
Float32Audio = NDArray[np.float32]


class DecodedAudio:
    """Canonical PCM decoded once from a local audio file.

    The canonical representation is unnormalised, read-only float32 PCM with
    shape ``(frames, channels)``. Derived channel, sample-rate, and normalised
    views are memoized, so extractors can share this object without reopening
    the source file or mutating evidence used by another extractor.
    """

    def __init__(
        self,
        *,
        path: str | Path,
        source_hash: str,
        pcm: np.ndarray,
        sample_rate: int,
    ) -> None:
        source_path = Path(path).expanduser().resolve()
        if re.fullmatch(r"[0-9a-fA-F]{64}", source_hash) is None:
            raise ValueError("source_hash must be a SHA-256 hex digest")
        canonical = np.asarray(pcm, dtype=np.float32)
        if canonical.ndim == 1:
            canonical = canonical[:, np.newaxis]
        if canonical.ndim != 2:
            raise ValueError("decoded PCM must have shape (frames, channels)")
        if sample_rate <= 0:
            raise ValueError("sample_rate must be positive")
        if canonical.shape[1] <= 0:
            raise ValueError("decoded PCM must contain at least one channel")
        if not np.all(np.isfinite(canonical)):
            raise ValueError("decoded PCM must contain only finite samples")

        canonical = np.ascontiguousarray(canonical)
        canonical.setflags(write=False)

        self.path = source_path
        self.source_path = source_path
        self.source_hash = source_hash
        self.pcm: Float32Audio = canonical
        self.original_sample_rate = int(sample_rate)
        self.sample_rate = self.original_sample_rate
        self.original_channels = int(canonical.shape[1])
        self.channels = self.original_channels
        self.frame_count = int(canonical.shape[0])
        self.original_frame_count = self.frame_count
        self.duration_sec = self.frame_count / self.original_sample_rate
        self.duration_seconds = self.duration_sec
        self.duration_ms = self.duration_sec * 1000.0
        self._views: dict[tuple[int, ChannelPolicy, bool], Float32Audio] = {
            (self.original_sample_rate, "preserve", False): self.pcm
        }

    @classmethod
    def from_file(cls, path: str | Path) -> DecodedAudio:
        """Decode *path* once, preferring libsndfile via ``soundfile``.

        ``librosa`` is used only when soundfile is unavailable or cannot decode
        the format. It is asked to preserve the native sample rate and channels
        so both paths produce the same frame-major canonical representation.
        """

        source_path = Path(path).expanduser().resolve()
        if not source_path.is_file():
            raise FileNotFoundError(source_path)

        soundfile_error: Exception | None = None
        try:
            import soundfile as sf

            pcm, sample_rate = sf.read(
                source_path,
                dtype="float32",
                always_2d=True,
            )
        except (ImportError, OSError, RuntimeError, ValueError) as exc:
            soundfile_error = exc
            try:
                import librosa

                fallback, sample_rate = librosa.load(
                    source_path,
                    sr=None,
                    mono=False,
                    dtype=np.float32,
                )
            except Exception as fallback_error:
                raise ValueError(
                    f"could not decode audio file {source_path}: "
                    f"soundfile={soundfile_error!s}; librosa={fallback_error!s}"
                ) from fallback_error

            fallback = np.asarray(fallback, dtype=np.float32)
            if fallback.ndim == 1:
                pcm = fallback[:, np.newaxis]
            elif fallback.ndim == 2:
                # librosa returns channel-major audio for mono=False.
                pcm = fallback.T
            else:
                raise ValueError(
                    f"decoder returned unsupported shape {fallback.shape!r}"
                )

        return cls(
            path=source_path,
            source_hash=hash_audio_file(source_path),
            pcm=pcm,
            sample_rate=int(sample_rate),
        )

    decode = from_file

    def view(
        self,
        sample_rate: int | None = None,
        channel_policy: ChannelPolicy = "preserve",
        *,
        normalize: bool = False,
    ) -> Float32Audio:
        """Return a memoized, read-only view for an extractor.

        ``preserve`` remains frame-major and two-dimensional. The other channel
        policies return one-dimensional arrays. ``normalize=True`` applies
        deterministic peak normalization to the derived view, never to
        canonical PCM.
        """

        target_rate = self.original_sample_rate if sample_rate is None else sample_rate
        if isinstance(target_rate, bool) or not isinstance(target_rate, int):
            raise TypeError("sample_rate must be an integer")
        if target_rate <= 0:
            raise ValueError("sample_rate must be positive")
        if channel_policy not in ("preserve", "stereo", "mono", "left", "right"):
            raise ValueError(f"unsupported channel policy: {channel_policy!r}")

        key = (target_rate, channel_policy, bool(normalize))
        cached = self._views.get(key)
        if cached is not None:
            return cached

        base_key = (target_rate, channel_policy, False)
        result = self._views.get(base_key)
        if result is None:
            channel_view = self._apply_channel_policy(channel_policy)
            if target_rate != self.original_sample_rate:
                channel_view = self._resample(channel_view, target_rate)
            result = np.ascontiguousarray(channel_view, dtype=np.float32)
            result.setflags(write=False)
            self._views[base_key] = result

        if normalize:
            peak = float(np.max(np.abs(result))) if result.size else 0.0
            if peak > 0.0:
                result = np.asarray(result / peak, dtype=np.float32)
            else:
                result = result.copy()
            result.setflags(write=False)
            self._views[key] = result
        return result

    def at(
        self,
        sample_rate: int,
        channel_policy: ChannelPolicy = "mono",
        *,
        normalize: bool = False,
    ) -> Float32Audio:
        """Alias for :meth:`view` suited to model sample-rate requests."""

        return self.view(sample_rate, channel_policy, normalize=normalize)

    def mono(
        self,
        sample_rate: int | None = None,
        *,
        normalize: bool = False,
    ) -> Float32Audio:
        """Return a mono view at the native or requested sample rate."""

        return self.view(sample_rate, "mono", normalize=normalize)

    def _apply_channel_policy(self, channel_policy: ChannelPolicy) -> Float32Audio:
        native_key = (self.original_sample_rate, channel_policy, False)
        cached = self._views.get(native_key)
        if cached is not None:
            return cached

        if channel_policy == "preserve":
            result = self.pcm
        elif channel_policy == "stereo":
            if self.original_channels == 1:
                result = np.repeat(self.pcm, 2, axis=1)
            else:
                result = self.pcm[:, :2]
        elif channel_policy == "mono":
            result = np.mean(self.pcm, axis=1, dtype=np.float32)
        elif channel_policy == "left":
            result = self.pcm[:, 0]
        else:
            result = self.pcm[:, -1]

        result = np.ascontiguousarray(result, dtype=np.float32)
        result.setflags(write=False)
        self._views[native_key] = result
        return result

    def _resample(self, pcm: Float32Audio, target_rate: int) -> Float32Audio:
        try:
            import librosa
        except ImportError as exc:
            raise RuntimeError(
                "resampling requires the optional 'fast' dependencies (librosa)"
            ) from exc

        # Audio is frame-major, so time is axis 0 for both mono and multichannel.
        resampled = librosa.resample(
            pcm,
            orig_sr=self.original_sample_rate,
            target_sr=target_rate,
            axis=0,
            res_type="soxr_hq",
            fix=True,
            scale=False,
        )
        return np.asarray(resampled, dtype=np.float32)


__all__ = ["ChannelPolicy", "DecodedAudio", "Float32Audio"]
