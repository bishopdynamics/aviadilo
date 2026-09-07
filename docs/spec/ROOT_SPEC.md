# SPEC: Aviadilo household map

- **Status:** draft — accepted product decisions incorporated; new engineering choices below await review.
- **Addenda:** none.
- **Compatibility baseline:** Home Assistant Core 2026.9.1, current stable Chromium on a tablet PC. The user reported using latest HA; this patch version is the verified release baseline, not an inspection of their installation.
- **Inputs:** `docs/idea/revised-direction.md`, `docs/research/everything-map.md`, `docs/research/weather-source-quality.md`, and the frozen Claremont spike.

## Summary

Aviadilo replaces separate aircraft, radar, and household-location maps with one large Lovelace map suitable for the user's Chromium kiosk. A Python Home Assistant integration shares external data collection and caching across cards and devices. A TypeScript/Lit/Leaflet card renders aircraft, precipitation radar, wind, and existing household trackers as independent layers. Every supported setting has a graphical editor, and distant travellers cannot pull the home view out to a world map.

This document makes the proposed implementation concrete. It does not authorize deployment to the user's HA instance or mark first-run setup complete.

## Goals

- One responsive map with independently enabled aircraft, radar, wind, and household-location layers.
- Graphical configuration throughout: integration setup/options plus every supported card setting.
- Retain the selected weather sources and visual wind styles.
- Share data requests and cached frames across viewers; replay should reuse downloaded data.
- Handle missing, stale, unavailable, and out-of-coverage data without breaking other layers.
- Support the user's current HA release and Chromium tablet PC, including touch and prolonged display.
- Deliver an installable integration/card bundle with reproducible development, tests, and packaging.

## Non-Goals

- Additional weather sources, weather alerts, lightning, wildfire overlays, or a general third-party plugin system.
- Aircraft routes, photos, watchlists, prediction/dead reckoning, or notifications.
- Historical people tracking, continuous aircraft recording, or synchronized historical replay of every layer.
- A literal 3D globe, flight-navigation tooling, or a replacement phone-tracking service.
- Support claims for older HA releases, Safari, or mobile companion webviews before testing them.

## Key Decisions

“Accepted” identifies user decisions. “Proposed” identifies concrete engineering choices submitted with this draft.

| Decision | Choice | Rationale / alternatives considered |
| --- | --- | --- |
| Product and stack — accepted | TypeScript + Lit + Vite + Leaflet; Python companion integration | One shared map, native web components, server-managed collection/cache |
| Weather sources — accepted | Radar: RainViewer default, NOAA MRMS, NOAA KSOX. Wind: DWD ICON global only | Selected after the Claremont image comparison |
| People — accepted | Existing coordinate-bearing `device_tracker` entities; radius filter before drawing/fitting | No migration of the household's tracking setup |
| Editor — accepted | Graphical access to every supported option | Advanced panels may collapse, but no YAML-only supported features |
| Compatibility — accepted input / pinned baseline | HA 2026.9.1 and current stable Chromium on tablet PC | Record tested Chromium version in verification; refresh the HA baseline deliberately as development proceeds |
| Aircraft sources — proposed | adsb.fi default; ADSB.lol alternative, manually selected | adsb.fi has a documented 1 request/second ceiling; both were researched. No automatic provider switching |
| Installation — proposed | One integration ZIP containing the compiled card; manual local installation first | Avoid separate backend/card version drift. GitHub/HACS publication is a follow-up to the GitLab development repository |
| Initial configuration model — proposed | One integration entry with one shared home/zone/custom collection area; any number of cards/viewers | Matches the household use case and keeps global cache/poll controls unambiguous. Multiple independently configured aircraft areas can follow |
| Viewport — proposed | Fixed home-area view by default; optional fit-visible mode | Only the central viewport controller can change bounds |
| Initial collection — accepted | 50 km aircraft radius, requested 10-second interval | Subject to shared provider limits and backoff |
| Cache — proposed | 512 MiB disk budget, 64 MiB backend memory budget; graphical disk setting 128–4096 MiB | Bounded persistent reuse; avoids unbounded kiosk growth |
| Viewer lifetime — proposed | 20-second heartbeat, 60-second lease; hide/disconnect ends demand | Stop upstream work after all active viewers leave |
| Time — proposed | Live targets, separately labelled radar history and current-valid model wind | No implication that a past radar frame rewinds live targets |

