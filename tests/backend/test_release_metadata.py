"""Release channel classification is deterministic and isolated from HACS runtime code."""

import runpy
from pathlib import Path
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[2]
MODULE: dict[str, Any] = runpy.run_path(str(ROOT / "scripts/release_metadata.py"))
classify_release = MODULE["classify_release"]
parse_version = MODULE["parse_version"]
write_github_output = MODULE["write_github_output"]


@pytest.mark.parametrize(
    ("tag", "prerelease", "make_latest"),
    [
        ("v0.1.0", False, True),
        ("v0.1.1-dev.1", True, False),
        ("v0.2.0-dev.1", True, False),
        ("v0.2.0-rc.1", True, False),
        ("v0.2.0-1rc.1", True, False),
    ],
)
def test_release_channel(tag: str, prerelease: bool, make_latest: bool) -> None:
    metadata = classify_release(tag, tag[1:])
    assert metadata.prerelease is prerelease
    assert metadata.make_latest is make_latest
    if prerelease:
        assert "explicitly select this version" in metadata.notes()
    else:
        assert "normal HACS installs and updates" in metadata.notes()


@pytest.mark.parametrize(
    "version",
    ["01.0.0", "1.0", "1.0.0-", "1.0.0-dev..1", "1.0.0-01", "1.0.0+"],
)
def test_invalid_semver_is_rejected(version: str) -> None:
    with pytest.raises(ValueError, match="semantic version"):
        parse_version(version)


def test_invalid_or_mismatched_tag_is_rejected() -> None:
    with pytest.raises(ValueError, match="start with v"):
        classify_release("0.1.0", "0.1.0")
    with pytest.raises(ValueError, match="does not match"):
        classify_release("v0.1.1", "0.1.0")


@pytest.mark.parametrize(
    ("tag", "expected"),
    [
        ("v0.1.0", "prerelease=false\nmake_latest=true\n"),
        ("v0.2.0-rc.1", "prerelease=true\nmake_latest=false\n"),
    ],
)
def test_github_outputs_are_lowercase_booleans(tmp_path: Path, tag: str, expected: str) -> None:
    output = tmp_path / "github-output"
    output.write_text("existing=value\n")
    write_github_output(output, classify_release(tag, tag[1:]))
    assert output.read_text() == f"existing=value\n{expected}"


@pytest.mark.parametrize("tag", ["v0.1.0", "v0.2.0-dev.1"])
def test_version_notes_append_without_changing_channel_guidance(tmp_path: Path, tag: str) -> None:
    metadata = classify_release(tag, tag[1:])
    guidance = metadata.notes(root=tmp_path)
    releases = tmp_path / "docs/releases"
    releases.mkdir(parents=True)
    (releases / "99.0.0.md").write_text("Unrelated release notes")
    assert metadata.notes(root=tmp_path) == guidance
    notes = releases / f"{metadata.version}.md"
    notes.write_text("\n# Upgrade\n\nRestart HA and reload before saving v2.\n")
    assert metadata.notes(root=tmp_path) == (
        f"{guidance}\n# Upgrade\n\nRestart HA and reload before saving v2.\n"
    )
    notes.write_text("\n")
    assert metadata.notes(root=tmp_path) == guidance


def test_release_cli_includes_matching_notes(tmp_path: Path) -> None:
    import json
    import subprocess
    import sys

    version = json.loads((ROOT / "package.json").read_text())["version"]
    output, notes = tmp_path / "github-output", tmp_path / "notes.md"
    result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/release_metadata.py"),
            f"v{version}",
            "--github-output",
            str(output),
            "--notes-file",
            str(notes),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    metadata = classify_release(f"v{version}", version)
    assert notes.read_text() == metadata.notes()
    local_notes = ROOT / "docs/releases" / f"{version}.md"
    if local_notes.exists():
        assert local_notes.read_text().strip() in notes.read_text()
