# Crate Dig local API

Play files from their path on disk. Binds to `127.0.0.1` only. Does not copy the library.

```bash
cd apps/local-api
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cratedig-local-api
```

Then in the web app (`pnpm dev`), open `/import`, paste an absolute folder path, and play from `/map`.

Indexed extensions: `.mp3` `.mp4` `.m4a` `.aac` `.wav` `.flac` `.ogg` `.oga` `.aif` `.aiff` `.webm`.

AIFF is transcoded with ffmpeg when present. Everything else is streamed with HTTP Range from the stored `location`.
