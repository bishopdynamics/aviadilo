"""Validate a release tag and derive its GitHub release channel metadata."""

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEMVER = re.compile(
    r"^(0|[1-9]\d*)\."
    r"(0|[1-9]\d*)\."
    r"(0|[1-9]\d*)"
    r"(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)"
    r"(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$"
)


@dataclass(frozen=True)
class ReleaseMetadata:
    """Validated metadata consumed by the release workflow."""

    version: str
    prerelease: bool

    @property
    def make_latest(self) -> bool:
        """Only stable releases may become the default HACS release."""
        return not self.prerelease

    def notes(self) -> str:
        """Return concise installation guidance for this release channel."""
        if self.prerelease:
            return (
                "Development release. In HACS, open Download/Redownload, expand "
                '"Need a different version?", and explicitly select this version. '
                "Restart Home Assistant when prompted.\n"
            )
        return (
            "Regular release for normal HACS installs and updates. Add "
            "`bishopdynamics/aviadilo` as a custom Integration repository if it is not "
            "already installed, then use the standard HACS Download or Update action. "
            "Restart Home Assistant when prompted.\n"
        )


def parse_version(version: str) -> tuple[int, int, int, str | None]:
    """Parse a strict SemVer 2.0.0 version or reject it."""
    match = SEMVER.fullmatch(version)
    if match is None:
        raise ValueError("Invalid package semantic version")
    return int(match[1]), int(match[2]), int(match[3]), match[4]


def classify_release(tag: str, expected_version: str) -> ReleaseMetadata:
    """Reject invalid or mismatched tags and classify stable versus prerelease."""
    if not tag.startswith("v"):
        raise ValueError("Release tag must start with v")
    version = tag[1:]
    _, _, _, prerelease = parse_version(version)
    if version != expected_version:
        raise ValueError("Tag version does not match package")
    return ReleaseMetadata(version=version, prerelease=prerelease is not None)


def write_github_output(path: Path, metadata: ReleaseMetadata) -> None:
    """Write booleans in the exact form expected by Actions and GitHub CLI."""
    with path.open("a") as output:
        output.write(
            f"prerelease={str(metadata.prerelease).lower()}\n"
            f"make_latest={str(metadata.make_latest).lower()}\n"
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tag")
    parser.add_argument("--github-output", type=Path, required=True)
    parser.add_argument("--notes-file", type=Path, required=True)
    args = parser.parse_args()
    expected = json.loads((ROOT / "package.json").read_text())["version"]
    try:
        release = classify_release(args.tag, expected)
    except ValueError as error:
        parser.exit(1, f"Release metadata validation failed: {error}\n")
    write_github_output(args.github_output, release)
    args.notes_file.write_text(release.notes())
