"""Build a byte-reproducible, allowlisted integration-root HACS archive."""

import argparse
import json
from pathlib import Path
from zipfile import ZIP_STORED, ZipFile, ZipInfo

from check_release import check_release

ROOT = Path(__file__).resolve().parents[1]


def build_release(output: Path, tag: str | None = None, root: Path = ROOT) -> None:
    """Archive runtime sources only, with fixed timestamps/modes and ordering."""
    integration = root / "custom_components" / "aviadilo"
    license_path = root / "LICENSE"
    if license_path.is_symlink():
        raise ValueError("LICENSE must not be a symbolic link")
    if not license_path.is_file():
        raise ValueError("LICENSE is missing")
    paths = [
        p
        for p in integration.rglob("*")
        if p.is_file()
        and "__pycache__" not in p.parts
        and (
            p.suffix in {".py", ".json"}
            or p.relative_to(integration).parts[0] in {"frontend", "brand"}
        )
    ]
    if any(p.is_symlink() for p in integration.rglob("*")):
        raise ValueError("Integration contains a symbolic link")
    release_files = [(path.relative_to(integration).as_posix(), path) for path in paths]
    release_files.append(("LICENSE", license_path))
    release_files.sort(key=lambda item: item[0])
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "w", compression=ZIP_STORED) as archive:
        for name, path in release_files:
            item = ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            item.create_system = 3
            item.external_attr = 0o100644 << 16
            archive.writestr(item, path.read_bytes())
    check_release(output, tag=tag, root=root)
    version = json.loads((root / "package.json").read_text())["version"]
    print(f"Built {output} ({version}); {len(release_files)} release files")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "dist" / "aviadilo.zip")
    parser.add_argument("--tag")
    args = parser.parse_args()
    build_release(args.output, args.tag)
