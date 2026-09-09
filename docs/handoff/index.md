# Handoff Main Index

## Current

- **2026-09-08 — Layout follow-up ready for publication.** User reports prior kiosk release works very well, then requested optional layer buttons and page auto height. Implemented map.show_layer_buttons (true default) and map.auto_height (false default), saved fixed layers when controls hidden, independent Recenter/error overlay, retained fixed height and stable responsive page sizing. New spec: docs/spec/FEATURE_SPEC_map_layout.md.
- Parent full checks passed 282 frontend + 489 backend + 23 Chromium tests. Native HA 2026.9.1/Chromium 153.0.8010.12 passed clean Sections/masonry/panel, resize/scroll/manual view/identity, graphical save and editor/picker clipping. A 120-second all-layer run held height steady with 0 extra resize/move events and bounded resources. Evidence: /tmp/aviadilo-map-layout; details in docs/development.md.
- Candidate version 0.2.0-dev.2; artifact metadata is /tmp/aviadilo-map-layout/artifact.json and immutable local ZIP candidate-0.2.0-dev.2.zip. Actual local HACS install passed. Next push code/validate remote, tag/publish, run download-release.py and verify_hacs.py --published, then finalize docs. Preserve v0.2.0-dev.1 and normal v0.1.0 Latest; no published replacement.
- All owned native browser/HA and worker processes are stopped. Only main worktree. User docs/TODO.md remains unchanged dirty intake; include .bishop changes. Previous preview-remount policy question stays separate; positive user feedback is recorded without inventing a stronger continuity guarantee.

## Archives

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
