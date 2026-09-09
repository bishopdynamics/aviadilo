# Handoff Main Index

## Current

- **2026-09-08 — Session wrapped at the user's request.** The user confirmed the normal HACS update to **v0.1.0 worked**, map tile caching/loading is “great now,” and edit mode no longer contains placeholder data. These are user-confirmed results on their installation; do not reopen the release-selection workaround or treat the observed caching/preview behavior as untested.
- The remaining extra information is expected at this checkpoint. **Slice 4** adds card-v2 migration, map themes and mutually exclusive wind modes/color. **Slice 5** removes routine status/weather panels, retaining layer buttons, Recenter, optional aircraft list, selection popups and compact attribution, with error-only/read-only inspection. **Slice 6** handles the next packaged upgrade/acceptance. No new implementation was started during wrap-up; resume through the normal slice cadence.
- **Separate unresolved design detail:** HA itself recreates custom-card preview elements after each settings change. Current data/cache behavior is shared, but a replaced element gets a new weather client. The user's positive caching/edit-data report does not explicitly choose native remount semantics versus a general handoff. Keep the specific cross-remount guarantee unclaimed; see docs/research/ha-preview-lifecycle.md and the feature spec's Open Questions.
- Release **v0.1.0** is normal/GitHub Latest, from **84c9231**; public ZIP has 28 files, 1,103,109 bytes, SHA256 **6a897206bccac56754f7fc08d423787cd6069e51b07e3afb054903eccde59bca**. Code and verification notes were pushed through 033fe6e before this wrap. Main documentation commits must not appear as new HACS releases. Next kiosk candidate is 0.2.0-dev.1; never replace published releases/tags.
- Verification already complete: parent 201 frontend + 476 backend + 15 Chromium tests; actual HACS 2.0.5 default update/install using published metadata/ZIP, retained settings/cache; isolated HA 2026.9.1 / new 0.1.0 frontend URL; all release/native/hassfest/HACS workflows passed. Details in docs/development.md and archive 21; evidence /tmp/aviadilo-hacs-update-fix and /tmp/aviadilo-kiosk-slice3. One early local cold-tile anomaly remained unreproduced across 96 later new tiles; user now reports good map loading. No additional tests needed for this documentation-only wrap.
- Worker sessions are completed; only the main worktree remains. The final process audit was empty; this continuity commit closes the session. **docs/TODO.md is the user's unchanged dirty intake**, intentionally uncommitted. Include every .bishop change in commits; none were present at wrap start. Do not infer completed physical-tablet/all-layer acceptance beyond the user's explicit report.

## Archives

- `archive_21.md` — v0.1.0 release/update verification before user confirmation.

- `archive_20.md` — kiosk slice 3 implementation, native acceptance and pending preview-remount decision.

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
