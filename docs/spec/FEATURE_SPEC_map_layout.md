# SPEC: Optional layer controls and automatic page height

- **Status:** in-progress — requested by the user after positive kiosk acceptance on 2026-09-08.

## Summary

Let a kiosk show a clean map with fixed saved layers, and optionally size the card to the remaining visible page instead of a fixed pixel height.

## Goals

- A graphical Show layer buttons checkbox; hidden controls use the saved layer selections.
- An opt-in Auto-size height to page checkbox that responds to viewport/layout changes without resize or scrolling loops.
- Preserve fixed height, Recenter's independent setting, attribution, error inspection, map interaction, shared data and bounded resources.

## Non-Goals

- New provider/cache behavior, a separate editor pipeline, cross-remount state transfer, dashboard-wide layout management or replacing existing published releases.

## Key Decisions

| Decision | Choice | Rationale / alternatives considered |
| --- | --- | --- |
| Layer controls | `map.show_layer_buttons`, boolean, default true | Existing dashboards keep controls. False uses `layers` from saved config, clearing any transient toggle state when switched off. |
| Height option | `map.auto_height`, boolean, default false | Interpret page sizing as filling the remaining visible viewport below the card. Optional clarification asked; use this interpretation unless the user steers otherwise. HA-assigned grid height is a distinct alternative. |
| Fixed height | Retain `map.height_px` and its current bounds/default | Used in fixed mode and before the auto layout can be measured. Preserve the value when auto mode is selected. |
| Auto geometry | Remaining viewport height (bounded by explicit fixed CSS clipping constraints) minus the card's layout position, non-map content, borders and a 16px bottom gap; map minimum 160px | Account for title, controls and actual optional list/details. If these consume the screen, the minimum map may require scrolling. List-only layout remains naturally sized. |
| Scrolling | Measure the card's unscrolled layout position using public composed DOM/scroll geometry; scrolling alone must not continually grow the card | Avoid a `viewportHeight - currentBoundingTop` feedback loop. No private HA selectors and no periodic sizing poll. |
| Controls row | Recenter stays independent; omit an empty row | Error-only inspection remains reachable as a compact overlay when ordinary controls are absent; attribution remains visible. |
| Contract/version | Add optional fields to canonical card v2; freeze v1 unchanged; next package `0.2.0-dev.2` | No breaking schema change or dependency update. Existing releases remain intact. |

## Design

Extend defaults, generated card types/validators and the graphical Map settings. Make the fixed pixel-height input inactive or hidden while auto height is enabled, retaining its value. Retain valid unknown fields and invalid editor drafts through existing normalization/editor behavior.

A small height controller/helper uses viewport/visual-viewport dimensions, generic composed ancestor geometry and ResizeObserver/resize notifications, coalesced through requestAnimationFrame. Write only meaningful height changes; observe layout without basing the result on an auto-sized ancestor's own growing content height. Recompute for viewport/orientation, layout position and non-map content changes. Explicit pixel height/max-height constraints around scrollports bound the available space; CSS Typed OM distinguishes an authored height from a content-growing auto height. Never use an auto ancestor's measured height as the target. Clean up all observers/listeners/animation frames on detach. Keep the same sizing algorithm in saved/edit/picker contexts; a preview uses its actual on-page position.

Keep HA Sections natural-row behavior and masonry's actual/estimated card height. The official custom-card sizing contract is documented at https://developers.home-assistant.io/docs/frontend/custom-ui/custom-card/#sizing-in-sections-view. Existing map resize wiring must preserve manual center/zoom and update only genuine viewport-dependent demand. Height/control-only changes must not recreate clients, clear caches or introduce timers that fetch data. All existing tile/queue/canvas caps remain enforced.

## Implementation Plan

1. **Layout options and packaged follow-up (M), [serial].**
   - Owned files: `contracts/card-config.schema.json`, `contracts/card-defaults.json`, `contracts/fixtures/**`; `src/config/{types,defaults,migrate,validate,validators.d}.ts`, `src/config/generate.mjs`; `src/aviadilo-map.ts`, `src/map/styles.ts`, new `src/map/height.ts`, `src/editor/{editor,map-panel,ha-controls}.ts`, `src/localize/en.ts`; `dev/{fixtures,runtime}.ts`, `dev/ha/manage.py`; `tests/frontend/{config,editor,map}/**`, `tests/backend/{test_contracts,test_release_metadata}.py`, `tests/e2e/{card,assets}.spec.ts`; `package.json`, `package-lock.json`, `pyproject.toml`, `uv.lock`, `custom_components/aviadilo/{manifest.json,const.py}`.
   - Verify defaults/migration/editor round trip, fixed saved layers when buttons are hidden, no empty toolbar, independent Recenter/error controls, fixed/auto sizing, resize/scroll stability, minimum-height overflow, list-only behavior, mounted identity/manual view, and listener cleanup.
   - Worker: lint/unit/backend/build only. Parent: full CI gates plus native HA graphical save/reopen, clean-map view, Sections/masonry/panel/preview sizing, resizing/scrolling with network/resource recording, packaged upgrade/publication/download checks. No new 20-minute soak is needed for these presentation changes unless verification exposes a new lifecycle concern.

## Open Questions

None blocking implementation. The optional height clarification can steer implementation if answered. The previous preview-remount policy question is separate and unchanged.

## Deferred / Follow-ups

No new deferred work. Existing provider and physical-device limitations remain as recorded in the parent specs.

## Change Log

- 2026-09-08 — Implemented and independently verified: 282 frontend + 489 backend + 23 Chromium tests, native HA page layouts/editing/scrolling/clipping, and 120-second stable all-layer rendering. Initial native footer clipping was fixed by explicit CSS constraints; no context-specific data behavior. Candidate 0.2.0-dev.2 is ready for remote/release checks.

- 2026-09-08 — User positively assessed the kiosk release and requested optional layer controls and automatic page height. Recorded the requested scope and compatibility defaults; implementation authorized by that request.
