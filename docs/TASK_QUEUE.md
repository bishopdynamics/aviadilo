# Task Queue

Agent-worked, ordered queue. Processing rules live in `AGENTS.md` and project-specific overrides in `PROJECT.md`.

## Queue

1. [in-progress] Implement `docs/spec/ROOT_SPEC.md` — approved 2026-09-06; slice 1 started 2026-09-06.
   - Slice 1 implemented and independently verified: Node 24.20.0/Python 3.14.2 setup, v1 schemas/fixtures, offline card stub, HACS layout and deterministic ZIP, pinned CI/release tooling. `make check`: 31 frontend + 32 backend tests passed; Chromium 151.0.7922.34 verified dev, built fixture and extracted packaged module with zero provider requests.
   - First-run setup is complete; `docs/FIRST_RUN.md` removed. Repository/hook trust, identity, stack, GitHub connection and initial upstream push are settled.
   - Slice 2 implemented and independently verified 2026-09-07: integration setup/options, shared scheduler/cache, safe diagnostics and versioned module bootstrap. `make check`: 31 frontend + 97 backend tests passed. Real HA 2026.9.1/Chromium setup, options reload, cache clear, diagnostics and final-ZIP restart/module rendering passed.
   - Slice 3 implemented and independently verified 2026-09-07: authenticated WS/HTTP, captured publications and bounded tile gateway, frontend client lifecycle/reconnect. `make check`: 57 frontend + 169 backend tests passed. Real HA/Chromium client handshake, revisions, connection ownership, hide/dispose, reload and final-ZIP restart passed.
   - Session wrapped at the user's request on 2026-09-07. Resume next session with slice 4, Map, full editor shell, people and viewport. Accepted scope/decisions do not need renewed approval.
   - External HACS prerequisite remains: public GitHub description/topics must be set; this session had no GitHub API credentials. HACS/hassfest execution and live HA/HACS acceptance are not claimed. See `docs/development.md`.
   - Use the approved eight serial slices, template-based worker briefs, explicit model/effort, and post-integration verification/review. Commit each slice and update status; follow the normal slice handoff cadence.
   - HACS is required from the first release. Remote: `github`; upstream: `github/main`; repository: `bishopdynamics/aviadilo`.

## Completed

- 2026-09-06 — Initial Planning completed by user approval of the revised `ROOT_SPEC.md`. Combined-map research and the Claremont source-comparison spike are preserved. Selected radar: RainViewer (default), NOAA MRMS, NOAA KSOX; wind: DWD ICON global.
