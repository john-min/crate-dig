from __future__ import annotations

import json
import runpy
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts" / "export_local_api_openapi.py"
CHECKED_IN = ROOT / "contracts" / "openapi" / "local-api.json"
EXPECTED_PATHS = {
    "/analysis-runs/{run_id}",
    "/analysis-runs/{run_id}/cancel",
    "/analysis-runs/{run_id}/tracks",
    "/analysis-stages/{stage_id}/retry",
    "/audio/{track_id}",
    "/evaluation-sets",
    "/evaluation-sets/{evaluation_set_id}",
    "/evaluation-sets/{evaluation_set_id}/anchors/{anchor_track_id}/neighbors",
    "/evaluation-sets/{evaluation_set_id}/judgments",
    "/evaluation-sets/{evaluation_set_id}/next",
    "/evaluation-sets/{evaluation_set_id}/report",
    "/evaluation-sets/{evaluation_set_id}/runs",
    "/evaluation-sets/{evaluation_set_id}/runs/{evaluation_run_id}/metrics",
    "/health",
    "/imports/folder",
    "/libraries",
    "/libraries/{library_id}/analysis-runs",
    "/libraries/{library_id}/metadata/import-csv",
    "/libraries/{library_id}/tracks",
    "/tracks",
    "/tracks/{track_id}",
    "/tracks/{track_id}/analysis",
    "/tracks/{track_id}/neighbors",
}


def test_openapi_export_is_deterministic_and_covers_current_routes():
    module = runpy.run_path(str(SCRIPT))
    first = module["render_openapi"]()
    second = module["render_openapi"]()

    assert first == second
    assert first == CHECKED_IN.read_text(encoding="utf-8")

    schema = json.loads(first)
    assert set(schema["paths"]) == EXPECTED_PATHS

    audio_responses = schema["paths"]["/audio/{track_id}"]["get"]["responses"]
    partial = audio_responses["206"]
    assert partial["content"]["application/octet-stream"]["schema"] == {
        "type": "string",
        "format": "binary",
    }
    assert set(partial["headers"]) == {
        "Accept-Ranges",
        "Content-Length",
        "Content-Range",
        "Content-Type",
    }

    for path, path_item in schema["paths"].items():
        for method, operation in path_item.items():
            if method == "parameters":
                continue
            success_responses = {
                code: response
                for code, response in operation["responses"].items()
                if code.startswith("2")
            }
            assert success_responses, f"{method.upper()} {path} has no success response"
            for code, response in success_responses.items():
                content = response.get("content", {})
                assert content, f"{method.upper()} {path} {code} has no typed content"
                for media_type in content.values():
                    assert media_type.get("schema"), (
                        f"{method.upper()} {path} {code} has no response schema"
                    )
