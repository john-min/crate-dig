from __future__ import annotations

import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from cratedig_engine.audio import hash_audio_file

from cratedig_local_api import audio as playback
from cratedig_local_api import db
from cratedig_local_api.analysis_routes import create_analysis_router
from cratedig_local_api.csv_metadata import import_rekordbox_tracks_csv
from cratedig_local_api.evaluation_routes import create_evaluation_router
from cratedig_local_api.evaluation_service import EvaluationService
from cratedig_local_api.repository import Repository
from cratedig_local_api.rekordbox_metadata import (
    load_rekordbox_usb_index,
    probe_audio_tags,
)
from cratedig_local_api.runtime import (
    RepositoryAnalysisService,
    ensure_local_fast_manifest,
)
from cratedig_local_api.scan import AUDIO_EXTENSIONS, parse_filename, scan_folder_entries
from cratedig_local_api.settings import Settings


class FolderImportBody(BaseModel):
    folder_path: str = Field(min_length=1)
    library_name: str = "Local Music"


class CsvMetadataImportBody(BaseModel):
    csv_path: str = Field(min_length=1)
    source_ref: str | None = None


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    conn = db.connect(settings.sqlite_path)
    connection_lock = threading.RLock()
    repository = Repository(conn, connection_lock=connection_lock)
    ensure_local_fast_manifest(repository)
    app = FastAPI(title="Crate Dig local API", version="0.1.0")
    app.state.settings = settings
    app.state.repository = repository
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Range", "Content-Type"],
        expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
    )
    app.include_router(create_analysis_router(RepositoryAnalysisService(repository)))
    app.include_router(create_evaluation_router(EvaluationService(repository)))

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
        with repository.synchronized():
            return {"libraries": db.list_libraries(conn)}

    @app.post("/imports/folder")
    def import_folder(body: FolderImportBody):
        folder = Path(body.folder_path).expanduser()
        try:
            files = scan_folder_entries(folder)
        except NotADirectoryError as exc:
            raise HTTPException(status_code=400, detail=f"Not a folder: {exc}") from exc
        with repository.synchronized():
            rekordbox_index = load_rekordbox_usb_index(folder)
            library_id = db.get_or_create_library(
                conn, body.library_name.strip() or "Local Music", "folder"
            )
            added = 0
            outcomes: list[dict[str, object]] = []
            for path in files:
                if path.suffix.lower() not in AUDIO_EXTENSIONS:
                    outcomes.append(
                        {
                            "path": str(path),
                            "status": "unsupported",
                            "reason": "unsupported_extension",
                        }
                    )
                    continue
                artist, title = parse_filename(path, library_root=folder)
                try:
                    metadata = (
                        rekordbox_index.metadata_for(path)
                        if rekordbox_index is not None
                        else None
                    ) or probe_audio_tags(path)
                    if metadata is not None:
                        artist = metadata.artist or artist
                        title = metadata.title or title
                    stat = path.stat()
                    audio_content_hash = hash_audio_file(path)
                    duplicates = db.find_tracks_by_content_hash(conn, audio_content_hash)
                    track_id = db.upsert_track(
                        conn,
                        library_id=library_id,
                        title=title,
                        artist=artist,
                        location=str(path),
                        album=metadata.album if metadata else "",
                        genre=metadata.genre if metadata else "",
                        label=metadata.label if metadata else "",
                        bpm=metadata.bpm if metadata else None,
                        musical_key=metadata.musical_key if metadata else "",
                        duration_sec=metadata.duration_sec if metadata else None,
                        rating=metadata.rating if metadata else None,
                        date_added=metadata.date_added if metadata else "",
                        rekordbox_track_id=(
                            metadata.rekordbox_track_id if metadata else ""
                        ),
                        bpm_source=metadata.bpm_source if metadata else "",
                        key_source=metadata.key_source if metadata else "",
                        audio_content_hash=audio_content_hash,
                        file_size_bytes=stat.st_size,
                        file_mtime_ns=stat.st_mtime_ns,
                    )
                except OSError as exc:
                    outcomes.append(
                        {
                            "path": str(path),
                            "status": "failed",
                            "reason": type(exc).__name__.lower(),
                        }
                    )
                    continue
                added += 1
                outcomes.append(
                    {
                        "path": str(path),
                        "track_id": track_id,
                        "status": "duplicate" if duplicates else "imported",
                        "duplicate_of_track_id": duplicates[0].id if duplicates else None,
                        "warnings": ["missing_metadata"] if not artist else [],
                    }
                )
            tracks = db.list_tracks(conn, library_id)
        return {
            "library_id": library_id,
            "scanned": added,
            "examined": len(files),
            "tracks": len(tracks),
            "outcomes": outcomes,
        }

    @app.get("/libraries/{library_id}/tracks")
    def library_tracks(library_id: str):
        with repository.synchronized():
            libs = {row["id"] for row in db.list_libraries(conn)}
            if library_id not in libs:
                raise HTTPException(status_code=404, detail="Library not found")
            tracks = db.list_tracks(conn, library_id)
        return {"tracks": [_public_track(row) for row in tracks]}

    @app.post("/libraries/{library_id}/metadata/import-csv")
    def import_csv_metadata(library_id: str, body: CsvMetadataImportBody):
        source = Path(body.csv_path).expanduser()
        if not source.is_file():
            raise HTTPException(status_code=400, detail=f"CSV not found: {source}")
        try:
            with repository.synchronized():
                summary = import_rekordbox_tracks_csv(
                    conn,
                    library_id=library_id,
                    csv_path=source,
                    source_ref=body.source_ref,
                )
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except (OSError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return summary.as_dict()

    @app.get("/tracks")
    def all_tracks():
        with repository.synchronized():
            tracks = db.list_tracks(conn)
        return {"tracks": [_public_track(row) for row in tracks]}

    @app.get("/tracks/{track_id}")
    def one_track(track_id: str):
        with repository.synchronized():
            row = db.get_track(conn, track_id)
        if not row:
            raise HTTPException(status_code=404, detail="Track not found")
        return _public_track(row)

    @app.get("/audio/{track_id}")
    def audio(track_id: str, request: Request):
        with repository.synchronized():
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
        create_app(cfg),
        host=cfg.host,
        port=cfg.port,
        reload=False,
    )


if __name__ == "__main__":
    main()