The HA release and its Python requirement are verified from [2026.9.1](https://github.com/home-assistant/core/releases/tag/2026.9.1) and [its project metadata](https://raw.githubusercontent.com/home-assistant/core/2026.9.1/pyproject.toml): backend development/tests require Python 3.14.2 or newer within the supported 3.14 line. Use Node 24 LTS for the frontend development environment; pin dependency versions in lockfiles during setup.

## Design

### Product layout and first use

The integration's graphical setup chooses a location anchor (HA home by default, another `zone`, or explicit coordinates), aircraft provider, and collection radius. Missing coordinates prevent activation of affected collection rather than falling back to zero.

The card picker exposes `custom:aviadilo-map` with a fixture-backed preview that makes no upstream requests. Card defaults: aircraft on, radar/wind off, people enabled when the user selects trackers. Add the integration to activate external layers. A people-only card can consume existing HA state without the integration.

The map owns layer toggles, recenter, selection/details, a radar timeline, and a collapsible aircraft list. Draw basemap, radar, wind, context/trails, aircraft, people, and then controls/popups in that order. Weather drawing must not intercept marker taps.

All controls work with touch and keyboard. Respect reduced motion; wind static markers remain available when particles are disabled. Adapt to HA masonry/sections sizing and Chromium window resizing. Performance measurements use the actual kiosk when available; no exact screen size or hardware capability is assumed.

### Configuration ownership

Integration options, edited by HA administrators:

- Anchor and 50 km aircraft collection radius; provider choice; requested aircraft interval (10 seconds default).
- Shared disk cache size (512 MiB default), background collection off by default, cache-clear action, and diagnostics.
- Advanced provider pacing can only be made more conservative than shipped policy. No override bypasses known limits.

Card options, all graphical:

| Panel | Supported settings and initial defaults |
| --- | --- |
| Map | Optional title; map/list/combined (combined); size; follow HA theme; home/zone/custom view anchor; initial extent; home-area or fit-visible view; zoom limits; recenter; optional idle return (off) |
| Layers | Aircraft on; radar off; wind off; selected people; session toggles revert to saved defaults on reload |
| Radar | RainViewer default / NOAA MRMS / NOAA KSOX; opacity 55%; latest image or loop; loop history 60 minutes bounded by available frames; playback 800 ms/frame; timestamp/legend/coverage indication |
| Wind | DWD ICON global source label; static style off/arrows/barbs; particles off by default; marker density/size; bounded particle density, animation speed and trail length; opacity; km/h, mph, knots, m/s |
| People | Explicit tracker list; names/photos/icons/colours; labels; radius filter enabled, 50 km; filter anchor defaults to integration anchor or HA home; accuracy circles off; optional age filtering off |
| Aircraft | Map/list toggles; airborne only by default; altitude/distance filters; label modes; marker size/colour; list columns and sort (nearest); 10 visible list rows; selected-aircraft trails, 2 minutes; units and detail fields |
| Freshness | Aircraft maximum position age 60 seconds; last-update status; stale retention with distinct appearance; effective refresh and source status |

Radius controls display their units, validate positive finite values, and support km/mi/nmi. Altitude and speed controls preserve zero and unknown as different states. Aircraft collection radius is capped by provider capability; changing a display filter does not cause a new fetch. Zooming or panning does not move the people-filter anchor or aircraft collection area.

Editor changes update preview locally. Valid edits round-trip through save/reopen and YAML. Preserve unrecognized future fields when changing an unrelated setting. A custom Lit editor uses documented HA editor contracts, with any internal selectors isolated behind a compatibility wrapper. [HA editor contracts](https://developers.home-assistant.io/docs/frontend/custom-ui/custom-card/).

### Shared collection and request control

One domain service owns the active integration entry, provider clients, caches, viewer registry, and queues. It uses HA's shared HTTP client and schedules blocking disk work outside the event loop. Each viewer explicitly subscribes to the external layers it displays.

Source policies:

| Source | Initial schedule and ceiling |
| --- | --- |
| adsb.fi | Requested 10-second collection; at least 2 seconds between all requests to the provider |
| ADSB.lol | Requested 10 seconds; start no faster than 10 seconds across the installation because published limits are dynamic |
| RainViewer | Metadata every 5 minutes while demanded; combined metadata/tile requests capped at 50 in any rolling minute, paced without bursts |
| NOAA radar | Metadata every 2 minutes while demanded; conservative initial ceiling 30 requests/minute, at least 2 seconds apart, shared by MRMS/KSOX |
| DWD wind | Refresh advertised valid-time/run information hourly while demanded; conservative maximum 10 requests/minute across metadata/grid requests |

Only adsb.fi and RainViewer ceilings above are derived from published numeric limits. The other values are proposed conservative defaults where no applicable fixed limit was verified; accept stricter server instructions and revise policy when authoritative limits change. Relevant evidence: [adsb.fi](https://github.com/adsbfi/opendata), [ADSB.lol](https://github.com/adsblol/api), [RainViewer transition](https://www.rainviewer.com/api/transition-faq.html). Treat no-limit claims as unverified.

All requests, including manual refresh, retries, metadata, and test-connection actions, pass through the same provider queue. Coalesce identical in-flight work. No parallel requests to one provider initially. Retry 429 according to provider cooldown headers; transient failures back off from 30 seconds to 15 minutes with jitter. Authentication or invalid-request errors stop repetitive requests and show an actionable state. Empty successful data is a valid result.

On unload or removal, cancel tasks, release subscriptions, and close owned resources. Expired viewer leases stop collection. Continuous collection is an explicit integration option, off by default; this release does not add notification/history features.

### Cache contract

Store public weather/aircraft cache entries under an integration-owned cache directory in the HA configuration directory, not the Recorder database. Persist cache schema/version, provider/product identity, response validators, fetch/expiry times, content type, byte size, and payload hash. Use atomic writes and startup recovery; never delete outside that directory.

Cache keys:

- Aircraft: provider + normalized collection area; short-lived latest snapshot, no historical archive.
- Radar: provider + product + opaque frame identity + style + native zoom + x/y + tile size.
- Wind: DWD coverage + advertised model/run identity when available + valid time + snapped geographic bounds + sampling resolution.

Use LRU eviction within the global 512 MiB disk budget. Respect upstream cache directives; revalidate expired data using validators when supported. Never label stale cached data as newly observed. Radar data whose frame identity is immutable can be reused throughout replay subject to provider conditions. Retain frames for at most 24 hours locally and exclude frames outside the source's advertised usable timeline from new playback sessions.

Do not assume a wind valid time is immutable across later model runs. If run identity is unknown, revalidate on the hourly schedule. Keep a failed refresh's last successful field, with its original valid time and visible stale status.

The frontend holds only a bounded radar frame buffer (up to 3 frames and 32 MiB decoded image budget); evict/revoke image object URLs when unused. Load the latest frame first, then limited adjacent frames. Backend cache hits serve replay without provider calls. Do not preload the entire globe, all source histories, or unused layers.

### Backend/frontend contract

Freeze a versioned JSON schema and shared fixtures in the first serial slice. Both protocol ends belong to one worker whenever the protocol changes.

- All messages carry `schema_version: 1`; unknown versions produce an explicit compatibility error.
- Times are ISO 8601 UTC strings; missing values are `null`, not invented zeroes.
- Authenticated HA WebSocket commands: `aviadilo/info`, `aviadilo/subscribe`, `aviadilo/update_subscription`, and `aviadilo/heartbeat`. Use HA's normal subscription cancellation. Subscriptions name the integration entry, requested layer flags, radar source, and bounded viewport; source/viewport changes revise demand after a 300 ms debounce.
- Subscription updates and heartbeats may affect only subscriptions owned by that authenticated connection. Enforce per-connection subscription and queued-request bounds; disconnect cancels the connection's demand.
- `info` returns source capabilities, integration-area metadata, effective policies, and status without credentials.
- Snapshot events are discriminated as aircraft, radar-manifest, wind-grid, or status. A subscription ID and revision prevent late responses from replacing a newer view.
- Aircraft records use stable provider-qualified identity plus optional ICAO hex, position, position age, callsign, registration, aircraft type/category, ground state, altitude, speed, course, vertical rate, and squawk. Normalize SI units internally. Do not equate course with heading or unknown altitude with ground.
- Radar manifests provide provider/product, generation time, available frame IDs and times, native zoom limit, attribution, and coverage metadata. Only advertised frame IDs can be requested; do not construct source URLs from assumed timestamp patterns.
- Wind events provide coverage identity, valid time, nullable run time, grid dimensions, first-cell centre, signed spacing, CRS/row-order, and U/V arrays in true east/north m/s with null missing cells. Normalize to a regular lon/lat grid, north-to-south rows; cap at 4096 cells. Use source-side downsampling when needed and report the effective resolution.

Radar PNG delivery uses a registered authenticated HA HTTP route with validated provider/product/frame/tile parameters. Frontend requests it with HA's authenticated fetch API, creates an object URL, and supplies it to its Leaflet grid layer. Do not place HA tokens in URLs or expose an arbitrary URL proxy. Reject unadvertised frames, out-of-range tile coordinates, oversized responses, unsupported content types, and unexpected redirect hosts. Return transient errors as errors, not transparent “no rain” tiles. [HA frontend API types](https://github.com/home-assistant/frontend/blob/dev/src/types.ts).

People use the existing HA frontend state path; no external service receives tracker IDs or locations. Cache telemetry contains provider/product identifiers and aggregate counts, not household tracker history.

### Sources and normalization

Aircraft adapters use adsb.fi's v3 radius API and ADSB.lol's documented compatible radius API. Fetch an area once, then apply display filters in the card. One bounded access/shape check per enabled source is required before live acceptance; routine tests use fixtures.

Radar adapters retain the products exercised by the spike:

- RainViewer weather manifest + opaque radar tile paths, Universal Blue, native zoom 7.
- NOAA MRMS `conus_bref_qcd`, using exact advertised frame times.
- NOAA KSOX `ksox_sr_bref`, with site coverage and actual frame times. This is KSOX specifically; a general radar-station picker is not part of this release.

Map zoom may exceed source tile zoom; enlarge source tiles locally and preserve their resolution description. Radar legends remain faithful to each product. Frame time is not necessarily the observation time of every contributing pixel.

DWD wind uses `dwd__Icon_reg025_fd_sl_UV10M`, the ICON-global coverage verified by the spike. Parse actual WCS geometry/units, preserve no-data cells, and use source-advertised valid times. No production GRIB ingestion or NDFD/HRRR dependencies are needed for the selected wind source.

The spike's numerical geometry and interpolation checks are evidence and fixture-design input. Keep only relevant compact fixtures in production tests; do not turn tests into repeated public API calls.

### People filtering and viewport

Validate the selected entity's current latitude/longitude, including valid zero coordinates. Hide unavailable/unknown entities with stale coordinates unless an explicit stale-display setting is enabled. Do not infer a position from a zone-name string alone or infer GPS freshness from time since a zone state changed.

Compute geodesic distance from the configured people anchor, with longitude wrapping. With radius enabled, include exactly `distance <= radius`. Apply this before drawing, counting fit candidates, or fitting bounds. GPS accuracy circles, trails, weather extent, and excluded people never contribute fit bounds.

Home-area mode fits the configured view extent once and remains steady on data updates. Fit-visible mode considers only filtered point markers and explicitly included zones; empty results fall back to the home view, and single-point results respect maximum zoom. Manual pan/zoom suspends automatic fitting until recenter or an enabled idle timeout.

A tracker in Tokyo outside the radius cannot affect the California map. It reappears automatically when it returns within range. Filtering does not alter HA's access permissions or existing tracking configuration.

### Runtime rendering and freshness

Wind arrows point downwind; barbs use an explicitly documented meteorological convention. Particles and static icons sample the same cached U/V grid. Cap particles at 1500 and target at most 30 frames/second; reduce work when necessary and stop all animation while hidden. Visual density does not change API sampling.

Radar defaults to latest frame; playback loops cached advertised frames with individual time labels. Aircraft and people remain live while radar history is shown. Wind displays its own forecast-valid time.

Each layer has independent loading/current/stale/unavailable/outside-coverage state. Display source attribution and timestamps; keep the basemap and unaffected layers usable after a provider error. A missing radar tile must not be presented as a dry-weather measurement.

### Repository and packaging

Proposed layout:

- `src/`: card entry, configuration/editor, HA transport wrapper, map/viewport, and separate layer modules.
- `custom_components/aviadilo/`: integration/config flow, service, authenticated transport, providers, scheduling/cache, and translations.
- `contracts/`: JSON schema and cross-language fixtures.
- `tests/frontend/`, `tests/backend/`, `tests/e2e/`: separate native test suites.
- `dev/`: synthetic fixture harness and isolated HA test-instance configuration.
- `scripts/`: reproducible bundle/release packaging and validation.
- Existing research/spike documents remain intact.

Build `aviadilo.js` with bundled runtime assets, copy it into the integration release directory, and serve it through an integration-owned static resource path. Provide exact resource-registration instructions and validate resource URL/cache-busting behaviour in HA. Do not assume HACS publishes directly from GitLab. Initial distribution is an integration ZIP and local resource registration; later GitHub/HACS publication is separate authorization/work.

Makefile is a thin portable wrapper: default `help`; `setup`, `run` (fixture harness), `build`, `test`, `check`, `lint`, `format`, `clean`. A distinct `ha-dev` target starts the isolated HA test instance; no target points at the user's production instance by default.

## Implementation Plan

All slices are **[serial]** initially. This avoids worktree/toolchain overhead while contracts and the new integration are established. Changes can be scheduled in parallel later only with disjoint ownership and isolated worktrees. Each worker gets a template-based self-contained brief and an explicit model/effort. The orchestrator alone edits handoff, memory, task queue, and deferred records.

The owned paths below are proposed for approval with this draft. Directory entries grant ownership only within that new module/test subtree. Shared files repeat across serial slices deliberately; no parallel ownership is implied.

1. **Bootstrap and frozen schemas — (M), [serial].** Establish toolchains, build/test commands, fixture harness, and versioned data/configuration schemas.
   - Owned files: `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc.json`, `.node-version`, `pyproject.toml`, `uv.lock`, `.python-version`, `Makefile`, project-owned portion of `.gitignore`, `contracts/**`, `src/aviadilo-map.ts` (buildable stub), `src/data/types.ts`, `src/config/**`, `custom_components/aviadilo/models.py`, `custom_components/aviadilo/providers/base.py`, `dev/index.html`, `dev/fixtures.ts`, `tests/frontend/config/**`, `tests/backend/test_contracts.py`.
   - Verification: format/lint/type checks, schema validation across both languages, offline fixture build.
2. **Integration setup, scheduler and cache — (M), [serial].**
   - Owned files: `custom_components/aviadilo/__init__.py`, `manifest.json`, `const.py`, `config_flow.py`, `strings.json`, `translations/en.json` under that same integration directory; `custom_components/aviadilo/service.py`, `scheduler.py`, `cache.py`; `tests/backend/test_config_flow.py`, `test_service.py`, `test_scheduler.py`, `test_cache.py`, `conftest.py`.
   - Verification: config/options flows, aggregate pacing and retries with fake clocks, concurrent cache misses coalesced, disk budget/restart/corruption cleanup.
3. **Authenticated protocol, both ends — (M), [serial].**
   - Owned files: `custom_components/aviadilo/websocket.py`, `http.py`, `__init__.py`, `service.py`; `src/data/client.ts`, `src/data/ha.ts`; `tests/backend/test_websocket.py`, `test_http.py`; `tests/frontend/data/**`.
   - Verification: shared contract fixtures, authentication, bounded parameters, lease expiry, stale-revision rejection, cancellation, no tokens in URLs. Both serializers/parsers belong to this worker.
4. **Map, full editor shell, people and viewport — (M), [serial].**
   - Owned files: `src/aviadilo-map.ts`, `src/map/**`, `src/layers/types.ts`, `src/layers/people/**`, `src/editor/editor.ts`, `src/editor/map-panel.ts`, `src/editor/people-panel.ts`, `src/editor/ha-controls.ts`, `src/localize/**`, `tests/frontend/map/**`, `tests/frontend/people/**`, `tests/frontend/editor/**`.
   - Verification: radius boundary/Tokyo/return/unknown cases, zero coordinates, empty/single fit bounds, manual viewport preservation, editor round-trip, keyboard/touch fixture checks.
5. **Aircraft data and presentation — (M), [serial].**
   - Owned files: `custom_components/aviadilo/providers/base.py`, `providers/adsb_fi.py`, `providers/adsb_lol.py`, `service.py`; `src/layers/aircraft/**`, `src/editor/aircraft-panel.ts`; `tests/backend/providers/test_aircraft.py`, `tests/frontend/aircraft/**`.
   - Verification: provider fixtures, missing/ground/unit handling, filter/sort/trail limits, stale position age, requests shared across viewers. Bounded live checks are orchestrator-only.
6. **Three selected radar adapters and playback — (M), [serial].**
   - Owned files: `custom_components/aviadilo/providers/rainviewer.py`, `providers/noaa_mrms.py`, `providers/noaa_ksox.py`, `service.py`; `src/layers/radar/**`, `src/editor/radar-panel.ts`; `tests/backend/providers/test_radar.py`, `tests/frontend/radar/**`.
   - Verification: opaque paths, advertised timestamps, native zoom, provider-specific legends, default RainViewer, latest-first bounded buffering, no fake transparent error tiles, cached repeat playback and cancellation.
7. **DWD wind and local animation — (M), [serial].**
   - Owned files: `custom_components/aviadilo/providers/dwd_icon.py`, `service.py`; `src/layers/wind/**`, `src/editor/wind-panel.ts`; `tests/backend/providers/test_wind.py`, `tests/frontend/wind/**`.
   - Verification: actual WCS geometry/time/unit fixtures, null masks, cardinal wind direction, common icon/particle field, reduced motion, hidden-tab stop, density controls causing no upstream requests.
8. **Product integration, packaging and isolated HA acceptance — (M), [serial].**
   - Owned files: `src/aviadilo-map.ts`, `src/editor/editor.ts`, `custom_components/aviadilo/__init__.py`, `custom_components/aviadilo/static.py`; `scripts/build_release.py`, `scripts/check_release.py`, `dev/ha/**`, `tests/e2e/**`, `playwright.config.ts`, `.gitlab-ci.yml`, `Makefile`.
   - Verification: `make check`; release ZIP contents; clean install into HA 2026.9.1; card picker/config/options; all four layers; two clients sharing requests; reload/reconnect; browser sizing and a prolonged kiosk run. The orchestrator runs singleton HA/UI verification and updates user/development docs.

First-run completion, repository connection, and the user's approval of this draft precede implementation dispatch. Existing accepted decisions need no reconfirmation.

## Open Questions

- Review the proposed aircraft choices (adsb.fi default, ADSB.lol alternative), single shared integration area, manual combined bundle before HACS publication, cache budgets, and new display defaults. These are concrete proposals, not unresolved alternatives that workers should choose.
- No further broad compatibility input is required from the user: latest HA and Chromium tablet PC are sufficient to start against the pinned baseline. Record exact tested browser/version and kiosk sizing during acceptance.

The implementation spec remains draft until these proposed choices are accepted or revised. Repository authorization/trust/setup are tracked separately as first-run prerequisites.

## Deferred / Follow-ups

- Multiple independent aircraft collection areas/integration profiles.
- GitHub mirror and HACS publication/automatic resource registration beyond the initial validated manual bundle.
- Additional weather providers (NDFD, HRRR, ECCC, IEM, etc.); outside the selected source set.
- Aircraft route/photo enrichment, watchlists, prediction, notifications, and continuous history.
- People history and synchronized cross-layer historical replay.
- Alerts, lightning, wildfire, additional geographic layers, and a 3D globe.
- Additional browser/older-HA support after dedicated compatibility testing.

## Change Log

- 2026-09-06 — Drafted from the accepted combined-map direction, source-selection spike, and latest-HA/Chromium tablet compatibility input. Added proposed cache/transport/package choices and serial owned-file slices. No implementation approval inferred.
