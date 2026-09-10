# SPEC: Non-overlapping household markers and people auto-fit

- **Status:** complete — user signed off v0.2.0-dev.7 on 2026-09-09 and authorized promotion to normal v0.2.0.

## Summary

Keep person/device and You are here markers usable when their map positions overlap. Spread the individual icons by default; optionally collapse overlapping markers into a counted group that expands on activation. Add a clearly labelled people-only auto-fit mode for the remaining small TODO item.

## Goals

- Default individual icons remain visible and selectable at shared or nearby locations.
- A graphical checkbox offers counted grouping for users who prefer it.
- Real coordinates, position freshness, accuracy and photo permissions remain authoritative.
- Auto-fit follows only the radius/freshness-filtered people/device positions when selected.
- Keep aircraft/radar/wind outside the collision mechanism and preserve kiosk interaction, sizing and resource limits.

## Non-Goals

- Change entity selection, merge two configured trackers into one person, change provider requests, infer coordinates, or promote the final stable release before feedback on this refinement.

## Key Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Default | Spread overlapping individual people/device/reference icons | Explicit user preference. |
| Optional grouping | `people.group_overlapping`, boolean default false; checkbox **Group overlapping markers** | Checked collapses each overlap group to a counted marker; unchecked keeps individuals spread. Applies to reference only when it overlaps selected people. |
| Scope | Filtered PeopleResult points plus the enabled/resolved reference marker | No aircraft/weather clustering; disabled/missing/out-of-radius entities do not create phantom members. |
| Coordinates | Display offsets only, with connectors from each displaced icon to its actual location | Do not overwrite PersonPoint/reference coordinates or feed offsets into viewport/radius/accuracy calculations. Accuracy circles remain at the actual position. |
| Group semantics | Count the markers, including the reference if present; identify **You are here** explicitly in accessible label/details | Do not represent the reference as an extra person. Reference-only remains the normal pin. |
| Interaction | Group activation expands individuals; activate again, Escape or map-background tap collapses; at most one group expanded | Touch/keyboard accessible, no auto-zoom/pan. Always-spread mode does not collapse on Escape. |
| Layout | Deterministic screen-space collision layout with stable IDs/order and icon/visible-label clearance | Prevent flicker/shuffling on unrelated state updates. Recompute for zoom/resize/location/membership changes; handle dateline world copies. |
| Constrained maps | Keep normal household groups within map bounds; when all members cannot fit, use a bounded scrollable member grid/list retaining individual access | Never silently discard members or draw unbounded/offscreen fans. In always-spread mode that fallback remains expanded; grouping is opt-in. |
| Auto-fit | New v2 `map.mode: fit-people`, label **Auto-fit people/devices** | Uses only filtered people/device true positions. Existing fit-visible includes aircraft and explicit zones, so does not satisfy people-only intent. |
| Fit compatibility | Existing home-area default and fit-visible behavior retained; empty people falls back to configured home extent; manual view suspends fitting until Recenter/idle return | No new fitting policy in individual layers; reference stays excluded from fit-people bounds. |
| Delivery | Fresh paired 0.2.0-dev.7 / Python 0.2.0.dev7 prerelease | User believes this is the final refinement before stable; preserve the endorsed feedback-first workflow. |

## Design

Use a shared presentation coordinator for household markers so the reference and people cannot independently occupy the same screen footprint. Keep the existing model, permissions and provider clients. Prefer a small pure layout function and layer adapters over a new clustering dependency. At most100 selected people plus one reference; geometry and resource use must stay bounded.

Normal singletons retain their familiar photo/initial/icon, name, reference pin and details. Layout must account for visible labels, with a bounded presentation width and full accessible/popup names. Offset icons must have clear noninteractive connector lines to their true locations. Keep individual marker identity where practical; timestamp/photo/status updates must not unnecessarily reset open groups, keyboard focus, popups or retained images. Group membership changes and map movement can recompute/collapse grouped expansion; ordinary unchanged-position updates should not. Accuracy circles and fit points use true coordinates. No timers/animations are required; obey reduced motion if any animation is introduced.

