# Handoff Main Index

## Current

- **2026-09-07 — Slice 2 implemented and verified after user go-ahead.** Real HA setup/options, explicit cache clear, safe diagnostics, shared scheduler/cache, viewer demand and versioned card bootstrap are implemented. Pause at slice handoff; next approved slice is 3 (authenticated protocol and frontend client, both ends in one worker). The ROOT_SPEC task stays in progress; no live providers, full card/editor or production deployment yet.
- Independent `make check`: 31 frontend + 97 backend tests passed, strict mypy on 20 files, formatting/lint, both builds and 15-file HACS ZIP validation. Backend tests use actual HA 2026.9.1 APIs and offline DNS; five dependency deprecation warnings remain. Sandbox socket wakeups hang these tests, so the offline suite ran successfully with standard escalation.
- Real isolated HA 2026.9.1 / frontend 20260826.6 / Chromium 151.0.7922.34: graphical setup and advanced controls, 75 nmi → 138,900 m option persistence/reload, confirmed cache-clear action, diagnostics API/menu, final ZIP install and restart all verified. Versioned bootstrap/card both returned HTTP 200 and the card registered/rendered after restart. No provider work active. Details/hash: `docs/development.md`.
- Critical compatibility finding: HA replaces the browser's custom-element registry during startup. Early direct card imports register in the old registry. `static.py` now serves a public constant bootstrap waiting for `home-assistant` before importing the card/Lit. Keep this order. HTTP routes remain per HA process; unload removes only owned extra-module membership.
- Medium choices: native Codex `gpt-6-astra`/high (Hanuman absent); narrow owned-file additions for pinned real-HA tests and approved diagnostics; background collection aircraft-only; 8 MiB cache entry cap / 32 MiB retained blobs within the 64 MiB budget; provider pacing history survives reload while explicit corrected setup may release permanent failure. All tests/types remain enabled.
- Resource audit: only main worktree `/mnt/Fast/projects/aviadilo` on `main`; worker `slice2_integration` completed. Test HA process/browser stopped. Temporary venv `/tmp/aviadilo-ha-runtime-venv` and config `/tmp/aviadilo-ha-slice2` retained for reproduction (isolated test identity only). Original `/tmp` toolchains/caches remain; environment exports in development guide. Brief `/tmp/aviadilo-briefs/slice2.md`; root check log `/tmp/aviadilo-root-slice2-check.log`.
- External limitations unchanged: Docker daemon inaccessible at host level, so hassfest container not run; GitHub description/topics and remote HACS validation remain pending without GitHub API credentials. Full HACS install/upgrade is slice 8. Isolated HA had optional camera/FFmpeg native-library warnings unrelated to Aviadilo.
- `.bishop/tasks.json` is an app-generated modification preserved unstaged outside the slice commit. No pushes or releases made.

## Archives

- `archive_7.md` — slice 1 implementation and verification.
- `archive_6.md` — full spec approval and implementation kickoff instructions.
- `archive_5.md` — spec drafting and HACS/GitHub correction before approval.
- `archive_4.md` — expanded scope research, source comparisons, and static Claremont spike.
- `archive_3.md` — initial Aviadilo first-run research.
- `archive_2.md` — inherited template session history.
- `archive_1.md` — earlier inherited template history.
