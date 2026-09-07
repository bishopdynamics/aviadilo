# Handoff Main Index

## Current

- **2026-09-06 — Slice 1 implemented and verified.** Bootstrap includes pinned toolchains/locks, v1 configuration/protocol schemas and shared fixtures, offline Lit stub, HACS integration layout/brand, deterministic ZIP validation and pinned CI/release workflows. No release published or HA deployment performed. Implementation task remains in progress; pause at slice handoff before slice 2 (graphical integration setup/options, scheduler/cache, module registration).
- Independent verification: `make check` passed formatting/lint/types in both languages, 31 frontend tests, 32 backend tests, both builds and ZIP validation. Chromium 151.0.7922.34 rendered development/build fixtures and the module extracted from the ZIP, with zero external resources/JS errors on stable loads; 390-pixel layout had no overflow. Details and artifact hash: `docs/development.md`.
- First-run setup is complete and `docs/FIRST_RUN.md` removed. Repository and project rm-hook trust were already recorded; hook input checks passed. Node 24.20.0, Python 3.14.2 and uv 0.12.8 are the verified tools. Temporary toolchains/caches under `/tmp` remain available; see development guide for environment exports.
- Technical choices: native Codex `gpt-6-astra`/high worker in main checkout because Hanuman is absent; build-time validators avoid runtime eval; nested defaults are isolated; provider results omit viewer metadata; finite numbers and radius-unit preferences are enforced. Bootstrap `0.1.0-dev.1` uses an original placeholder brand icon and draft development releases. Brief retained at `/tmp/aviadilo-briefs/slice1.md`.
- External HACS prerequisite: public GitHub description/topics remain unset; issues are enabled. `gh` and GitHub HTTPS/API credentials are absent, so no remote metadata edits were made. Proposed metadata is in development guide. HACS/hassfest execution and live HA/HACS acceptance remain pending.
- Resource audit: only main worktree `/mnt/Fast/projects/aviadilo` on `main`; native worker finished; both preview servers and browser session stopped. No worker worktrees or stale metadata. The app regenerated `.bishop/tasks.json` from new Make/npm targets; preserved unstaged outside the slice commit.

## Archives

- `archive_6.md` — full spec approval and implementation kickoff instructions.
- `archive_5.md` — spec drafting and HACS/GitHub correction before approval.
- `archive_4.md` — expanded scope research, source comparisons, and static Claremont spike.
- `archive_3.md` — initial Aviadilo first-run research.
- `archive_2.md` — inherited template session history.
- `archive_1.md` — earlier inherited template history.
