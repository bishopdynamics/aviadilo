# SPEC: Reliable tile streaming and recent-view caching

- **Status:** implemented and independently verified — parent427frontend/576backend/40browser gates pass; packaged native acceptance and prerelease delivery in progress. User approved the discussed plan on2026-09-09.
- **Parent:** [ROOT_SPEC.md](ROOT_SPEC.md).
- **Baseline:** signed-off normal 0.2.0, release commit 0b3a4d5; HA 2026.9.1 and Chromium 153.0.8010.12.

## Summary

Visible basemap tiles must recover from transient failures and load promptly from cache even when several kiosks share one HA user. The current per-browser eight-request allowance competes against an eight-request per-user gateway with no queue; cached requests are checked behind the same admission limit, and server 429 responses have no renderer retry. Retain a bounded cache of recently viewed basemap images across navigation without retaining photos or keeping idle network activity alive.

## Goals

- Temporary 429/network/502/503/504 failures recover while a tile remains visible, without pan/reload and without request storms.
- Cache hits remain responsive during cold requests; concurrent browsers sharing one user receive fair bounded service.
- Recent navigation away/back reuses fresh basemap images without repeating HTTP/decode work when identity and generation are unchanged.
- Cancellation, hidden/disconnected views, cache clear, user/connection changes and photo authorization remain correct.
- Verify actual native HA with multiple simultaneous same-user browser contexts, regular/read-only roles, synthetic failures and bounded resource measurements; publish the tested prerelease.

## Non-Goals

- New providers, upstream acceleration, bulk prefetch/offline maps, IndexedDB/service-worker storage, a larger public cache budget, or new user settings.
- Weather-client continuity across HA-forced element replacement, aircraft-warning diagnosis, entity behavior or visual layout changes.
- A claim that the household 429 source is established before matching actual incident evidence. The code defects are independently reproducible.

## Key Decisions

| Decision | Choice | Rationale / alternatives considered |
| --- | --- | --- |
| Scope/approval | Proceed through implementation, acceptance and prerelease | User approved the proposed sequence; routine implementation details do not need another approval. |
| Upstream requests | Keep current OSM minimum one-second pacing, scheduler cooldowns and coalescing | Improve local service before considering higher external traffic. OSM's policy requires cache reuse and has no fixed one-request/second allowance: https://operations.osmfoundation.org/policies/tiles/ (read 2026-09-09). |
| Gateway | Bounded cache-probe lane plus fair bounded miss queue | Increasing the old per-user rejection threshold alone still leaves cache hits competing with cold misses. |
| Admission limits | Up to 64 outstanding requests/user and 256 total; cache probes 8/user and 32 total; cold fetches 8/user and 32 total | Waiting requests retain small request state; work/image budgets remain bounded. Per-user FIFO and round-robin ready users prevent starvation. HTTP requests over admission capacity still get retryable 429. |
| Cache lookup | Authenticated fresh-basemap-only lookup before cold-slot admission; recheck cache when a queued miss runs | No public bypass or photo fast path; concurrent requests reuse integration cache/coalescing. |
| Retry | Shared cancellable scheduling, exponential backoff/jitter, Retry-After support; wait outside active transfer slots | A temporarily rejected tile must not become permanently blank. Retries stop on removal/hide/dispose; terminal auth/path/data failures remain errors. |
| Navigation cache | Fresh basemap decoded images retained for up to 10 minutes after the last owner releases; globally bounded idle retention at 32 MiB/128 entries | Fits the existing per-connection decoded budget. No extra permanent data store or retained household photos. |
| Identity | Reuse only same HA connection/user/entry/generation after fresh authenticated asset-info acquisition | Idle cache does not preserve authority; clear/reload/log-out cannot resurrect invalid images. |
| Delivery | 0.2.1-dev.1 / Python 0.2.1.dev1 | Fresh immutable prerelease after stable 0.2.0; stable Latest remains 0.2.0 until user assessment. |

## Design

### Backend cache-first admission

Keep the existing strict route/schema/error-body contracts. Add an internal fresh-basemap cache lookup to the AssetService/Service/OsmProvider path, returning an AssetPayload or no hit; it must not fetch, revalidate or enqueue upstream work. The unavailable service returns no hit. Perform identity/generation and normal photo authorization checks before work and immediately before returning bytes/304 responses.

Bound all live requests with the admission limits above. Cache-probe operations have their own small bounded lane and release it promptly. Basemap hits may complete while cold-fetch slots are occupied. Misses and photos enter the bounded FIFO per-user/round-robin queue; a slot is released on every success/error/cancellation path. Recheck generation/service and cache after waiting, so late cache fills avoid more upstream work and stale requests never start after clear/reload. A single request's 120-second gateway deadline includes all waiting. Disconnects and cancellation remove queued work promptly, even before it gets a slot. A queue shutdown/clear must not leak tasks, futures or counters. HTTP capacity failures preserve `Retry-After: 1` and the existing v1 busy body. Cache PNG processing must remain off-loop where required and preserve current memory budgets.

### Frontend recovery

