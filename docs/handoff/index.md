# Handoff Main Index

## Current

- **2026-09-09 — User confirms tile-streaming dev.1 works and requests up to one hour of reuse.** Original tile-streaming TODO is marked done (wording otherwise preserved). Extend only the idle decoded-basemap retention timer from10minutes to60minutes, within32MiB/128entries and existing HTTP freshness/auth/generation/photo limits. This is retention after leaving the map, not an expiry override.
- Narrow orchestrator-owned constant/test/version refinement; no worker dispatch needed for trivial glue. Existing regression now checks reuse after59minutes and disposal at the one-hour boundary, with earlier HTTP expiry still tested. Full release checks in progress; planned paired0.2.1-dev.2/Python0.2.1.dev2. Preserve prerelease feedback workflow; stable0.2.0 remainsLatest.
- Evidence/scripts `/tmp/aviadilo-cache-hour`; previous dev.1 evidence `/tmp/aviadilo-tile-streaming`. Only main worktree. User TODO was dirty intake before confirmation; only checkbox added. No .bishop changes observed; private root tmp/ remains ignored. Native HA is currently stopped; all native testing stays in `/tmp/aviadilo-slice8/ha`.

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
