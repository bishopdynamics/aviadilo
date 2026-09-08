# Handoff Main Index

## Current

- **2026-09-08 — Approved kiosk refinement slice 1 implemented and independently verified.** The user approved the complete detailed spec; no renewed approval for its choices. Pause at the slice handoff. Next continuation is **slice 2: integration basemap cache and bounded external photos**. ROOT_SPEC/addendum remain in progress; user TODO items are not marked complete.
- Full root `make check`: **194 frontend + 332 backend + 11 offline Chromium tests**, formatting/lint/TS, strict mypy on 38 files, builds and local package validation passed. Log `/tmp/aviadilo-kiosk-slice1/root-check.log`. Existing card/radar/editor/reconnect behavior remains compatible; no new production asset registration, cache/provider activation, cardv2 or release.
- Contract/API details: `contracts/assets.schema.json`, shared fixtures, `src/data/assets.ts`, `custom_components/aviadilo/assets.py`; documented in docs/development.md. Header X-Aviadilo-Generation, UUIDhex:counter, safe fixed errors, strict paths, paired JSON semantics, HTTP-compatible SHA256, owner-refcount and generation lifecycle. Future renderers must release responses/check current after decode; backend source/cache implementations still pending.
- Real HA loopback HTTP/WS auth/event/clear tests and adversarial parser/cancellation/owner regressions passed. Worker native Codex gpt-6-astra/high (Hanuman absent), lone serial main writer; parent reran full gates and reviewed/source-fingerprinted all 15 owned files. Nonblocking messages: generated eslint-disable banner, existing large fixture build chunk, HA/aiohttp deprecations.
- Local working ZIP remains dev.2 but now 25 files, SHA256 `a9bf56e6267e4d6a85474ec6eed0f1f0ae2c2248590c57ecb96f6201641a36ee`; do not confuse it with published dev.2. No tag/release/household deployment. Spec's dev.3 packaging/upgrade remains slice 6. No dependencies changed.
- Resource audit: worker completed, only main worktree, no stale trees or remaining Aviadilo pytest/Vite/Playwright processes; no native HA server/browser session started. Interrupted restricted pytest attempt was stopped; escalated full run passed. Evidence/report `/tmp/aviadilo-kiosk-slice1`; brief `/tmp/aviadilo-briefs/kiosk-slice1.md`.
- User-owned `docs/TODO.md` is still modified/uncommitted (including existing trailing whitespace); do not stage or edit it incidentally. `.bishop/` remains tracked and must be committed if generated metadata changes. Prior HACS topics issue is fixed; validation 34276525393 passed.

## Archives

- `archive_17.md` — kiosk spec drafting, approved product direction and verified CI metadata fix.
- `archive_16.md` — first public HACS release, explicit prerelease selection and user-confirmed installation/card preview behavior.
- `archive_15.md` — slice 8 implementation, native HA/soak acceptance and pre-publication handoff.
- `archive_14.md` — slice 7 wind implementation, verification and handoff.
- `archive_13.md` — slice 6 radar implementation, independent verification and handoff.
- `archive_12.md` — slice 5 aircraft implementation, independent verification and handoff.
- `archive_11.md` — slice 4 map/editor/people implementation and standalone/HA verification.
- `archive_10.md` — previous session wrap after slices1–3 and authorization to resume slice 4.
- `archive_9.md` — slice 3 implementation, transport APIs and live protocol verification.
- `archive_8.md` — slice 2 implementation, registry startup fix and real HA verification.
- `archive_7.md` — slice 1 implementation and verification.
- `archive_6.md` — full spec approval and implementation kickoff instructions.
- `archive_5.md` — spec drafting and HACS/GitHub correction before approval.
- `archive_4.md` — expanded scope research, source comparisons, and static Claremont spike.
- `archive_3.md` — initial Aviadilo first-run research.
- `archive_2.md` — inherited template session history.
- `archive_1.md` — earlier inherited template history.
