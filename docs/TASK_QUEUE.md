# Task Queue

Agent-worked, ordered queue. Processing rules live in `AGENTS.md` and project-specific overrides in `PROJECT.md`.

## Queue

1. [in-progress, awaiting user assessment] One-hour idle basemap retention delivered as [v0.2.1-dev.2](https://github.com/bishopdynamics/aviadilo/releases/tag/v0.2.1-dev.2) from a9a15f7. Original dev.1 tile-streaming repair is user-confirmed and its TODO marked done. Parent 427 frontend / 576 backend / 40 browser checks, native package navigation, all remote gates and actual published-byte HACS upgrade from dev.1 passed. Stable0.2.0 remains Latest.

## Awaiting incident evidence

- Intermittent Aircraft unavailable warning: icons are user-confirmed working; no household cause was established. The supplied capture showed a healthy adsb.fi state and no active viewers. Revisit if active-warning diagnostics become available; no runtime fix or warning suppression is claimed. See [investigation](research/intermittent-aircraft-status.md). The separate people-location mismatch is fixed and user-confirmed.

## Completed

- 2026-09-09 — User signed off the original [implementation](spec/ROOT_SPEC.md) and all kiosk/layout/permissions/reference/aircraft/person/marker-layout addenda through v0.2.0-dev.7. Both final user TODO items were marked done in the release commit. Normal [v0.2.0](https://github.com/bishopdynamics/aviadilo/releases/tag/v0.2.0) is published as GitHub Latest/HACS default; actual public ZIP and six default HACS install/update cases passed.
- 2026-09-08 — HACS metadata/topics and normal-channel update repair verified and user-confirmed.
- 2026-09-06 — Initial planning completed by approval of ROOT_SPEC.md.

Detailed implementation and verification history is preserved in [handoff archive 33](handoff/archive_33.md) and [development notes](development.md).
