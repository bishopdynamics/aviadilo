# Handoff Main Index

## Current

- **2026-09-09 — Person entity support delivered as v0.2.0-dev.6**, commit **cb3a4d4**, main pushed. User's stock map shows a person whose directly selected device tracker failed in Aviadilo. Prefer persons for household members while retaining explicit device trackers; PROJECT.md extends the old tracker-only rule. Canonical v2 `people.trackers` accepts both domains; no automatic replacement of existing selections or household person-link changes.
- Shared people resolver uses valid selected-entity coordinates, then person-only first accessible active `in_zones` zone. Zone provenance is explicit, accuracy null and update time labelled GPS age unknown. Radius/health/rendering agree; missing/passive zones cannot invent a location. Person photo asset support is paired across schema/frontend/backend with selected-person read permission, picture-key and existing cache/generation guards. Frozen v1 remains strict; v2 fully validates before omitting people from the extra legacy check.
- Parent **386 frontend + 564 backend + 29 browser scenarios** pass, plus lint/types/build/tag checks. Actual native HA 2026.9.1 / Chromium 153.0.8010.12 persons aggregate synthetic GPS and zone-connection sources; admin, regular and read-only roles pass coordinate/zone/photos, movement/radius/passive recovery, manual view, preserved row preferences/save/reopen and picker. Actual stock Show-all selection includes the same persons and excludes broken/duplicate source trackers. No second stock basemap fetched, zero JS/Aviadilo-command/external-browser errors. Test dashboard restored; all owned HA/browser processes stopped. Evidence `/tmp/aviadilo-person-support`, details docs/development.md.
- Published **0.2.0-dev.6**: 28 files, 1,229,232 bytes, SHA256 **cd7507a26d716ccf60073b25f85fb899101facf3cf047449d60efd98e81cb9b0**. Actual HACS install from published metadata/bytes and 42-file settings/dashboard/cache retention passed; public ZIP exactly matches the native-tested candidate. Remote native **34409801423**, hassfest/HACS **34409801340** and publication **34410149930** passed. [v0.2.0-dev.6](https://github.com/bishopdynamics/aviadilo/releases/tag/v0.2.0-dev.6) is published from cb3a4d4. Normal v0.1.0 stays Latest.
- User supplied diagnostics in root `tmp/`, now ignored via project-owned .gitignore rule; no contents tracked or published. Aggregate capture shows dev.5 loaded/adsb.fi current/zero failures or backoff/zero active viewers, so the earlier intermittent aircraft incident remains unproven. Icons are confirmed working. New person/zone support addresses the concrete People mismatch; do not suppress source warnings or invent an aircraft cause. Prior reference/kiosk fixes remain accepted; separate preview-remount policy question remains recorded.
- Native gpt-6-astra/high worker completed, Hanuman absent; only main worktree. The isolated test HA config currently has two actual YAML persons linked to synthetic trackers and corresponding customization; the next prepare rewrites that test configuration. Private test credentials and user diagnostics remain out of git. **docs/TODO.md remains dirty user intake, excluded from agent edits/commits**; preserve current contents (last observed blob826b8a73ebca2674724abca48f032b14319afd00). No .bishop changes occurred; include future ones.

## Archives

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
