# Aviadilo: tooling, architecture, and settings research

Researched 2026-09-05 using primary documentation and upstream repositories. This is the historical aircraft-card decision aid, not an implementation specification.

Update 2026-09-06: the user approved the stack, companion integration, visual-editor coverage, and initial aircraft settings/defaults recommended here, then expanded the product to weather radar, wind, and household locations. See [the revised direction](../idea/revised-direction.md) and [current architecture research](everything-map.md). Later candidates below retain that status; provider choices still require validation.

## Recommended direction

Use **TypeScript + Lit**, **Vite library mode**, and **Leaflet** for an initial 2D map. Add a small **Python Home Assistant integration** if the user accepts the additional installation and maintenance scope: it would collect data once and share it with every card and device. Keep aircraft providers replaceable. Investigate adsb.fi and ADSB.lol as the first adapters, with a local receiver as another useful option.

The visual editor should cover every supported setting. Advanced options can be collapsed, but should not require writing YAML. This coverage rule is a proposed acceptance criterion that makes the mandatory visual editor meaningful.

## Language and toolchain alternatives

| Option | Assessment for Aviadilo |
| --- | --- |
| TypeScript + Lit | Recommended. Typed configuration and aircraft records help keep the renderer, editor, and provider adapters consistent. Lit offers reactive web components with scoped styling. This matches Home Assistant's component architecture. |
| JavaScript + Lit | Viable with less build configuration, but less help catching configuration and provider-format mistakes. Attractive for a tiny card; less attractive as settings grow. |
| Plain JavaScript custom element | Lowest framework dependency. More manual work for state updates, editor controls, and lifecycle cleanup. |
| React, Vue, or Svelte wrapped as a custom element | Possible alternatives, but add framework integration work without an obvious benefit for this particular card. No existing UI code needs to be reused. |

