# Handoff Main Index

## Current

- **2026-09-07 — Slice 8 implemented and locally verified after user continuation.** All four layers now compose into the card. ROOT_SPEC stays in progress for required authenticated HACS delivery and user acceptance; no additional feature slice is queued. `.bishop/` is committed, including app-generated changes, per the user's correction.
- Candidate **0.1.0-dev.2**, 23-file HACS ZIP, SHA256 `78b7e4d1773f78651ec041d71140413a5e29d438027873d1cf3279830ca17392`. Root CI: **123 frontend + 258 backend + 11 Chromium tests**, lint/types, mypy on 36 files, builds/package checks; final helper regression subset (45 tests) passed. Pinned hassfest: zero invalid integrations. Details in `docs/development.md`.
- Real HA 2026.9.1 / frontend 20260826.6: graphical setup (75 km) / options (256 MiB), native card picker/editor save/reopen, dev.1→dev.2 upgrade/versioned bootstrap, saved entry/options/dashboard and 17 warm cache files retained across package replacement/restart. Chromium 151 native sections/390 px layout and real WS reconnect passed. Initial helper schema/URL/params/Recorder issues corrected; shim is never distributed.
- **20-minute two-client HA soak passed** on Chromium 153.0.8010.12 with all layers and radar loop/wind animation. Zero JS/tile errors, stable card DOM (282 nodes), 3 MiB decoded radar buffer, 1.88 MB wind canvases/client. Final retained heaps 13.75/13.22 MiB; diagnostics two viewers/three products/no pending jobs, 59,569-byte shared disk cache. Synthetic provider responses and mocked/blocked OSM only; physical tablet/overnight endurance remain unclaimed.
- Actual HACS 2.0.5 install/upgrade extraction, canonical asset URL normalization, backup cleanup and version bookkeeping independently passed with mocked GitHub metadata and low-level HTTP responses. **Real authenticated HACS validation/download/install/update remains pending:** validator returned 401 without GitHub auth, repository description/topics still missing, no usable GitHub API connector/token/gh. SSH Git remote exists. Candidate release notes and user guide are ready. Nothing pushed, tagged, published or deployed to household HA this session.
- Choices: serial native Codex gpt-6-astra/high implementation because Hanuman absent; lighter installer verification gpt-5.6-sol/medium. Stable HA connection identity, passive local info discovery every 5 seconds, revision-aware weather handoff, visible-content demand, natural sections height, Playwright offline gates, marked/locked isolated HA launcher with normal exit 100 restart and graceful shutdown.
- Resource audit: all workers complete; only main worktree `/mnt/Fast/projects/aviadilo` on main; no stale worker worktrees or intentional survivors. Soak browsers and MCP browser destroyed; isolated HA launcher stopped. Unserved test config/private auth, scripts/logs/screenshots and isolated installer artifacts remain under `/tmp/aviadilo-slice8`; brief `/tmp/aviadilo-briefs/slice8.md`. Never commit test credentials. Temporary pinned toolchains/browser binaries remain reusable.

## Archives

- `archive_14.md` — slice 7 wind implementation, verification and handoff.
- `archive_13.md` — slice 6 radar implementation, independent verification and handoff.
- `archive_12.md` — slice 5 aircraft implementation, independent verification and handoff.
- `archive_11.md` — slice 4 map/editor/people implementation and standalone/HA verification.
- `archive_10.md` — previous session wrap after slices1–3 and authorization to resume slice 4.
- `archive_9.md` — slice 3 implementation, transport APIs and live protocol verification.
- `archive_8.md` — slice 2 implementation, registry startup fix and real HA verification.
- `archive_7.md` — slice 1 implementation and verification.
- `archive_6.md` — full spec approval and implementation kickoff instructions.
- `archive_5.md` — spec drafting and HACS/GitHub correction before approval.
- `archive_4.md` — expanded scope research, source comparisons, and static Claremont spike.
- `archive_3.md` — initial Aviadilo first-run research.
- `archive_2.md` — inherited template session history.
- `archive_1.md` — earlier inherited template history.
