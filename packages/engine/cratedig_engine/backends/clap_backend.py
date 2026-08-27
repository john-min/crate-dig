"""CLAP deep backend. Optional: requires torch + transformers + librosa."""

from __future__ import annotations

from cratedig_engine.audio.excerpt import core_excerpt
from cratedig_engine.schemas import BackendOutput

DEFAULT_CLAP_MODEL = "laion/clap-htsat-unfused"


class ClapBackend:
    name = "clap"
    model_version = DEFAULT_CLAP_MODEL

    VIBES = [
        "driving",
        "punchy",
        "intense",
        "percussive",
        "hypnotic",
        "dark",
        "warm",
        "euphoric",
        "dreamy",
        "atmospheric",
        "minimal",
        "deep",
        "raw",
        "vocal",
        "instrumental",
        "piano",
    ]
    ENERGY = {"driving", "punchy", "intense", "percussive"}
    VALENCE = {"euphoric", "warm", "dreamy"}
    PROMPT_TEXT = {
        "acid": "squelchy acid 303 synth line",
        "vocal": "a song with clear vocals or singing",
        "instrumental": "purely instrumental music with no vocals",
        "sub-heavy bass": "deep heavy sub bass",
        "arpeggiated": "an arpeggiated synth melody",
        "piano": "prominent piano",
    }

    def _prompt_for(self, tag: str) -> str:
        return self.PROMPT_TEXT.get(tag, tag + " music")

    def __init__(
        self,
        model_id: str = DEFAULT_CLAP_MODEL,
        sr: int = 48000,
        n_windows: int = 3,
        win_sec: int = 10,
    ):
        import torch
        from transformers import ClapModel, ClapProcessor

        self.torch = torch
        self.sr = sr
        self.n_windows = n_windows
        self.win = sr * win_sec
        self.model_version = model_id
        self.device = (
            "mps"
            if torch.backends.mps.is_available()
            else "cuda"
            if torch.cuda.is_available()
            else "cpu"
        )
        self.model = ClapModel.from_pretrained(model_id).to(self.device).eval()
        self.processor = ClapProcessor.from_pretrained(model_id)

        tin = self.processor(
            text=[self._prompt_for(p) for p in self.VIBES],
            return_tensors="pt",
            padding=True,
        ).to(self.device)
        with torch.no_grad():
            out = self.model.get_text_features(**tin)
        t = self._as_embeds(out)
        self.text_emb = torch.nn.functional.normalize(t, dim=-1)

    def _as_embeds(self, out):
        if self.torch.is_tensor(out):
            return out
        for attr in ("text_embeds", "audio_embeds", "pooler_output"):
            v = getattr(out, attr, None)
            if self.torch.is_tensor(v):
                return v
        if isinstance(out, (tuple, list)) and self.torch.is_tensor(out[0]):
            return out[0]
        raise TypeError(f"cannot extract embedding tensor from {type(out)}")

    def analyze(self, audio_path: str) -> BackendOutput:
        import librosa
        import numpy as np

        y, _ = librosa.load(audio_path, sr=self.sr, mono=True)
        if y.size == 0:
            raise ValueError("empty audio")
        y = core_excerpt(y, self.sr, max_sec=120)

        if len(y) <= self.win:
            chunks = [y]
        else:
            n = min(self.n_windows, max(1, len(y) // self.win))
            starts = np.linspace(0, len(y) - self.win, num=n).astype(int)
            chunks = [y[s : s + self.win] for s in starts]

        try:
            ain = self.processor(
                audio=chunks,
                sampling_rate=self.sr,
                return_tensors="pt",
                padding=True,
            )
        except TypeError:
            ain = self.processor(
                audios=chunks,
                sampling_rate=self.sr,
                return_tensors="pt",
                padding=True,
            )
        ain = ain.to(self.device)
        with self.torch.no_grad():
            out = self.model.get_audio_features(**ain)
        a = self._as_embeds(out)
        a_mean = a.mean(dim=0, keepdim=True)
        embedding = a_mean.squeeze(0).cpu().numpy().astype(np.float32)

        a_n = self.torch.nn.functional.normalize(a_mean, dim=-1)
        sims = (a_n @ self.text_emb.T).squeeze(0).cpu().numpy()
        return BackendOutput(
            embedding=[float(x) for x in embedding.tolist()],
            features=self._feats_from_sims(sims),
            embedding_dim=int(embedding.shape[0]),
        )

    def _feats_from_sims(self, sims) -> dict:
        feats: dict = {}
        order = sorted(range(len(self.VIBES)), key=lambda i: sims[i], reverse=True)
        for i in order[:6]:
            feats[f"vibe::{self.VIBES[i]}"] = round(float(sims[i]), 4)
        feats["mood_top"] = " / ".join(self.VIBES[i] for i in order[:3])
        feats["genre_pred"] = self.VIBES[order[0]]
        feats["energy_rms"] = round(
            float(sum(sims[self.VIBES.index(p)] for p in self.ENERGY) / len(self.ENERGY)),
            5,
        )
        feats["engagement"] = round(
            float(sum(sims[self.VIBES.index(p)] for p in self.VALENCE) / len(self.VALENCE)),
            5,
        )
        return feats