Extend internal error metadata to distinguish retryable HTTP/transport failures and carry parsed Retry-After; do not change assets v1. Handle HTTP429/502/503/504 and transient fetch failures; do not continually retry 401/403/404, malformed routes/payloads or superseded generations. Existing generation refresh handles 409. Parse delta seconds and HTTP dates defensively. Never retry earlier than a valid Retry-After; excessively large values may suspend automatic attempts rather than overflow timers.

Use one bounded shared scheduler per asset connection for pending/retrying tiles, deduplicate shared tile owners, and release transfer/decode capacity while waiting. Exponential retry delay starts at one second and caps at 30 seconds with jitter, increased by any Retry-After. Continued visible demand may recover after a prolonged outage; concurrency and cadence, not an early fixed attempt exhaustion that strands tiles, bound retries. Observe connection-wide cooldown on 429 to prevent every queued tile immediately repeating the rejection. Fresh visible requests should not be starved by retries. Local decode-budget backpressure remains event-driven. Tile removal, navigation, hidden views, user/connection changes and aborts cancel waiting attempts and timers. Unavailable presentation stays truthful during recovery.

### Recent-view retention

Separate idle basemap cache lifetime from active network/viewer lifetime. Last-owner release cancels all pending and retrying work, releases subscriptions/network activity and drops private photos immediately. It may retain only fully decoded fresh basemap images, within the existing 32 MiB/128-entry active budget and an aggregate 32 MiB/128-entry idle budget; at most one retired connection cache is retained. Keep one bounded expiry timer, with idempotent URL/decode disposal. Preserve original HTTP freshness/age and no-store/no-cache handling; retaining images does not extend freshness. On return reacquire current authenticated metadata before adoption; discard on connection/user/entry/generation mismatch. A new connection/user must not adopt another identity's idle data; purge superseded retention. A cache clear during the idle interval must be observed by the next metadata handshake. No viewer, upstream request, subscription or polling timer is retained just to keep cache warm. Existing weather viewers retain their normal lifecycle.

## Implementation Plan

1. **(M) [serial] Paired streaming/cache implementation and regression tests.** One demanding worker owns both ends of retry/admission behavior so the HTTP semantics and frontend recovery stay aligned.
   - Owned files: `custom_components/aviadilo/assets.py`, `custom_components/aviadilo/service.py`, `custom_components/aviadilo/providers/osm.py`; new narrowly named asset-admission helper module if useful; `src/data/assets.ts`, new narrowly named asset-cache/retry helper modules if useful, `src/map/basemap.ts`; `tests/backend/test_assets.py`, `tests/backend/test_osm.py` (or the existing OSM test filename), new focused admission tests if needed; `tests/frontend/data/assets.test.ts`, existing basemap/fixture-asset tests as required; `tests/e2e/assets.spec.ts`, `dev/runtime.ts` only for synthetic fault controls. No broad unrelated refactors.
   - Worker verification: full lint, frontend/backend tests and package build. Parent runs offline browser and actual HA checks, reviews and commits the slice.
2. **(M) [serial] Packaged acceptance and prerelease delivery.** Orchestrator owns singleton environment and trivial version promotion.
   - Owned files: `scripts/check_release.py` required-module list, six package version files (`package.json`, `package-lock.json`, `pyproject.toml`, `uv.lock`, integration `const.py`/`manifest.json`), README/user guide/development notes, `docs/releases/0.2.1-dev.1.md`. Orchestrator-only continuity: this spec, ROOT addendum, PROJECT, task queue, DEFERRED and handoff. User TODO only marked done after user assessment.
   - Verify cold multi-browser same-user pressure, warm hits during miss saturation, injected temporary failures recovering without movement, cancellation while waiting, navigation cache reuse, idle generation clear, reconnect and regular/read-only photo safety. Use synthetic upstream only for automated pan/zoom/load tests. Run full make check; package and actual HACS upgrade from stable; native multi-context resource/idle checks; remote native/HACS/hassfest; public ZIP equality and actual published-metadata/bytes HACS install. Normal Latest remains 0.2.0.

## Open Questions

None blocking. The optional question about whether household kiosks share one login remains unanswered; acceptance covers shared and distinct users regardless.

## Deferred / Follow-ups

- Persistent browser storage, provider changes and upstream pacing changes: consider only after measuring this repair. Existing server disk and browser HTTP caching remain supported.
- Existing aircraft-warning and general weather-client remount questions remain separate.

## Change Log

- 2026-09-09 — Implementation complete with paired gateway/retry/retention tests and coherent0.2.1-dev.1 packaging. Parent full gates pass427frontend/576backend/40browser scenarios. Native baseline defects reproduced; repaired gateway, retry and navigation checks pass. Review also reproduced/fixed interrupted JSON error-stream cleanup and verified Retry-After in native Chromium. Final native multi-context/package/publication checks remain in progress.

- 2026-09-09 — Recorded the user-approved implementation sequence and bounded engineering choices. One serial paired worker; native acceptance and release remain orchestrator-owned. No new behavior is approved for stable promotion before prerelease assessment.
