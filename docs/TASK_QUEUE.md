# Task Queue

Agent-worked, ordered queue. Processing rules live in `AGENTS.md` and project-specific overrides in `PROJECT.md`.

## Queue

1. [in-progress] Implement `docs/spec/ROOT_SPEC.md` — approved 2026-09-06; slice 1 started 2026-09-06.
   - Slice 1 implemented and independently verified: Node 24.20.0/Python 3.14.2 setup, v1 schemas/fixtures, offline card stub, HACS layout and deterministic ZIP, pinned CI/release tooling. `make check`: 31 frontend + 32 backend tests passed; Chromium 151.0.7922.34 verified dev, built fixture and extracted packaged module with zero provider requests.
   - First-run setup is complete; `docs/FIRST_RUN.md` removed. Repository/hook trust, identity, stack, GitHub connection and initial upstream push are settled.
   - Pause at the slice handoff. Next: slice 2, Integration setup, scheduler and cache, including graphical setup/options and module registration. Accepted scope/decisions do not need renewed approval.
   - External HACS prerequisite remains: public GitHub description/topics must be set; this session had no GitHub API credentials. HACS/hassfest execution and live HA/HACS acceptance are not claimed. See `docs/development.md`.
   - Use the approved eight serial slices, template-based worker briefs, explicit model/effort, and post-integration verification/review. Commit each slice and update status; follow the normal slice handoff cadence.
   - HACS is required from the first release. Remote: `github`; upstream: `github/main`; repository: `bishopdynamics/aviadilo`.

## Completed

- 2026-09-06 — Initial Planning completed by user approval of the revised `ROOT_SPEC.md`. Combined-map research and the Claremont source-comparison spike are preserved. Selected radar: RainViewer (default), NOAA MRMS, NOAA KSOX; wind: DWD ICON global.
