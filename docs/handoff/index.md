# Handoff Main Index

## Current

- **2026-09-08 — Non-admin kiosk fix delivered as v0.2.0-dev.3**, commit **6c95c0e**, all pushed. User's Tablet kiosks had blank maps after cache/profile resets, with HA refusing aviadilo/assets_changed subscriptions. Reproduced on published dev.2 using an explicitly regular account: event denied, zero basemap HTTP requests. HA permits raw arbitrary-event subscriptions only to administrators; this was an Aviadilo integration bug, not MQTT.
- Paired repair: frontend uses dedicated authenticated **aviadilo/subscribe_assets**; backend forwards only valid current AssetInfo in the existing event_type/data envelope. Caps 4/connection, 16/user, 128 total; idempotent HA-standard unsubscribe/disconnect cleanup. Global HA event restrictions, HTTP authentication, generation/entry/photo/entity guards, cache and provider policies are unchanged. Keep kiosk roles unchanged; update prerelease, restart HA and reload kiosk pages.
- Parent gates passed **301 frontend + 512 backend + 23 Chromium tests**. Native HA 2026.9.1 / Chromium 153.0.8010.12 verified regular and read-only accounts stayed non-owner/non-admin, painted maps, received real admin cache-clear notifications, repainted with a new generation and recovered after actual socket disconnect. Deliberate raw-event probes stayed unauthorized; unauthenticated HTTP stayed 401. HA's own stale-unsubscribe warnings during forced reconnect were traced separately to non-Aviadilo subscriptions; no Aviadilo command failures. Evidence: /tmp/aviadilo-kiosk-permissions and docs/development.md.
- Public ZIP: **28 files, 1,216,014 bytes**, SHA256 **de66eca023ff6db604fb6c50658a0e4afa48c11a0552497de95dc06cbbef34cb**. Downloaded bytes exactly match the tested candidate; tag validation and actual published-metadata/ZIP HACS 2.0.5 installation passed. Remote native **34316844292**, hassfest/HACS **34316844253**, publication **34317078828** passed. Release: https://github.com/bishopdynamics/aviadilo/releases/tag/v0.2.0-dev.3. Normal v0.1.0 remains Latest; no old published release/tag was replaced.
- **Next is user kiosk confirmation.** ROOT_SPEC remains in progress. Existing positive feedback on the kiosk/layout work and prerelease workflow stays accepted; the earlier preview-remount policy question is separate.
- All owned browser/HA/test processes and worker stopped; process audit empty. Only main worktree. Explicit regular/read-only synthetic accounts and private auth files remain under /tmp/aviadilo-kiosk-permissions for future role coverage; never print/commit those credentials. The isolated synthetic dashboard was opened to these users without changing their roles. **docs/TODO.md remains unchanged dirty user intake**, intentionally uncommitted (blob c1bcc1bf91d680cb700819071583fa066d5914a5). Include .bishop changes; none occurred. No household configuration or MQTT changes were made.

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
