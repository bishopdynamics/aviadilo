# SPEC: Preserve singleton locations while spreading household icons

- **Status:** complete — user confirmed the combined dev.3 build on2026-09-09 and authorized normal0.2.1 release.
- **Parent:** [ROOT_SPEC.md](ROOT_SPEC.md); refines [household layout](FEATURE_SPEC_marker_layout.md).
- **Baseline:** published 0.2.1-dev.2, including user-confirmed tile streaming and one-hour idle basemap retention.

## Summary

Prevent an overlapping household from displacing an otherwise independent person's icon. Reserve independent icons at their original map positions before placing relocated icons in remaining space. Make true-location connector lines visibly thicker with a contrasting outline.

## Goals

- Three coincident people cannot move a nearby, originally non-overlapping fourth person from its true in-bounds location.
- Classify original overlaps before any displacement or synthetic group-control placement; source order/entity names do not decide which singleton loses its location.
- Apply the priority consistently in default spreading and optional collapsed/expanded grouping.
- Make relocated-person/device/reference connectors clear on light/dark map backgrounds without intercepting clicks or dragging.
- Preserve true coordinates, accuracy, fit/radius behavior, photo/marker identity, keyboard/touch and bounded overflow access.

## Non-Goals

- New map settings, provider/cache changes, entity policies, icon designs, grouping defaults or aircraft/weather decluttering.
- Unlimited packing, moving the map to make icons fit, or retaining a singleton at a position whose footprint cannot satisfy existing edge constraints.

## Key Decisions

| Decision | Choice | Rationale / alternatives considered |
| --- | --- | --- |
| Priority | Reserve originally isolated, in-bounds household icons first | Relocated icons must choose the remaining space rather than starting a displacement cascade. |
| Original overlap | Original projected footprints including current label clearance, before clamping/relocation | Group expansion and synthetic group controls cannot redefine a real independent person as overlapping. |
| Group controls | Pass original singleton priority from HouseholdLayer into the pure layout | A group centroid can itself collide with a true singleton even though none of its members did. Synthetic controls must yield to that singleton. |
| Group anchors | Preserve reference-first/stable-ID ordering among non-singletons; optionally reserve one feasible representative per original group before fanout if this stays within the existing deterministic contract | Preserve familiar anchors without giving a displaced group member priority over independent locations. Report the exact choice. |
| Edges/capacity | True-position reservation only when existing footprint bounds permit; remaining edge placement and explicit overflow panel retained | Do not promise impossible in-bounds packing or silently discard icons. Edge-adjusted icons must not displace an eligible true singleton. |
| Connector style | Solid dark foreground, 3 px, over a light 6 px casing; rounded ends, both noninteractive | More visible against both light/dark basemaps without changing the meaning or adding controls. Existing true-coordinate endpoints retained. |
| Runtime bounds | No timers/new dependencies; at most two SVG paths per displaced icon | Same maximum100 people plus reference, deterministic placement and bounded overflow. |
| Delivery | 0.2.1-dev.3 / Python0.2.1.dev3 | Established verified-prerelease feedback workflow; normal0.2.0 remains Latest. |

## Design

Compute original singleton membership once from the original visible person/device/reference footprints, independently of optional grouping presentation. Use a small pure helper/optional argument to give spreadMembers the protected original IDs. Direct callers without explicit original membership should derive singleton protection from their original inputs.

Reserve protected icons at the true coordinates wherever the existing footprint and clearance bounds fit. Then place other icons/controls using the existing bounded nearest-slot search around their original coordinates, avoiding every reserved footprint. Keep deterministic tie-breaking and stable source-order independence. No relocated footprint may be used to reclassify another icon's original singleton status. If edge clamping or lack of room requires fallback, preserve existing visible/overflow semantics and original input models.

Draw connector casings and foregrounds in the context pane below markers; ensure casing paths also have pointer-events disabled. Prefer casing-first/foreground-second ordering where crossings occur. Both paths must be removed with existing presentation cleanup, and both trace the original true location to the displayed icon. Group count controls do not invent a person's location. Marker/photos/details remain the existing nodes and resources; all movement remains presentation-only.

## Implementation Plan

1. **(M) [serial] Placement priority and connector implementation.** One demanding worker owns the pure geometry and coordinator contract together.
   - Owned: `src/map/household-layout.ts`, `src/map/household.ts`, `src/map/styles.ts`, `tests/frontend/map/household-layout.test.ts`, `tests/e2e/card.spec.ts`. No other runtime/config/contract changes expected.
   - Worker verification: `make lint test build`. Add meaningful before/after regression for a coincident triple plus an isolated icon at the old preferred displaced slot; adversarial IDs/order; multiple groups/singletons, labels, reference, edge/capacity behavior. Write browser coverage for real icon anchor, no intersections, grouped expansion and connector style/cleanup/pointer behavior; parent runs browsers.
2. **(M) [serial] Package and verify the refinement.** Parent owns six version files, release/user/development docs and singleton native environment. Parent-only continuity: this spec, ROOT addendum, PROJECT, queue and handoff.
   - Full `make check`; native actual HA synthetic positions for the reported scene, both themes, nearby singleton preserved as membership changes and grouping expands/collapses; true data/accuracy/fit, photos, non-admin users and touch/keyboard behavior.
   - Reuse relevant existing native marker/capacity checks without rerunning unrelated long soaks. Build coherent dev.3; verify actual HACS dev.2 upgrade, remote native/HACS/hassfest, public ZIP equality and published-bytes upgrade. Stable Latest remains0.2.0.

## Open Questions

None blocking. User supplied the behavior and visual direction; routine placement and stroke choices above make them concrete without another confirmation.

## Deferred / Follow-ups

No new technical features. Prior cache-hour assessment, aircraft-warning evidence and general weather-client remount questions remain separate.

## Change Log

- 2026-09-09 — User confirmed dev.3 and requested the normal release. Tile streaming, one-hour retention and singleton/connector refinements are accepted; normal0.2.1 promotion changes version metadata only.

- 2026-09-09 — Published dev.3 from 2197808 after all local/native/remote checks. Public ZIP exactly matches the tested candidate; actual published-metadata/bytes HACS upgrade from dev.2 preserves settings/cache/dashboard. Stable 0.2.0 remains Latest. Screenshots after tile completion confirm clear leaders in both themes. User assessment follows.

- 2026-09-09 — Implemented original-footprint singleton reservation, including grouped centroid controls and edge priority. Remaining placements keep reference-first/stable-ID order; no extra per-group representative reservation. Connectors use 3px dark strokes over 6px white casings, all casings first. Parent 431/576/41 gates and native admin/regular/read-only true-anchor, accuracy, photos, light/dark, keyboard/touch, click-through, grouping, capacity and cleanup checks pass. Publication follows.

- 2026-09-09 — Recorded user-requested singleton priority and clearer connectors; no new permission/schema/provider scope. One serial native worker because Hanuman is absent.
