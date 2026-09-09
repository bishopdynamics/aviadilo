# SPEC: Person entities and stock-map location parity

- **Status:** implemented and locally verified — preparing v0.2.0-dev.6 publication; user assessment follows.

## Summary

Support Home Assistant `person` entities as the preferred selection for household members, alongside existing `device_tracker` selections. Match the stock map's person location behavior, including a reported active-zone fallback when coordinates are absent.

## Goals

- Graphically select persons or device trackers without changing existing saved selections.
- Use HA's chosen person state, location, name and picture; preserve direct tracker support.
- Render person zone locations honestly and apply the same location resolution to drawing, health, radius filtering and fitting.
- Preserve freshness, photo authorization, cache/pacing and identical production viewing/editor/picker behavior.

## Non-Goals

- Reimplement HA's tracker priority, infer people from names, automatically replace saved entities, configure household person links, introduce geolocation, or suppress the separate intermittent aircraft warning.

## Key Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Config | Keep `people.trackers` entry shape; permit `person.*` and `device_tracker.*` in canonical v2 | Compatible existing YAML/settings; v1 schema remains frozen and strict. |
| Editor | Person suggestions first, tracker suggestions also available; labels describe both | HA handles a person's underlying tracker choice; direct tracking remains useful. |
| Position | Prefer selected entity's valid coordinates. For person only, otherwise first accessible non-passive `zone.*` in its `in_zones` with valid coordinates | Matches the stock map's primary-source behavior while keeping finite/range checks and valid zeros. No state-name/home guessing or underlying tracker lookup. |
| Presentation | Label zone fallback as a zone location; no GPS accuracy circle for fallback | A zone representative point is not a GPS fix. Use selected person's name/picture, not zone identity. |
| Freshness | Existing explicit position time / entity-updated / unknown semantics for direct coordinates; zone fallback uses selected person update time marked GPS age unknown | Do not call zone-coordinate fallback or arbitrary person state updates a fresh GPS observation. |
| Health | Use the same resolver as the people model; missing warning covers selected person or tracker | A valid zone-resolved person must not produce a false no-location warning. |
| Photos | Expand the existing asset entity allowlist to person or tracker at both ends | Preserve selected-entity POLICY_READ, picture-key, user/entry/generation guards and private photo-cache rules. No underlying-source permission bypass. |
| Migration | v1 input remains validated against frozen v1; current v2 can use person IDs without being rejected by the legacy validator | Existing migrateConfig validates v1-shaped legacy fields even for v2; adjust that validation narrowly while retaining malformed legacy-field rejection and unknown-field preservation. |
| Delivery | 0.2.0-dev.6 / Python 0.2.0.dev6, no dependency changes | Established immutable prerelease workflow. |

## Design

Home Assistant's [person integration](https://www.home-assistant.io/integrations/person/) chooses among associated trackers. The verified HA 2026.9.1 source also supplies home coordinates for legacy home-presence trackers. The stock frontend's [location helper](https://github.com/home-assistant/frontend/blob/20260826.6/src/common/entity/get_entity_location.ts) uses coordinates first and otherwise a person's first active zone in `in_zones`. Its [Show all map](https://github.com/home-assistant/frontend/blob/20260826.6/src/panels/lovelace/cards/hui-map-card.ts) includes persons and removes their duplicate source trackers. Aviadilo's explicit selection should consume that person entity, not reconstruct this aggregation or silently rewrite selections.

Use a shared people-specific resolver returning position and coordinate/zone provenance. Leave map anchors/global entityPoint behavior unchanged. Preserve selected entity identity for labels, photos and permissions; state updates/zone movement resolve again. Missing, passive, malformed or inaccessible zones do not invent positions; unknown/unavailable person states still obey show_stale. Radius filtering occurs before rendering/fit for direct and zone positions, with no independent recenter. Use safe DOM text for labels/zone names and no data from an unreadable underlying source.

The People visual editor must allow changing an existing row from device_tracker to person while retaining custom name/icon/color/photo preferences. Give a concise explanation that person uses HA's associated trackers. Canonical v2 card schema, graphical suggestions, asset request schema/generator and Python request validation must agree. Preserve all existing valid v1 configs and invalid-draft gating. Photos remain authenticated HA routes or the existing guarded external-photo gateway.

The user also requested root `tmp/` ignored for their diagnostic download. Parent already added `/tmp/` below the managed .gitignore block; diagnostic contents must never be staged or copied to public docs/memories. Aggregate inspection found adsb.fi current with zero backoff/failures and zero active viewers at capture. This does not diagnose the earlier intermittent aircraft event and does not block the person fix.

## Implementation Plan

1. **Person support and packaged acceptance (M), [serial].** One worker owns both asset-contract ends.
   - Owned: `contracts/card-config.schema.json`, `contracts/card-defaults.json` if needed, `contracts/fixtures/{cases,asset-cases}.json`, `contracts/assets.schema.json`; `src/config/{types,migrate,defaults,validate}.ts`, `src/config/generate.mjs` if required; `src/data/{asset-types,assets,validators}.ts` if generated/required; `src/editor/{editor,people-panel,ha-controls}.ts`, `src/localize/en.ts`; `src/layers/people/{model,layer}.ts`, `src/aviadilo-map.ts`; `custom_components/aviadilo/assets.py`; `tests/frontend/{people,config,editor,data}/**`, `tests/backend/{test_assets,test_contracts,test_websocket}.py`, `tests/e2e/{card,assets}.spec.ts`; `dev/fixtures.ts`, `dev/ha/custom_components/aviadilo_fixture/__init__.py`; `package.json`, `package-lock.json`, `pyproject.toml`, `uv.lock`, `custom_components/aviadilo/{const.py,manifest.json}`.
   - Worker: meaningful compatibility/location/freshness/radius/health/photo-permission tests; lint/types/unit/backend/build/tag validation, no browser/HA instance.
   - Parent: full CI, native HA person versus broken tracker and stock-map comparison, zone fallback/missing/passive/movement, editor save/reopen/picker, regular/read-only authenticated photos, public ZIP/HACS verification.

## Open Questions

None blocking. The selected household person/entity values remain the user's configuration, not something to infer from aggregate diagnostics.

## Deferred / Follow-ups

No new deferred feature. The separately open aircraft-warning investigation retains its existing need for incident evidence.

## Change Log

- 2026-09-09 — Parent386 frontend/564 backend/29 browser gates and actual HA person/stock-map/three-role/photo/editor/picker acceptance passed. Actual local HACS upgrade passed.

- 2026-09-09 — User supplied diagnostics under tmp and requested gitignore; identified working stock-map person versus faulty direct device tracker. Verified HA person/zone behavior and recorded compatible support.
