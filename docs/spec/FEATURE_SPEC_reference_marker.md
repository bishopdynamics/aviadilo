# SPEC: Optional you-are-here reference marker

- **Status:** implemented, verified and published as v0.2.0-dev.4 from 8b89254; awaiting user assessment.

## Summary

Add a default-enabled you-are-here icon at the card's configured geographic anchor, normally Home Assistant home, controlled through the visual editor.

## Goals

- Show one recognizable, accessible reference marker by default, independent of the four data layers.
- Keep it at the resolved geographic location during panning and support disabling it graphically.
- Preserve map interaction, viewport policy, real-data permissions and all resource limits.

## Non-Goals

- Browser GPS, user-to-device-tracker inference, new permissions/provider calls, a fifth layer button or changed automatic fitting.

## Key Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Setting | `map.show_you_are_here`, boolean, default true | Requested default; additive card-v2 field. |
| Location | Existing `resolveAnchor(config.map.anchor, hass)` | HA home by default, or configured zone/custom anchor. No live-device location source exists. Optional clarification asked; this map-reference interpretation was stated while work proceeds. |
| Presentation | One bundled SVG/CSS location/reference icon; title/accessible text identifies the configured anchor | High contrast on light/dark maps, visually distinct from aircraft/people. Clarify the reference source rather than imply measured device GPS. |
| Layer behavior | Independent of People and other data toggles; map/combined layouts only | A context marker with its own checkbox; no hidden data demand. |
| Viewport | Marker does not contribute fit points or move the camera | Existing central viewport rules remain unchanged. |
| Missing location | Hide until a valid anchor is available | Do not invent 0,0; valid explicit zeros must work. |
| Delivery | Paired package metadata `0.2.0-dev.4`, no dependency change | Follow established prerelease workflow; preserve published versions. |

## Design

Extend canonical card-v2 defaults/schema/types and graphical Map controls. Preserve frozen v1 schema, legacy migration, unknown fields and invalid drafts. Reuse public anchor resolution and longitude wrapping to keep a single marker in the visible world copy.

Prefer a small reusable marker layer. Use a local vector icon with a visible halo or offset shape so a co-located tracker does not completely obscure it; retain tracker/aircraft click behavior. Any tooltip/popup must identify the map reference, use safe DOM text and avoid focus/popup auto-pan. Update position only when needed, never duplicate markers on repeated updates; remove on disable, missing anchor, list layout and detach. Do not add a timer, data subscription, remote image or geolocation prompt. Production editor/picker/saved views use the same implementation.

## Implementation Plan

1. **Reference marker and prerelease (M), [serial].**
   - Owned: `contracts/card-config.schema.json`, `contracts/card-defaults.json`, `contracts/fixtures/cases.json`; `src/config/{types,defaults,migrate,validate}.ts` and generator if required; `src/aviadilo-map.ts`, `src/map/{styles,geo}.ts`, new `src/map/reference.ts`, `src/localize/en.ts`, `src/editor/editor.ts`; `tests/frontend/{config,map,editor}/**`, `tests/e2e/{card,assets}.spec.ts`, `tests/backend/test_contracts.py`; `package.json`, `package-lock.json`, `pyproject.toml`, `uv.lock`, `custom_components/aviadilo/{const.py,manifest.json}`.
   - Worker: scoped tests, lint/unit/backend/build and package version checks.
   - Parent: full CI, native admin plus regular/read-only marker/default/toggle/anchor/pan/editor checks, screenshots for both themes/overlap, public prerelease/download/HACS verification.

## Open Questions

No blocking question. The optional location clarification can steer the work; the implemented interpretation must be explicit in user guidance.

## Deferred / Follow-ups

No new deferred work; live-device location is outside this requested reference-marker implementation unless the user selects it.

## Change Log

- 2026-09-09 — Published v0.2.0-dev.4 from 8b89254 after native and hassfest/HACS workflows passed. Public ZIP exactly matches the tested candidate; tag validation and actual HACS installation using downloaded bytes/published metadata pass. Normal v0.1.0 remains Latest.

- 2026-09-09 — Parent full checks pass: 308 frontend, 515 backend, 24 Chromium scenarios; native HA admin/regular/read-only default/toggle/pan/zero/missing anchor/keyboard/theme/editor checks pass. Actual HACS candidate installation preserves settings/cache/dashboard.

- 2026-09-09 — User requested optional default-enabled icon and confirmed the kiosk fix works. Recorded map-anchor implementation and compatibility behavior.
