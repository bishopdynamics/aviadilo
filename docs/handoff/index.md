# Handoff Main Index

## Current

- **Release process endorsed, 2026-09-08:** the user explicitly approves publishing prereleases for their hands-on testing and feedback before normal releases. Recorded in PROJECT.md and evergreen as the established workflow. This preference update does not assess a new build or request another release.

- **2026-09-08 — Requested layout follow-up delivered.** The user said the kiosk release works very well, then requested optional layer buttons and automatic page height. Implemented and pushed as **9d714aa**, published **v0.2.0-dev.2**. Normal **v0.1.0 remains Latest/HACS default**. In Map settings: Show layer buttons (default on), Auto-size height to page (default off); Recenter remains independent and fixed height is retained. User explicitly selects the prerelease in HACS, restarts HA and reloads browsers.
- Public ZIP: 28 files, 1,209,174 bytes, SHA256 **da711afda2646465aaaf87e4b4083db1394221fd7946843d9102b9caece38357**. Downloaded bytes exactly match the tested candidate; tagged package validation and actual HACS 2.0.5 installation with published metadata/bytes passed, retaining settings/cache/dashboard. Release: https://github.com/bishopdynamics/aviadilo/releases/tag/v0.2.0-dev.2. No old tag/release was replaced.
- Parent verification: **282 frontend + 489 backend + 23 Chromium tests**, native HA 2026.9.1 / Chromium 153.0.8010.12 Sections/masonry/panel sizing, scrolling, preserved center/client/assets, graphical save/reopen, retained fixed height and editor/picker attribution. A 120-second all-layer run after resizing held height 828px with 0 further resize/move events and bounded resources. Remote native **34311281979**, HACS/hassfest **34311282005**, publication **34311564569** all passed. Evidence: /tmp/aviadilo-map-layout and docs/development.md.
- Sizing uses unscrolled composed geometry and explicit CSS fixed-height/max-height limits, never the measured height of an auto-growing ancestor. Native preview footer clipping was found and fixed generically, without private HA selectors or data mode branches. Minimum map 160px and a 16px bottom gap apply; tall other content can require scrolling. No sizing timer runs. User optional clarification about remaining page versus assigned height did not arrive; implemented the stated remaining-page interpretation with fixed clipping limits.
- **Next is user assessment.** ROOT_SPEC remains in progress. Prior kiosk positive feedback is accepted; the separate old preview-remount policy question remains recorded, without claiming cross-remount state continuity. No new provider/cache or household deployment work was added.
- All owned HA/browser/test processes and native worker stopped; process audit empty. Only main worktree remains. **docs/TODO.md is unchanged dirty user intake**, intentionally uncommitted (blob c1bcc1bf91d680cb700819071583fa066d5914a5). Include .bishop updates; none occurred. Private test auth/config/evidence remain outside git under /tmp.

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
