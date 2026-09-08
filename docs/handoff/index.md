# Handoff Main Index

## Current

- **2026-09-08 — Kiosk refinement slice 2 implemented and independently verified.** Shared persistent OSM caching, authenticated asset routes, bounded private external photos, Advanced pacing controls and coordinated clear/reload/cancellation are ready. Frozen assets/feed contracts and current card version remain unchanged. Next on user continuation is approved slice 3: connect the card/editor/picker to one real pipeline and the new assets, remove production preview branching, and implement browser queue/LRU/cancellation. Stop after each committed slice.
- Parent `make check` passed: 194 frontend + 462 backend + 11 offline Chromium tests; mypy 44 files, lint/types/build/package passed. HA 2026.9.1, Python 3.14.2, Node 24.20.0, Playwright 1.63.0 / bundled Chromium 153.0.8010.12. Additional real HA HTTP/WS acceptance passed: 16 cold tiles respected 1-second pacing; two users fetched the warm set in 10 ms during provider block/cooldown, then 8 ms from persistent disk after service reload, with zero additional upstream calls. Clear emitted the new generation and old URLs returned 409. These measure backend delivery, not map painting; native preview equivalence/endurance remains scheduled later.
- Evidence `/tmp/aviadilo-kiosk-slice2/`: worker report/fingerprints/logs, root-check.log, root-acceptance.log and standalone test_parent_acceptance.py. The first parent acceptance attempt had an incorrect assertion that permanent blocking survives reload; corrected to check the existing preserved cooldown/consumed slots policy. All final checks passed. Worker brief `/tmp/aviadilo-briefs/kiosk-slice2.md`; native Codex gpt-6-astra/high used serially because Hanuman was absent. Reviewed cache-age/stale/no-store and scheduler resource-failure/cancellation regressions are covered.
- Local intermediate ZIP remains 0.1.0-dev.2, 28 files, SHA256 11b266738080422de789304e1cd085e70673fd02261ee2e0fde25545d0f8d624. It is not the published dev.2 ZIP and must not replace that release. No tag, provider probe or household deployment. New release is slice 6. The HACS topic validation issue is already fixed.
- User docs/TODO.md remains modified/uncommitted and untouched. Include every .bishop change in commits (none arose this slice). Worktree/process audit: only main checkout; worker finished; no retained test/server/browser process or temporary worktree. Source/continuity commit and normal github/main push finish this handoff.

## Archives

- `archive_18.md` — kiosk slice 1 asset contracts, independent verification and handoff.
- `archive_17.md` — kiosk spec drafting, approved product direction and verified CI metadata fix.
- `archive_16.md` — first public HACS release, explicit prerelease selection and user-confirmed installation/card preview behavior.
- `archive_15.md` — slice 8 implementation, native HA/soak acceptance and pre-publication handoff.
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
