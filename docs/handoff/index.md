# Handoff Main Index

## Current

- **2026-09-09 — Aircraft-kind icons and filters delivered as v0.2.0-dev.5**, commit **c686f72**, main pushed. User confirms the dev.4 reference marker works and looks good; new request is recognizable airplane/helicopter icons and aircraft-type checkboxes. `aircraft.types` has ten broad reported-category groups, defaults all, allows empty. No extra provider calls, model-code guesses or feed-contract changes. Unknown is explicit. Card schema remains v2, frozen v1 intact.
- Original bundled SVG icons preserve color/size/stale/course behavior and stable DOM. Missing course has a question badge. Filters apply to map/list/fit and permanently clear hidden selection/trail. Acceptance found and fixed existing Leaflet popup teardown order and keyboard-only popup selection: Enter/Space now update controller selection/reopen, and filtering removes the actual popup before listeners detach.
- Parent **360 frontend + 546 backend + 26 Chromium** checks pass. Native HA 2026.9.1/Chromium 153.0.8010.12 admin and explicitly non-owner regular/read-only accounts pass all/none/heli/unknown, selection/trail/popup, keyboard persistence/reopening, manual view, save/reopen, editor and raw picker checks. Type display edits preserve client/assets/map identity and data subscriptions. Light/dark/picker icons reviewed; zero JS/Aviadilo-command/external-browser-request errors. Exact runtime ZIP installed; the installed test upstream fixture alone was expanded to ten categories. See docs/development.md and `/tmp/aviadilo-aircraft-types`.
- Published **0.2.0-dev.5**: 28 files, 1,227,916 bytes, SHA256 **a0b960d7f9083deac4c0095a1853809b5c4cf2c99b05640e77f228535972b979**. Actual HACS 2.0.5 installation from published metadata/bytes and external settings/dashboard/cache retention pass. Remote native **34401542517**, hassfest/HACS **34401542468**, and publication **34402025325** passed. [Release v0.2.0-dev.5](https://github.com/bishopdynamics/aviadilo/releases/tag/v0.2.0-dev.5) is published from c686f72; actual downloaded bytes exactly match the native-tested candidate and tag validation passed. Normal v0.1.0 stays Latest.
- Previous reference-marker and kiosk-permission fixes are user-confirmed. ROOT_SPEC stays in progress for this aircraft follow-up's user assessment and the separately retained preview-remount policy question. Continue the user-endorsed prerelease-testing workflow.
- Native gpt-6-astra/high worker completed; Hanuman absent. All owned browser/HA/test processes stopped; only main worktree. Installed synthetic fixture currently has ten aircraft, restored to repository's three examples on next prepare. Private synthetic HA accounts/tokens remain outside git. **docs/TODO.md unchanged dirty user intake**, excluded from commits (blob c1bcc1bf91d680cb700819071583fa066d5914a5). No .bishop changes occurred; include any future changes. No household configuration changed.

## Archives

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
