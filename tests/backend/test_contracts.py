"""Both language ends consume this exact corpus; no provider requests are made."""

import json
import math
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any
from zipfile import ZipFile

import pytest
from jsonschema import Draft7Validator, FormatChecker

from custom_components.aviadilo.models import ContractError, ensure_finite, validate_geometry

ROOT = Path(__file__).resolve().parents[2]
CASES = json.loads((ROOT / "contracts/fixtures/cases.json").read_text())


def validate(name: str, value: dict[str, Any]) -> None:
    ensure_finite(value)
    schema = json.loads((ROOT / f"contracts/{name}.schema.json").read_text())
    Draft7Validator.check_schema(schema)
    Draft7Validator(schema, format_checker=FormatChecker()).validate(value)
    validate_geometry(name, value)


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_shared_fixture(case: dict[str, Any]) -> None:
    if case["valid"]:
        validate(case["schema"], case["value"])
    else:
        from jsonschema import ValidationError

        with pytest.raises((ValidationError, ContractError)):
            validate(case["schema"], case["value"])


@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_reject_nonfinite(value: float) -> None:
    config = json.loads((ROOT / "contracts/card-defaults.json").read_text())
    config["people"]["radius_m"] = value
    with pytest.raises(ContractError, match="finite"):
        validate("card-config", config)


def test_packaging_validation_and_determinism(tmp_path: Path) -> None:
    # A minimal isolated source tree tests packaging without relying on a prior build.
    sandbox = tmp_path / "source"
    integration = sandbox / "custom_components/aviadilo"
    integration.mkdir(parents=True)
    for filename in ("package.json", "hacs.json", "pyproject.toml"):
        shutil.copy(ROOT / filename, sandbox / filename)
    for filename in (
        "__init__.py",
        "models.py",
        "providers/base.py",
        "manifest.json",
        "brand/icon.png",
    ):
        target = integration / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(ROOT / "custom_components/aviadilo" / filename, target)
    version = json.loads((sandbox / "package.json").read_text())["version"]
    (integration / "frontend").mkdir()
    (integration / "frontend/aviadilo.js").write_text(f"/*! Aviadilo version: {version} */\n")
    sys.path.insert(0, str(ROOT / "scripts"))
    try:
        import build_release
        import check_release

        first, second = tmp_path / "first.zip", tmp_path / "second.zip"
        build_release.build_release(first, f"v{version}", sandbox)
        build_release.build_release(second, f"v{version}", sandbox)
        assert first.read_bytes() == second.read_bytes()
        with pytest.raises(ValueError, match="Tag version"):
            check_release.check_release(first, "v99.0.0", sandbox)
        with ZipFile(first) as archive:
            files = {item.filename: archive.read(item) for item in archive.infolist()}
        mutations: list[tuple[str, dict[str, bytes | None], str]] = [
            ("unsafe", {"../escape.py": b""}, "Unsafe"),
            ("missing", {"frontend/aviadilo.js": None}, "missing"),
            (
                "wrong-js",
                {"frontend/aviadilo.js": b"/*! Aviadilo version: 99.0.0 */"},
                "JavaScript",
            ),
            ("wrong-manifest", {"manifest.json": b'{"version":"99.0.0"}'}, "Manifest"),
        ]
        for name, mutation, error in mutations:
            changed: dict[str, bytes | None] = dict(files)
            changed.update(mutation)
            bad = tmp_path / f"{name}.zip"
            with ZipFile(bad, "w") as archive:
                for filename, content in changed.items():
                    if content is not None:
                        archive.writestr(filename, content)
            with pytest.raises(ValueError, match=error):
                check_release.check_release(bad, root=sandbox)
        # Extract only the validated archive and prove model imports are self-contained.
        installed = tmp_path / "installed"
        with ZipFile(first) as archive:
            archive.extractall(installed)
        result = subprocess.run(
            [sys.executable, "-I", "-c", "import runpy; runpy.run_path('models.py')"],
            cwd=installed,
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode == 0, result.stderr
    finally:
        sys.path.pop(0)
