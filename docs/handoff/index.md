# Handoff Main Index

## Current

- **2026-09-08 — Kiosk refinement slice 3 implemented; platform decision pending.** One real HA pipeline now serves saved, dashboard-edit, card-editor and picker contexts; browser basemap/photo assets use shared bounded resources. Production synthetic helpers/direct OSM/browser pacing removed. Card/feed/integration remain v1 and the local package remains dev.2; no release/tag. Theme/wind v2, quiet presentation and packaged acceptance are later approved slices.
- **Ask/resolve next:** the user was asked asynchronously whether to accept HA's native preview remount behavior or specify a general cross-remount runtime handoff. No answer yet. HA frontend 20260826.6 recreates custom previews on every changed config; Title adds a per-element weather subscription. Shared asset client/decoded cache survives when another owner remains. Mounted setConfig updates preserve clients/view. See docs/research/ha-preview-lifecycle.md and the spec's Open Questions. Do not mark the stronger cross-remount guarantee satisfied or begin slice 4 before resolving this.
- Parent full make check passed **201 frontend + 463 backend + 15 Chromium scenarios**, lint/types/mypy44/build/package. After the final one-line Energy test-config addition, all 77 contract/helper tests passed again. Native HA 2026.9.1/frontend20260826.6 and Chromium153.0.8010.12 verified matching tracker IDs/timestamps, DEMO aircraft, selected weather, external/first-party/unsupported photos, saved/dashboard-edit/card-editor/Done/raw-picker views and real socket-drop recovery. Title remount is recorded separately. Native HA's Lovelace config unsubscribe cleanup rejection after the deliberate drop is separately attributed; no Aviadilo command failed.
- Native 16-tile warm return **23–40 ms**, second browser **37–82 ms**, post-HA-restart **35.4 ms**, with zero extra upstream calls and browser HTTP cache disabled. Real cache clear revoked held assets/advanced generation and repainted 16 cold tiles in15.09s; next cold zoom16.01s. Detach returned all asset counts/bytes to zero. One earlier cold run left two tiles incomplete; three additional fresh 32-tile pairs (including original levels after clear) passed. No cause/fix claimed; retain that cold case and request-failure logging for packaged acceptance.
- Development harness fixes: child/restart cwd must be the managed HA config, or HA namespace resolution can select checkout modules and bypass the installed fixture. The affected early native run reached public providers at the configured synthetic area; stopped/excluded, temporary public cache removed. All credited runs first verified installed module paths and fixture service/OSM sessions via authenticated aviadilo_fixture/stats. Preparation creates www before /local registration and includes Energy for stock HA picker APIs. Three stock HA demo thumbnail URLs are mocked; all other external browser requests are blocked/recorded.
- Evidence `/tmp/aviadilo-kiosk-slice3/`: report/fingerprints, root-final-check.log, root-final-contracts.log, native-equivalence-verified.log + JSON/screenshots, native-warm-{repeat,cold-z12,cold-z14,restart,clear-cold}.json, HA logs/source extracts and reproduction scripts. Native config `/tmp/aviadilo-slice8/ha`, private test auth outside git. Local 28-file ZIP SHA256 **1d32b9276c0ef305b8d9742489fee464f7aa24e65520632b41bbeaa9b998b3ea**; it does not replace published dev.2. Worker was serial native Codex gpt-6-astra/high (Hanuman absent); parent added only Energy YAML glue and docs after worker freeze.
- User docs/TODO.md remains untouched/modified/uncommitted; all .bishop changes belong in commits (none this slice). Worker is finished. Only main worktree; all owned native servers/browser/tests stopped and the final process audit was empty before the checkpoint commit/push. No household deployment. Prior slice 2 baseline was 7eb7340.

## Archives

- `archive_19.md` — kiosk slice 2 shared backend assets, independent verification and handoff.

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
