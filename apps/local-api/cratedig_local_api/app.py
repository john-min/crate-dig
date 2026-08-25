from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from cratedig_local_api import audio as playback
from cratedig_local_api import db
from cratedig_local_api.scan import parse_filename, scan_folder
from cratedig_local_api.settings import Settings


class FolderImportBody(BaseModel):
    folder_path: str = Field(min_length=1)
    library_name: str = "Local Music"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    conn = db.connect(settings.sqlite_path)
    app = FastAPI(title="Crate Dig local API", version="0.1.0")
    app.state.settings = settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Range", "Content-Type"],
        expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
    )

    @app.get("/health")
    def health():
        return {
            "ok": True,
            "host": settings.host,
            "ffmpeg": playback.have_ffmpeg(),
            "home": str(settings.home),
        }

    @app.get("/libraries")
    def libraries():
        return {"libraries": db.list_libraries(conn)}

    @app.post("/imports/folder")
    def import_folder(body: FolderImportBody):
        folder = Path(body.folder_path).expanduser()
        try:
            files = scan_folder(folder)
        except NotADirectoryError as exc:
            raise HTTPException(status_code=400, detail=f"Not a folder: {exc}") from exc
        library_id = db.get_or_create_library(conn, body.library_name.strip() or "Local Music", "folder")
        added = 0
        for path in files:
            artist, title = parse_filename(path)
            db.upsert_track(
                conn,
                library_id=library_id,
                title=title,
                artist=artist,
                location=str(path),
            )
            added += 1
        tracks = db.list_tracks(conn, library_id)
        return {
            "library_id": library_id,
            "scanned": added,
            "tracks": len(tracks),
        }

    @app.get("/libraries/{library_id}/tracks")
    def library_tracks(library_id: str):
        libs = {row["id"] for row in db.list_libraries(conn)}
        if library_id not in libs:
            raise HTTPException(status_code=404, detail="Library not found")
        return {"tracks": [_public_track(row) for row in db.list_tracks(conn, library_id)]}

    @app.get("/tracks")
    def all_tracks():
        return {"tracks": [_public_track(row) for row in db.list_tracks(conn)]}

    @app.get("/tracks/{track_id}")
    def one_track(track_id: str):
        row = db.get_track(conn, track_id)
        if not row:
            raise HTTPException(status_code=404, detail="Track not found")
        return _public_track(row)

    @app.get("/audio/{track_id}")
    def audio(track_id: str, request: Request):
        row = db.get_track(conn, track_id)
        if not row:
            raise HTTPException(status_code=404, detail="Track not found")
        source = Path(row.location)
        if not source.is_file():
            raise HTTPException(status_code=404, detail="File missing on disk")
        path = source
        content_type = playback.content_type_for(source)
        if playback.needs_transcode(source):
            dest = settings.preview_dir / f"{row.id}.mp3"
            path = playback.transcode_to_mp3(source, dest)
            content_type = "audio/mpeg"
        return playback.file_range_response(path, request, content_type)

    return app


def _public_track(row: db.TrackRow) -> dict:
    missing = not Path(row.location).is_file()
    return row.as_dict(missing=missing, preview_path=f"/audio/{row.id}")


def main() -> None:
    import uvicorn

    cfg = Settings.from_env()
    uvicorn.run(
        "cratedig_local_api.app:create_app",
        factory=True,
        host=cfg.host,
        port=cfg.port,
        reload=False,
    )


if __name__ == "__main__":
    main()
