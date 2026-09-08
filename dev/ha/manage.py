"""Prepare and run a clearly isolated HA instance with an optional offline provider shim."""

import argparse
import fcntl
import json
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
from pathlib import Path, PurePosixPath
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]
MARKER = ".aviadilo-development-instance"
BASELINE = "2026.9.1"


def install(archive: Path, config: Path, fixtures: bool) -> str:
    """Validate both old/new candidates without assuming this checkout's current version."""
    with ZipFile(archive) as zipped:
        items = zipped.infolist()
        names = {item.filename for item in items}
        if len(items) != len(names) or len(items) > 1000:
            raise ValueError("Duplicate or excessive ZIP paths")
        if sum(item.file_size for item in items) > 32 * 1024 * 1024:
            raise ValueError("ZIP exceeds runtime size budget")
        if not {"__init__.py", "manifest.json", "frontend/aviadilo.js", "brand/icon.png"} <= names:
            raise ValueError("Incomplete runtime ZIP")
        for item in items:
            path = PurePosixPath(item.filename)
            if (
                path.is_absolute()
                or ".." in path.parts
                or "\\" in item.filename
                or ":" in item.filename
                or not path.parts
                or item.filename != path.as_posix()
                or path.parts[0] == "custom_components"
                or stat.S_ISLNK(item.external_attr >> 16)
                or not (path.suffix in {".py", ".json"} or path.parts[0] in {"frontend", "brand"})
            ):
                raise ValueError("Unsafe ZIP entry")
        manifest = json.loads(zipped.read("manifest.json"))
        version = manifest.get("version")
        if manifest.get("domain") != "aviadilo" or not isinstance(version, str):
            raise ValueError("Incorrect manifest")
        if not zipped.read("frontend/aviadilo.js").startswith(
            f"/*! Aviadilo version: {version} */".encode()
        ):
            raise ValueError("Manifest/bundle version mismatch")
        if zipped.testzip() is not None:
            raise ValueError("Corrupt ZIP")
        components = config / "custom_components"
        components.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=".aviadilo-install-", dir=components) as temporary:
            staged = Path(temporary) / "aviadilo"
            staged.mkdir()
            zipped.extractall(staged)
            if fixtures:
                manifest["dependencies"] = sorted(
                    set(manifest.get("dependencies", [])) | {"aviadilo_fixture"}
                )
                (staged / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
            target = components / "aviadilo"
            backup = components / ".aviadilo-previous"
            if target.is_symlink() or backup.is_symlink():
                raise ValueError("Refusing symlink integration installation")
            if backup.exists():
                shutil.rmtree(backup)
            if target.exists():
                target.rename(backup)
            try:
                staged.rename(target)
            except BaseException:
                if backup.exists():
                    backup.rename(target)
                raise
        if fixtures:
            shutil.copytree(
                Path(__file__).parent / "custom_components/aviadilo_fixture",
                components / "aviadilo_fixture",
                dirs_exist_ok=True,
            )
        elif (components / "aviadilo_fixture").exists():
            shutil.rmtree(components / "aviadilo_fixture")
        return version


def supervise(command: list[str], lock_fd: int) -> int:
    """Honor HA's normal restart request while keeping this instance locked.

    HA has its own process group so Ctrl-C reaches it exactly once through this
    supervisor. The inherited lock also survives an unexpected supervisor exit.
    """
    try:
        while True:
            with subprocess.Popen(command, start_new_session=True, pass_fds=(lock_fd,)) as process:
                try:
                    code = process.wait()
                except KeyboardInterrupt:
                    print("Stopping isolated Home Assistant…", flush=True)
                    try:
                        process.send_signal(signal.SIGINT)
                    except ProcessLookupError:
                        pass
                    while True:
                        try:
                            process.wait()
                            return 130
                        except KeyboardInterrupt:
                            # A second Ctrl-C requests termination; still reap HA
                            # before the caller releases its instance lock.
                            process.terminate()
                if code != 100:
                    return code
            print("Home Assistant requested a restart (exit 100); restarting…", flush=True)
    except KeyboardInterrupt:
        return 130


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["prepare", "run"])
    parser.add_argument(
        "--config", type=Path, default=Path(tempfile.gettempdir()) / "aviadilo-ha-dev"
    )
    parser.add_argument("--archive", type=Path, default=ROOT / "dist/aviadilo.zip")
    parser.add_argument(
        "--fixtures", action="store_true", help="Replace only provider HTTP; never disables HA auth"
    )
    parser.add_argument("--port", type=int, default=18123)
    args = parser.parse_args()
    config = args.config.expanduser().resolve()
    if config == ROOT or ROOT in config.parents:
        raise ValueError("HA instance/auth data must live outside the repository")
    if config.exists() and not (config / MARKER).is_file():
        raise ValueError(
            "Refusing an existing directory not marked as an Aviadilo development instance"
        )
    config.mkdir(parents=True, exist_ok=True)
    marker = config / MARKER
    previous_mode = None
    if marker.exists() and marker.read_text().strip():
        previous_mode = json.loads(marker.read_text()).get("fixtures")
    marker.touch()
    with (config / ".aviadilo-manage.lock").open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit(
                "Stop the managed HA instance before replacing its integration"
            ) from None
        if args.command == "run":
            print(
                "After onboarding, confirm pending HTTP configuration in Home Assistant "
                "within five minutes. Unconfirmed changes roll back and request a restart.",
                flush=True,
            )
            import importlib.metadata

            if importlib.metadata.version("homeassistant") != BASELINE:
                raise ValueError(f"Use locked Home Assistant {BASELINE}")
            raise SystemExit(
                supervise(
                    [sys.executable, "-m", "homeassistant", "--config", str(config)],
                    lock.fileno(),
                )
            )
        version = install(args.archive.resolve(), config, args.fixtures)
        yaml = f"""# Generated isolated Aviadilo instance. Synthetic coordinates, no credentials.
homeassistant:
  name: Aviadilo SYNTHETIC acceptance
  latitude: 34.1
  longitude: -117.72
  elevation: 0
  unit_system: metric
  time_zone: UTC
http:
  server_host: 127.0.0.1
  server_port: {args.port}
frontend:
api:
websocket_api:
config:
recorder:
  purge_keep_days: 1
lovelace:
  mode: yaml
"""
        if args.fixtures:
            yaml += "aviadilo_fixture:\n"
        (config / "configuration.yaml").write_text(yaml)
        dashboard = config / "ui-lovelace.yaml"
        mode_changed = previous_mode is not None and previous_mode != args.fixtures
        if mode_changed and dashboard.exists():
            shutil.copy2(dashboard, config / "ui-lovelace.before-mode-change.yaml")
            print(
                "Fixture mode changed; previous dashboard saved to "
                "ui-lovelace.before-mode-change.yaml"
            )
        if not dashboard.exists() or mode_changed:
            dashboard.write_text("""title: Synthetic Aviadilo acceptance
views:
  - title: Synthetic map
    cards:
      - type: custom:aviadilo-map
        schema_version: 1
        title: SYNTHETIC aircraft, radar, wind and trackers
        layers:
          aircraft: true
          radar: true
          wind: true
          people: true
        wind:
          static_style: arrows
          particles: true
        people:
          trackers:
            - entity_id: device_tracker.synthetic_0
            - entity_id: device_tracker.synthetic_1
""")
        if not args.fixtures and (not dashboard.exists() or mode_changed or previous_mode is None):
            text = dashboard.read_text()
            for layer in ("aircraft", "radar", "wind"):
                text = text.replace(f"          {layer}: true", f"          {layer}: false")
            dashboard.write_text(text)
        marker.write_text(json.dumps({"fixtures": args.fixtures}) + "\n")
        print(
            f"Prepared isolated HA {BASELINE} at {config}; "
            f"Aviadilo {version}; fixtures={args.fixtures}"
        )
        print(f"Run: uv run --frozen python dev/ha/manage.py run --config {config}")
        print(
            f"Complete normal HA onboarding at http://127.0.0.1:{args.port}; "
            "then add Aviadilo in Devices & services."
        )


if __name__ == "__main__":
    main()
