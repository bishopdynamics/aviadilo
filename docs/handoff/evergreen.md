# Evergreen Handoff

Durable handoff info — the kind of stuff that should be read at the start of every session, regardless of what the last session did. Keep entries current; delete them when they stop being true.

## Evergreen Entries

- Project: Aviadilo (`aviadilo`), one larger Lovelace kiosk map combining optional aircraft, radar, wind, and household locations. Original idea: `docs/idea/initial-idea.md`; current user decisions: `docs/idea/revised-direction.md`.
- Full `docs/spec/ROOT_SPEC.md` approved by the user on 2026-09-06. Implementation begins next session. All documented engineering defaults and deferrals are accepted; do not request repeated approval.
- HACS is required from the first release (user correction). Public GitHub repository: `bishopdynamics/aviadilo`; remote `github`, upstream `github/main`. User committed/pushed existing work as `0a91da2`. Keep this remote name; no GitLab repository or `origin` is needed.
- Compatibility: user runs latest HA on a Chromium tablet-PC kiosk. Official latest release verified as HA 2026.9.1 on 2026-09-06; use that test baseline and record the tested Chromium build. No more broad kiosk/browser clarification is needed.
- The user currently uses HACS `weather-radar-card` and values its wind markers/animations. Include optional static and animated wind in the design.
- Target region: California, North America. Weather choices selected after spike review (2026-09-06): RainViewer (default), NOAA MRMS, and NOAA KSOX for radar; DWD ICON global only for wind. The spike confirms the DWD global coverage identity; use it rather than the old card's ICON-D2 label.
- Household locations use `device_tracker` entities. Support them directly. A configurable people-radius filter must exclude far-away travellers from drawing and map fitting; no conversion to person entities is required.
- All supported configuration needs a visual editor, including advanced settings.
- Public data access must remain free for household use. Respect half of documented provider allowances across the installation, including tile/grid requests and retries; cache and share work. Approved aircraft sources: adsb.fi default, ADSB.lol alternative. Approved cache budgets: 512 MiB disk, 64 MiB backend memory.
- Source-quality research: `docs/research/weather-source-quality.md`. Earlier suggestions to add NDFD/HRRR wind or ECCC radar were superseded by the user's selection. Those sources and other candidates remain research only, outside implementation scope.
- Frozen seven-source comparison: `docs/spikes/claremont-weather/comparison.html` (self-contained/offline) and its README. Actual NDFD regional fallback was 5.079 km, HRRR 3 km, DWD ICON-global 0.25°. Wind images share 21:00 UTC valid time; radar ~18:40–18:42 UTC on 2026-09-06. All viewing uses embedded/local images with zero provider requests.
- Expanded architecture and source research: `docs/research/everything-map.md`. One map owns viewport policy; integration caches aircraft snapshots, radar metadata/tiles, and wind fields; frontend consumes existing HA locations and animates wind locally.
- Approved delivery: one HACS Integration package bundling the card, automatic module loading, GitHub Actions/HACS/hassfest checks, and HACS install/upgrade acceptance. HACS packaging starts in slice 1 bootstrap.
- First-run repository creation/connection/initial push are complete per user action and local upstream verification. Hook trust verification and local scaffolding remain pending; `docs/FIRST_RUN.md` stays until the remaining setup is complete.