The preference for Lit is an engineering judgment based on [Home Assistant's web component architecture](https://developers.home-assistant.io/docs/frontend/architecture/) and [Lit's component model](https://lit.dev/docs/).

For builds, **Vite** provides a development page and a library build suitable for a distributable module. **Rollup** is a sound alternative when precise bundling control is the main priority. The community boilerplate uses Lit, TypeScript, and Rollup, making it a useful reference rather than something to copy wholesale. [Vite library mode](https://vite.dev/guide/build.html#library-mode), [Rollup introduction](https://rollupjs.org/introduction/), [custom-card boilerplate](https://github.com/custom-cards/boilerplate-card).

Proposed tooling: npm with a committed lockfile, explicit TypeScript checking, lint/format checks, Vitest for configuration and data logic, and ordinary Playwright browser tests for the editor and map. Vitest can share Vite configuration; Playwright can exercise the built card in browser pages. Pin compatible stable versions when scaffolding rather than treating this research as a version lock. [Vitest](https://vitest.dev/guide/), [Playwright](https://playwright.dev/docs/intro).

Build a self-contained `aviadilo.js` resource with bundled runtime dependencies and map assets; avoid depending on CDN imports at runtime. HACS supports dashboard JavaScript from the repository root, `dist`, or release assets according to its packaging rules. Public HACS distribution would also require resolving the GitLab/GitHub publishing arrangement during setup. [HACS dashboard packaging](https://www.hacs.xyz/docs/publish/plugin/).

## Map alternatives

| Option | Strengths | Tradeoff |
| --- | --- | --- |
| Leaflet | Markers, popups, circles, trails, GeoJSON, touch interaction; good fit for a local 2D aircraft map. | Less natural for a true globe, tilted vector maps, or very large animated datasets. |
| MapLibre GL JS | WebGL vector rendering, styled maps, and globe-related capabilities. | More graphics and tile/style configuration to validate on wall tablets and mobile webviews. |
| Custom SVG/canvas radar | No map-tile dependency; good for a compact radar with range rings. | Requires our own coordinate projection and interaction work; lacks geographic context without another layer. |

Recommendation: Leaflet for the geographic map; consider a map-free radar view later. The ADS-B Exchange inspiration does not yet establish a requirement for a literal 3D globe. [Leaflet features](https://leafletjs.com/), [MapLibre introduction](https://maplibre.org/maplibre-gl-js/docs/).

Map data is a separate dependency from aircraft data. OpenStreetMap's standard tile service requires visible attribution, caching, and appropriate request headers, prohibits bulk prefetching, and offers no availability guarantee. Keep tile configuration replaceable, preserve attribution, and let the aircraft list work if tiles fail. Auto dark/light card styling does not imply every tile provider supplies a free dark map. [OSMF tile policy](https://operations.osmfoundation.org/policies/tiles/).

## Where data collection should run

| Architecture | Advantages | Costs and limitations |
| --- | --- | --- |
| Card fetches providers directly | One frontend installation; requests can stop when the dashboard is closed. | Each device has its own poller. Sharing within one page or browser does not coordinate separate devices. Provider CORS support is required, and credentials would be available to the browser. |
| Card + Aviadilo integration | One household collection service, shared cache and request budget, backend credentials, access to local receiver URLs, scope for future automations. | Python as well as TypeScript; additional integration setup and compatibility testing. Viewer-driven polling requires explicit subscription lifecycle design. |
| Card consumes an existing integration | Reuses an existing collector and its setup. | Its data fields, interval, provider access, and entity representation constrain the card. No guarantee it meets the free-data requirement. |

Recommendation: **card + integration**, subject to user approval because this expands the project beyond a standalone card. Home Assistant provides `DataUpdateCoordinator` for fetching a dataset once and distributing updates. It is a building block, not an automatic global quota manager: multiple configured areas still need a shared provider limiter. [HA coordinated polling](https://developers.home-assistant.io/docs/integration_fetching_data/).

Browser restrictions are real even for a free public endpoint: the provider must permit cross-origin access for browser scripts to read its response. A backend removes this browser dependency, while still respecting provider access rules. [MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).

Proposed data flow: selected provider → shared scheduler/cache → normalized aircraft snapshots → authenticated HA subscription → card. Keep display filters local to the card so changing marker colours or altitude filters does not issue another upstream request. Prefer bounded snapshots over creating and deleting a HA entity for every passing aircraft. The exact transport and Recorder behaviour belong in the spec.

## Aircraft data candidates

Free access, open licensing, and unrestricted use are different properties. These are documentation findings, not live API acceptance tests or promises of future availability.

| Source | Verified documentation | Recommendation |
| --- | --- | --- |
| adsb.fi | Public endpoints; personal, non-commercial use; attribution/link required. Public limit is 1 request/second. Radius lookup uses `/api/v3/lat/{lat}/lon/{lon}/dist/{dist}`, up to 250 nautical miles. The older v2 geographic endpoint is deprecated. | Strong candidate for personal HA use and a clearly defined polling ceiling. Validate access and local coverage before picking a default. [Official open-data documentation](https://github.com/adsbfi/opendata). |
| ADSB.lol | Public documentation says the API is available to everyone under ODbL 1.0. Upstream describes load-dependent rate limits and a possible future feeder API-key requirement. | Strong open-data candidate, but do not describe it as unlimited or assume a fixed numeric limit. [Data documentation](https://www.adsb.lol/docs/open-data/api/), [API repository](https://github.com/adsblol/api). |
| Local readsb/tar1090 receiver | readsb documents `data/aircraft.json` and receiver metadata. | Useful for someone already running a receiver; avoids community API traffic. Receiver hardware is not free if they do not already have it. [readsb JSON documentation](https://github.com/wiedehopf/readsb/blob/dev/README-json.md). |
| Airplanes.live | Older API repository was archived on 2026-04-29. Current API documentation did not expose usable endpoint/access details through this research tool. | Keep as a candidate needing current access/terms verification. Do not adopt the archived 1-request/second claim as current policy. [Archived upstream](https://github.com/airplanes-live/api-archive), [current documentation page](https://airplanes.live/api-docs/). |
| OpenSky | API documentation describes daily credits and differing temporal resolution. Published terms require written agreement for operational REST API use, including live products/services. | Poor default for a ready-to-use free dashboard without resolving that eligibility. HA's existing integration also documents a 15-minute default interval. [API documentation](https://openskynetwork.github.io/opensky-api/rest.html), [published terms](https://opensky-network.org/about/terms-of-use), [HA integration](https://www.home-assistant.io/integrations/opensky/). |

Support one selected provider at a time initially, with adapters for alternatives. Automatic failover and combining sources are separate features: both need additional rules for request budgets, attribution, duplicates, differing fields, and provider cooldowns. An empty successful response is not a reason to fail over.

## Visual editor options and requirements

Home Assistant documents two routes: `getConfigForm()` for schema-driven forms, and `getConfigElement()` for a custom editor that emits `config-changed`. It also provides card-picker registration and default configuration hooks. [Graphical card configuration](https://developers.home-assistant.io/docs/frontend/custom-ui/custom-card/).

The built-in form is attractive for fixed settings. A **custom Lit editor** is the recommended direction if we include provider-dependent guidance, ordered field lists, and shared data-profile selection. Keep configuration definitions and validation reusable. Native HA selectors include location/map selection with an optional radius, numbers, booleans, colours, and entity selection. A HA `area` is an organizational area such as a room; use a geographical location or `zone` for the tracked sky region. [Selector documentation](https://www.home-assistant.io/docs/blueprint/selectors/).

Direct use of internal HA components needs a compatibility boundary. HA explicitly cautions that internal components can change; its 2026.4 update replaced several input components. Prefer documented editor contracts, keep any internal selectors/forms behind a small wrapper, and verify against the supported HA versions. [Frontend component changes](https://developers.home-assistant.io/blog/2026/03/25/frontend-component-updates-2026.4/).

Proposed acceptance criteria:

- Add and configure the card from the card picker without typing YAML.
- Every supported option, including advanced options, has a usable graphical control.
- Group related settings, show units and defaults, and show field-specific errors without discarding valid values.
- Preview changes immediately using cached/sample data; do not create a separate live provider poller for each editor preview.
- Save, reopen, and reload without losing settings. YAML round trips preserve values; unknown future fields are retained when editing an unrelated setting.
- Support keyboard navigation, labelled controls, mobile layouts, HA themes, and reduced motion. Provide a readable list alongside map interaction.

If we adopt the integration, provider credentials and shared polling options belong in its graphical config/options flow. The card editor selects the configured data profile and explains its coverage; it should not silently change settings shared by other cards.

## Settings worth exposing

The following is a proposed catalogue, not a commitment to implement everything in the first release. “Initial” denotes the recommended initial set; “Later” identifies candidates for discussion. Existing aircraft cards demonstrate demand for range controls, filtering, labels, colours, lists, and tracking effects. Aviadilo should use ordinary controls for its initial set rather than inheriting another card's template language. [Springvar's flight card](https://github.com/Springvar/home-assistant-flightradar24-card), [Ehrenholm's radar card](https://github.com/Ehrenholm/flightradar-radar-card).

| Group | Candidate settings | Suggested defaults and behaviour | Scope |
| --- | --- | --- | --- |
| Data source | Provider/data profile; local receiver URL where applicable; connection status | Shared profile if using the integration; one source active | Initial |
| Coverage | Home location, another HA zone, or custom map point; collection radius | Home; propose 50 km radius; show provider maximum in selected units | Initial |
| Card basics | Optional title; map, list, or combined layout; card height | Combined map/list; responsive size | Initial |
| View | Fit coverage or fixed initial zoom; pan/zoom controls; recenter button | Fit coverage initially; preserve manual view during updates | Initial |
| Geographic context | Home marker, range rings, scale, basemap choice | Rings/scale enabled; home marker optional; provider attribution always visible | Initial |
| Aircraft visibility | Ground aircraft; minimum/maximum altitude; maximum displayed distance | Hide confirmed ground aircraft; no altitude restriction; display within collected area | Initial |
| Labels | Callsign, registration/hex fallback; always, selected-only, or off | Selected-only on crowded maps; callsign when available | Initial |
| List | Visible columns; row count; sorting by distance, altitude, speed, or callsign | Nearest first; propose 10 visible rows; map limit is a separate setting | Initial |
| Details | Position, altitude, ground speed, course, vertical rate, squawk, last observation | Show available fields; unknown values remain unknown | Initial |
| Units | Distance km/mi/nmi; altitude m/ft; speed km/h/mph/knots | HA units where applicable, with an explicit aviation preset | Initial |
| Appearance | Follow HA theme; marker size; uniform or altitude-based marker colour | Follow HA theme; medium icons; avoid relying only on colour | Initial |
| Trails | Off, selected aircraft, or all; retained duration | Selected aircraft; propose 2 minutes of observed points only | Initial |
| Freshness | Show last update; maximum position age; retain stale data on outages | Propose 60-second position age; dim stale data and label it before removal | Initial |
| Refresh | Requested update interval; pause/resume; request status | Propose 10 seconds; scheduler can slow it; manual refresh uses the same limiter | Initial |
| Map interaction | Tap aircraft to select/details; selection linking with list | Built-in details; explicit external link when available | Initial |
| Advanced filters | Aircraft category/type; callsign/registration allow/block lists; military tag; squawk filter | Disabled initially; expose only fields with known provider semantics | Later |
| Watchlist | Favourite registrations/ICAO addresses, highlight colours, temporary follow mode | Local highlighting; no separate per-aircraft polling | Later |
| Extra information | Origin/destination, airline metadata, aircraft photos | Off until enrichment sources and their request/cache policies are verified | Later |
| Advanced map layers | Airport/runway overlays, custom tile URLs, map-free radar, globe view | Separate scope and data dependencies | Later |
| Alerts/history | Entry/exit events, scheduled tracking, notifications, replay | Integration-level features needing their own persistence and polling decisions | Later |

Location and requested polling interval are shared integration settings in the recommended architecture; display radius, colours, list filters, and layout are card settings. Map panning should not silently expand the collection area. If a user views outside it, show the coverage boundary and a recenter control.

Data semantics constrain the controls. readsb distinguishes course over ground from heading, permits barometric altitude to be the string `ground`, omits unavailable fields, and reports position age separately from message age. Preserve those distinctions in normalization and UI labels. Zero altitude is not a reliable replacement for the ground flag, and an unknown altitude should not become zero. [Aircraft field definitions](https://github.com/wiedehopf/readsb/blob/dev/README-json.md).

Routes and photos are not promised by the baseline position feed. Treat them as optional enrichment, cached separately and fetched only when useful. Any estimated movement between observations must be marked as estimated and stop when stale; smooth animation must not require faster API polling. Prediction is a later candidate, not part of the initial trail promise.

## Conservative polling proposal

These are proposed scheduler rules derived from the user's requirement, not provider-published defaults:

- Start with a requested interval of 10 seconds. Where the documented maximum is 1 request/second, the user's half-rate rule implies at least 2 seconds between requests across Aviadilo's use of that provider, including retries, manual refresh, and multiple areas. Longer-window quotas also need headroom.
- Display the effective interval and reason when it exceeds the requested interval. A missing or dynamic provider limit is not permission to poll rapidly; use a conservative policy and honour server cooldowns, with current-policy validation before release.
- Share cached results for identical areas. Schedule differing areas under the same provider budget. Aviadilo can coordinate its own installation, not unrelated apps sharing the household's public IP.
- Honour `Retry-After` and provider-specific cooldown headers; apply increasing delays on transient failures. Stop repetitive authentication/invalid-configuration requests and report the actionable issue.
- Debounce area edits. Filter and sort existing snapshots without new network calls. Avoid automatic per-aircraft metadata fan-out.
- Prefer polling while at least one viewer needs data. In an integration, explicitly track active subscriptions with disconnect cleanup and expiry; the coordinator alone does not know which browser cards are visible. Continuous collection for alerts/history would be a separate opt-in mode.
- Keep last-success time, provider observation time, and position age distinct. A failed request must not make cached aircraft look freshly observed.

At 10 seconds, one continuously active area generates 8,640 requests/day. Four independent device pollers would generate 34,560; a shared collector still generates 8,640. Closing all viewers can reduce this further. These are arithmetic examples, not assurances that a provider permits that daily volume.

## Proposed repository layout and verification

Frontend: `src/card`, `src/editor`, `src/config`, `src/data`, `src/map`, `src/localize`, `tests`, `dev`, and generated `dist/aviadilo.js`. If approved, backend: `custom_components/aviadilo` plus integration tests. A shared fixtures/schema directory should define the Python-to-TypeScript snapshot contract. This is a proposed layout, not scaffolding already created.

The Makefile should delegate setup, run, build, test, check, lint, format, and generated-artifact cleaning to the selected tooling. Integration packaging and HACS delivery need an explicit choice before finalizing the layout; do not assume a combined repository is automatically installable as both HACS categories.

Meaningful verification for implementation: provider fixture parsing with missing/stale fields and units; fake-clock request counting across cards/areas/retries; editor save/reopen/YAML round trips; preview causing no extra provider requests; browser resize/touch/keyboard behaviour; actual HA card picker, editor, and dashboard compatibility. Use synthetic or sanitized fixtures for routine development. No dependencies were installed and no live dashboard/API integration tests were run during this research.

## Decisions to discuss next

1. Accept TypeScript + Lit + Vite + Leaflet, and decide whether the initial map should be 2D or a literal globe.
2. Accept a companion Python integration, or prefer the simpler standalone installation with its polling and browser constraints.
3. Agree the initial settings set and whether 50 km / 10-second defaults fit the intended use.
4. Identify target HA versions/devices, select the first providers after access and coverage checks, and settle packaging.

After those discussions, finish first-run setup and turn the agreed design into `docs/spec/ROOT_SPEC.md`. Later candidates above have not been approved or formally deferred by a spec.
