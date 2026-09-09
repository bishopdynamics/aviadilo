# Handoff Main Index

## Current

- **2026-09-08 — Standard HACS update repair in progress, explicitly prioritized by user.** Baseline2c8437c. Public GitHub only had v0.1.0-dev.2 marked prerelease and releases/latest404. HACS2.0.5 (verified current release) defaults show_beta=false, so it advertises main SHA with no ZIP. Existing validation/native CI are green; topics are not the cause.
- Worker hacs_release_fix, native Codex gpt-5.6-sol/medium for mechanical release work (Hanuman absent), prepared coherent0.1.0 and tag-derived release channels. Normal releases become Latest, prereleases do not; draft-upload-publish avoids visible assetless releases and a guard refuses replacing published releases. No runtime feature changes beyond version fields. Worker gates201frontend/476backend/lint/mypy46/build pass; candidate28files SHA2566a897206bccac56754f7fc08d423787cd6069e51b07e3afb054903eccde59bca.
- Parent actual HACS2.0.5 get_releases/common_update_data and Update entity default install test passed using mocked GitHub boundaries: dev2 ->0.1.0 normal Update, correct ZIP URL/extraction, settings/cache retained, no false update after futuremain/futureprerelease. Parent full make check passed201frontend/476backend/15Chromium, and isolated HA package upgrade loaded the0.1.0 bootstrap/module with retained settings. Publication/tag and actual public ZIP/latest/HACS recheck remain. Evidence /tmp/aviadilo-hacs-update-fix; brief /tmp/aviadilo-briefs/hacs-update-fix.md. No household instance or provider access involved.
- User's HACS task authorizes fixing publication now rather than waiting for kiosk slice6. The kiosk native-preview-remount question is still pending and is not silently approved by this task. Future kiosk candidate should be0.2.0-dev.1, after normal0.1.0. See docs/research/ha-preview-lifecycle.md and archive20 for its earlier evidence.
- Preserve docs/TODO.md untouched/uncommitted; include every .bishop change (none so far). Main checkout only; serial worker finished. Code is being committed/tagged for normal v0.1.0 publication; verify actual release before marking distribution fixed.

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
