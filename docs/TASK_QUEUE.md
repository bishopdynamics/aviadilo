# Task Queue

Agent-worked, ordered queue. Processing rules live in `AGENTS.md` and project-specific overrides in `PROJECT.md`.

## Queue

1. [in-progress, awaiting user assessment] [Reliable tile streaming](spec/FEATURE_SPEC_tile_streaming.md) delivered as [v0.2.1-dev.1](https://github.com/bishopdynamics/aviadilo/releases/tag/v0.2.1-dev.1) from39f3565. Parent427 frontend/576 backend/40 browser checks, final packaged native same-user/regular/read-only/recovery/cache-clear/60-second resource checks, all remote gates and actual public-ZIP HACS upgrade passed. Normal 0.2.0 remains Latest. User TODO remains untouched until assessment.

## Awaiting incident evidence

- Intermittent Aircraft unavailable warning: icons are user-confirmed working; no household cause was established. The supplied capture showed a healthy adsb.fi state and no active viewers. Revisit if active-warning diagnostics become available; no runtime fix or warning suppression is claimed. See [investigation](research/intermittent-aircraft-status.md). The separate people-location mismatch is fixed and user-confirmed.

## Completed

- 2026-09-09 — User signed off the original [implementation](spec/ROOT_SPEC.md) and all kiosk/layout/permissions/reference/aircraft/person/marker-layout addenda through v0.2.0-dev.7. Both final user TODO items were marked done in the release commit. Normal [v0.2.0](https://github.com/bishopdynamics/aviadilo/releases/tag/v0.2.0) is published as GitHub Latest/HACS default; actual public ZIP and six default HACS install/update cases passed.
- 2026-09-08 — HACS metadata/topics and normal-channel update repair verified and user-confirmed.
- 2026-09-06 — Initial planning completed by approval of ROOT_SPEC.md.

Detailed implementation and verification history is preserved in [handoff archive 33](handoff/archive_33.md) and [development notes](development.md).
