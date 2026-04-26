from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class RangeRequestHandler(SimpleHTTPRequestHandler):
    """Serve local files with byte-range support for smoother MP4 scrubbing."""

    def send_head(self):
        path = Path(self.translate_path(self.path))
        if path.is_dir():
            for index in ("index.html", "index.htm"):
                index_path = path / index
                if index_path.exists():
                    path = index_path
                    break
            else:
                return self.list_directory(path)

        if not path.exists():
            self.send_error(404, "File not found")
            return None

        file_size = path.stat().st_size
        range_header = self.headers.get("Range")
        content_type = self.guess_type(str(path))

        if not range_header:
            self.send_response(200)
            self.send_header("Content-type", content_type)
            self.send_header("Content-Length", str(file_size))
            self.send_header("Accept-Ranges", "bytes")
            self.end_headers()
            return path.open("rb")

        units, _, requested_range = range_header.partition("=")
        if units != "bytes":
            self.send_error(416, "Requested Range Not Satisfiable")
            return None

        start_text, _, end_text = requested_range.partition("-")
        start = int(start_text) if start_text else 0
        end = int(end_text) if end_text else file_size - 1
        end = min(end, file_size - 1)

        if start >= file_size or end < start:
            self.send_error(416, "Requested Range Not Satisfiable")
            return None

        self.send_response(206)
        self.send_header("Content-type", content_type)
        self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()

        source = path.open("rb")
        source.seek(start)
        self.range = (start, end)
        return source

    def copyfile(self, source, outputfile):
        if not hasattr(self, "range"):
            return super().copyfile(source, outputfile)

        start, end = self.range
        remaining = end - start + 1
        while remaining > 0:
            chunk = source.read(min(64 * 1024, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)
        del self.range


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8090), RangeRequestHandler)
    print("Serving http://127.0.0.1:8090 with byte-range video support")
    server.serve_forever()
