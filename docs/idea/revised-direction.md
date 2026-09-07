# Aviadilo: shared household map

Recorded from the user's direction on 2026-09-06. This extends the original aircraft-card idea; keep `initial-idea.md` as the original user-authored record.

## Product purpose

Aviadilo is a Lovelace map card and companion Home Assistant integration that bring nearby aircraft, weather radar, wind, and household locations onto one larger kiosk map. The purpose is to replace separate maps competing for dashboard space while sharing data collection and conserving provider requests.

## Accepted foundation

The user approved the recommendations from the 2026-09-05 research:

- TypeScript + Lit frontend, Vite tooling, and Leaflet for the initial 2D map.
- A companion Python Home Assistant integration for shared collection and caching.
- Free data sources, conservative polling, and replaceable aircraft-provider adapters.
- A mandatory visual editor covering all supported configuration, including advanced settings.
- Compatibility input: latest Home Assistant, displayed in Chromium on a tablet PC kiosk. HA 2026.9.1 is the verified current stable baseline as of 2026-09-06; the user's installed patch/browser build was not inspected.
- The proposed initial aircraft settings and 50 km / 10-second defaults. These describe aircraft collection and do not prescribe a weather refresh interval or a people radius.

Approval of the earlier suggestions retains their initial-versus-later distinction. It does not make every previously listed later candidate part of the first release.

## Added requirements

- Weather radar is an optional overlay on the same map.
- Optimize weather visuals for California, with wider North American coverage. After reviewing the Claremont spike, the user selected RainViewer (default), NOAA MRMS, and NOAA KSOX for radar, and DWD ICON global only for wind (2026-09-06).
- Include optional wind visualization, with static markers and animation inspired by the user's current HACS `weather-radar-card`.
- Reuse the household's existing Home Assistant location tracking to display people. The user confirmed all their locations use `device_tracker` entities; no migration to `person` entities should be required.
- Provide a configurable radius filter for people. A person travelling far away, such as Tokyo, must not cause the home map to zoom out to include them.
- Design the project around multiple independent map layers so future kinds of geographic information can fit without restructuring the entire card.
- Keep a single map surface usable on a kiosk, with enough space to view the combined information.

## Design work now

The weather source set and radar default are settled. Use the selected products and captured endpoint evidence from the Claremont spike when drafting the initial specification. New layer behaviour, people-filter details, cache sizing, packaging, and compatibility targets still need to be made concrete. Other researched weather adapters are outside the selected implementation scope; the complete frozen comparison remains available as research.

See [the draft implementation spec](../spec/ROOT_SPEC.md) and [expanded research](../research/everything-map.md). Proposed engineering choices await spec review; the product requirements and accepted foundation above are user decisions.
