"""Export the local API OpenAPI contract without touching a real user database."""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "local-api"))
sys.path.insert(0, str(ROOT / "packages" / "engine"))

from cratedig_local_api.app import create_app  # noqa: E402
from cratedig_local_api.settings import Settings  # noqa: E402


OUTPUT = ROOT / "contracts" / "openapi" / "local-api.json"


def render_openapi() -> str:
    with tempfile.TemporaryDirectory(prefix="crate-dig-openapi-") as home:
        app = create_app(Settings(home=Path(home)))
        schema = app.openapi()
        app.state.repository.conn.close()
    return json.dumps(schema, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(render_openapi(), encoding="utf-8")
    print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
