# Root Spec Drafting and HACS Correction — 2026-09-06

Historical record before full approval. Current approved status is in index.md, evergreen.md, and ROOT_SPEC.md.

# Handoff Main Index

## Current

- 2026-09-06 (HACS/GitHub correction) — User requires HACS from the beginning and created public `github.com/bishopdynamics/aviadilo`, added remote `github`, and pushed the existing work. Verified clean starting tree and local `main`/`github/main` both at `0a91da20ef8e8e8d181f4f7779d23ea84dc7e096` (`initial project bringup`). Repository setup is complete; no GitLab creation or remote rename is needed.
- Revised the draft to HACS Integration packaging with the compiled card included, automatic HA module registration, GitHub Actions/HACS/hassfest checks, release-asset version checks, and clean HACS install/upgrade acceptance. Packaging is in bootstrap rather than deferred. Optional default-catalogue submission is separate from first-release HACS custom-repository support.
- 2026-09-06 (spec draft) — User confirmed latest Home Assistant and a tablet PC running Chromium with the HA dashboard. Official latest release verified as HA 2026.9.1; use it as a test baseline, not an inspected installed patch. Backend metadata requires Python >=3.14.2. Broad compatibility questions are answered.
- Created `docs/spec/ROOT_SPEC.md` as a draft for review, with eight serial slices and owned paths. Remaining proposed choices include adsb.fi default/ADSB.lol alternative aircraft feeds, one shared integration area, 512 MiB disk/64 MiB backend memory cache, authenticated WebSocket/HTTP transport, and new display defaults. HACS-first delivery is now accepted as noted above. Deferred items mirrored with draft status; Initial Planning marked in progress.
- 2026-09-06 — User reviewed the Claremont comparison and selected **RainViewer (default), NOAA MRMS, and NOAA KSOX for radar; DWD ICON global only for wind**. Updated project rules, README, direction, research, evergreen, and queue. Other researched weather sources are outside implementation scope. Do not reopen this selection.
- Aviadilo remains in first-run planning for one kiosk map with aircraft, radar, wind, and household device trackers. TypeScript/Lit/Vite/Leaflet, Python companion integration, complete visual editor, aggressive shared caching, and people-radius filtering are accepted. Weather source selection does not approve the complete implementation spec.
- The seven-image frozen spike remains intact at `docs/spikes/claremont-weather/comparison.html`; its README, cache, and verification.json preserve real inputs and checks. It works offline without provider requests. Earlier spike details are in archive_4.md.
- Next: review remaining engineering proposals, finish hook trust verification/local scaffolding, and dispatch implementation slices. Repository creation/connection/initial push are already done. `docs/FIRST_RUN.md` remains for the outstanding setup.
- The user committed all earlier planning/spike work, including the original idea, in `0a91da2`. This session's HACS correction changes are local documentation edits; no production app scaffolding was added.
- Resources: only the main Git worktree at `/mnt/Fast/projects/aviadilo`, branch `main`; no worker worktree. The completed spike worker used native Codex Astra/high. A later process check found the prior preview server no longer running; the offline HTML remains the durable artifact. Temporary renderer dependencies remain at `/tmp/aviadilo-spike-venv`.

## Archives

- `archive_4.md` — expanded scope research, source comparisons, and static Claremont spike.
- `archive_3.md` — initial Aviadilo first-run research.
- `archive_2.md` — inherited template session history.
- `archive_1.md` — earlier inherited template history.
