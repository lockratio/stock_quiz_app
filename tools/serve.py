"""Tiny no-cache static server for local dev (GitHub Pages needs no server).

    python tools/serve.py [port]     # default 8777, serves the repo root

No-store headers so edits to JS/CSS/data show up on every reload.
"""
import sys, http.server, socketserver
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
ROOT = Path(__file__).resolve().parent.parent

class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"          # keep-alive; avoids Chromium conn resets
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(ROOT), **k)
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()
    def log_message(self, *a):
        pass                                # quiet

class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

with Server(("127.0.0.1", PORT), Handler) as httpd:
    print(f"serving {ROOT} at http://127.0.0.1:{PORT}/  (no-cache)")
    httpd.serve_forever()
