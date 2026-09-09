# Handoff Main Index

## Current

- **2026-09-09 — Final household-layout TODO refinement delivered as v0.2.0-dev.7**, commit **239fb4b**, main pushed. User confirms person support fixed the missing person and believes this is the last change before release. Explicit preference: **always spread individual people/device/You are here icons**, plus optional grouping checkbox. `people.group_overlapping` defaults false; true counted groups include reference explicitly and expand by click/tap/keyboard. True data coordinates/accuracy/fit stay unchanged; connectors show displacement. Reference priority and nearby placement keep ordinary layouts compact; overflow uses a scrollable member panel with controls first and retained focus.
- Other TODO implemented: `map.mode: fit-people`, label **Map view mode → Auto-fit people/devices**, fits only radius/freshness-filtered people/device true coordinates. Aircraft, reference and explicit zones do not enlarge it. Empty fallback/home-area/fit-visible and manual suspension/Recenter/idle behavior retained. Frozen v1 stays intact; narrow v2 mode validation extension. No dependencies, providers or entity/permission policies changed.
- Parent gates **411 frontend + 570 backend + 38 browser scenarios** pass. Native HA 2026.9.1 / Chromium 153.0.8010.12 admin plus non-owner regular/read-only, editor/picker, touch/keyboard, offscreen cleanup, true data/photo identity, people-fit/manual view and full100-people-plus-reference capacity pass. Acceptance repaired group hit targeting and overflow focus/control ordering. **120.31s** stability:78 nodes,0 map moves/resizes/photo refetches; peak sampled heap25,568,744 bytes, managed decoded max6,094,848 bytes. Zero JS/Aviadilo-command/external-browser errors. Test dashboard restored; all owned HA/browser/test processes stopped. Evidence `/tmp/aviadilo-marker-layout`, details docs/development.md.
- Published **0.2.0-dev.7**:28 files,1,247,590 bytes,SHA256 **65d202330c33dd387111e54754d2c6f90705f183d647915990641dbf33d6f49a**. Public ZIP exactly matches the tested candidate; actual HACS install with published metadata/bytes and external-file retention pass (43 on dev.6 upgrade, 57 after normal cache growth). Remote native **34417456042**, hassfest/HACS **34417455884** and publication **34417787320** passed. [v0.2.0-dev.7](https://github.com/bishopdynamics/aviadilo/releases/tag/v0.2.0-dev.7) published from 239fb4b; normal v0.1.0 remains Latest. Stable 0.2.0 follows final user assessment.
- Person support is explicitly user-confirmed. Earlier intermittent aircraft warning has no established household cause; supplied dev.5 diagnostics were healthy at capture. Keep that and the earlier preview-remount question separate; do not invent fixes or reopen confirmed functionality. Root tmp/ remains ignored; never publish user diagnostic contents.
- Native gpt-6-astra/high worker completed; Hanuman absent. Only main worktree. Isolated HA retains synthetic YAML persons and test-only added states; no household configuration touched. **docs/TODO.md remains dirty user-owned intake and is unmodified/uncommitted by the agent**; both requested items are implemented pending user assessment. Last observed blob826b8a73ebca2674724abca48f032b14319afd00, preserve current contents. No .bishop changes occurred; include future ones.

## Archives

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
