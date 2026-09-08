# Development

Aviadilo's `0.1.0-dev.2` candidate composes aircraft, radar, wind and household trackers with the shared HA service and complete graphical editor. The development and browser harnesses use synthetic data. Local HA/package acceptance is recorded below; authenticated HACS delivery and physical tablet acceptance remain pending.

## Toolchains

- Node 24.20.0, pinned in `.node-version`; use a Node version manager or the official Node distribution for your OS.
- Python 3.14.2, pinned in `.python-version`, matching the approved Python 3.14 baseline for Home Assistant 2026.9.1.
- `uv` 0.12.8 (also pinned in CI), GNU Make, and Git. The Makefile uses GNU Make 3.81-compatible constructs for macOS; execution was verified on Linux.

Install the pinned Node version before running `make setup`. Dependency versions are recorded in `package-lock.json` and `uv.lock`. Backend tests now use real Home Assistant 2026.9.1 APIs and pytest-asyncio; they require no running HA instance or provider access.

The 2026-09-06 development session provisioned temporary toolchains without changing the host's Node 22/Python 3.12 installation:

```sh
export PATH="/tmp/node-v24.20.0-linux-x64/bin:$PATH"
export UV_PYTHON_INSTALL_DIR=/tmp/aviadilo-python
export UV_CACHE_DIR=/tmp/aviadilo-uv-cache
export npm_config_cache=/tmp/aviadilo-npm-cache
```

Those paths are session conveniences on the Linux development host and may disappear after a reboot. Install the pinned toolchains normally for lasting use. The Node archive was checked against the official SHA256 checksum; Python was installed through `uv`.

The temporary toolchains were absent at the slice 5 session start on 2026-09-07, leaving `.venv/bin/python` as a broken symlink. Restoring the same pinned Node/Python paths repaired the environment; `uv sync --locked --offline` then passed with existing dependencies. The previous isolated HA test instance and earlier `/tmp` evidence are also absent, so historical paths below are records of prior verification, not guaranteed reusable artifacts.

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
| `make e2e` | Exercise the composed card in Chromium with offline transport |
| `make ha-prepare` | Prepare the isolated synthetic HA instance in `/tmp` |
| `make ha-dev` | Run that isolated instance on localhost:18123 |
| `make clean` | Remove generated build artifacts |

The fixture preview uses synthetic local data and makes no provider requests. Routine tests must remain offline. Live source checks and HA/browser acceptance belong to the orchestrator after their implementation slices.

## Contracts and packaging

`contracts/` holds the versioned JSON schemas and fixtures. Both language implementations validate the same examples. Protocol changes must update both ends together and explicitly handle incompatible versions. Card configuration preserves unknown future fields when editing unrelated settings.

HACS uses the repository as type **Integration**. The archive contains the contents of `custom_components/aviadilo/` at ZIP root, including the built card and brand icon. Frontend, manifest, and tag versions must agree. All runtime dependencies must be available within the installed integration or declared in its manifest.

The GitHub Actions workflows run native/browser checks, HACS/hassfest validation, and version-tag release packaging. Local package installation and mocked HACS transport checks are distinct from authenticated HACS delivery. See the slice 8 evidence and remaining gates below.

Actions are pinned by commit and the HACS/hassfest validator images by digest. An explicit version-tag push runs the checks and publishes a development prerelease with `aviadilo.zip`. A push to `main` runs CI but does not publish an installable release. The earlier draft-only behavior was corrected after the first HACS installation attempt.

