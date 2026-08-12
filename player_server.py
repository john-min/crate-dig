"""Local player for the djvibe dashboard (also saves 👍/👎 feedback).

Run this and it will (re)build the dashboard, start a small web server on your
own computer (127.0.0.1 only), and open the dashboard in your browser.

    python3 player_server.py

Serves the dashboard + streams audio for tracks in your rekordbox collection,
and accepts POSTed feedback votes into <workdir>/feedback.jsonl. Nothing leaves
your machine. Press Control+C to stop.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import threading
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pandas as pd

from djvibe import io

WORKDIR = os.environ.get("DJVIBE_WORKDIR", "./djvibe_data")
PORT = int(os.environ.get("DJVIBE_PORT", "8765"))

CTYPE = {".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac",
         ".wav": "audio/wav", ".flac": "audio/flac", ".ogg": "audio/ogg",
         ".oga": "audio/ogg", ".aif": "audio/aiff", ".aiff": "audio/aiff"}
TRANSCODE_EXT = {".aif", ".aiff"}
HAVE_FFMPEG = shutil.which("ffmpeg") is not None

ID2PATH: dict[str, str] = {}
DASHBOARD_HTML = b""


def _load():
    global ID2PATH, DASHBOARD_HTML
    ws = io.Workspace(WORKDIR)
    df = pd.read_csv(ws.tracks_csv, dtype={"track_id": str})
    ID2PATH = {str(r.track_id): str(r.location) for r in df.itertuples(index=False)}
    DASHBOARD_HTML = ws.dashboard_html.read_bytes()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path in ("/", "/index.html"):
            return self._send_page()
        if parsed.path == "/audio":
            qs = urllib.parse.parse_qs(parsed.query)
            return self._send_audio(qs.get("id", [""])[0])
        self.send_error(404)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/feedback":
            n = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(n).decode("utf-8", "ignore").strip()
            try:
                ws = io.Workspace(WORKDIR)
                with open(ws.root / "feedback.jsonl", "a", encoding="utf-8") as f:
                    f.write(body + "\n")
                self.send_response(200)
                self.send_header("Content-Length", "2")
                self.end_headers()
                self.wfile.write(b"ok")
            except Exception:
                self.send_error(500)
            return
        self.send_error(404)

    def _send_page(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(DASHBOARD_HTML)))
        self.end_headers()
        self.wfile.write(DASHBOARD_HTML)

    def _send_audio(self, tid):
        path = ID2PATH.get(tid)
        if not path or not os.path.exists(path):
            return self.send_error(404, "track not found")
        ext = os.path.splitext(path)[1].lower()
        if ext in TRANSCODE_EXT and HAVE_FFMPEG:
            return self._stream_transcoded(path)
        return self._stream_file(path, CTYPE.get(ext, "application/octet-stream"))

    def _stream_file(self, path, ctype):
        size = os.path.getsize(path)
        rng = self.headers.get("Range")
        start, end, partial = 0, size - 1, False
        if rng and rng.startswith("bytes="):
            partial = True
            s, _, e = rng[6:].partition("-")
            start = int(s) if s else 0
            end = int(e) if e else size - 1
            end = min(end, size - 1)
        length = end - start + 1
        try:
            self.send_response(206 if partial else 200)
            self.send_header("Content-Type", ctype)
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(length))
            if partial:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.end_headers()
            with open(path, "rb") as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = f.read(min(64 * 1024, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _stream_transcoded(self, path):
        try:
            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg")
            self.end_headers()
            proc = subprocess.Popen(
                ["ffmpeg", "-i", path, "-f", "mp3", "-b:a", "192k", "-vn",
                 "-loglevel", "error", "pipe:1"],
                stdout=subprocess.PIPE)
            shutil.copyfileobj(proc.stdout, self.wfile)
            proc.stdout.close(); proc.wait()
        except (BrokenPipeError, ConnectionResetError):
            pass


def serve(workdir=None, do_build=True):
    global WORKDIR
    if workdir:
        WORKDIR = workdir
    if do_build:
        import dashboard_studio
        dashboard_studio.build(WORKDIR)
    _load()
    url = f"http://127.0.0.1:{PORT}/"
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"\n[player] serving {len(ID2PATH)} tracks at {url}")
    print(f"[player] ffmpeg for AIFF: {'yes' if HAVE_FFMPEG else 'no (AIFF plays in Safari only)'}")
    print("[player] opening your browser… press Control+C here to stop.\n")
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[player] stopped.")


def main():
    serve(WORKDIR, do_build=True)


if __name__ == "__main__":
    main()
