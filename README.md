# Aviadilo

A Lovelace map card and companion Home Assistant integration combining aircraft, weather radar, wind, and household locations on one kiosk-friendly map.

Originally inspired by the ADS-B Exchange globe view, Aviadilo now aims to replace several dashboard maps with one larger shared map. Aircraft, precipitation radar, wind markers/animation, and existing Home Assistant location entities form optional layers. A configurable distance filter keeps far-away household members from pulling the map away from home.

The accepted stack is TypeScript, Lit, Vite, and Leaflet, with a Python Home Assistant integration that shares external-data requests and caches across devices. All supported settings must have a visual editor. Public data access should remain free for household use and conservative on provider requests.

The implementation specification is approved and development has begun with build tooling, shared data contracts, and HACS packaging. The current card and integration are development stubs; live data, graphical setup, and automatic card loading arrive in later slices.

The public repository is [bishopdynamics/aviadilo](https://github.com/bishopdynamics/aviadilo). HACS installation and updates are required from the first release, using one Integration package that includes the card. The first HACS-installable release is still pending.

The [approved implementation spec](docs/spec/ROOT_SPEC.md) targets Home Assistant 2026.9.1 and the user's Chromium tablet-PC kiosk.

See [the revised direction](docs/idea/revised-direction.md), [expanded research and design](docs/research/everything-map.md), and [task queue](docs/TASK_QUEUE.md). The [original idea](docs/idea/initial-idea.md) and [initial research](docs/research/initial-options.md) preserve the aircraft-card starting point.

## Development

Use Node 24 (pinned in `.node-version`), Python 3.14.2, and [uv](https://docs.astral.sh/uv/). With the pinned Node version on your `PATH`, run:

```sh
make setup
make check
make run
```

`make run` serves a synthetic fixture preview. It makes no requests to aircraft, weather, or basemap providers. `make build` prepares the bundled card and HACS archive; `make help` lists the available commands. Development artifacts are not a tested HACS release yet.

See [the development guide](docs/development.md) for toolchain setup, verification, and packaging details.

Weather planning targets California and North America. Selected radar sources are **RainViewer (default), NOAA MRMS, and NOAA KSOX**; wind uses **DWD ICON global**. The [weather source comparison](docs/research/weather-source-quality.md) records the research and final selection.

[Open the static Claremont comparison](docs/spikes/claremont-weather/comparison.html): seven real source snapshots, fully embedded for offline viewing.
