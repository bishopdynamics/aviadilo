# Handoff Main Index

## Current

- **2026-09-08 — Kiosk permission fix ready for release.** User's Tablet account got a blank basemap and HA refused aviadilo/assets_changed subscription, despite cache/profile resets. Confirmed raw custom-event subscriptions are admin-only, and AssetClient awaited this before tile loading. MQTT is unrelated; keep user permissions unchanged.
- Implemented dedicated authenticated aviadilo/subscribe_assets with strict metadata-only forwarding, bounded subscriptions and standard cleanup. Paired schema/frontend/dev transport updated. HA allowlist and HTTP/photo/entity permissions remain intact. Candidate0.2.0-dev.3; next remote CI/tag/publication/download/HACS verification.
- Parent gates:301 frontend +512 backend +23 Chromium tests. Native HA2026.9.1/Chromium153.0.8010.12 reproduced old dev.2 denial/no tile requests using a regular account, then verified fixed basemap, actual admin clear/invalidation/repaint and reconnect for regular and read-only users. Both explicitly non-owner/non-admin. HA host stale-unsubscribe warnings under forced reconnect are separately traced; no Aviadilo command failures. Evidence and private test auth: /tmp/aviadilo-kiosk-permissions. Use these non-admin profiles for future asset acceptance.
- Candidate ZIP:28 files,1,216,014 bytes,SHA256 de66eca023ff6db604fb6c50658a0e4afa48c11a0552497de95dc06cbbef34cb. Local HACS installation passed. No release yet. All owned native processes/worker stopped; only main worktree. User docs/TODO.md remains unchanged dirty intake; include .bishop changes.

## Archives

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
