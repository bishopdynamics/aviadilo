# Developer guide

This page covers building and contributing to Aviadilo. To install it in Home Assistant, follow the [README](../README.md#set-up-aviadilo).

The released baseline is **0.2.1**, verified with Home Assistant **2026.9.1** and Chromium **153.0.8010.12**. Detailed past results and session-specific paths are preserved in the [development and verification history](development-history.md).

## Set up a checkout

Use the toolchain versions pinned in the repository:

- Node **24.20.0** (`.node-version`).
- Python **3.14.2** (`.python-version`).
- [uv](https://docs.astral.sh/uv/) **0.12.8**, GNU Make and Git.

Clone the repository and enter the checkout. With the pinned Node version on your `PATH`, run:

```sh
make setup
npx playwright install chromium
make check
make run
```

`make run` serves the local synthetic fixture harness. It does not contact aircraft, weather or basemap providers. Use [isolated Home Assistant](../dev/ha/README.md) to test the packaged integration with real HA authentication and transport.

The Makefile uses GNU Make 3.81-compatible constructs for macOS and Linux. Locked dependencies live in `package-lock.json` and `uv.lock`; avoid incidental toolchain or dependency upgrades during unrelated changes.

## Development commands

| Command | Purpose |
| --- | --- |
| `make help` | List available tasks; also the default target |
| `make setup` | Install locked dependencies and generate frontend validators |
| `make run` | Serve the synthetic preview locally |
| `make check` | Run formatting, lint, types, tests, build and offline Chromium checks |
| `make test` | Run frontend and backend tests |
| `make lint` | Check formatting, lint and static types |
| `make format` | Apply source formatting |
| `make build` | Build the bundled card and deterministic HACS ZIP |
| `make e2e` | Run the offline Chromium scenarios |
| `make ha-prepare` | Prepare an isolated synthetic HA instance in `/tmp` |
| `make ha-dev` | Run that isolated instance on localhost:18123 |
| `make clean` | Remove generated build artifacts |

Backend tests use real HA APIs without requiring a running HA instance or provider access. Browser installation may also need system dependencies; CI uses `npx playwright install --with-deps chromium`.

## Architecture and code map

Aviadilo uses TypeScript, Lit, Vite and Leaflet for the card, with a Python integration for shared external-data collection and caching. Supported settings have graphical editors.

| Location | Responsibility |
| --- | --- |
| [custom_components/aviadilo](../custom_components/aviadilo/) | Integration setup, providers, pacing, caches, authenticated transport and bundled-card registration |
| [src/aviadilo-map.ts](../src/aviadilo-map.ts) | Card composition and lifecycle |
| [src/editor](../src/editor/) | Graphical card configuration |
| [src/map](../src/map/) | Viewport, basemap, sizing and household presentation |
| [src/layers](../src/layers/) | Aircraft, radar, wind and people layers |
| [src/data](../src/data/) | HA transport, shared assets and status |
| [contracts](../contracts/) | Versioned schemas and shared fixtures |
| [tests](../tests/) | Frontend, backend and browser checks |
| [dev/ha](../dev/ha/) | Isolated native HA tooling and synthetic provider fixtures |

Keep saved cards, dashboard editing, card editors and picker previews on the same real production data path. Synthetic feeds belong in development/test harnesses. Display offsets must not alter authoritative positions, radius filtering or fit bounds. Only the central viewport controller may fit or recenter the map.

## Verification

Run checks appropriate to the change and the full release gates before publishing. Keep routine tests offline. Test packaged changes in the isolated instance rather than a household HA installation, and stop owned processes when finished.

For behavior involving assets or permissions, include explicit non-owner regular and read-only users. For lifecycle and layout work, include saved/editor/picker views, reconnects, small screens, keyboard/touch and relevant resource bounds. See the [isolated HA guide](../dev/ha/README.md) and [verification history](development-history.md) for procedures and prior evidence.

## Packaging and releases

HACS distributes Aviadilo as one **Integration** package containing the card. The ZIP has the contents of `custom_components/aviadilo/` at its root, with the license and compiled frontend. All runtime modules must be included; development fixtures and private diagnostics must be excluded.

- [Build script](../scripts/build_release.py): deterministic runtime archive.
- [Package validator](../scripts/check_release.py): layout, required files, identity and version checks.
- [Release metadata helper](../scripts/release_metadata.py): strict tag validation, channel flags and release notes.
- [Release workflow](../.github/workflows/release.yml): checked tag build, draft upload, then publication.
- [HA/HACS validation](../.github/workflows/validate.yml): hassfest and HACS checks.

Keep npm/lock, Python/lock, integration manifest, runtime constant and built frontend versions coherent. Configuration and wire-schema versions are separate; protocol changes must update both ends and preserve supported migrations.

A push to `main` runs CI. A version-tag push publishes a checked release: development tags remain prereleases, and normal releases become Latest for the recommended update channel. Never replace an existing published tag or asset. Verify the actual public ZIP and HACS installation after publication; a successful source build alone is insufficient.

Our release loop is **verified change → prerelease → hands-on feedback → normal release**. Promote the confirmed functionality without adding untested behavior. Test fresh installs and upgrades from both the previous normal release and the confirmed prerelease, with settings/cache/dashboard retention.

## Design and project background

- [Project rules](../PROJECT.md) and [task queue](TASK_QUEUE.md).
- [Root specification and feature addenda](spec/ROOT_SPEC.md).
- [Revised direction](idea/revised-direction.md) and [combined-map research](research/everything-map.md).
- [Original aircraft-card idea](idea/initial-idea.md) and [initial research](research/initial-options.md), inspired by the ADS-B Exchange globe view.
- [Weather-source comparison](research/weather-source-quality.md): RainViewer, NOAA MRMS/KSOX and DWD ICON global were selected for the initial California/North America use case.
- [Static Claremont comparison](spikes/claremont-weather/comparison.html): seven embedded source snapshots, with no requests when viewed.
- [Development and verification history](development-history.md): chronological implementation, acceptance and release evidence.