Counted groups identify all members safely and indicate when they include You are here. Expanded icons retain the existing individual details and selected-entity photo handling. Use minimum44px touch targets where controls are introduced, Enter/Space activation, visible focus, Escape, and no focus/popup auto-pan. Keep pointer events on individual/group controls; connector lines cannot intercept map or aircraft interaction. A small-map/large-group fallback must retain access to every member without overlapping or leaking outside clipping bounds. Do not create duplicate image requests or bypass existing per-user picture-key/generation checks. Ordinary declutter toggles/expansion must preserve map/client/assets identity and must not change data subscriptions; photo acquisition follows actual visible individuals using the current bounded cache.

The People checkbox includes text explaining that unchecked means individual spreading and that the reference participates. Map modes get readable labels: Home area, Auto-fit people/devices, Auto-fit visible items (or equivalent clear wording), while existing serialized values remain intact. For v2 fit-people validation, current schema validates the whole draft before narrowly excluding the newly extended map.mode from additional frozen-v1 checks; retain legacy follow_theme and all other mixed-field validation. Frozen v1 is unchanged and cannot claim new modes.

## Implementation Plan

1. **Household layout and people auto-fit (M), [serial].** One worker owns the presentation contract and both layer ends.
   - Owned: `contracts/card-config.schema.json`, `contracts/card-defaults.json`, `contracts/fixtures/cases.json`; `src/config/{types,migrate,defaults,validate}.ts`, generator if required; `src/map/{reference,viewport,styles}.ts`, new household layout/coordinator modules under `src/map/`; `src/layers/people/{model,layer}.ts`, new reusable people marker helpers if necessary; `src/aviadilo-map.ts`; `src/editor/{editor,people-panel,map-panel,ha-controls}.ts`, `src/localize/en.ts`; `tests/frontend/{map,people,config,editor}/**`, `tests/e2e/{card,assets}.spec.ts`, `tests/backend/test_contracts.py`; `dev/{fixtures,runtime}.ts` for deterministic test controls only; `package.json`, `package-lock.json`, `pyproject.toml`, `uv.lock`, `custom_components/aviadilo/{const.py,manifest.json}`.
   - Worker: pure geometry, config/migration, viewport/layer lifecycle/resource tests; lint/types/unit/backend/build/tag checks. Browser regression source only, no native/browser execution.
   - Parent: full CI; native HA overlap/edge/small/large-group, grouping-toggle/expand/keyboard, live movement/zone/photo, people-fit/manual-view, editor/picker and regular/read-only roles; deterministic package/HACS/public ZIP verification.

## Open Questions

None blocking. Explicit user preference: always spread, grouping optional. People auto-fit is the other outstanding TODO item and is included in this refinement.

## Deferred / Follow-ups

No new technical features are deferred. The user signed off the final prerelease and authorized stable 0.2.0 on 2026-09-09. The previously documented intermittent-aircraft and preview-remount questions remain separate; do not invent new findings or suppress existing errors here.

## Change Log

- 2026-09-09 — User signed off the final v0.2.0-dev.7 behavior and authorized normal v0.2.0 publication. Promotion changes version metadata only.

- 2026-09-09 — Published [v0.2.0-dev.7](https://github.com/bishopdynamics/aviadilo/releases/tag/v0.2.0-dev.7) from 239fb4b. Remote native/hassfest/HACS/publication checks passed; public ZIP exactly matches tested bytes and actual published-metadata/bytes HACS install passed. Normal 0.1.0 remains Latest pending final assessment and stable 0.2.0.

- 2026-09-09 — Parent 411 frontend/570 backend/38 browser checks and native three-role/capacity/120-second stability passed. Acceptance repaired group pointer targeting and overflow focus; all public/private data invariants retained. Local HACS install passed.

- 2026-09-09 — User confirms person support fixed the missing person, requests TODO completion and prefers always-spread icons with optional grouping. Existing fit-visible includes aircraft; people-only mode added to cover the small TODO.
