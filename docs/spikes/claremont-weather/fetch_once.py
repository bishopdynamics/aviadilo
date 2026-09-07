"""Fetch the explicit frozen request list once; never refresh existing cache files."""

import hashlib
import json
from pathlib import Path
import subprocess
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

BASE = Path(__file__).resolve().parent
CACHE = BASE / "cache"
ALLOWED_HOSTS = {
    "opengeo.ncep.noaa.gov", "mapservices.weather.noaa.gov",
    "geo.weather.gc.ca", "maps.dwd.de", "nomads.ncep.noaa.gov",
    "tile.openstreetmap.org", "tilecache.rainviewer.com", "tgftp.nws.noaa.gov",
}


def main():
    requests = json.loads((CACHE / "requests.json").read_text())
    log_path = CACHE / "download-log.json"
    log = json.loads(log_path.read_text()) if log_path.exists() else {}
    last = {}
    for request in requests:
        name = request["file"]
        url = request["url"]
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
            raise ValueError(f"Unapproved source: {url}")
        if Path(name).name != name:
            raise ValueError(f"Invalid cache filename: {name}")
        path = CACHE / name
        if path.exists() or name in log:
            print(f"ALREADY CAPTURED/ATTEMPTED {name}", flush=True)
            continue
        # The task is one bounded capture, with no automatic retry loop.
        host = parsed.hostname
        wait = 20 if host == "nomads.ncep.noaa.gov" else 2
        if host in last:
            time.sleep(max(0, wait - (time.monotonic() - last[host])))
        last[host] = time.monotonic()
        partial = CACHE / (name + ".partial")
        headers = CACHE / (name + ".headers")
        result = subprocess.run([
            "curl", "--silent", "--show-error", "--location",
            "--max-time", "90", "--proto", "=https",
            "--user-agent", "Aviadilo-static-research-spike/1.0",
            "--dump-header", str(headers), "--output", str(partial),
            "--write-out", "%{http_code}", url,
        ], capture_output=True, text=True)
        status = result.stdout.strip()
        successful = result.returncode == 0 and status == "200"
        # Preserve errors for diagnosis, but do not treat them as image data.
        target = path if successful else CACHE / (name + ".error")
        if partial.exists():
            partial.replace(target)
        log[name] = {
            "url": url, "httpStatus": status,
            "capturedAt": datetime.now(timezone.utc).isoformat(),
            "bytes": target.stat().st_size if target.exists() else 0,
            "sha256": hashlib.sha256(target.read_bytes()).hexdigest() if target.exists() else None,
            "error": None if successful else result.stderr.strip() or f"HTTP {status}",
        }
        log_path.write_text(json.dumps(log, indent=2) + "\n")
        print(f"{'SAVED' if successful else 'FAILED'} {name}: HTTP {status}, {log[name]['bytes']} bytes", flush=True)


if __name__ == "__main__":
    main()
