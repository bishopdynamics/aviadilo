# Handoff Main Index

## Current

- **2026-09-09 — Released [v0.2.0](https://github.com/bishopdynamics/aviadilo/releases/tag/v0.2.0) after explicit user sign-off**, tagged commit **0b3a4d54a7ace96117540087b9082b1905b8b79c**. Normal non-prerelease, GitHub Latest and HACS default. Published `2026-09-10T00:20:17Z`. This promotes dev.7 with version metadata changes only; all runtime entries match the signed-off public package after version substitution.
- Actual public ZIP: **28 files, 1,247,566 bytes**, SHA256 **1733ff57de721a86e5e5cea0b84fde2ab97baad63f7aac11bab80246e0367575**; exactly matches the tested stable candidate and GitHub asset digest. All remote workflows pass: Native **34420327325**, HA/HACS **34420327317**, Publication **34420586005**. Actual HACS 2.0.5 default Download and Update entity paths, using published metadata/bytes with offline transport, pass fresh install and upgrades from **0.1.0**/**dev.7**, each with beta visibility false/true. All settings/cache/dashboard sentinels retained. Use normal HACS Update, restart HA and reload dashboards.
- Local `make check`: **411 frontend + 570 backend + 38 Chromium**, lint/format/types passed. Stable native HA **2026.9.1 / Chromium 153.0.8010.12** smoke passes admin and explicit non-owner regular/read-only aircraft, person coordinates/zone fallback, photos, basemap and people-fit; zero JS/Aviadilo-command/external-browser errors. Native upgrade retained all 65 checked external files: 64 byte-identical after smoke, with one synthetic aircraft cache record refreshed during runtime. Settings/dashboard hashes unchanged. Prior full marker-layout/capacity/stability evidence remains `/tmp/aviadilo-marker-layout`; release evidence `/tmp/aviadilo-release-020`.
- Original implementation and all addenda through default individual spreading/optional grouping and people-only auto-fit are user-accepted. Both final TODO items were marked done in the release commit. The user has since pruned them and added a new tile-streaming/429/client-cache intake item; docs/TODO.md is again dirty user-owned content, preserved unmodified and unstaged. No approved implementation work remains for this release. Intermittent aircraft warning is parked awaiting active-incident evidence; no household cause/fix is claimed. Native HA preview replacement remains documented; no stronger cross-remount client continuity is claimed.
- No workers dispatched for metadata-only promotion. Hanuman absent; prior native agents completed. Only main worktree; all owned HA/browser/test processes stopped. Isolated HA retains synthetic YAML persons/test states, not household data. `tmp/` remains ignored for private diagnostics; never publish its contents. No .bishop changes occurred. Final continuity-only commit follows the immutable release tag.

## Archives

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
