# SPEC: Aircraft icons and type filters

- **Status:** complete — user signed off v0.2.0-dev.7 on 2026-09-09 and authorized promotion to normal v0.2.0.

## Summary

Replace aircraft triangles with recognizable aircraft-kind icons and provide Aircraft checkboxes for selecting which kinds appear, including a helicopters-only view.

## Goals

- Distinguish reported aircraft kinds with clear local vector icons, particularly airplane versus helicopter.
- Apply saved type selections consistently to map, list, selected detail/trail and automatic-fit candidates.
- Keep defaults inclusive and preserve the shared feed, permissions, cache, viewport interaction and marker accessibility.

## Non-Goals

- Exact manufacturer/model silhouettes, a new aircraft database, model-code guesses, inferred classifications from motion, provider-side filters or extra provider requests.

## Key Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Configuration | `aircraft.types`, array of unique stable string IDs; all groups enabled by default, empty valid | Existing enum-array graphical controls provide the requested checkboxes; all defaults preserve traffic visibility. |
| Groups | `airplanes`, `helicopters`, `gliders`, `balloons`, `parachutists`, `ultralights`, `drones`, `spacecraft`, `ground`, `unknown` | Broad recognizable types match the user's plane/helicopter example without listing every model or weight class. Ground includes vehicles/obstacles; label it clearly. |
| Classification | Existing `Aircraft.category`: A1–A6 airplanes; A7 helicopters/rotorcraft; B1 gliders; B2 balloons/airships; B3 parachutists; B4 ultralights/hang-gliders/paragliders; B6 drones; B7 spacecraft; C1–C5 ground vehicles/obstacles; all missing, reserved or unrecognized values unknown | Both provider adapters already carry the readsb category. Normalize case/whitespace; use exact category matches. No new wire fields. |
| Missing metadata | Distinct neutral Unknown icon/filter | A null or reserved category must not be classified as a plane from type code, altitude, speed, registration or callsign. Explain that reported categories can be absent. |
| Marker | Original bundled SVG shapes using existing marker size/color, contrast outlines and stable marker DOM | No remote icon service, font-glyph platform variance or third-party artwork copying. Preserve rotation for known course and make missing course visibly/accessibly distinct without inventing a bearing. |
| Filtering | In shared AircraftController before rows, points, selected detail/trail and fit | Hiding a selected kind removes its selection and trail so restoring types does not reopen stale selection. Display filters do not mutate provider selection or subscriptions. |
| Compatibility | Additive canonical card-v2 field; frozen v1 and feed v1 unchanged | Existing card migration/default filling, invalid draft behavior and unknown config fields stay intact. |
| Delivery | Paired package version 0.2.0-dev.5 / Python 0.2.0.dev5, no dependency update | Established verified prerelease workflow; keep previous public tags/releases immutable. |

## Design

A small pure classification module exports the group IDs and friendly names for rendering/filtering. Use the same classification for icon, accessible label and controller filtering. Keep exact model `aircraft_type` and raw category detail available. Source names and labels use safe DOM text. Differentiate the airplane and helicopter at the current default size and in both map themes; preserve stale opacity, marker-size/color edits, course rotation, selected outline, click/keyboard behavior, popup position and dateline wrapping. Update glyph only if the kind changes; repeated feed updates should not recreate marker nodes or destroy keyboard focus/popups.

Aircraft settings use a clearly labelled type-checkbox group with a brief explanation that it depends on reported categories. Update the reusable aircraft editor panel as well as the schema-driven production editor. All choices checked must retain existing traffic; no choices checked means no matching aircraft. Type-filtered selected aircraft must clear selection and trail even while still in the unfiltered feed. Preserve other filters, sorting, row limits and freshness semantics. Independent card selections must not alter another viewer's feed. No new timers or network requests. Saved, editor and picker production modes remain identical.

Primary references verified 2026-09-09: [readsb JSON documentation](https://github.com/wiedehopf/readsb/blob/dev/README-json.md) distinguishes the `category` emitter classification from `t` model and `type` transport source; [provider emitter-category reference](https://support.adsbexchange.com/hc/en-us/articles/44705224053517-Emitter-Category-ADS-B-DO-260B-2-2-3-2-5-2) defines the category values above. The choice to group airplane weight classes and surface objects is Aviadilo presentation policy, not a new source classification.

## Implementation Plan

1. **Icons, filters and prerelease (M), [serial].**
   - Owned: `contracts/card-config.schema.json`, `contracts/card-defaults.json`, `contracts/fixtures/cases.json`; `src/config/{types,defaults,migrate,validate}.ts`, `src/config/generate.mjs` if required; `src/layers/aircraft/{index,model,layer,list}.ts`, new classification/icon modules in that directory; `src/editor/{editor,aircraft-panel}.ts`, `src/localize/en.ts`, `src/map/styles.ts`, `src/aviadilo-map.ts`; `dev/fixtures.ts`, `dev/ha/custom_components/aviadilo_fixture/__init__.py`; `tests/frontend/{aircraft,config,editor}/**`, `tests/backend/{test_contracts,providers/test_aircraft}.py`, `tests/e2e/{card,assets}.spec.ts`; `package.json`, `package-lock.json`, `pyproject.toml`, `uv.lock`, `custom_components/aviadilo/{const.py,manifest.json}`.
   - Worker checks: focused classification/controller/contract/editor tests, lint/types/unit/backend/build/tag validation.
   - Parent checks: full CI, native packaged HA with admin/regular/read-only users, saved/editor/picker behavior, helicopters-only and all/none/unknown filtering, fit and selected-trail cleanup, visual/light/dark/keyboard/heading review, public release/download and actual HACS install.

## Open Questions

None blocking. Broad kind groups are the stated interpretation of aircraft types; user feedback can refine them in later prereleases.

## Deferred / Follow-ups

None added to the backlog. Exact-model silhouettes or supplemental classification databases are outside this request.

## Change Log

- 2026-09-09 — User signed off the final v0.2.0-dev.7 behavior and authorized normal v0.2.0 publication. Promotion changes version metadata only.

- 2026-09-09 — Published [v0.2.0-dev.5](https://github.com/bishopdynamics/aviadilo/releases/tag/v0.2.0-dev.5) from c686f72 after all remote workflows passed. Public ZIP exactly matches the native-tested candidate; actual HACS installation with published metadata/bytes passed. Normal v0.1.0 remains Latest.

- 2026-09-09 — Parent 360 frontend/546 backend/26 browser checks pass. Native three-role, saved filters, editor/picker and actual HACS candidate upgrade pass. Acceptance also repaired popup teardown and keyboard selection; unknown classification and provider policy remain unchanged.

- 2026-09-09 — User confirms previous reference-marker release and requests aircraft-kind icons and type checkboxes. Verified existing category transport and recorded local filtering design.
