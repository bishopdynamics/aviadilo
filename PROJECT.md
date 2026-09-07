# Project: Aviadilo

A Lovelace map card and companion Home Assistant integration combining aircraft, weather radar, wind, and household locations on one kiosk-friendly map.

This file is **project-owned**: template migrations never touch it. It holds everything about *this* project that agents must know beyond the shared rules in `AGENTS.md`. Where the two conflict, this file wins.

## Project-specific rules

- Approved stack (2026-09-06): TypeScript + Lit + Vite + Leaflet, with a companion Python Home Assistant integration for shared data collection and caching.
- Compatibility target: the user runs latest Home Assistant and a tablet PC showing the HA dashboard in Chromium. Use HA 2026.9.1 as the current verified stable test baseline (2026-09-06); record the tested Chromium build during acceptance. Support touch and responsive resizing.
- A visual configuration editor is mandatory and must cover all supported settings, including advanced settings. Shared integration options also need graphical configuration.
- Keep public data sources free for the intended household use. Keep provider adapters replaceable and record access/attribution requirements.
- Be conservative with provider APIs: stay at or below half documented request allowances, including aggregate tile downloads, retries, manual refreshes, and multiple clients. A dynamic or unknown limit requires a conservative provider policy.
- Cache and reuse frames/data aggressively across clients and replay, with bounded storage and provider cache rules. The user explicitly reinforced avoiding repeated source requests (2026-09-06). The Claremont spike is intentionally frozen and makes no provider requests when viewed.
- Design around independent aircraft, radar, wind, and household-location layers on one map. The shared map controls the viewport; individual layers must not recenter it independently.
- The user currently uses HACS `weather-radar-card` and values its wind markers/animations. Include optional static and animated wind display in the revised design.
- Target geography is California, North America. Weather source selection approved after the Claremont spike (2026-09-06): radar supports RainViewer (default), NOAA MRMS, and NOAA KSOX; wind uses DWD ICON global only. Other researched weather sources are outside the selected implementation scope.
- All of the user's household locations use `device_tracker` entities. Support these directly; do not require conversion to `person` entities.
- A configurable people-radius filter is mandatory. Apply it before rendering and automatic fitting so distant travellers cannot force the map to zoom out.
- The earlier aircraft settings and 50 km / 10-second defaults were accepted. RainViewer is the approved radar default; other new weather/people/display defaults remain design proposals.
- Current direction is in `docs/idea/revised-direction.md`; draft implementation spec is `docs/spec/ROOT_SPEC.md`. The accepted feature/source decisions are incorporated; proposed engineering defaults await spec review. First-run setup remains incomplete.
