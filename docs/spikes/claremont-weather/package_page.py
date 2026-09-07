"""Build a single offline HTML artifact, embedding only local validated PNGs."""

import base64
import json
from pathlib import Path
import re

BASE = Path(__file__).resolve().parent
data = json.loads((BASE / "snapshots.json").read_text())
for snapshot in data["snapshots"]:
    path = (BASE / snapshot["image"]).resolve()
    if BASE.resolve() not in path.parents or path.suffix != ".png":
        raise ValueError("Snapshot image must be a local PNG")
    contents = path.read_bytes()
    if not contents.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("Invalid PNG")
    snapshot["image"] = "data:image/png;base64," + base64.b64encode(contents).decode()
html = (BASE / "index.html").read_text()
style = (BASE / "style.css").read_text()
script = (BASE / "app.js").read_text()
inline_data = json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")
html = html.replace('<link rel="stylesheet" href="style.css">', "<style>" + style + "</style>")
html = html.replace('<script src="snapshots.js" defer></script>', "")
html = html.replace('<script src="app.js" defer></script>', "")
html = html.replace("</body>", "<script>window.SPIKE_DATA = " + inline_data + ";</script>\n<script>" + script + "</script>\n</body>")
(BASE / "comparison.html").write_text(html)
print(f"comparison.html: {len(data['snapshots'])} embedded PNGs, {len(html.encode()):,} bytes")
