# Development

Aviadilo currently contains the slice 1 bootstrap. The integration and card are stubs; the fixture harness is the local development surface. Live providers, HA setup/options, authenticated transport, and the full map/editor follow in the approved serial slices.

## Toolchains

- Node 24.20.0, pinned in `.node-version`; use a Node version manager or the official Node distribution for your OS.
- Python 3.14.2, pinned in `.python-version`, matching the approved Python 3.14 baseline for Home Assistant 2026.9.1.
- `uv` 0.12.8 (also pinned in CI), GNU Make, and Git. The Makefile uses GNU Make 3.81-compatible constructs for macOS; execution was verified on Linux.

Install the pinned Node version before running `make setup`. Dependency versions are recorded in `package-lock.json` and `uv.lock`. Production HA tests are separate from the bootstrap's contract tests.

The 2026-09-06 development session provisioned temporary toolchains without changing the host's Node 22/Python 3.12 installation:

```sh
export PATH="/tmp/node-v24.20.0-linux-x64/bin:$PATH"
export UV_PYTHON_INSTALL_DIR=/tmp/aviadilo-python
export UV_CACHE_DIR=/tmp/aviadilo-uv-cache
export npm_config_cache=/tmp/aviadilo-npm-cache
```

Those paths are session conveniences on the Linux development host and may disappear after a reboot. Install the pinned toolchains normally for lasting use. The Node archive was checked against the official SHA256 checksum; Python was installed through `uv`.

## Commands

| Command | Purpose |
| --- | --- |
| `make help` | List tasks; also the default target |
| `make setup` | Prepare the pinned frontend and Python dependencies |
| `make run` | Serve the synthetic fixture preview in the foreground |
| `make check` | Run the local CI gates |
| `make test` | Run frontend and backend automated tests |
| `make lint` | Check source quality |
| `make format` | Apply source formatting |
| `make build` | Build the bundled card and HACS release archive |
| `make clean` | Remove generated build artifacts |

The fixture preview uses synthetic local data and makes no provider requests. Routine tests must remain offline. Live source checks and HA/browser acceptance belong to the orchestrator after their implementation slices.

## Contracts and packaging

`contracts/` holds the versioned JSON schemas and fixtures. Both language implementations validate the same examples. Protocol changes must update both ends together and explicitly handle incompatible versions. Card configuration preserves unknown future fields when editing unrelated settings.

HACS uses the repository as type **Integration**. The archive contains the contents of `custom_components/aviadilo/` at ZIP root, including the built card and brand icon. Frontend, manifest, and tag versions must agree. All runtime dependencies must be available within the installed integration or declared in its manifest.

The GitHub Actions workflows prepare native checks, HACS/hassfest validation, and version-tag release packaging. A locally verified bootstrap archive is not proof of a working HACS installation. Clean HACS installation and upgrade, automatic module loading, and the actual tablet kiosk remain acceptance work in later slices.

Actions are pinned by commit and the HACS/hassfest validator images by digest. The version-tag workflow builds an explicitly labelled draft development prerelease; it does not automatically publish the stub as a usable product.

HACS also requires a public repository description and topics. At the slice 1 kickoff, `bishopdynamics/aviadilo` had neither; GitHub CLI/API credentials were unavailable in this session. The issue tracker was enabled. Before HACS validation, set the description to “A Home Assistant kiosk map combining aircraft, weather radar, wind, and household locations.” and add appropriate topics such as `home-assistant`, `hacs`, `lovelace-custom-card`, `aircraft`, `weather-radar`, and `leaflet`. These requirements are documented by [HACS](https://www.hacs.xyz/docs/publish/start/).

## Slice 1 verification — 2026-09-06

The orchestrator independently ran `make check` on Node 24.20.0/Python 3.14.2: formatting, lint and static types passed in both languages; Vitest passed 31 tests and pytest passed 32. Both frontend builds and release validation passed. Packaging tests cover deterministic output, missing/unsafe paths, version mismatch and imports after extraction.

Headless Chromium 151.0.7922.34 rendered the development and built fixture pages, including a 390-pixel viewport without horizontal overflow. The compiled module extracted directly from the ZIP also registered and rendered under the strict script policy. These checks recorded no JavaScript errors or external resource requests on stable loads. This is bootstrap browser evidence, not acceptance on the user's tablet or Home Assistant instance.

Artifact: `dist/aviadilo.zip`, version `0.1.0-dev.1`, six runtime files. SHA256: `3bd6d1ed3e66f25a384f881f87bcde46cb807c00f4472d4b1f48864f5d7553be`.
