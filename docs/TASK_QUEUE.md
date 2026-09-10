# Task Queue

Agent-worked, ordered queue. Processing rules live in `AGENTS.md` and project-specific overrides in `PROJECT.md`.

## Queue

1. [in-progress] Publish normal0.2.1 after user confirmation of dev.3 on2026-09-09. Promote exact tested behavior, verify fresh HACS installation and stable/prerelease upgrades, publish and check the actual public ZIP/Latest metadata. Prepare a clear quick-start for additional testers.

## Awaiting incident evidence

- Intermittent Aircraft unavailable warning: icons are user-confirmed working; no household cause was established. The supplied capture showed a healthy adsb.fi state and no active viewers. Revisit if active-warning diagnostics become available; no runtime fix or warning suppression is claimed. See [investigation](research/intermittent-aircraft-status.md). The separate people-location mismatch is fixed and user-confirmed.

## Completed

- 2026-09-09 — User accepted tile streaming, one-hour basemap retention and singleton/connector refinements through dev.3 and authorized normal0.2.1. Earlier delivery history is preserved in [archive37](handoff/archive_37.md).

- 2026-09-09 — User signed off the original [implementation](spec/ROOT_SPEC.md) and all kiosk/layout/permissions/reference/aircraft/person/marker-layout addenda through v0.2.0-dev.7. Both final user TODO items were marked done in the release commit. Normal [v0.2.0](https://github.com/bishopdynamics/aviadilo/releases/tag/v0.2.0) is published as GitHub Latest/HACS default; actual public ZIP and six default HACS install/update cases passed.
- 2026-09-08 — HACS metadata/topics and normal-channel update repair verified and user-confirmed.
- 2026-09-06 — Initial planning completed by approval of ROOT_SPEC.md.

Detailed implementation and verification history is preserved in [handoff archive 33](handoff/archive_33.md) and [development notes](development.md).
