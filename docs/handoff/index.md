# Handoff Main Index

## Current

- **2026-09-07 — Slice 7 implemented and independently verified after user continuation.** DWD ICON-global collection/cache, static arrows/barbs, bounded particles and graphical controls are in place. Pause at the slice handoff; next approved slice is **8, Product integration and HACS/HA acceptance**. ROOT_SPEC remains in progress; wait for user continuation.
- Final root `make check`: **120 frontend + 245 backend tests**, format/lint/TS, strict mypy on 33 files, both builds and 23-file HACS ZIP passed. Log `/tmp/aviadilo-root-slice7-check.log`; artifact hash and API/engineering details in `docs/development.md` and `src/layers/wind/README.md`.
- Chromium 151.0.7922.34 standalone checks passed direction, 390px layout/saved controls, 1500-particle/30fps and 8MiB canvas limits, marker clicks, no-data versus calm, unchanged-update continuity, actual cyclic grid sampling and detach/reattach/disposal. Reduced motion/document visibility were explicitly synthetic events because CDP preference override did not persist; physical OS/kiosk acceptance is unclaimed. Aircraft/radar/wind card composition remains **slice 8** and is absent from current normal card bundle.
- Three bounded DWD requests: metadata, 48-cell ocean subset and 64-cell longitude band; all HTTP200 with no household area/retries. Actual geometry/units/advertised time normalized against frozen schema. REFERENCE_TIME metadata exists but returned grid lacks proven selected-run binding; run_time remains null. Headerless cache freshness is one hour, with hourly unknown-run revalidation.
- Choices: native serial Codex gpt-6-astra/high, Hanuman absent; 12 wind regions reserve four replay slots for aircraft/radar; shared metadata demand with region-specific grids; source-side scaling/padding and exact source-edge longitude bands; paired no-data masks, no-data stops animation; 5/10/50-knot FROM barbs versus downwind arrows; bounded two-canvas rendering. Only two legacy offline fixtures needed registration isolation. No dependency/schema change.
- Resource audit: worker slice7_wind completed, only main worktree /mnt/Fast/projects/aviadilo on main, no worker/stale worktrees. Browser session and local server stopped. No HA GUI/token created. Reproduction artifacts /tmp/aviadilo-slice7 and brief /tmp/aviadilo-briefs/slice7.md remain unserved; pinned toolchains restored earlier remain available.
- Preserve app-generated .bishop/tasks.json outside commits. All work remains local; no push/release/production deployment. GitHub description/topics and remote HACS/hassfest remain pending; slice 8 must address full card composition, isolated HA/HACS install/upgrade and physical-kiosk acceptance with honest limits.

## Archives

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
