# Handoff Main Index

## Current

- 2026-09-06 (spec draft) — User confirmed latest Home Assistant and a tablet PC running Chromium with the HA dashboard. Official latest release verified as HA 2026.9.1; use it as a test baseline, not an inspected installed patch. Backend metadata requires Python >=3.14.2. Broad compatibility questions are answered.
- Created `docs/spec/ROOT_SPEC.md` as a draft for review, with eight serial slices and owned paths. Proposed choices include adsb.fi default/ADSB.lol alternative aircraft feeds, one shared integration area, 512 MiB disk/64 MiB backend memory cache, authenticated WebSocket/HTTP transport, and an initial combined integration/card ZIP with HACS publication deferred. These new choices are not yet approved. Deferred items mirrored with draft status; Initial Planning marked in progress.
- 2026-09-06 — User reviewed the Claremont comparison and selected **RainViewer (default), NOAA MRMS, and NOAA KSOX for radar; DWD ICON global only for wind**. Updated project rules, README, direction, research, evergreen, and queue. Other researched weather sources are outside implementation scope. Do not reopen this selection.
- Aviadilo remains in first-run planning for one kiosk map with aircraft, radar, wind, and household device trackers. TypeScript/Lit/Vite/Leaflet, Python companion integration, complete visual editor, aggressive shared caching, and people-radius filtering are accepted. Weather source selection does not approve the complete implementation spec.
- The seven-image frozen spike remains intact at `docs/spikes/claremont-weather/comparison.html`; its README, cache, and verification.json preserve real inputs and checks. It works offline without provider requests. Earlier spike details are in archive_4.md.
- Next: user review of the concrete draft, then first-run completion and implementation dispatch. No `origin` is configured; read-only GitLab search found no matching Aviadilo project. Repository creation/connection, hook trust verification, and scaffolding remain pending. `docs/FIRST_RUN.md` remains.
- Changes remain uncommitted. The original `docs/idea/initial-idea.md` contains pre-existing user edits and a trailing blank-line diff warning; preserved as-is. No production app scaffolding was added.
- Resources: only the main Git worktree at `/mnt/Fast/projects/aviadilo`, branch `main`; no worker worktree. The completed spike worker used native Codex Astra/high. A later process check found the prior preview server no longer running; the offline HTML remains the durable artifact. Temporary renderer dependencies remain at `/tmp/aviadilo-spike-venv`.

## Archives

- `archive_4.md` — expanded scope research, source comparisons, and static Claremont spike.
- `archive_3.md` — initial Aviadilo first-run research.
- `archive_2.md` — inherited template session history.
- `archive_1.md` — earlier inherited template history.
