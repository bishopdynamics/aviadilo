# Handoff Main Index

## Current

- **2026-09-07 — Slice 6 implemented and independently verified after user continuation.** RainViewer/MRMS/KSOX shared radar adapters, bounded playback/canvas, legends/controls and per-caller tile cancellation are in place. Pause at the slice handoff; next approved slice is **7, DWD wind and local animation**. ROOT_SPEC stays in progress; wait for user continuation.
- Final root `make check`: **109 frontend + 229 backend tests**, format/lint/TS, strict mypy on 31 files, both builds and 22-file HACS ZIP passed. Log `/tmp/aviadilo-root-slice6-check.log`; artifact hash/API/source details in `docs/development.md` and `src/layers/radar/README.md`.
- Chromium 151.0.7922.34 standalone minified checks passed: 390px/1024px, saved controls, legends, latest-first native overzoom, marker clicks through overlay, cached repeat playback, slow preload without abort/restart churn, paused-frame refresh/history changes, partial-error retention/recovery, coverage skipping, hide/resume and disposal. Final disposal left zero URLs/requests/canvas/timers/listeners/attribution. Aircraft and radar frontend wiring remains **slice 8**, outside the current normal card bundle.
- Live access/shape checks: exactly one metadata read and one 256px global overview per source through Scheduler, no household area/retries. Six HTTP200, three valid PNGs; manifests had 13 RainViewer/60 MRMS/20 KSOX frames. New adapters normalize those captured files against frozen schema. Provider cache headers and probe versus production smoothing choices are recorded in development guide. No household-coverage or HACS acceptance claim.
- Implementation choices: serial native Codex gpt-6-astra/high, Hanuman unavailable; protocol-neutral client AbortSignal extension plus tests and instance-local offline transport fixture registration; RainViewer smoothing on/snow off; NOAA sampling caps z7/z9; 15-minute radar stale threshold; 24 MiB image buffer plus 8 MiB canvas; bundled exact palettes/legend with truthful coverage descriptions. Schemas unchanged.
- Resource audit: worker slice6_radar completed; only main worktree /mnt/Fast/projects/aviadilo on main, no worker worktrees/stale metadata. Local HTTP harness and browser sessions stopped. No full HA GUI instance or credentials created. Reproduction artifacts under /tmp/aviadilo-slice6 and brief /tmp/aviadilo-briefs/slice6.md remain unserved; restored pinned toolchains remain available.
- Preserve app-generated .bishop/tasks.json outside commits. Work remains local; no push/release/production deployment. GitHub description/topics, remote HACS/hassfest, full HACS/physical-kiosk acceptance and remaining slices are pending.

## Archives

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
