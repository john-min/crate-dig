"""Chord-progression detection for a track (librosa only, no heavy deps).

Pipeline per track:
    1. load mono audio, keep the central section (reuse features.core_excerpt).
    2. beat-track and compute a beat-synchronized CQT chromagram.
    3. match each beat's chroma against 24 major/minor triad templates.
    4. smooth (median filter over beats) and collapse consecutive duplicates
       into a compact progression, e.g. ["Am", "F", "C", "G"].
    5. estimate the key with a Krumhansl-Schmuckler correlation.

This is intentionally lightweight template matching, not a deep model: it is
fast, dependency-free (librosa is already a fallback backend), and good enough
to surface the harmonic shape of a track. Dense/atonal material will be noisier.

Usable standalone:
    from djvibe.chords import detect_chords
    result = detect_chords("/path/to/track.mp3")
    # -> {"chords": ["Am","F","C","G"], "key_est": "A minor", "n_beats": 128}
"""
from __future__ import annotations

import numpy as np

# 12 pitch-class names (sharps); index 0 == C
_PITCHES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Krumhansl-Kessler key profiles (major / minor), rotated per tonic below.
_KK_MAJOR = np.array(
    [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_KK_MINOR = np.array(
    [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def _triad_templates() -> tuple[np.ndarray, list[str]]:
    """Return a [24, 12] binary template matrix and matching chord labels.

    24 chords = 12 major triads + 12 minor triads. Each template has three
    active pitch classes (root, third, fifth), L2-normalized for cosine match.
    """
    templates = []
    labels = []
    for root in range(12):
        # major: root, +4, +7 ; minor: root, +3, +7
        major = np.zeros(12); major[[root, (root + 4) % 12, (root + 7) % 12]] = 1.0
        minor = np.zeros(12); minor[[root, (root + 3) % 12, (root + 7) % 12]] = 1.0
        templates.append(major); labels.append(_PITCHES[root])            # "C"  = C major
        templates.append(minor); labels.append(_PITCHES[root] + "m")      # "Cm" = C minor
    T = np.array(templates, dtype=np.float64)
    T /= np.linalg.norm(T, axis=1, keepdims=True)
    return T, labels


_TEMPLATES, _LABELS = _triad_templates()


def _estimate_key(chroma_mean: np.ndarray) -> str:
    """Krumhansl-Schmuckler: correlate the mean chroma with all 24 key profiles."""
    c = chroma_mean - chroma_mean.mean()
    best_score, best_key = -np.inf, "?"
    for tonic in range(12):
        for profile, mode in ((_KK_MAJOR, "major"), (_KK_MINOR, "minor")):
            p = np.roll(profile, tonic)
            p = p - p.mean()
            denom = (np.linalg.norm(c) * np.linalg.norm(p)) or 1.0
            score = float(np.dot(c, p) / denom)
            if score > best_score:
                best_score, best_key = score, f"{_PITCHES[tonic]} {mode}"
    return best_key


def _median_smooth(idx: np.ndarray, k: int = 3) -> np.ndarray:
    """Median filter a sequence of chord indices to remove single-beat flicker."""
    if k < 2 or idx.size < k:
        return idx
    pad = k // 2
    padded = np.pad(idx, pad, mode="edge")
    out = np.empty_like(idx)
    for i in range(idx.size):
        window = padded[i:i + k]
        vals, counts = np.unique(window, return_counts=True)
        out[i] = vals[np.argmax(counts)]      # mode of the window
    return out


def _collapse(labels_seq: list[str], max_len: int = 24) -> list[str]:
    """Collapse consecutive duplicates into a compact progression."""
    out: list[str] = []
    for lab in labels_seq:
        if not out or out[-1] != lab:
            out.append(lab)
    return out[:max_len]


def detect_chords(path: str, sr: int = 22050, max_sec: float = 90.0,
                  min_beat_conf: float = 0.0) -> dict:
    """Detect a beat-synced chord progression for one audio file.

    Returns a dict:
        chords   : list[str]  collapsed progression, e.g. ["Am","F","C","G"]
        key_est  : str        estimated key, e.g. "A minor"
        n_beats  : int        number of beats analyzed
        raw      : list[str]  per-beat labels before collapsing (may be long)
    Raises ValueError on empty/too-short audio.
    """
    import librosa
    from .features import core_excerpt

    y, sr = librosa.load(path, sr=sr, mono=True)
    if y.size == 0:
        raise ValueError("empty audio")
    y = core_excerpt(y, sr, max_sec=max_sec)

    # Harmonic component reduces percussive smearing of the chroma.
    y_harm = librosa.effects.harmonic(y, margin=4)

    # Beat grid; fall back to a fixed frame grid if beat tracking fails.
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, trim=False)
    chroma = librosa.feature.chroma_cqt(y=y_harm, sr=sr)

    if beats is not None and len(beats) >= 4:
        # mean (not median) — median of a beat window that straddles a chord change
        # picks erratic values; mean averages the chroma cleanly.
        chroma_sync = librosa.util.sync(chroma, beats, aggregate=np.mean)
    else:
        chroma_sync = chroma       # per-frame fallback

    key_est = _estimate_key(chroma.mean(axis=1))

    # Cosine similarity of each (normalized) beat chroma to the 24 templates.
    cs = chroma_sync.T.astype(np.float64)                       # [n_beats, 12]
    norms = np.linalg.norm(cs, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    cs_n = cs / norms
    sims = cs_n @ _TEMPLATES.T                                  # [n_beats, 24]
    idx = sims.argmax(axis=1)

    idx = _median_smooth(idx, k=3)
    raw = [_LABELS[i] for i in idx]
    chords = _collapse(raw)

    return {
        "chords": chords,
        "key_est": key_est,
        "n_beats": int(cs.shape[0]),
        "tempo": round(float(np.atleast_1d(tempo)[0]), 2),
        "raw": raw,
    }
