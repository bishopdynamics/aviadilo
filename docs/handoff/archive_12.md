# Handoff Main Index

## Current

- **2026-09-07 — Slice 5 implemented and independently verified after explicit user continuation.** adsb.fi/ADSB.lol shared aircraft collection and reusable map/list/editor components are in place. Pause at the slice handoff; next approved slice is **6, Three selected radar adapters and playback**. ROOT_SPEC stays in progress; wait for user continuation.
- Final root `make check`: **91 frontend + 195 backend tests**, formatting/lint/TS, strict mypy on 27 files, both builds and 19-file HACS ZIP passed. Log `/tmp/aviadilo-root-slice5-check.log`; artifact hash and API details in `docs/development.md`.
- Chromium 151.0.7922.34 standalone minified aircraft component checks passed: 390px/1024px sizing, keyboard selection, keyed popup/marker/focus/scroll preservation, stable manual viewport, stale expiry without fresh snapshots, filters/fit exclusion, zero/null, text escaping, marker churn, attribution and cleanup. Native helper controls preserve saved selections/CSS colours and convert units. Normal card/client composition remains **slice 8**; aircraft frontend modules are not imported into the current product card yet.
- Both provider access probes returned HTTP200 and valid empty results at fixed ocean 0,0, radius1 nmi, exactly one GET/provider through Scheduler. Both sent no-store; adapters respect it. An initial Claremont probe was rejected by auto-review as potentially household data and did not execute; the safer ocean check was accepted. No populated live-record or household-coverage claim.
- Implementation choices: serial native Codex gpt-6-astra/high because Hanuman is unavailable; narrow existing-test ownership extension for automatic producer startup; direct cache get/put to preserve cancellation; outward integer-nmi fetch plus exact metre clipping; nondirectional unknown-course markers, selected-only bounded trails, keyed UI and bounded scrolling popups. No schema changes. All settings remain graphical.
- Resource audit: native worker slice5_aircraft completed; only main worktree /mnt/Fast/projects/aviadilo on main, no worker worktrees/stale metadata. Both local fixture servers and browser session stopped. No full HA GUI instance or credentials created this slice. Prior /tmp state had disappeared; pinned toolchains were restored and .venv repaired. Current reproduction artifacts under /tmp/aviadilo-slice5 and brief /tmp/aviadilo-briefs/slice5.md remain unserved.
- Preserve app-generated .bishop/tasks.json outside our commits. Implementation commits remain local; no push/release/production deployment. GitHub description/topics, remote HACS/hassfest, full HACS/kiosk acceptance and remaining product slices stay pending.

## Archives

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
