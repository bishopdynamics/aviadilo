# Handoff Main Index

## Current

- **2026-09-09 — User-confirmed tile-streaming fix extended to one hour**, delivered as [v0.2.1-dev.2](https://github.com/bishopdynamics/aviadilo/releases/tag/v0.2.1-dev.2) from **a9a15f750ef2c5a934a0ea5b688221952c9cbc6f**. Dev.1 is accepted; the hour refinement awaits assessment. Original tile-streaming TODO marked done, wording preserved. Normal **0.2.0 remains Latest/HACS default**; explicitly select dev.2, restart HA and reload dashboards.
- Runtime change is only the idle decoded-basemap timer: ten minutes → one hour after the last map releases it. Every packaged runtime byte matches public dev.1 after version substitution except the timer expression. Provider freshness, 32 MiB / 128 entries, identity/generation checks, private-photo disposal and idle network behavior remain intact. This does not extend HTTP expiry or change weather freshness.
- Parent **427 frontend / 576 backend / 40 Chromium** checks passed. Updated fake-clock regression proves reuse after 59 minutes and disposal at the one-hour boundary; earlier provider-expiry and invalidation coverage remains. Native HA **2026.9.1 / Chromium153.0.8010.12**, regular user, actual dev.2 module: 12-tile return uses **zero HTTP/upstream requests**. Native package replacement retained 29 external files unchanged. Actual HACS2.0.5 dev.1→dev.2 upgrade with published metadata/bytes preserves settings/cache/dashboard.
- Published `2026-09-10T02:28:39Z`: **29 files, 1,257,688 bytes**, SHA256 **d302ae66001a7991f1b713b9c5dfa985ec77ba26e4c8005e64bd132a78f7dafc**. Public ZIP equals the tested candidate/GitHub digest. Remote Native **34428945681**, HA/HACS **34428945747**, Publication **34429351835** passed. Evidence `/tmp/aviadilo-cache-hour`; prior broader streaming acceptance in `/tmp/aviadilo-tile-streaming`.
- Trivial constant/test/metadata refinement handled by orchestrator, no workers. Hanuman absent; only main worktree. All owned HA/browser/test processes stopped. Isolated HA retains synthetic persons; no household HA or private diagnostic contents touched. Root tmp/ stays ignored. No .bishop changes observed. Final docs commit follows the immutable release tag. Aircraft-warning and general weather-client remount questions remain separate.

## Archives

- `archive_35.md` — tile-streaming dev.1 delivery before confirmation and one-hour refinement.

- `archive_34.md` — verified normal0.2.0 release before tile-streaming implementation.

- `archive_33.md` — final prerelease and task history before explicit sign-off and normal 0.2.0 release.

- `archive_32.md` — person support delivery before confirmation and final marker-layout refinement.

- `archive_31.md` — intermittent-warning investigation before supplied diagnostics and person support.

- `archive_30.md` — aircraft-kind release before the intermittent-warning investigation.

- `archive_29.md` — reference-marker delivery before user confirmation and aircraft-kind refinement.

- `archive_28.md` — kiosk permission release before user confirmation and reference-marker follow-up.

- `archive_27.md` — layout follow-up before the kiosk-user permission report.

- `archive_26.md` — prior kiosk release delivery before user-approved layout follow-up.

- `archive_25.md` — candidate checkpoint and acceptance before public-download verification.

- `archive_24.md` — slice-5 verification before packaged upgrade.

- `archive_23.md` — slice-4 checkpoint before quiet presentation.

- `archive_22.md` — prior v0.1.0 user-confirmed wrap and remaining kiosk plan.

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
