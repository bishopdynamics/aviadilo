# Evergreen Handoff

Durable handoff info — the kind of stuff that should be read at the start of every session, regardless of what the last session did. Keep entries current; delete them when they stop being true.

## Evergreen Entries

- Project: Aviadilo (`aviadilo`), one larger Lovelace kiosk map combining optional aircraft, radar, wind, and household locations. Original idea: `docs/idea/initial-idea.md`; current user decisions: `docs/idea/revised-direction.md`.
- Approved 2026-09-06: TypeScript + Lit + Vite + Leaflet, companion Python HA integration, initial aircraft settings and 50 km / 10-second defaults. New layer defaults remain proposals.
- Compatibility: user runs latest HA on a Chromium tablet-PC kiosk. Official latest release verified as HA 2026.9.1 on 2026-09-06; use that test baseline and record the tested Chromium build. No more broad kiosk/browser clarification is needed.
- The user currently uses HACS `weather-radar-card` and values its wind markers/animations. Include optional static and animated wind in the design.
- Target region: California, North America. Weather choices selected after spike review (2026-09-06): RainViewer (default), NOAA MRMS, and NOAA KSOX for radar; DWD ICON global only for wind. The spike confirms the DWD global coverage identity; use it rather than the old card's ICON-D2 label.
- Household locations use `device_tracker` entities. Support them directly. A configurable people-radius filter must exclude far-away travellers from drawing and map fitting; no conversion to person entities is required.
- All supported configuration needs a visual editor, including advanced settings.
- Public data access must remain free for household use. Respect half of documented provider allowances across the installation, including tile/grid requests and retries; cache and share work. Aircraft provider selection and detailed cache/transport behaviour remain to be finalized.
- Source-quality research: `docs/research/weather-source-quality.md`. Earlier suggestions to add NDFD/HRRR wind or ECCC radar were superseded by the user's selection. Those sources and other candidates remain research only, outside implementation scope.
- Frozen seven-source comparison: `docs/spikes/claremont-weather/comparison.html` (self-contained/offline) and its README. Actual NDFD regional fallback was 5.079 km, HRRR 3 km, DWD ICON-global 0.25°. Wind images share 21:00 UTC valid time; radar ~18:40–18:42 UTC on 2026-09-06. All viewing uses embedded/local images with zero provider requests.
- Expanded architecture and source research: `docs/research/everything-map.md`. One map owns viewport policy; integration caches aircraft snapshots, radar metadata/tiles, and wind fields; frontend consumes existing HA locations and animates wind locally.
- Draft `docs/spec/ROOT_SPEC.md` now incorporates accepted decisions and proposes aircraft defaults, cache/transport/packaging, and eight serial implementation slices. It awaits user review; no production implementation approval is inferred.
- First-run setup remains incomplete. No `origin` is configured, and the GitLab connector found no matching Aviadilo project on 2026-09-06. Repository creation/connection, hook trust verification, and scaffolding remain pending.
