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

from custom_components.aviadilo.assets import validate_asset
from custom_components.aviadilo.models import ContractError, ensure_finite, validate_geometry

ROOT = Path(__file__).resolve().parents[2]
CASES = json.loads((ROOT / "contracts/fixtures/cases.json").read_text())
ASSET_CASES = json.loads((ROOT / "contracts/fixtures/asset-cases.json").read_text())


@pytest.mark.parametrize("case", ASSET_CASES, ids=[case["name"] for case in ASSET_CASES])
def test_asset_fixture(case: dict[str, Any]) -> None:
    from jsonschema import ValidationError

    def check() -> None:
        schema = json.loads((ROOT / "contracts/assets.schema.json").read_text())
        Draft7Validator.check_schema(schema)
        Draft7Validator(schema).validate(case["value"])
        validate_asset(case["value"])

    if case["valid"]:
        check()
    else:
        with pytest.raises((ValidationError, ValueError)):
            check()
        with pytest.raises(ValueError):
            validate_asset(case["value"])


def validate(name: str, value: dict[str, Any]) -> None:
    ensure_finite(value)
    schema = json.loads((ROOT / f"contracts/{name}.schema.json").read_text())
    Draft7Validator.check_schema(schema)
    Draft7Validator(schema, format_checker=FormatChecker()).validate(value)
    # The backend consumes only v1 integration/feed protocols. Its shared
    # geometry checks also exercise card fixtures, after the card schema gate.
    if name in ("card-config", "card-config-v1"):
        validate_geometry("card-config", {**value, "schema_version": 1})
    else:
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
    # An isolated source tree tests packaging without relying on a prior build.
    sandbox = tmp_path / "source"
    integration = sandbox / "custom_components/aviadilo"
    shutil.copytree(
        ROOT / "custom_components/aviadilo",
        integration,
        ignore=shutil.ignore_patterns("__pycache__", "frontend"),
    )
    for filename in ("LICENSE", "package.json", "hacs.json", "pyproject.toml"):
        shutil.copy(ROOT / filename, sandbox / filename)
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
        assert json.loads((sandbox / "package.json").read_text())["license"] == "MIT"
        with pytest.raises(ValueError, match="Tag version"):
            check_release.check_release(first, "v99.0.0", sandbox)
        with ZipFile(first) as archive:
            entries = archive.infolist()
            assert [item.filename for item in entries] == sorted(item.filename for item in entries)
            assert all(item.date_time == (1980, 1, 1, 0, 0, 0) for item in entries)
            assert all(item.external_attr >> 16 == 0o100644 for item in entries)
            files = {item.filename: archive.read(item) for item in archive.infolist()}
        assert files["LICENSE"] == (sandbox / "LICENSE").read_bytes()
        mutations: list[tuple[str, dict[str, bytes | None], str]] = [
            ("unsafe", {"../escape.py": b""}, "Unsafe"),
            ("missing", {"frontend/aviadilo.js": None}, "missing"),
            ("missing-license", {"LICENSE": None}, "missing"),
            ("wrong-license", {"LICENSE": b"not the project license"}, "License content"),
            (
                "wrong-js",
                {"frontend/aviadilo.js": b"/*! Aviadilo version: 99.0.0 */"},
                "JavaScript",
            ),
            ("wrong-constant", {"const.py": b'VERSION = "99.0.0"'}, "bootstrap version"),
            ("wrong-manifest", {"manifest.json": b'{"version":"99.0.0"}'}, "Manifest"),
        ]
        mutations.extend(
            (f"missing-{filename.replace('/', '-')}", {filename: None}, "missing")
            for filename in sorted(check_release.REQUIRED)
            if filename.endswith((".py", ".json"))
        )
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
        license_path = sandbox / "LICENSE"
        license_content = license_path.read_bytes()
        license_path.unlink()
        with pytest.raises(ValueError, match="LICENSE is missing"):
            build_release.build_release(tmp_path / "missing-license-source.zip", root=sandbox)
        license_path.symlink_to(ROOT / "LICENSE")
        with pytest.raises(ValueError, match="symbolic link"):
            build_release.build_release(tmp_path / "symlink-license-source.zip", root=sandbox)
        license_path.unlink()
        license_path.write_bytes(license_content)
        # Import the extracted runtime, with no checkout on the isolated Python path.
        installed = tmp_path / "installed"
        installed_integration = installed / "custom_components/aviadilo"
        with ZipFile(first) as archive:
            archive.extractall(installed_integration)
        modules = [
            "custom_components.aviadilo"
            + ("" if name == "__init__.py" else "." + name[:-3].replace("/", "."))
            for name in sorted(files)
            if name.endswith(".py")
        ]
        result = subprocess.run(
            [
                sys.executable,
                "-I",
                "-c",
                "import importlib, json, pathlib, sys; "
                "sys.path.insert(0, sys.argv[1]); "
                "modules = [importlib.import_module(name) for name in json.loads(sys.argv[2])]; "
                "assert all(pathlib.Path(m.__file__).is_relative_to(sys.argv[1]) "
                "for m in modules); "
                "print(f'Imported {len(modules)} packaged runtime modules')",
                str(installed),
                json.dumps(modules),
            ],
            cwd=installed,
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode == 0, result.stderr
        assert result.stdout.strip() == f"Imported {len(modules)} packaged runtime modules"
    finally:
        sys.path.pop(0)


def test_isolated_ha_fixture_shapes_are_accepted_by_real_adapters(tmp_path: Path) -> None:
    import runpy
    import time

    from custom_components.aviadilo.cache import Cache
    from custom_components.aviadilo.providers.base import normalize
    from custom_components.aviadilo.providers.dwd_icon import parse_grid, parse_metadata
    from custom_components.aviadilo.providers.noaa_ksox import NoaaKsoxProvider
    from custom_components.aviadilo.providers.noaa_mrms import NoaaMrmsProvider
    from custom_components.aviadilo.providers.rainviewer import RainViewerProvider

    fixture = runpy.run_path(str(ROOT / "dev/ha/custom_components/aviadilo_fixture/__init__.py"))
    session = fixture["FixtureSession"]()
    now = time.time()
    aircraft = session.get("https://opendata.adsb.fi/api/v3/lat/34.1/lon/-117.72/dist/27")
    assert len(normalize(json.loads(aircraft.body), "adsb_fi", now)["aircraft"]) == 3
    for adapter_type in [RainViewerProvider, NoaaMrmsProvider, NoaaKsoxProvider]:
        adapter = adapter_type(session, Cache(tmp_path / adapter_type.__name__))
        value = adapter.normalize(session.get(adapter.endpoint).body, now)
        validate("event", {**value, "schema_version": 1, "subscription_id": 1, "revision": 0})
        assert len(value["frames"]) == 3
    metadata = parse_metadata(fixture["wind_description"](now), now)
    grid = parse_grid(
        fixture["wind_grid"]({"subset": ["Lat(33,35)", "Long(-119,-117)"]}),
        metadata,
        metadata.valid_time(now),
    )
    validate("event", {**grid, "schema_version": 1, "subscription_id": 1, "revision": 0})
    assert grid["u_mps"][0] == 8 and grid["v_mps"][0] == 3
    with pytest.raises(RuntimeError, match="refuses"):
        session.get("https://unexpected.invalid/provider")


def test_isolated_ha_install_preserves_settings_and_rejects_unsafe_zip(tmp_path: Path) -> None:
    import runpy

    install = runpy.run_path(str(ROOT / "dev/ha/manage.py"))["install"]
    config = tmp_path / "ha"
    config.mkdir()
    retained = config / ".storage"
    retained.mkdir()
    (retained / "synthetic-options").write_text("retained")
    cache = retained / "aviadilo/public/basemap/tile"
    cache.parent.mkdir(parents=True)
    cache.write_bytes(b"retained public cache entry")
    dashboard = config / "ui-lovelace.yaml"
    legacy_dashboard = (
        "views:\n  - cards:\n      - type: custom:aviadilo-map\n"
        "        schema_version: 1\n        wind:\n"
        "          static_style: barbs\n          particles: true\n"
    )
    dashboard.write_text(legacy_dashboard)
    manifest = json.loads((ROOT / "custom_components/aviadilo/manifest.json").read_text())
    archive = tmp_path / "candidate.zip"
    with ZipFile(archive, "w") as zipped:
        zipped.writestr("LICENSE", (ROOT / "LICENSE").read_bytes())
        zipped.writestr("__init__.py", "")
        zipped.writestr("manifest.json", json.dumps(manifest))
        zipped.writestr("frontend/aviadilo.js", f"/*! Aviadilo version: {manifest['version']} */")
        zipped.writestr("brand/icon.png", b"\x89PNG\r\n\x1a\n")
    previous_archive = tmp_path / "previous.zip"
    previous_manifest = {**manifest, "version": "0.1.0"}
    with ZipFile(archive) as current, ZipFile(previous_archive, "w") as previous:
        for item in current.infolist():
            content = current.read(item)
            if item.filename == "manifest.json":
                content = json.dumps(previous_manifest).encode()
            elif item.filename == "frontend/aviadilo.js":
                content = b"/*! Aviadilo version: 0.1.0 */"
            previous.writestr(item, content)
    assert install(previous_archive, config, True) == "0.1.0"
    assert install(archive, config, True) == manifest["version"]
    assert (retained / "synthetic-options").read_text() == "retained"
    assert cache.read_bytes() == b"retained public cache entry"
    assert dashboard.read_text() == legacy_dashboard
    assert (
        json.loads((config / "custom_components/.aviadilo-previous/manifest.json").read_text())[
            "version"
        ]
        == "0.1.0"
    )
    installed = config / "custom_components/aviadilo/manifest.json"
    assert "aviadilo_fixture" in json.loads(installed.read_text())["dependencies"]
    assert install(archive, config, False) == manifest["version"]
    assert json.loads(installed.read_text()) == manifest
    assert (retained / "synthetic-options").read_text() == "retained"
    assert (config / "custom_components/.aviadilo-previous").is_dir()
    assert not (config / "custom_components/aviadilo_fixture").exists()
    legacy_archive = tmp_path / "legacy-candidate.zip"
    with ZipFile(archive) as current, ZipFile(legacy_archive, "w") as legacy:
        for item in current.infolist():
            if item.filename != "LICENSE":
                legacy.writestr(item, current.read(item))
    assert install(legacy_archive, config, False) == manifest["version"]
    with ZipFile(archive, "a") as zipped:
        zipped.writestr("../escape.py", "")
    with pytest.raises(ValueError, match="Unsafe"):
        install(archive, config, False)
    assert not (tmp_path / "escape.py").exists()


@pytest.mark.parametrize("ending", [0, 7])
def test_ha_supervisor_restarts_only_normal_restart_requests(tmp_path: Path, ending: int) -> None:
    import runpy

    supervise = runpy.run_path(str(ROOT / "dev/ha/manage.py"))["supervise"]
    attempts = tmp_path / "attempts"
    child = tmp_path / "child.py"
    child.write_text(
        "import fcntl, pathlib, sys\n"
        "lock = open(sys.argv[1], 'w')\n"
        "try:\n"
        "    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)\n"
        "except BlockingIOError:\n"
        "    pass\n"
        "else:\n"
        "    sys.exit(9)\n"
        "attempts = pathlib.Path(sys.argv[2])\n"
        "count = int(attempts.read_text()) if attempts.exists() else 0\n"
        "attempts.write_text(str(count + 1))\n"
        "sys.exit(100 if count < 2 else int(sys.argv[3]))\n"
    )
    import fcntl

    lock_path = tmp_path / "lock"
    with lock_path.open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        assert (
            supervise(
                [sys.executable, str(child), str(lock_path), str(attempts), str(ending)],
                lock.fileno(),
                tmp_path,
            )
            == ending
        )
    assert attempts.read_text() == "3"


def test_ha_supervisor_ctrl_c_reaps_child_without_restarting(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    import runpy
    import signal
    from unittest.mock import MagicMock

    supervise = runpy.run_path(str(ROOT / "dev/ha/manage.py"))["supervise"]
    process = MagicMock()
    process.__enter__.return_value = process
    process.wait.side_effect = [KeyboardInterrupt, 100]
    popen = MagicMock(return_value=process)
    monkeypatch.setattr(subprocess, "Popen", popen)
    assert supervise(["synthetic-ha"], 11, tmp_path) == 130
    process.send_signal.assert_called_once_with(signal.SIGINT)
    assert popen.call_count == 1
    assert process.wait.call_count == 2


@pytest.mark.parametrize("fixtures", [True, False])
def test_generated_ha_dashboard_validates_card_schema_and_survives_upgrade(
    tmp_path: Path, fixtures: bool
) -> None:
    from homeassistant.util.yaml import load_yaml_dict

    manifest = json.loads((ROOT / "custom_components/aviadilo/manifest.json").read_text())
    archive = tmp_path / "candidate.zip"
    with ZipFile(archive, "w") as zipped:
        zipped.writestr("__init__.py", "")
        zipped.writestr("manifest.json", json.dumps(manifest))
        zipped.writestr("frontend/aviadilo.js", f"/*! Aviadilo version: {manifest['version']} */")
        zipped.writestr("brand/icon.png", b"\x89PNG\r\n\x1a\n")
    config = tmp_path / "instance"
    command = [
        sys.executable,
        str(ROOT / "dev/ha/manage.py"),
        "prepare",
        "--config",
        str(config),
        "--archive",
        str(archive),
    ]
    if fixtures:
        command.append("--fixtures")
    subprocess.run(command, check=True, capture_output=True, text=True)
    assert (config / "www").is_dir() is fixtures
    dashboard = config / "ui-lovelace.yaml"
    configuration = load_yaml_dict(str(config / "configuration.yaml"))
    from homeassistant.components.recorder import CONFIG_SCHEMA as RECORDER_CONFIG_SCHEMA

    assert RECORDER_CONFIG_SCHEMA(configuration)["recorder"]["purge_keep_days"] == 1
    value = load_yaml_dict(str(dashboard))
    card = value["views"][0]["cards"][0]
    validate("card-config", card)
    assert card["layers"]["aircraft"] is fixtures
    # Existing dashboard content, even an old invalid config, belongs to the
    # acceptance operator. A same-mode package upgrade must not rewrite it.
    previous = dashboard.read_text().replace("        schema_version: 2\n", "")
    dashboard.write_text(previous)
    subprocess.run(command, check=True, capture_output=True, text=True)
    assert dashboard.read_text() == previous


def test_ha_supervisor_uses_installed_namespace_after_config_unmount_and_restart(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import runpy

    supervise = runpy.run_path(str(ROOT / "dev/ha/manage.py"))["supervise"]
    checkout, config = tmp_path / "checkout", tmp_path / "instance"
    for base, source in [(checkout, "checkout"), (config, "installed")]:
        integration = base / "custom_components" / "aviadilo"
        integration.mkdir(parents=True)
        (integration / "__init__.py").write_text(f'SOURCE = "{source}"\n')
        (integration / "manifest.json").write_text(
            json.dumps(
                {
                    "dependencies": ["aviadilo_fixture"] if source == "installed" else [],
                }
            )
        )
    fixture = config / "custom_components" / "aviadilo_fixture"
    fixture.mkdir()
    (fixture / "__init__.py").write_text('SOURCE = "fixture"\n')
    observations = tmp_path / "observations.json"
    child = """import importlib, json, os, pathlib, sys
config, output = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
# HA2026.9.1 loader temporarily mounts config while importing the namespace.
sys.path.insert(0, str(config))
import custom_components
sys.path.remove(str(config))
from custom_components import aviadilo, aviadilo_fixture
manifest = pathlib.Path(aviadilo.__file__).with_name("manifest.json")
record = {"cwd": os.getcwd(), "integration": aviadilo.__file__,
          "fixture": aviadilo_fixture.__file__, "manifest": json.loads(manifest.read_text())}
previous = json.loads(output.read_text()) if output.exists() else []
output.write_text(json.dumps([*previous, record]))
sys.exit(100 if not previous else 0)
"""
    command = [sys.executable, "-c", child, str(config), str(observations)]
    # Demonstrate this scenario actually reproduces the unsafe inherited-cwd bug.
    broken = subprocess.run(command, cwd=checkout, capture_output=True, text=True, check=False)
    assert broken.returncode != 0 and "aviadilo_fixture" in broken.stderr
    monkeypatch.chdir(checkout)
    with (tmp_path / "lock").open("w") as lock:
        assert supervise(command, lock.fileno(), config) == 0
    records = json.loads(observations.read_text())
    assert len(records) == 2
    for record in records:
        assert record["cwd"] == str(config.resolve())
        assert record["integration"] == str(config / "custom_components/aviadilo/__init__.py")
        assert record["fixture"] == str(fixture / "__init__.py")
        assert record["manifest"]["dependencies"] == ["aviadilo_fixture"]
