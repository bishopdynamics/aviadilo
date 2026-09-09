# Handoff Main Index

## Current

- **2026-09-08 — Standard HACS update delivery fixed and published.** Code commit 84c9231, annotated tag **v0.1.0**. GitHub Latest now points to a normal non-draft/non-prerelease release with aviadilo.zip. Prior prerelease-only state caused HACS to advertise a main SHA with no release ZIP. Future normal tags become Latest; prerelease tags do not. Draft upload precedes publication; already published releases cannot be replaced by rerunning the workflow. Existing dev.2 is unchanged.
- **User retry:** HACS → Aviadilo → three dots → Update information; then install v0.1.0, restart HA and reload the browser. No re-adding the repository or manually choosing dev.2 is needed. Their household installation/update is not yet confirmed; no household instance was touched.
- Public ZIP HTTP 200, **1,103,109 bytes**, 28 files, SHA256 **6a897206bccac56754f7fc08d423787cd6069e51b07e3afb054903eccde59bca**, exactly matching the tested build. GitHub release 34298890289, native 34298889078 and HA/HACS validation 34298889035 succeeded. Release URL: https://github.com/bishopdynamics/aviadilo/releases/tag/v0.1.0.
- Parent full make check passed **201 frontend + 476 backend + 15 Chromium**, lint/types/mypy on 46 files/build/package. Actual HACS 2.0.5 release filtering and Update entity async_install(None) reproduced the broken default, then installed 0.1.0 from dev.2 with settings/cache retained. After install, later main commits and a future prerelease did not cause a default-channel update; beta opt-in still works. Repeated successfully using actual published metadata/downloaded ZIP. Isolated HA 2026.9.1 / frontend 20260826.6 / Chromium 153.0.8010.12 upgrade loaded the 0.1.0 bootstrap/module and retained configured trackers using verified synthetic upstreams.
- Evidence **/tmp/aviadilo-hacs-update-fix/**: root-check.log, hacs-published-result.json, latest-release.json, workflow-final.json, published-0.1.0.zip, native-upgrade.json/screenshot and worker logs. Brief /tmp/aviadilo-briefs/hacs-update-fix.md. Serial native worker gpt-5.6-sol/medium handled mechanical release/version tooling because Hanuman was absent. All owned tests/HA/browser processes stopped; only main worktree.
- The user explicitly prioritized this delivery fix over waiting for kiosk slice 6. **Kiosk native-preview-remount decision is still pending** and was not implicitly resolved; see docs/research/ha-preview-lifecycle.md and archive 20. Next kiosk development version is 0.2.0-dev.1, sorting after 0.1.0. Do not silently claim cross-remount client continuity. Remaining theme/wind/card-v2/quiet presentation follows the approved feature spec.
- User docs/TODO.md remains untouched, modified and uncommitted. Include all .bishop changes in commits (none arose). This documentation follow-up may put main ahead of the release tag; that must not be treated as a new HACS release/update.

## Archives

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
