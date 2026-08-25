from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def default_home() -> Path:
    override = (os.environ.get("CRATE_DIG_HOME") or "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return Path.home() / ".crate-dig"


@dataclass(frozen=True)
class Settings:
    home: Path
    host: str = "127.0.0.1"
    port: int = 8000
    cors_origins: tuple[str, ...] = (
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    )

    @property
    def sqlite_path(self) -> Path:
        return self.home / "crate-dig.sqlite"

    @property
    def preview_dir(self) -> Path:
        return self.home / "artifacts" / "previews"

    @classmethod
    def from_env(cls) -> Settings:
        home = default_home()
        host = (os.environ.get("CRATE_DIG_API_HOST") or "127.0.0.1").strip()
        port_raw = (os.environ.get("CRATE_DIG_API_PORT") or "8000").strip()
        try:
            port = int(port_raw)
        except ValueError:
            port = 8000
        return cls(home=home, host=host, port=port)
