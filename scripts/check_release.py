"""Validate package identity, versions, bounded safe ZIP content and HACS layout."""

import argparse
import ast
import json
import re
import stat
import tomllib
from pathlib import Path, PurePosixPath
from zipfile import BadZipFile, ZipFile

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = {
    "LICENSE",
    "__init__.py",
    "manifest.json",
    "const.py",
    "models.py",
    "providers/base.py",
    "brand/icon.png",
    "frontend/aviadilo.js",
}
SEMVER = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$")


def check_release(path: Path, tag: str | None = None, root: Path = ROOT) -> None:
    """Reject mismatched or unsafe archives without extracting their contents."""
    package = json.loads((root / "package.json").read_text())
    version = package["version"]
    if package.get("license") != "MIT":
        raise ValueError("JavaScript package license is not MIT")
    if not SEMVER.fullmatch(version):
        raise ValueError("Invalid package semantic version")
    if tag is not None and tag != f"v{version}":
        raise ValueError("Tag version does not match package")
    project = tomllib.loads((root / "pyproject.toml").read_text())["project"]
    if project.get("license") != "MIT":
        raise ValueError("Python package license is not MIT")
    python_version = re.sub(r"-dev\.(\d+)$", r".dev\1", version)
    if project["version"] != python_version:
        raise ValueError("Python package version does not match")
    hacs = json.loads((root / "hacs.json").read_text())
    expected_hacs = {
        "name": "Aviadilo",
        "homeassistant": "2026.9.1",
        "zip_release": True,
        "filename": "aviadilo.zip",
        "hide_default_branch": True,
    }
    if hacs != expected_hacs:
        raise ValueError("HACS metadata does not match approved packaging")
    integrations = sorted(
        p.name
        for p in (root / "custom_components").iterdir()
        if p.is_dir() and p.name != "__pycache__"
    )
    if integrations != ["aviadilo"]:
        raise ValueError("Exactly one integration directory is required")
    source_manifest = json.loads((root / "custom_components/aviadilo/manifest.json").read_text())
    source_license = (root / "LICENSE").read_bytes()
    with ZipFile(path) as archive:
        entries = archive.infolist()
        names = [item.filename for item in entries]
        if len(names) != len(set(names)):
            raise ValueError("Duplicate ZIP paths")
        if not REQUIRED <= set(names):
            raise ValueError("Required runtime files are missing")
        if len(entries) > 1000 or sum(item.file_size for item in entries) > 32 * 1024 * 1024:
            raise ValueError("Archive exceeds bootstrap package budget")
        for item in entries:
            p = PurePosixPath(item.filename)
            if (
                p.is_absolute()
                or ".." in p.parts
                or "\\" in item.filename
                or ":" in item.filename
                or item.filename != p.as_posix()
                or not p.parts
                or p.parts[0] == "custom_components"
                or "__pycache__" in p.parts
                or stat.S_ISLNK(item.external_attr >> 16)
            ):
                raise ValueError("Unsafe ZIP path or entry")
            if not (
                item.filename == "LICENSE"
                or p.suffix in {".py", ".json"}
                or p.parts[0] in {"brand", "frontend"}
            ):
                raise ValueError("Unexpected non-runtime file")
        if archive.testzip() is not None:
            raise ValueError("Corrupt ZIP content")
        if archive.read("LICENSE") != source_license:
            raise ValueError("License content does not match source LICENSE")
        manifest = json.loads(archive.read("manifest.json"))
        if manifest != source_manifest or manifest.get("version") != version:
            raise ValueError("Manifest version/content does not match source package")
        for key in ("domain", "name", "codeowners", "documentation", "issue_tracker", "version"):
            if not manifest.get(key):
                raise ValueError(f"Missing manifest field: {key}")
        if manifest["domain"] != "aviadilo":
            raise ValueError("Incorrect integration domain")
        constants = ast.parse(archive.read("const.py"))
        runtime_versions = [
            node.value.value
            for node in constants.body
            if isinstance(node, ast.Assign)
            and any(
                isinstance(target, ast.Name) and target.id == "VERSION" for target in node.targets
            )
            and isinstance(node.value, ast.Constant)
        ]
        if runtime_versions != [version]:
            raise ValueError("Runtime bootstrap version does not match manifest")
        javascript = archive.read("frontend/aviadilo.js").decode()
        if not javascript.startswith(f"/*! Aviadilo version: {version} */"):
            raise ValueError("JavaScript build version does not match manifest")
        if not archive.read("brand/icon.png").startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError("Brand icon is not PNG")
    print(f"Validated {path.name}: integration-root layout, {version}, safe runtime files")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--tag")
    args = parser.parse_args()
    try:
        check_release(args.archive, args.tag)
    except (ValueError, BadZipFile) as error:
        parser.exit(1, f"Release validation failed: {error}\n")
