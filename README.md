# Aviadilo

A Lovelace map card and companion Home Assistant integration combining aircraft, weather radar, wind, and household locations on one kiosk-friendly map.

Originally inspired by the ADS-B Exchange globe view, Aviadilo now aims to replace several dashboard maps with one larger shared map. Aircraft, precipitation radar, wind markers/animation, and existing Home Assistant location entities form optional layers. A configurable distance filter keeps far-away household members from pulling the map away from home.

The accepted stack is TypeScript, Lit, Vite, and Leaflet, with a Python Home Assistant integration that shares external-data requests and caches across devices. All supported settings must have a visual editor. Public data access should remain free for household use and conservative on provider requests.

The development candidate combines all four layers in one card: live aircraft with a selectable list, radar history and legends, DWD ICON-global wind markers and animation, and household trackers. The people layer filters distant travellers before rendering or fitting the map. A graphical editor covers every supported setting. Shared collection and caching serve multiple cards without multiplying provider requests.

The public repository is [bishopdynamics/aviadilo](https://github.com/bishopdynamics/aviadilo). HACS installation and updates are required from the first release, using one Integration package that includes the card. The first HACS-installable release is still pending.

See [the user guide](docs/user-guide.md) for the installation flow, map controls, shared settings, and troubleshooting. Version `0.1.0-dev.2` is a local development candidate; authenticated HACS delivery and acceptance on the user's tablet remain pending.

The [approved implementation spec](docs/spec/ROOT_SPEC.md) targets Home Assistant 2026.9.1 and the user's Chromium tablet-PC kiosk.

See [the revised direction](docs/idea/revised-direction.md), [expanded research and design](docs/research/everything-map.md), and [task queue](docs/TASK_QUEUE.md). The [original idea](docs/idea/initial-idea.md) and [initial research](docs/research/initial-options.md) preserve the aircraft-card starting point.

## Development

Use Node 24 (pinned in `.node-version`), Python 3.14.2, and [uv](https://docs.astral.sh/uv/). With the pinned Node version on your `PATH`, run:

```sh
make setup
npx playwright install chromium
make check
make run
```

`make run` serves a synthetic fixture preview. It makes no requests to aircraft, weather, or basemap providers. `make check` includes offline Chromium tests; CI installs Chromium's system dependencies with `npx playwright install --with-deps chromium`. `make build` prepares the bundled card and HACS archive; `make help` lists the available commands. The [isolated HA guide](dev/ha/README.md) explains packaged installation and upgrade tests using synthetic provider responses with real HA authentication and transport.

See [the development guide](docs/development.md) for toolchain setup, verification, and packaging details.

Weather planning targets California and North America. Selected radar sources are **RainViewer (default), NOAA MRMS, and NOAA KSOX**; wind uses **DWD ICON global**. The [weather source comparison](docs/research/weather-source-quality.md) records the research and final selection.

[Open the static Claremont comparison](docs/spikes/claremont-weather/comparison.html): seven real source snapshots, fully embedded for offline viewing.
