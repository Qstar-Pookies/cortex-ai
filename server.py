#!/usr/bin/env python3
"""Tiny local proxy for NVIDIA NIM while serving the static site.

Run:  python3 server.py [port]   (default 8000)
Open: http://localhost:8000

POST /v1/chat/completions is forwarded to NVIDIA NIM with your key.
Everything else is served as a normal static file server.
"""

import json
import os
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

NVIDIA_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions"
# Replace this with your real key when you rotate it.
# Or run:  NVIDIA_API_KEY="your-real-key" python3 server.py 8000
DEFAULT_NVIDIA_API_KEY = "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"


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        if self.path.startswith("/v1/chat/completions") or self.path.startswith("/api/nim"):
            self._proxy_nim()
        else:
            self.send_error(404, "Not found")
            return

        try:
            length = int(self.headers.get("Content-Length") or 0)
            payload = self.rfile.read(length)
        except Exception:
            self.send_error(400, "Bad request body")
            return

        api_key = os.environ.get("NVIDIA_API_KEY") or DEFAULT_NVIDIA_API_KEY
        request = urllib.request.Request(
            NVIDIA_ENDPOINT,
            data=payload,
            method="POST",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "Accept": self.headers.get("Accept") or "application/json",
            },
        )

        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                body = response.read()
                self.send_response(response.status)
                self.send_header(
                    "Content-Type",
                    response.headers.get("Content-Type") or "application/json",
                )
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
        except Exception as error:
            self.send_response(502)
            message = json.dumps({"error": str(error)}).encode()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(message)))
            self.end_headers()
            self.wfile.write(message)


def main():
    port = int(os.sys.argv[1]) if len(os.sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(("", port), Handler)
    print(f"Serving {os.getcwd()} on http://localhost:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
