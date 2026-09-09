# SPEC: Asset subscriptions for ordinary kiosk users

- **Status:** complete — published v0.2.0-dev.3; user confirmed on 2026-09-09 that it works great.

## Summary

HA rejects `subscribe_events` for custom events when the user is not an administrator. Aviadilo awaits `aviadilo/assets_changed` subscription before loading assets, leaving regular kiosk users with a blank basemap. Replace that transport with a dedicated, authenticated metadata-only Aviadilo command.

## Goals

- Normal and read-only HA users can render the same basemap/photos as permitted administrators.
- Cache-clear invalidation/reconnect continue working without polling or extra provider requests.
- Preserve HA's global event restrictions, HTTP authentication, photo/entity permissions and cache-generation guards.

## Non-Goals

- MQTT changes, kiosk administrator access, mutating HA's event allowlist, swallowing denied subscriptions, or bypassing cache invalidation.

## Key Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Subscription | `aviadilo/subscribe_assets`, schema_version1, standard HA result/event/unsubscribe lifecycle | Integration-owned authorization; no raw arbitrary event subscription by the frontend. |
| Scope | Only the current Aviadilo AssetInfo metadata in the existing event_type/data envelope | No entity states, arbitrary event names, coordinates or private payloads. |
| Admission | At most4 asset subscriptions/connection,16/user,128 total; cleanup idempotent | One shared asset coordinator normally uses one; avoid unbounded listeners. |
| Tests | Create owner first, then explicitly ordinary/read-only users and assert roles | HA automatically makes its first created user an owner; prior tests missed this boundary. |
| Delivery | New paired frontend/backend prerelease0.2.0-dev.3 | Existing published artifacts remain immutable. |

## Design

Add the command to assets.schema.json and both-end validation. It accepts only id, type and schema_version; no event name or entry selector. AssetsInfo retains existing entry validation. Register an HA bus listener internally and forward only valid metadata matching the currently loaded service; maintain the existing envelope consumed by AssetClient. Register standard connection.subscriptions cleanup and send acknowledgement before events. Do not mutate that subscriptions dictionary from a disconnect cleanup callback.

Switch the shared AssetClient and offline dev transport to the dedicated command for every production context/user. Preserve subscribe-before-info ordering, generation races, cancellation and reconnection. Keep raw HA subscribe_events permissions unchanged; an ordinary user must still be refused arbitrary events. No changes to provider/cache behavior or HTTP authorization.

## Implementation Plan

1. **Authenticated asset transport repair (M), [serial].** One worker owns both ends.
   - Owned: `custom_components/aviadilo/assets.py`; `contracts/assets.schema.json`, `contracts/fixtures/asset*.json`; `src/data/{assets,asset-types}.ts`, `src/config/{generate.mjs,validate.ts,validators.d.ts}` if needed; `dev/{runtime,fixtures}.ts`; `tests/backend/{test_assets,test_contracts}.py`, `tests/frontend/data/assets.test.ts`, `tests/e2e/{assets,card}.spec.ts`; `package.json`, `package-lock.json`, `pyproject.toml`, `uv.lock`, `custom_components/aviadilo/{const.py,manifest.json}`.
   - Worker: paired contracts, role-explicit real HA WS/HTTP tests, lifecycle/admission/error regressions, lint/unit/backend/build.
   - Parent: reproduce old denial with an ordinary user; independently run full checks; native Chromium with a non-admin/read-only test account and real HA transport, basemap loading plus admin-triggered clear/reconnect; release/download/HACS checks.

## Open Questions

None. The source and frontend dependency explain the reported log and blank map; no user permission changes are needed.

## Deferred / Follow-ups

No new deferred work.

## Change Log

- 2026-09-09 — User confirms the kiosk fix works great and requests only a new optional reference marker. Do not reopen the permission repair.

- 2026-09-08 — Published v0.2.0-dev.3 from 6c95c0e. Actual downloaded bytes match native-tested candidate; published-bytes HACS install and all remote workflows passed. Kiosk user permissions and HA's global restrictions remain unchanged; user confirmation follows.

- 2026-09-08 — Implemented and independently verified: 301 frontend + 512 backend + 23 browser tests, old-version non-admin reproduction, and fixed regular/read-only native HA loading/clear/reconnect. Candidate 0.2.0-dev.3 is ready for remote validation/publication.

- 2026-09-08 — Confirmed HA websocket_api.commands permission check and first-test-user owner behavior. User has already cleared kiosk caches/profiles; do not prescribe that as the fix.
