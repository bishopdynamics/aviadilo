# Expanded Map Research and Claremont Spike — 2026-09-06

Historical research and capture record. The later user source selection supersedes candidate recommendations in this record.

# Handoff Main Index

## Current

- 2026-09-06 (Claremont spike) — User requested one frozen image per weather source at Claremont and reinforced aggressive caching. Built `docs/spikes/claremont-weather/comparison.html` (self-contained, ~6.5 MB), plus a local-asset `index.html`, raw cache/provenance, offline renderers, and README. Seven real images: RainViewer, NOAA MRMS, NOAA KSOX, ECCC, DWD wind, NDFD wind, HRRR wind. Radar ~18:40–18:42 UTC; all winds21:00 UTC. User review pending; no production implementation.
- Actual data findings: DWD capabilities/data confirm ICON global0.25° (not ICON-D2). NDFD WCS failed at the requested time; compact Pacific Southwest GRIB fallback has5,079.406 m spacing, not2.5 km. HRRR3 km grid vectors were rotated to true east/north; NDFD alternating scan rows normalized. Detailed geometry/time/unit evidence in `cache/wind-render-report.json`.
- Verification: parent reran both renderers and JS syntax check; all seven900×600 images loaded in browser, filter/lightbox/Escape worked, no mobile overflow or JS errors. Self-contained artifact worked via file:// with zero HTTP(S) subresource requests. Viewing/reopening never calls providers. Network capture was explicitly approved and bounded; `fetch_once.py` skips already-attempted requests. Temporary renderer dependencies are at `/tmp/aviadilo-spike-venv`.
- One native Codex worker (`spike_page`, gpt-6-astra/high) handled UI and then offline wind rendering serially in main; hanuman absent. Completed, no worker worktree. Local preview server intentionally available on127.0.0.1:8765 (exec session28344), serving only the spike directory. Offline artifact is the durable deliverable.
- 2026-09-06 — User approved the earlier TypeScript/Lit/Vite/Leaflet stack, Python companion integration, complete visual editor, and initial aircraft settings/defaults, then expanded Aviadilo into one larger kiosk map with optional aircraft, weather radar, wind, and household locations. All their locations are `device_tracker` entities; their current radar card is HACS `weather-radar-card`, whose wind markers/animations they want to preserve.
- Updated `PROJECT.md`, `README.md`, evergreen, and the queue. Added `docs/idea/revised-direction.md` for accepted product requirements and `docs/research/everything-map.md` for source research, proposed architecture/settings, diagram, implementation stages, and acceptance examples. The original aircraft idea is preserved; the original research now links to the revised direction.
- Key design proposals: one central viewport policy; fixed home-area kiosk view; people radius applied before rendering/fitting; separate aircraft/radar/wind schedules; shared aircraft snapshots, radar manifest/tile cache, and wind-vector cache; wind animation runs locally; existing HA entity updates supply people. New defaults and transport/cache/package details still need specification.
- Radar research: RainViewer transition notice says past-only, native zoom 7, Universal Blue, 100 requests/IP/minute. Its general FAQ conflicts, so use the stricter dated notice. One public manifest read returned 13 past frames and empty nowcast/infrared arrays; paths are opaque. No actual radar tile playback/coverage test was run. NOAA and DWD are regional candidates.
- Wind research: upstream weather-radar-card uses bulk WCS grids for markers/Canvas2D particles. Exact wind provider/coverage needs validation; upstream calls a global product ICON-D2 while DWD documents ICON-D2 as regional. Earlier web-tool access failed; the later spike above retrieved and validated the real DWD data.
- User clarified region and sources: California/North America; retain RainViewer and NOAA/NWS radar, plus current DWD wind labelled “DWD ICON-D2 (global, ~28 km)”. Added `docs/research/weather-source-quality.md`: NOAA NDFD is the first proposed finer-grid wind comparison; HRRR, NOAA single-site radar, ECCC GeoMet, and IEM are additional candidates. Paid Windy/meteoblue offerings do not fit current requirements. No visual benchmark was run or extra provider approved.
- Next: settle exact product/transport/cache/packaging and compatibility choices, complete first-run setup, then draft `ROOT_SPEC.md` for the expanded product. HA version, installed weather-card version, and kiosk/browser details remain unknown. Do not ask again for the accepted stack, integration, device_tracker support, combined map direction, region, or retained source families.
- No production application scaffolding. The spike installed temporary data-reading dependencies and received runtime/browser checks as noted above. Documentation checks passed. `docs/FIRST_RUN.md` remains. Current changes are uncommitted; the user-authored initial idea had existing edits and a trailing blank-line diff warning, preserved as-is.
- Worktree audit: only `/mnt/Fast/projects/aviadilo`, branch `main`; no workers/worktrees created. Hanuman tools are absent; Elefant, dev-tools, and browser tools are available.

## Archives

- `archive_3.md` — Aviadilo first-run identity and initial research before scope expansion.
- `archive_2.md` — inherited template session history.
- `archive_1.md` — earlier inherited template history.
