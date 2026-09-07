# Aviadilo First-Run Research — 2026-09-05

Historical record before the user approved the initial recommendations and expanded the project. Current direction is in index.md and evergreen.md.

# Handoff Main Index

## Current

- 2026-09-05 — Began Aviadilo session-start and first-run setup. Read `CLAUDE.md` → `AGENTS.md`, `PROJECT.md`, `docs/FIRST_RUN.md`, continuity docs, task queue, and the user-authored initial idea. Elefant and dev-tools are available; hanuman tools are absent from this session. Elefant search found no relevant Aviadilo context.
- Recorded the existing idea's identity and requirements in `PROJECT.md`, new `README.md`, and `evergreen.md`. The user then authorized tooling/settings research and required a visual editor. Research is complete in `docs/research/initial-options.md`, with primary-source citations, alternatives, proposed defaults, and a settings catalogue.
- Recommendation, not approval: TypeScript + Lit + Vite + Leaflet, with a small Python HA integration to share collection across cards/devices. Mandatory visual editor is recorded in project rules. All-supported-settings graphical coverage is a proposed acceptance criterion. No dependencies or application scaffolding were added.
- Provider findings: adsb.fi public personal/non-commercial access has a documented 1 request/second ceiling and a v3 radius endpoint; ADSB.lol has open data with dynamic limits and possible future feeder-key access. Airplanes.live's old API repository is archived, so current access is unverified. OpenSky's published operational-use terms and quotas make it a poor unqualified default. See the research for links and limits of verification; no live API/HA tests were performed.
- Next: discuss the proposed stack, standalone card versus companion integration, 2D versus globe, and initial settings/defaults. Then continue first-run setup. Hook/trust verification, remote/push verification, scaffolding, and the first-run completion commit remain pending. `docs/FIRST_RUN.md` remains; `ROOT_SPEC.md` has not been drafted.
- `docs/idea/initial-idea.md` contained uncommitted user edits at session start; preserved as-is. Its existing trailing blank line causes an unscoped `git diff --check` warning.
- Worktree audit: only the main checkout at `/mnt/Fast/projects/aviadilo`, branch `main`; no workers or worker worktrees were created.

## Archives

- `archive_2.md` — inherited template session history, preserved at Aviadilo first-run setup.
- `archive_1.md` — earlier inherited template history.
