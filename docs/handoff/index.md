# Handoff Main Index

## Current

- **2026-09-08 — Continuing remaining kiosk slices without routine pauses**, per user request. Slice 4 is implemented and independently verified; next slice 5 quiet presentation, then slice 6 packaged upgrade/acceptance. Commit each slice and continue; ROOT_SPEC completion is still the user’s assessment.
- Slice 4: canonical card-v2 migration, themes, exclusive wind modes/color and robust invalid drafts. Parent full checks: 264 frontend + 482 backend + 17 Chromium tests. Native HA 2026.9.1 / Chromium 153.0.8010.12 verified v1 storage untouched on load, expected migration, theme contrast and scoped filtering, preserved mounted identities/view, modes/reduced motion and native editor Save to v2. Evidence: /tmp/aviadilo-kiosk-remaining and docs/development.md.
- The separate native-preview-remount question is pending via an async question: accept HA recreation with possible temporary state resets versus expanded continuity scope. Shared real pipeline/cache and user-confirmed v0.1.0 behavior remain accepted; do not infer the stronger cross-remount guarantee.
- Public v0.1.0 remains Latest; v0.2.0-dev.1 is available for the planned development candidate (public metadata checked this session). Local slice-4 build still says 0.1.0 and must not be published over existing assets. Prepared release notes and slice-5/6 briefs are not yet implemented delivery.
- Only main worktree. Slice-4 worker completed. Isolated fixture HA is running under the parent at /tmp/aviadilo-slice8/ha for continued acceptance; stop gracefully before package replacement/end. No household instance is touched. Native helper/token files stay private under /tmp. docs/TODO.md remains the unchanged dirty user intake (blob c1bcc1bf91d680cb700819071583fa066d5914a5). Include .bishop updates in commits.

## Archives

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
