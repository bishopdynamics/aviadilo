# Project: Aviadilo

A Lovelace map card and companion Home Assistant integration combining aircraft, weather radar, wind, and household locations on one kiosk-friendly map.

This file is **project-owned**: template migrations never touch it. It holds everything about *this* project that agents must know beyond the shared rules in `AGENTS.md`. Where the two conflict, this file wins.

## Project-specific rules

- Follow-up direction approved 2026-09-08: production card viewing, dashboard editing, card editing and picker previews must use the same real-data clients, integration cache, upstream fetching and refresh rules. A preview flag must not select synthetic data or a cache-only path. Discuss any technical reason for an exception with the user before implementing it. Synthetic feeds remain confined to development/test harnesses.
- Kiosk refinement retains layer buttons, Recenter, the optional aircraft list and selection popups while removing routine status/weather settings panels. Shared basemap caching, map themes and mutually exclusive wind display modes/color are covered by `docs/spec/FEATURE_SPEC_kiosk_refinement.md` (approved by the user on 2026-09-08; implementation in progress).
- License: MIT, explicitly selected by the user on 2026-09-08. Keep the license notice in the repository and distributed release ZIP.
- Commit the `.bishop/` folder with the project, including app-generated updates. The user explicitly requires it to remain version-controlled (2026-09-07); do not leave those changes out of project commits merely because the app generated them.
- Approved stack (2026-09-06): TypeScript + Lit + Vite + Leaflet, with a companion Python Home Assistant integration for shared data collection and caching.
- Release delivery: normal SemVer tags publish non-prerelease GitHub releases with the compiled aviadilo.zip and become the HACS default; development/RC tags remain prereleases and do not displace Latest. Main commits are not downloadable releases. Upload the ZIP to a draft before publishing, and never replace a published tag/release. The user prioritized repairing standard HACS updates on 2026-09-08.
- HACS installation and updates are required from the first release. Public repository: `https://github.com/bishopdynamics/aviadilo`; use the existing `github` remote and `github/main` upstream. This replaces the template's GitLab/`origin` first-run assumption. CI/release workflows belong in GitHub Actions.
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
- The user approved `docs/spec/ROOT_SPEC.md` in full on 2026-09-06, including aircraft providers/defaults, one shared integration area, cache budgets, transport, HACS packaging, display defaults, and deferrals.
- Implementation began 2026-09-06 with approved slice 1 bootstrap work; do not reopen accepted decisions. First-run setup is complete. Follow the serial slice handoff cadence and use `docs/development.md` for toolchains and verification.
