# Task Queue

Agent-worked, ordered queue that drives session-by-session work. Processing rules live in `AGENTS.md` ("Task queue"). This file is project-owned.

## Queue

1. [in-progress] Initial Planning
   - Draft `docs/spec/ROOT_SPEC.md` ready for review (2026-09-06), targeting HA 2026.9.1 and the user's Chromium tablet PC. Eight serial slices cover contracts, integration/cache, authenticated transport, map/editor/people, aircraft, radar, wind, and packaging/HA verification. Engineering proposals await review; first-run setup remains pending.
   - First-run design revised 2026-09-06: user approved the initial stack/integration/settings and expanded scope to one map with aircraft, radar, wind, and household device trackers. Mandatory people-radius filtering and full visual editing. See `docs/idea/revised-direction.md` and `docs/research/everything-map.md`; original research is `docs/research/initial-options.md`. First-run setup and detailed specification remain pending.
   - Weather sources selected after spike review (2026-09-06): radar RainViewer (default), NOAA MRMS, NOAA KSOX; wind DWD ICON global only. Other researched sources are outside the selected implementation scope.
   - Claremont static spike reviewed for source selection: `docs/spikes/claremont-weather/comparison.html` (seven frozen source images retained as research). Results and source-resolution caveats are in the adjacent README. Initial Planning remains pending completion; this does not approve the full implementation specification.
   1. Read `docs/idea/initial-idea.md`.
   2. Discuss, help the user flesh out the idea, research, discuss again, then write `docs/spec/ROOT_SPEC.md` (start from `docs/spec/SPEC_TEMPLATE.md`).
2. ROOT_SPEC.md
   1. Implement the initial specification.