HACS also requires a public repository description and topics. At the slice 1 kickoff, `bishopdynamics/aviadilo` had neither; GitHub CLI/API credentials were unavailable in this session. The issue tracker was enabled. Before HACS validation, set the description to “A Home Assistant kiosk map combining aircraft, weather radar, wind, and household locations.” and add appropriate topics such as `home-assistant`, `hacs`, `lovelace-custom-card`, `aircraft`, `weather-radar`, and `leaflet`. These requirements are documented by [HACS](https://www.hacs.xyz/docs/publish/start/).

## Slice 1 verification — 2026-09-06

The orchestrator independently ran `make check` on Node 24.20.0/Python 3.14.2: formatting, lint and static types passed in both languages; Vitest passed 31 tests and pytest passed 32. Both frontend builds and release validation passed. Packaging tests cover deterministic output, missing/unsafe paths, version mismatch and imports after extraction.

Headless Chromium 151.0.7922.34 rendered the development and built fixture pages, including a 390-pixel viewport without horizontal overflow. The compiled module extracted directly from the ZIP also registered and rendered under the strict script policy. These checks recorded no JavaScript errors or external resource requests on stable loads. This is bootstrap browser evidence, not acceptance on the user's tablet or Home Assistant instance.

Artifact: `dist/aviadilo.zip`, version `0.1.0-dev.1`, six runtime files. SHA256: `3bd6d1ed3e66f25a384f881f87bcde46cb807c00f4472d4b1f48864f5d7553be`.

## Integration foundation — slice 2

HA's normal setup/options flows cover the shared location, aircraft provider/radius/units, requested interval, disk budget, background collection and conservative provider limits. Cache clearing is a separate confirmed action. Diagnostics expose aggregate state and counts without coordinates, tracker data, response bodies or credentials.

Background collection currently covers the selected aircraft source; radar and wind require viewer demand. This avoids fetching unused weather layers. Viewer leases expire after 60 seconds, and demand is checked again immediately before queued work reaches a producer. Adapters and authenticated transport are later slices, so this slice makes no provider requests.

The scheduler shares one queue per provider (one combined NOAA queue), coalesces requests and retains consumed slots/cooldowns across integration reloads. Correcting settings and reloading can release a permanent error without resetting rate-limit history. Requests have a 60-second timeout.

The cache lives at `<HA config>/aviadilo_cache`, outside the replaceable integration directory. The default disk budget is 512 MiB; complete entry bytes count toward it. Entries are capped at 8 MiB and retained blobs at 32 MiB, reserving room for temporary buffers within the 64 MiB backend cache budget. Metadata/entry count is bounded. Atomic writes, recovery and cancellation handling keep clear/unload operations coherent. Revalidation updates freshness separately from the original data time, and all selected radar products have 24-hour retention.

The module URL includes the integration version. A tiny public bootstrap waits for HA's `home-assistant` element before importing the card; this avoids registering it before HA replaces the browser's custom-element registry. Unload removes the integration's extra-module registration. HA's HTTP router cannot remove an individual route after startup, so the versioned asset routes remain for that HA process and are reused safely on reload.

### Verification — 2026-09-07

Independent `make check` passed 31 frontend and 97 backend tests, formatting/lint, strict mypy on 20 files, both Vite builds and ZIP validation. The five pytest warnings originate in HA/dependency deprecations. In this Codex environment, the sandbox blocks asyncio socket wakeups; the offline check ran with normal escalation rather than changing the tests.

An isolated HA Core 2026.9.1 instance with frontend 20260826.6 and Chromium 151.0.7922.34 exercised graphical setup and options, automatic module loading, confirmed cache clearing and authenticated diagnostics. Changing 75 nmi saved 138,900 metres and reloaded successfully. The test instance is separate from the user's HA installation. Its optional camera/FFmpeg native libraries were absent; no Aviadilo setup failure resulted.

The final ZIP was installed into that isolated instance and HA restarted. The entry loaded with its saved options; both versioned bootstrap and card URLs returned HTTP 200, and the card registered in HA's final registry and rendered. The graphical entry menu exposed Download diagnostics. No Aviadilo provider work was active.

Artifact: `dist/aviadilo.zip`, still development version `0.1.0-dev.1`, now 15 runtime files. SHA256: `61e5f18152807d63f842085b6d618f858336c7ddc8676f15996d6bf82b92e7ed`.

HACS installation/upgrade acceptance remains for slice 8. Docker daemon access was denied at the host level, so the pinned hassfest container was not run. GitHub description/topics and remote HACS validation also remain pending.

## Authenticated transport — slice 3

`websocket.py` implements the four version 1 commands through HA's authenticated connection dispatcher. Each connection owns its own subscription IDs; even another connection for the same user cannot update or heartbeat them. Normal HA unsubscribe/disconnect, lease expiry and integration unload clean up demand and callbacks. The initial status event establishes the frontend's subscription ID.

`src/data/ha.ts` isolates the HA APIs. `createHaAdapter(hass)` supplies `AviadiloClient` with authenticated calls, subscriptions and fetches. The client validates messages, debounces selection updates for 300 ms, tracks revisions, sends 20-second heartbeats, and cancels/revokes tile work on hide, selection changes or disposal. It disables HA's automatic subscription replay so its own reconnect logic uses the latest selection. Server lifecycle signals use the existing status-message field (`aviadilo:closed` and `aviadilo:lease_expired`).

The client is an exported API for the next card/layer slices; the current card stub does not yet consume it. Callers supply a resolved integration entry ID, layer flags, radar source and viewport; call `setSelection`, `setVisible`/`setActive`, `loadTile`/`releaseTile`, and `dispose` as the view lifecycle changes.

Future provider adapters capture a publication context with `service.capture(product, viewport?)` before awaiting work, then call `service.publish(context, payload)` without a viewer envelope. The service rejects stale audiences/areas, fans out current envelopes and bounds shared replay to 16 keys / 8 MiB of serialized snapshots. Aircraft background collection can retain its latest snapshot without viewers.

Radar adapters register a `TileSource` with `service.tiles.register(...)`: explicit trusted HTTPS hosts, products, sizes/styles and a synchronous URL resolver. The gateway owns all fetching, pacing, caching and revalidation. `/api/aviadilo/radar` requires authentication and a current matching viewer/revision, advertised frame and intersecting viewport. Opaque frame IDs travel as encoded query values. There is no arbitrary-URL input and no HA token in the URL.

Initial limits are 4 subscriptions per connection, 16 per user and 128 total; 8 active tile requests per user and 32 total. PNG responses are capped at 2 MiB with bounded dimensions and framing checks. The backend request deadline is 120 seconds and the frontend deadline 150 seconds, allowing queue pacing while ensuring stalled work ends. All upstream redirects are rejected; adapters must use canonical allowed hosts. Upstream failures return errors rather than transparent images. A 304 without new cache headers inherits the stored freshness policy.

### Verification — 2026-09-07

Independent `make check` passed **57 frontend and 169 backend tests**, formatting/lint, TypeScript, strict mypy on 24 files, both builds and the 17-file HACS ZIP check. Tests exercise real HA authentication/HTTP/WebSocket behavior and shared fixtures, with injected upstream responses rather than provider calls.

A temporary bundle of the actual frontend client ran inside the isolated HA 2026.9.1 UI in Chromium 151.0.7922.34. It established a subscription, coalesced two rapid edits into revision 2, removed its viewer on hide, and resumed cleanly. A second authenticated connection could heartbeat its own subscription but received `not_found` when targeting the first connection's ID; closing it left one viewer. Unauthenticated tile access returned HTTP 401. The client recovered from integration reload and a full HA restart using the final ZIP, retaining revision 2 with one viewer. Disposal left zero viewers and zero queued work. The temporary test token was revoked, its private file removed, and HA/browser stopped.

Artifact: `dist/aviadilo.zip`, development version `0.1.0-dev.1`, 17 runtime files. SHA256: `3e334596f5c489bbb8ac7fb65a8de1dd7c7737b4e287844051866312a8b0b136`. Live providers, card wiring and full HACS acceptance remain later slices.

## Map, editor and people — slice 4

The card now embeds Leaflet and its styles in one JavaScript module, matching the integration's single-file static route. Map/list/combined layout, theme, anchors, extent, zoom limits, transient layer toggles and recenter controls have graphical settings. The editor exposes every v1 setting through native accessible controls; aircraft/radar/wind settings are saved for their later implementation slices. Valid edits preserve unknown root, panel and tracker fields; invalid drafts retain the last valid configuration.

Selected `device_tracker` entities supply the people layer directly. Radius filtering happens before drawing/counting/fitting, including the boundary, longitude wrapping, zero coordinates and missing-anchor handling. Unavailable positions require explicit stale display. Explicit position timestamps take precedence; `last_updated` is labelled as an entity update with GPS age unknown, and `last_changed` is never treated as GPS freshness. Accuracy circles do not contribute fit bounds. The central viewport holds the home view or fits filtered points/zones, suspends automatic fitting after manual interaction, and resumes on recenter or an enabled idle return.

Runtime basemap tiles use OpenStreetMap's standard HTTPS endpoint with visible attribution, normal browser caching and valid referrers. Only visible tiles load; one queue per page starts at most one image per second with one in flight, a 15-second deadline, and cancellation on unload/hide. There is no prefetch, automatic retry or cache busting. This browser queue shares pacing across cards on the same page; it is not an installation-wide cache or cross-device limiter. External aircraft/weather requests retain the backend scheduler contract. Basemap requirements follow the separately researched [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).

Picker/editor previews use a local schematic map and synthetic locations, with no Aviadilo tile, photo, provider or backend requests. HA frontend 20260826.6 sets `.preview` through `hui-card`, but its `hui-card-picker` creates custom cards directly without that flag. `src/map/ha-preview.ts` isolates a composed-ancestor check for that case, evaluated before side effects and again on reattachment. This context is never saved into card configuration. `fixtureHass` is an explicit development-only state injection; HA previews do not read real household positions.

The card currently reads `aviadilo/info` on connection/configuration to resolve integration status and the default people anchor. It does not yet subscribe to external layers or continuously refresh changed integration options; reload the card after changing the integration anchor. Full transport/layer wiring remains later work.

### Verification — 2026-09-07

Independent final `make check` passed **83 frontend and 169 backend tests**, formatting/lint, TypeScript, strict mypy on 24 files, both builds and 17-file ZIP validation. The nine Python warnings are from HA/dependencies. Log: `/tmp/aviadilo-root-slice4-check.log`. Runtime module: 719.69 kB raw / 125.75 kB gzip, with no separate CSS or JavaScript chunks.

Chromium 151.0.7922.34 exercised development and built fixtures, 390-pixel width without horizontal overflow, Tokyo exclusion/return, keyboard zoom preservation/recenter, persistent popups, synthetic touch events and listener cleanup on detach/reattach. Unit tests cover boundary/zero/unknown/wrapped positions, missing anchors, empty/single fits, idle return, future fields and tile pacing/cancellation. Trusted touch emulation did not persist through this browser connector's CDP calls; physical touch/tablet acceptance remains unclaimed.

In isolated HA Core 2026.9.1, the final ZIP survived a full restart and registered the card/editor. A people-only dashboard showed the nearby tracker and excluded Tokyo/unavailable trackers; a real HA state update brought the traveller back without overriding a manual view. HA's native editor saved a title and 25 nmi as 46,300 metres and reopened with the same displayed values. The final card picker showed synthetic people even without `.preview`, with zero OSM requests. OSM images were mocked throughout automated map interaction; no public map/aircraft/weather provider was exercised. HA's own unrelated picker examples requested its demo images. Final stable card interactions had no JavaScript errors; earlier stop/restart and general HA UI errors are not counted as card acceptance failures.

Artifact: `dist/aviadilo.zip`, development version `0.1.0-dev.1`, 17 runtime files. SHA256: `425bfb404e7c52a12b79f876fcdb8ad80af34ac6524257aa6df8f1615e46b153`. All test servers/browser sessions stopped and the temporary HA token/private files removed. HACS install/upgrade, live sources, integration option-change recovery and the physical kiosk remain later acceptance work.

## Aircraft collection and components — slice 5

Service startup registers the configured adsb.fi or ADSB.lol adapter. One producer collects the shared area for all active viewers; there are no per-card provider requests. Background collection still requires its explicit integration option. The existing scheduler owns pacing, backoff and Retry-After, and final-viewer cancellation reaches the in-flight HTTP request. Old-area responses are rejected; viewers joining or changing revision during a request receive the shared result under their current envelope. Status reports retain the original success time, distinguish unavailable/stale data, and expose effective pacing. Protocol fields and schema version remain unchanged.

Adapters use bounded JSON responses (4 MiB / 10,000 records), reject redirects and invalid response shapes, normalize to SI, and preserve unknown versus zero, ground versus unknown altitude, non-ICAO identity, and course versus heading. Upstream position age includes response/body-transfer age. Integer nautical-mile requests round outward, then valid positions are clipped to the exact configured metre radius with longitude wrapping; unknown positions remain unknown metadata. These choices follow the providers' [adsb.fi endpoint/terms](https://github.com/adsbfi/opendata), [ADSB.lol radius schema](https://api.adsb.lol/api/openapi.json), and [readsb field definitions](https://github.com/wiedehopf/readsb/blob/dev/README-json.md).

The shared cache uses provider plus normalized area, honours response validators and cache directives, and preserves original data times on cache hits/304. Direct cache get/put keeps HTTP cancellation within the scheduler; the cache's shielded `fetch` helper is not used for aircraft. Both providers returned `Cache-Control: no-store` during this session's bounded access checks, so those responses are not persisted. The service retains only the bounded current display snapshot while aircraft demand/background collection exists, and drops replay state when that demand ends.

Frontend composition API: import `src/layers/aircraft/index.ts`, create `AircraftController(config, anchor)`, and pass validated aircraft events to `update` and aircraft status entries to `setStatus`. `configure` changes only local display filters; `select` shares selection between `AircraftLayer(map, controller)` and `<aviadilo-aircraft-list .controller=...>`. `view`/`subscribe` expose rows, map points and selected trails; `fitPoints` supplies only fresh map candidates to the central viewport. Layers never pan or fit the map themselves. Dispose the layer/controller and detach the list on teardown. The reusable `aircraftControls` helper in `src/editor/aircraft-panel.ts` preserves saved selections/CSS colours and writes SI configuration values.

The controller bounds retained aircraft to 10,000 records and the selected trail to 240 points plus its configured duration (at most two minutes). One-second ticks age/expire data even without new responses, stopping when listeners leave. Stale positions are visibly distinct and excluded from fitting; unknown course has a nondirectional symbol. Keyed marker/list updates preserve focus and selection. Popup content scrolls within a bounded height, and provider attribution remains linked on map and list. Final card/client/editor composition is still slice 8: the current normal bundle does not import the aircraft frontend components, and the existing people-only fixture remains unchanged.

### Verification — 2026-09-07

Final independent `make check` passed **91 frontend and 195 backend tests**, format/lint, TypeScript, strict mypy on 27 files, both builds and the 19-file HACS ZIP check. Log: `/tmp/aviadilo-root-slice5-check.log`. Provider tests use synthetic bodies with HA's real service/session boundaries; they cover SI/null/ground/non-ICAO handling, exact-radius/antimeridian boundaries, bounded response/error handling, cacheable-to-no-store replacement, 304 age preservation, shared late-join/revision publication, last-viewer HTTP cancellation, Retry-After recovery and rapid viewer-status cleanup.

Chromium 151.0.7922.34 exercised a separately bundled/minified aircraft module without external requests. At 390px, the list scrolls internally without widening the page. Keyboard row selection synchronizes map/details; subsequent positions preserve marker/popup identity, focused controls, popup scroll and manual map centre/zoom. Stale/unknown-position exclusion from fit, local filters, row limits, zero versus unknown display, text escaping, elapsed-time removal without new snapshots, marker churn, attribution and timer/listener disposal passed. Popups remain readable and contained for the tested centre selection at 390px and 1024px. The editor helper correctly initially displays saved units/sort/labels, retains CSS colour strings and converts 1000 ft to 304.8 m. Evidence, standalone harness and screenshot: `/tmp/aviadilo-slice5/browser-evidence.json`, `browser-entry.ts`, `browser-setup.js`, `browser-final.png`.

One bounded GET per approved provider went through the shared scheduler at the explicitly non-household ocean point 0°, 0°, radius 1 nmi. Both returned HTTP 200, the expected v2-compatible envelope with millisecond `now`, an empty aircraft array and no-store. This establishes access and empty-response shape; populated live records and household coverage are not claimed. Automatic approval review rejected the initial Claremont-coordinate probe as potentially disclosing a household location; it did not execute. The ocean check was the approved safer alternative. No further provider data requests were made.

Artifact: `dist/aviadilo.zip`, development version `0.1.0-dev.1`, 19 runtime files, SHA256 `f0826157fa9eb98991814c4865ace1a348969d77008f868524018c2d62911785`. Both local fixture servers and the browser session were stopped. No full HA GUI instance was started this slice. Aircraft card composition, populated-source/household acceptance, HACS installation/upgrade and physical kiosk testing remain later acceptance work.

## Selected radar adapters and playback — slice 6

Service startup registers RainViewer, NOAA MRMS `conus_bref_qcd`, and NOAA KSOX `ksox_sr_bref`. Metadata collection is source-wide and viewer-driven, every 300 seconds for RainViewer and 120 seconds for NOAA. Successful cadence survives rapid hide/reopen; the latest source manifest replays under each current subscription revision without starting premature metadata requests. Metadata and images share the existing provider buckets, including the common NOAA limit. Aircraft-only background collection is unchanged.

The bounded metadata adapters validate exact hosts/products and advertised frame identities. RainViewer retains opaque past paths, with Universal Blue scheme 2, smoothing enabled and snow colouring disabled. NOAA parses bounded WMS capabilities without DTD/entities, keeps the exact irregular UTC times, and resolves EPSG:3857 XYZ bounds through WMS 1.1.1. Empty successful timelines display unavailable; a newest frame older than 15 minutes is stale even when NOAA metadata was just fetched. NOAA `generated_at` is original metadata receipt because the source supplies no capabilities-generation time. Cache replay/304 preserve timestamps and source directives. The existing authenticated tile gateway performs all PNG requests, validation and cached replay.

`src/layers/radar/README.md` documents the component API: `RadarController(client)`, `RadarLayer(controller).attach(map)`, and Lit `radarTimeline`, `radarLegend` and `radarControls` helpers. The controller accepts only the authenticated client's tile-loading/release interface. `AviadiloClient.loadTile(tile, signal?)` now supports individual cancellation: shared waiters retain their request until the final waiter leaves, including synchronous abort/replacement races. Wire fields and schemas are unchanged. The composing card still owns HA subscription selection/visibility and must forward current events; final composition remains slice 8.

Playback loads the latest frame first, then at most one adjacent frame while looping. It retains at most three frames with 32 visible tiles each (24 MiB decoded), plus a canvas capped at 8 MiB. Oversized viewports use a coarser grid; zoom beyond each source cap enlarges existing tiles locally. RainViewer's documented native cap is z7. NOAA WMS has no native slippy zoom: MRMS z7 and KSOX z9 are conservative display sampling choices, approximately 1 km and 250 m per pixel in California, without claiming uniform radar accuracy or extra detail. Slow preloads finish before advancing rather than being repeatedly cancelled by playback timers. Paused historical selection survives metadata refresh; Latest resumes following newest.

Candidate-frame errors keep the previous complete image with a stale/error label. Source/revision/frame-list/viewport/hide/disposal changes cancel obsolete work and release image URLs. The canvas does not receive pointer events or alter the viewport. Legends and linked attribution are bundled: the complete 128-entry RainViewer rain palette from its [official colour table](https://www.rainviewer.com/files/rainviewer_api_colors_table.csv), and the exact NOAA legend preserved in the frozen spike. No runtime legend requests occur. RainViewer per-pixel coverage remains unknown; NOAA bounds describe a product envelope, not coverage of every pixel. Controls say so and skip requests outside a known envelope. Source references: [RainViewer weather maps](https://www.rainviewer.com/api/weather-maps-api.html), [transition policy](https://www.rainviewer.com/api/transition-faq.html), [NOAA service directory](https://opengeo.ncep.noaa.gov/geoserver/www/index.html).

### Verification — 2026-09-07

Final independent `make check` passed **109 frontend and 229 backend tests**, format/lint, TypeScript, strict mypy on 31 files, both builds and the 22-file HACS ZIP check. Log: `/tmp/aviadilo-root-slice6-check.log`. Tests cover metadata shapes/hostile inputs/empty timelines, exact NOAA times/bounds/style, cache revalidation, late-viewer publication, request cancellation, shared NOAA metadata/tile pacing, rapid no-cache reopen, and shared/reentrant frontend cancellation. Existing authenticated HTTP/WebSocket tests remain real HA tests with offline injected sources.

Chromium 151.0.7922.34 exercised a standalone minified radar bundle with synthetic PNGs and zero external browser requests. The 390px/1024px layout, complete legends and saved editor choices passed. Initial latest mode requested only four visible native z7 tiles on a z9 map; underlying markers remained clickable. Three frames retained 12 URLs / 3 MiB decoded, and repeat seek made zero new calls. With 260ms-per-tile loading and a 100ms playback setting, all three frames loaded in 12 calls with zero abort/restart churn. Opacity/speed edits made no requests or viewport changes. Paused refresh, smaller-history selection, partial-frame failure retaining previous imagery, recovery, KSOX outside-coverage skipping, native z9 overzoom, hide/resume, and disposal passed. Disposal left zero URLs, pending requests, canvases, timers, listeners or radar attribution. Evidence and harness: `/tmp/aviadilo-slice6/browser-evidence.json`, `browser-entry.ts`, `browser-setup.js`, `browser-final.png`.

One metadata read and one 256px global overview PNG per provider ran through the shared scheduler, with no household coordinates or retries: all six HTTP200, all three PNGs valid. RainViewer advertised 13 past frames, MRMS 60 irregular times, KSOX 20. RainViewer metadata sent no-cache and tiles max-age172800 (local retention still capped at 24 hours); NOAA metadata sent must-revalidate/max-age15 and tiles max-age9000. The new adapters independently normalized those captured live metadata files against the frozen event schema without additional requests. The RainViewer overview probe used unsmoothed `2/0_0`; the documented production resolver uses smoothed `2/1_0`. These checks establish access/format, not household coverage or full HACS acceptance. Raw evidence: `/tmp/aviadilo-slice6/live-check.json` and `normalized-live-evidence.json`.

Artifact: `dist/aviadilo.zip`, development version `0.1.0-dev.1`, 22 runtime files, SHA256 `01e06c38c99f57bfb103d99bfad6416dee9bcd88e294a3a8d471edade999f1f3`. The local server and browser sessions were stopped; the native worker completed and only the main worktree remains. No full HA GUI instance, credential, release or deployment was created this slice. DWD wind is next; full card/HACS/physical-kiosk acceptance remains slice 8.

## DWD wind and local animation — slice 7

The integration now registers the selected `dwd__Icon_reg025_fd_sl_UV10M` WCS 2.0.1 source. Metadata and each viewport grid enter the existing shared DWD scheduler separately, avoiding nested queue requests. Up to 12 active snapped regions share metadata and matching grid work; four of the existing 16 replay slots remain reserved for aircraft/radar. Region changes wake collection without waiting an hour, equivalent bounds ignore display zoom, and original viewer/revision/area ownership is preserved through asynchronous work. The last interested viewer cancels its region; one viewer leaving cannot cancel metadata needed by another region. Wind never runs for aircraft-only background collection.

DescribeCoverage confirms ICON-global, 0.25° native geometry, U then V in m/s, and an advertised valid-time list. The adapter chooses the nearest time to the hourly metadata validation instant (earlier on an exact tie), keeping that field consistent across rapid reopen. `REFERENCE_TIME` lists model runs, but the returned text does not establish a selected run binding, so `run_time` remains null. Cache identity includes coverage, selected valid time, unknown-run validation epoch, snapped bounds and sampling. Headerless responses use the approved conservative one-hour freshness; explicit cache directives/validators still apply and unknown-run data revalidates hourly. Failures retain the previous field's actual valid time with stale status. A model-valid time more than three hours from now is flagged stale.

Text responses are checked for EPSG:4326 longitude/latitude order, inclusive possibly nonzero grid indices, unrotated affine geometry, matching cell centres/edge bounds and paired bands. Geometry comes from the returned data rather than assumed request bounds. Missing/nonfinite/sentinel cells produce paired nulls; calm zero remains valid. Metadata XML rejects DTD/entities and disguised encodings. Raw responses are capped at 1 MiB, fields at 4096 cells, and malformed HTTP200 content enters normal scheduler backoff before cache writes.

Larger areas use source-side `scaleSize=i(width),j(height)` with `rangeSubset=u,v`; no native global array is downloaded and decimated. Requests include interpolation padding. Wrapped/seam-touching views use a bounded full-longitude band at the requested latitude span, with the verified source cell edges −180.125° to 179.875°. The resulting ordinary longitude grid fits the frozen schema; frontend interpolation crosses its seam only when width × longitude step demonstrably spans 360°. Actual returned spacing is reported as effective resolution. See [DWD geoservices](https://www.dwd.de/DE/leistungen/geodienste/help/nutzung_geodienste.html?lsbId=621762) and [WCS reference](https://docs.geoserver.org/stable/en/user/services/wcs/reference/).

`src/layers/wind/README.md` describes `WindController`, `WindLayer(map, controller)`, the shared `sampleWind`/projection/unit helpers, and `windPanel`/`windControls`. The composing card must forward validated current events, clear the controller when its viewport/revision changes, and own final visibility/disposal. These components perform no network calls. Arrows point downwind; barbs point from the source direction and always encode 5/10/50 knots independently of the selected numeric unit, following [NWS conventions](https://www.weather.gov/hfo/windbarbinfo). Both static markers and particles sample the same U/V field without bridging contributing missing cells or extrapolating beyond the represented field.

Rendering uses two noninteractive canvases, together capped at 8 MiB RGBA, below aircraft/people. Static work is capped at 4096 markers, particles at 1500, and animation updates at no more than 30 fps. A light stroke with dark halo supports contrasting map backgrounds. Unchanged config/visibility and status-only updates preserve animation state. Reduced motion, document/layer hiding, movement and physical detachment stop particles; resume resets elapsed time. All-null fields explicitly report unavailable and do no animation work, while calm and partially masked fields remain usable. All frozen wind controls are graphical, with linked source, valid time, unknown run and effective resolution displayed. Full card composition remains slice 8.

### Verification — 2026-09-07

Final independent `make check` passed **120 frontend and 245 backend tests**, formatting/lint, TypeScript, strict mypy on 33 files, both builds and the 23-file HACS ZIP check. Log `/tmp/aviadilo-root-slice7-check.log`. New checks include scaled/nonzero-index geometry, null masks and cyclic seams, cache/revalidation, shared/multiple regions, cancellation, stale/no-data state, and malformed HTTP200 responses retrying at fake-clock 0/30/90 seconds without caching invalid bodies. The two deliberately offline legacy fixtures disable only their instance's wind registration; actual registration/collection is tested separately.

Chromium 151.0.7922.34 exercised a standalone minified wind bundle with no external browser requests. Eastward/northward particles moved along the expected screen axes; 27 canvas updates in a sampled 1.2 seconds stayed under the 30 fps cap. Unchanged settings/status preserved particle identity. The 390px layout, saved controls, 65-knot barb parts, marker clicks through canvases, all-null versus calm behavior, 1500-particle cap, and cyclic sampling of the actual captured full-longitude field passed. A 2200px-wide/2200px-tall map allocated 8,380,176 canvas bytes, below 8 MiB. Physical DOM detach stopped RAF; reattach restored exactly two canvases; disposal left zero particles, RAF, canvas bytes/elements and controller listeners.

The browser connector's CDP reduced-motion override did not persist. Reduced-motion and document-hidden handlers were therefore exercised with explicitly synthetic MediaQueryList/visibility change events: particles stopped, static glyphs remained when appropriate, and resume showed no accumulated-time jump. These are component checks, not OS accessibility or physical-kiosk acceptance. Evidence, harness and screenshots live under `/tmp/aviadilo-slice7/` (`browser-evidence.json`, `browser-entry.ts`, `browser-setup.js`, `browser-arrows.png`, `browser-barbs.png`).

Three bounded DWD requests through Scheduler used no household location or retries: one DescribeCoverage, an 8×6 ocean subset around 0°,0°, and an additional 16×4 full-longitude/ocean-latitude band to verify the dateline geometry. All returned HTTP200. The description advertised 137 times and u/v m/s; grids returned the requested 48/64 cells with nonzero row indices and actual affine geometry. Both grids were independently normalized and validated against the frozen event schema; longitude aliases on either side of the 360° seam sampled identically. No cache headers or validators were returned. Raw evidence: `live-check.json`, `global-band-check.json`, `dwd-description.xml`, `dwd-scaled-ocean.txt`, `dwd-global-band.txt`, plus normalized `live-grid.json`/`global-grid.json`.

Artifact: `dist/aviadilo.zip`, development version `0.1.0-dev.1`, 23 runtime files, SHA256 `4d7fb180a11cb326d580927826a55f0e77cf92f98e951a0ad4f709ec03ee8c38`. Local browser/server stopped; native worker completed and only main worktree remains. No full HA GUI instance, credential, release or deployment was created. Slice 8 must compose the three new frontend layers with the existing people map and complete HACS/HA/physical-kiosk acceptance.

## Product composition and local acceptance — slice 8, 2026-09-07

The card now composes all four layers with the actual authenticated client. HA's stable connection identifies a client; ordinary reactive state updates do not recreate subscriptions. Passive `aviadilo/info` discovery every five seconds refreshes integration setup/options without provider calls. Disabled layers, list-only layouts, collapsed lists, offscreen/hidden cards and removal release unneeded demand. People remain usable when the external integration is absent. Radar waits for the current revision's manifest before loading tiles, and wind clears when its selection changes. Display edits reuse the existing client and preserve manual view/selection.

The public sizing contract uses natural height in HA sections, so disclosures cannot overlap a following card. Masonry uses rendered height when available and a saved-configuration estimate before rendering. Raw HA picker and editor previews render synthetic aircraft/radar/wind/trackers from bundled local fixtures. The editor preserves supported settings and unknown future fields.

Native implementation used one serial Codex `gpt-6-astra` worker with high reasoning because Hanuman was unavailable. A separate read-heavy installer check used `gpt-5.6-sol` with medium reasoning in a confined `/tmp` directory. The orchestrator reviewed changes and independently reran their checks. `.bishop/` is committed, including app-generated task metadata, per the user's explicit correction.

### Reproducing the offline checks

After `make setup`, run `npx playwright install chromium` once. Linux CI uses `npx playwright install --with-deps chromium`. `make check` now includes the 11 Playwright scenarios. The browser binary can be overridden with `AVIADILO_CHROMIUM_PATH`; this session used `PLAYWRIGHT_BROWSERS_PATH=/tmp/aviadilo-playwright`. Playwright is pinned to 1.63.0 with bundled Chromium 153.0.8010.12.

`dev/index.html` remains the offline preview. `dev/runtime.html` exposes an explicitly fake HA transport for browser tests, using the real card/client/subscription and tile lifecycle. Tests block external endpoints before loading and supply synthetic OSM raster bytes. They cover all four layers, two viewers, responsive/keyboard selection, manual view, local edits, list/hidden demand, initial unavailable/explicit entry discovery, HA reconnect/integration recreation, old-revision races, paused radar refresh, preview isolation, editor round-trip, cleanup, and a following sections card.

Independent full `make check` passed **123 frontend + 258 backend + 11 Chromium tests**, formatting/lint/TypeScript, strict mypy on 36 files, both builds and the 23-file ZIP. Log: `/tmp/aviadilo-slice8/root-final-check-v2.log`. The final helper-only Recorder change also passed the 45 focused configuration/provider-fixture regressions independently (`root-helper-final.log`) and worker lint; it does not affect the distributed ZIP. Official pinned hassfest reported one integration and zero invalid integrations (`hassfest-final.log`).

### Real Home Assistant and package upgrade

The separate instance at `/tmp/aviadilo-slice8/ha` runs HA 2026.9.1 and frontend 20260826.6. Its optional provider shim replaces only provider HTTP responses; HA auth, WebSockets, revision checks, tile HTTP, scheduler, cache and compiled card remain real. Unknown provider hosts fail closed, and browser OSM requests are blocked or mocked. No Aviadilo public provider was queried for these acceptance runs. The shim is a required dependency only in the installed test manifest and is absent from the distribution. See [the isolated HA guide](../dev/ha/README.md).

Native graphical integration setup saved a 75 km collection radius; the graphical options flow saved a 256 MiB disk budget. Replacing development version `0.1.0-dev.1` with `0.1.0-dev.2` and restarting HA retained the entry, settings/options and dashboard. The actual loaded bootstrap and card URLs changed to `/aviadilo_static/0.1.0-dev.2/`. A further package replacement/restart preserved all 17 valid warm cache files byte-for-byte before viewers resumed. An arbitrary invalid sentinel file was correctly removed by cache recovery; the successful retention check used real cache entries.

The native HA dashboard also fit a 390 px browser viewport without horizontal overflow. After explicitly closing its real HA WebSocket, the card was active again at the first one-second observation with three aircraft, two people, radar images and a wind grid. This is a real connection recovery check, distinct from the more detailed controlled disconnect/recreation browser regressions.

Chromium 151.0.7922.34 verified automatic native card-picker availability, synthetic previews, graphical save/reopen of the title, all layer toggles, wind barbs and particles, and real sections sizing. A following markdown card remained 8 px below Aviadilo both with wind controls collapsed and expanded. Real HA rendering showed three synthetic aircraft, radar tiles, wind fields/animation and two selected synthetic trackers. Screenshots include `ha-editor-reopened.png` and `ha-sections.png` under the slice's temporary evidence directory. Initial helper defects—missing sample `schema_version`, handling of `yarl.URL` and separate/repeated request parameters, and missing Recorder for the frontend's `recorder/info` call—were corrected and covered by meaningful configuration/adapter/gateway tests. Optional host FFmpeg/libturbojpeg errors concern HA's camera dependencies; Aviadilo does not use them.

### Twenty-minute HA soak

Two separate Chromium 153.0.8010.12 contexts ran the actual packaged HA card for **1,200 seconds**, with looping radar, 500 wind particles, three aircraft and two trackers each. The 41 periodic samples enforced wind/radar resource limits and allowed up to 15 seconds for normal refresh handoffs. Both clients completed with zero JavaScript errors and zero failed tile responses; 72 authenticated tile responses succeeded and 18 basemap requests were mocked. After initialization the card DOM stayed at 282 nodes per client. Each retained at most three radar frames (3 MiB decoded) and two wind canvases (1,881,600 bytes). Sampled JS heap peaked at 26.1 MiB; final retained heaps after explicit collection were 13.75/13.22 MiB, below the initial 16.02/15.20 MiB.

Final authenticated diagnostics returned HTTP200, package `0.1.0-dev.2`, two viewers, three active products, zero pending provider jobs, current active provider states, and a shared cache of 46 entries/59,569 disk bytes/53,176 memory bytes. Evidence: `/tmp/aviadilo-slice8/ha-soak-{result.json,progress.json,final.png}` and `ha-soak.log`; the standalone runner is `ha-soak.mjs`. This is a 20-minute synthetic-provider Linux/Chromium run, not an overnight or physical-tablet endurance claim. Its browser contexts and the isolated HA server were stopped after completion.

### HACS compatibility and remaining release gates

The actual **HACS 2.0.5** `HacsIntegrationRepository.async_install_repository` installed the baseline and upgraded the candidate in a separate test config. HACS's real download URL normalization, ZIP save/extraction, backup creation/cleanup and version bookkeeping ran. Metadata used `GitHubReleaseModel` fixtures, and only GitHub metadata refresh plus the low-level HTTP response transport were mocked. The HTTP boundary received exact canonical `v0.1.0-dev.1` and `v0.1.0-dev.2` asset URLs. Runtime/brand files landed at the correct integration root without a nested `custom_components`; external settings/cache sentinels survived. A Python audit hook rejected network connections, and HACS's temporary backup directory was confined before import. The orchestrator independently reran the script successfully. Evidence: `/tmp/aviadilo-slice8/hacs-installer-check/{verify_hacs_install.py,REPORT.md,result.json}` and `hacs-installer-parent.log`.

This proves installer compatibility with mocked transport. **Authenticated HACS repository validation, a real release download/install/update, and the physical tablet remain unverified.** The pinned HACS validator exited with HTTP 401 because no GitHub token was available (`hacs-validator-initial.log`). Public repository metadata still lacked description/topics. No GitHub CLI credentials, token or usable GitHub connector was available. All code remains local; this session did not push, tag, publish, or deploy to the household instance. Candidate notes are prepared in [the release notes](releases/0.1.0-dev.2.md); these delivery gates remain part of the in-progress ROOT_SPEC, not deferred features.

Final artifact: `dist/aviadilo.zip`, `0.1.0-dev.2`, 23 runtime files, SHA256 `78b7e4d1773f78651ec041d71140413a5e29d438027873d1cf3279830ca17392`. Frontend/manifest/Python/runtime bootstrap versions are checked together; schemas remain version 1.

## HACS release delivery correction — 2026-09-08

After the user pushed `9e09696`, HACS tried downloading `aviadilo.zip` for that commit hash. Public GitHub had no version tags or releases. Native CI and hassfest passed, while HACS reported missing license, description and topics. With `zip_release: true`, source code on `main` does not supply the compiled release asset. The tag workflow also created drafts, which HACS filters out.

The release workflow now publishes a development prerelease after an explicit `v*` tag push, preserving all native/browser gates, exact tag/package validation, pinned actions and limited write permissions. It does not publish on a `main` push. SSH Git access can push the version tag and GitHub Actions can use its own token to publish; a separate local GitHub API token is not required for that route.

The user selected MIT and updated the GitHub description. The root license is included at ZIP root, with matching npm/Python metadata. Packaging checks verify its presence/content and deterministic ordering; the isolated HA installer accepts both new licensed and earlier unlicensed test ZIPs. Independent lint, 39 packaging/contract tests, build and exact `v0.1.0-dev.2` package validation passed. All 23 pre-existing runtime files are byte-identical; the only added ZIP entry is `LICENSE`. The first published archive contains 24 files, SHA256 `90c74ee5333e26331c5fd1b396cac46ae904854ff0d32b4389e8d7f8193b8463`. Evidence lives under `/tmp/aviadilo-release-20260908`.

In HACS, refresh **Update information**, then Download/Redownload → **Show beta versions** and select the versioned prerelease. Do not choose a commit hash. [HACS version selection](https://www.hacs.xyz/docs/publish/start/#versions), [refresh/download controls](https://www.hacs.xyz/docs/use/repositories/dashboard/).
