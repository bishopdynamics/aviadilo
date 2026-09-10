# Handoff Archive 37

Before user sign-off and normal0.2.1 release.

- **2026-09-09 — Singleton priority and clearer connectors delivered as [v0.2.1-dev.3](https://github.com/bishopdynamics/aviadilo/releases/tag/v0.2.1-dev.3)**, tagged commit **21978081a85e6ec2d547d4eca1015ba4a40a3640**. User requested protecting single icons from displaced group members and making leaders visible. Household assessment remains. Normal **0.2.0 stays Latest/HACS default**; select dev.3 explicitly, restart HA and reload dashboards.
- Original visible footprints determine singleton/group membership before clamping or synthetic controls. Eligible in-bounds singleton positions are reserved first; edge-adjusted icons and group controls yield. Remaining placement keeps reference-first/stable-ID order, without extra group representative reservations. Existing bounded overflow, true coordinates/accuracy/fit and one-hour basemap cache remain. Connectors use **3px #102131 foreground / 6px white casing**, rounded and noninteractive; all casings precede foregrounds and existing cleanup removes both.
- Parent **431 frontend / 576 backend / 41 Chromium** gates passed. Native HA **2026.9.1 / Chromium 153.0.8010.12** admin and explicit non-owner regular/read-only cases passed: isolated icon 0 px displacement versus baseline 152 px, true model/accuracy coordinates, photo/node identity, group/reference expansion, keyboard/touch, click-through leaders, light/dark contrast and complete cleanup. Native 101-member fallback retains keyboard access and clears leaders. Repeated state updates keep path/photo counts stable. Final screenshots waited for tile completion; zero JS/Aviadilo-command/external-browser errors.
- Public ZIP **29 files, 1,258,332 bytes**, SHA256 **fd97229a80a6cc3f9d25e20cb08795331fd7e31eb612a642ad57c2bffbca8695**, published `2026-09-10T04:36:00Z`. Exact candidate/GitHub digest match. Remote Native **34437252933**, HA/HACS **34437252962**, Publication **34437565542** all passed. Actual HACS 2.0.5 published-byte dev.2→dev.3 upgrade retains settings/cache/dashboard. Native replacement retained 29 external files; all non-frontend runtime entries match dev.2 after version substitution. Evidence `/tmp/aviadilo-anchor-priority`.
- Native gpt-6-astra/high serial worker completed; Hanuman absent. Only main worktree, all owned HA/browser/test processes stopped. Isolated HA has synthetic person states; household HA/private diagnostics untouched. User TODO unchanged and prior streaming item remains checked. No .bishop changes observed; root tmp/ ignored/private. Final docs commit follows immutable release tag. One-hour assessment and prior aircraft-warning/general weather-client remount topics remain separate.


## Previous queue

# Task Queue

Agent-worked, ordered queue. Processing rules live in `AGENTS.md` and project-specific overrides in `PROJECT.md`.

## Queue

1. [in-progress, awaiting user assessment] [Singleton priority and clearer connectors](spec/FEATURE_SPEC_marker_anchor_priority.md) delivered as [v0.2.1-dev.3](https://github.com/bishopdynamics/aviadilo/releases/tag/v0.2.1-dev.3) from 2197808. Parent 431 frontend / 576 backend / 41 browser checks, native three-role/theme/grouping/101-member acceptance, all remote gates and actual public-ZIP HACS upgrade passed. Originally isolated in-bounds markers stay anchored; outlined leaders improve contrast. Stable 0.2.0 remains Latest.

## Awaiting user assessment

- One-hour idle basemap retention delivered as [v0.2.1-dev.2](https://github.com/bishopdynamics/aviadilo/releases/tag/v0.2.1-dev.2) from a9a15f7. Original dev.1 tile-streaming repair is user-confirmed and its TODO marked done. Parent 427 frontend / 576 backend / 40 browser checks, native package navigation, all remote gates and actual published-byte HACS upgrade from dev.1 passed. Stable0.2.0 remains Latest.

## Awaiting incident evidence

- Intermittent Aircraft unavailable warning: icons are user-confirmed working; no household cause was established. The supplied capture showed a healthy adsb.fi state and no active viewers. Revisit if active-warning diagnostics become available; no runtime fix or warning suppression is claimed. See [investigation](research/intermittent-aircraft-status.md). The separate people-location mismatch is fixed and user-confirmed.

## Completed

- 2026-09-09 — User signed off the original [implementation](spec/ROOT_SPEC.md) and all kiosk/layout/permissions/reference/aircraft/person/marker-layout addenda through v0.2.0-dev.7. Both final user TODO items were marked done in the release commit. Normal [v0.2.0](https://github.com/bishopdynamics/aviadilo/releases/tag/v0.2.0) is published as GitHub Latest/HACS default; actual public ZIP and six default HACS install/update cases passed.
- 2026-09-08 — HACS metadata/topics and normal-channel update repair verified and user-confirmed.
- 2026-09-06 — Initial planning completed by approval of ROOT_SPEC.md.

Detailed implementation and verification history is preserved in [handoff archive 33](handoff/archive_33.md) and [development notes](development.md).
