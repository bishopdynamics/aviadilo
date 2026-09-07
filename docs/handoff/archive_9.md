# Handoff Main Index

## Current

- **2026-09-07 — Slice 3 implemented and independently verified after user continuation.** Authenticated WS/HTTP, strict runtime validation, publication contexts, bounded shared replay/tile gateway and TypeScript client are complete. Pause at slice handoff. Next approved slice: 4, Map, full editor shell, people and viewport. Live providers and card wiring still belong to later slices; no production deployment.
- Independent `make check`: 57 frontend + 169 backend tests passed, formatting/lint/TS, strict mypy on 24 files, both Vite builds and 17-file HACS ZIP validation. Nine warnings originate in HA/dependency code. Offline HA tests ran with normal escalation for local socket wakeups. Root log: `/tmp/aviadilo-root-slice3-check.log`.
- Real HA 2026.9.1 / Chromium 151.0.7922.34 smoke used a temporary bundle of the actual client: initial subscription, rapid-edit debounce to revision 2, hide/resume/dispose, cross-connection heartbeat rejection, own heartbeat success, peer cleanup, unauthenticated HTTP 401, integration reload and full HA restart recovery. Final client/build retained revision 2 and exactly one viewer after restart; disposal left zero viewers/queued work. No provider calls. Artifact hash and bounds in `docs/development.md`.
- Interfaces for next worker: `createHaAdapter(hass)` → `AviadiloClient(adapter, selection, callbacks)`; selection needs resolved entry ID, layer flags, radar provider and viewport. Use `setSelection`, visibility/active controls, tile load/release and disposal. Server adapter hooks: capture before awaiting, then publish without an envelope; register trusted synchronous tile resolvers. Keep the existing HA-ready bootstrap from slice 2.
- Medium choices: one native Codex `gpt-6-astra`/high worker (Hanuman absent); explicit manifest/shared-fixture ownership; per-connection/user/global limits, 2 MiB PNG cap, 120s/150s tile deadlines and rejection of all redirects. Lifecycle notifications use existing status messages. Missing adapters report empty capabilities/unavailable status, not fabricated live data.
- Resource audit: only main worktree `/mnt/Fast/projects/aviadilo` on `main`; worker `slice3_transport` completed. Isolated HA and browser stopped. Temporary test token revoked and private auth file removed; temporary served client bundle removed. Venv/config under `/tmp/aviadilo-ha-runtime-venv` and `/tmp/aviadilo-ha-slice2`, toolchains/caches and unserved build/brief artifacts remain for reproduction. Brief: `/tmp/aviadilo-briefs/slice3.md`.
- External limitations unchanged: Docker daemon inaccessible, so hassfest container not run; GitHub description/topics and remote HACS validation pending without API credentials. Full HACS install/upgrade acceptance is slice 8. `.bishop/tasks.json` remains app-generated and unstaged outside the slice commit. No pushes/releases made.

## Archives

- `archive_8.md` — slice 2 implementation, registry startup fix and real HA verification.
- `archive_7.md` — slice 1 implementation and verification.
- `archive_6.md` — full spec approval and implementation kickoff instructions.
- `archive_5.md` — spec drafting and HACS/GitHub correction before approval.
- `archive_4.md` — expanded scope research, source comparisons, and static Claremont spike.
- `archive_3.md` — initial Aviadilo first-run research.
- `archive_2.md` — inherited template session history.
- `archive_1.md` — earlier inherited template history.
