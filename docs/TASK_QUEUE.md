# Task Queue

Agent-worked, ordered queue. Processing rules live in `AGENTS.md` and project-specific overrides in `PROJECT.md`.

## Queue

1. [ready] Implement `docs/spec/ROOT_SPEC.md` — approved 2026-09-06; **start next session**, as explicitly requested by the user.
   - Begin with remaining first-run trust/setup checks and slice 1: Bootstrap, HACS packaging and frozen schemas. Scope and decisions are approved; explain the slice at kickoff without asking for renewed permission.
   - Keep `docs/FIRST_RUN.md` until its remaining local setup is actually complete. Identity, stack, public GitHub repository, `github` remote, and initial upstream push are already settled.
   - Use the approved eight serial slices, template-based worker briefs, explicit model/effort, and post-integration verification/review. Commit each slice and update status; follow the normal slice handoff cadence.
   - HACS is required from the first release. Remote: `github`; upstream: `github/main`; repository: `bishopdynamics/aviadilo`.

## Completed

- 2026-09-06 — Initial Planning completed by user approval of the revised `ROOT_SPEC.md`. Combined-map research and the Claremont source-comparison spike are preserved. Selected radar: RainViewer (default), NOAA MRMS, NOAA KSOX; wind: DWD ICON global.
