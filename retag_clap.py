"""Re-tag a finished CLAP run from its CACHED embeddings — no audio re-analysis.

Recomputes the vibe tags from the embeddings already in the cache (fast), so
vocabulary / calibration changes take effect without re-analyzing audio.

Calibration (how a tag's scores are normalized across your library):
  mixed (default) — INSTRUMENTATION tags (vocal, piano, acid, ...) use an
                    absolute, world-relative scale (is the element actually
                    present?); everything else — energy, mood, AND texture —
                    uses a library-relative z-score so no tag over-spreads.
  --mode zscore   — everything library-relative (z-score)
  --mode centered — everything library-relative (gentler; subtract mean only)
  --mode raw      — everything absolute (no calibration; some tags act as catch-alls)

Run inside the CLAP environment (needs torch/transformers):
    source clap_env/bin/activate
    python retag_clap.py --workdir djvibe_clap
    deactivate
    DJVIBE_WORKDIR=djvibe_clap python3 player_server.py
"""
from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

from djvibe import io
from djvibe.features import ClapBackend

# Only genuine "element present or not" tags stay ABSOLUTE. Texture words
# (bright, dubby, gritty, ...) are relative and over-spread when absolute, so
# they are z-scored with everything else. Add a tag here to make it absolute.
RAW_TAGS = {
    "vocal", "instrumental", "acid", "piano", "arpeggiated", "sub-heavy bass",
}


def calibrate(sims, prompts, mode="mixed"):
    """Normalize the [N, P] similarity matrix per the chosen mode."""
    sims = sims.astype(float)
    if mode == "raw":
        return sims
    if mode == "zscore":
        return (sims - sims.mean(0, keepdims=True)) / (sims.std(0, keepdims=True) + 1e-6)
    if mode == "centered":
        return sims - sims.mean(0, keepdims=True)
    # mixed: instrumentation absolute (global-normalized), rest library z-score
    cal = sims.copy()
    obj = [j for j in range(sims.shape[1]) if prompts[j] in RAW_TAGS]
    subj = [j for j in range(sims.shape[1]) if j not in obj]
    for j in subj:
        col = sims[:, j]
        cal[:, j] = (col - col.mean()) / (col.std() + 1e-6)
    if obj:
        block = sims[:, obj]                       # absolute: NOT per-prompt centered
        block = (block - block.mean()) / (block.std() + 1e-6)   # rescaled to be comparable
        for k, j in enumerate(obj):
            cal[:, j] = block[:, k]
    return cal


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workdir", default="djvibe_clap")
    ap.add_argument("--mode", default="mixed",
                    choices=["mixed", "zscore", "centered", "raw"])
    args = ap.parse_args()
    ws = io.Workspace(args.workdir)

    backend = ClapBackend()
    import torch

    rows = [r for r in io.read_jsonl(ws.audio_cache) if r.get("ok")]
    if not rows:
        raise SystemExit(f"[retag] no cached analyses in {ws.audio_cache}")
    ids = [r["track_id"] for r in rows]

    E = torch.tensor(np.asarray([r["embedding"] for r in rows], dtype=np.float32),
                     device=backend.device)
    E = torch.nn.functional.normalize(E, dim=-1)
    sims = (E @ backend.text_emb.T).detach().cpu().numpy()    # [N, P]

    cal = calibrate(sims, backend.PROMPTS, args.mode)
    n_obj = sum(p in RAW_TAGS for p in backend.PROMPTS)
    print(f"[retag] {len(ids)} tracks — mode: {args.mode}"
          + (f" ({n_obj} instrumentation tags absolute, rest z-scored)" if args.mode == "mixed" else ""))

    feat_rows = []
    for i, tid in enumerate(ids):
        f = backend._feats_from_sims(cal[i])
        f["track_id"] = tid
        feat_rows.append(f)
    out = pd.DataFrame(feat_rows)
    out.to_csv(ws.features_csv, index=False)

    print(f"[retag] wrote {ws.features_csv}")
    print("[retag] dominant-vibe spread:")
    for g, n in out["genre_pred"].value_counts().head(16).items():
        print(f"    {g:16s} {n:5d}  {100*n/len(out):4.0f}%")
    print(f"[retag] now rebuild: DJVIBE_WORKDIR={args.workdir} python3 player_server.py")


if __name__ == "__main__":
    main()
