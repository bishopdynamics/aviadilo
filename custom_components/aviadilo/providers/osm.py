"""Trusted, cache-first OSM Standard raster acquisition, shared across all viewers."""

import time
from collections.abc import Callable
from dataclasses import replace

from aiohttp import ClientError, ClientSession, ClientTimeout

from ..assets import AssetPayload, AssetRequest, validate_asset
from ..cache import Cache, Entry, FetchResult
from ..scheduler import ProviderError, Scheduler
from .asset_http import (
    USER_AGENT,
    InvalidAsset,
    directives,
    normalize,
    off_loop,
    policy_entry,
    read_image,
    stale_allowed,
)


class OsmProvider:
    def __init__(
        self,
        session: ClientSession,
        cache: Cache,
        scheduler: Scheduler,
        *,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.session, self.cache, self.scheduler, self.clock = session, cache, scheduler, clock
        self.counters = {
            "hits": 0,
            "misses": 0,
            "revalidations": 0,
            "stale": 0,
            "received_bytes": 0,
        }

    @staticmethod
    def key(request: AssetRequest) -> str:
        validate_asset(request.as_dict())
        if request.kind != "basemap":
            raise InvalidAsset("Invalid tile request")
        return f"basemap-v1/osm_standard/standard/{request.z}/{request.x}/{request.y}/256"

    async def fetch(self, request: AssetRequest, referer: str | None) -> AssetPayload:
        key = self.key(request)
        cached = await self.cache.get(key)
        if cached is not None:
            self.counters["hits"] += 1
            return self.payload(cached)
        self.counters["misses"] += 1

        async def fetch(stale: Entry | None) -> FetchResult:
            async def upstream() -> Entry:
                return await self.upstream(request, key, stale, referer)

            try:
                entry = await self.scheduler.request("osm_standard", key, upstream, retry=False)
            except (ProviderError, TimeoutError, OSError) as error:
                if isinstance(error, ProviderError) and error.status not in (500, 502, 503, 504):
                    raise
                if (
                    stale is not None
                    and stale_allowed(stale, self.clock())
                    and await self.cache.get(key, stale=True) is not None
                ):
                    self.counters["stale"] += 1
                    # Preserve every age/retention timestamp on failed refresh.
                    return FetchResult(entry=replace(stale, stale=True), store=False)
                raise
            return FetchResult(entry=entry)

        entry = await self.cache.fetch(key, fetch)
        return self.payload(entry)

    def payload(self, entry: Entry) -> AssetPayload:
        now = self.clock()
        age = max(
            0,
            entry.age_at_validation
            + now
            - (entry.validated_at if entry.validated_at is not None else entry.fetched_at),
        )
        policy = directives(entry.cache_control)
        return AssetPayload(
            entry.payload,
            max_age_s=min(
                int(entry.freshness_lifetime or 0),
                int(policy.get("max-age") or entry.freshness_lifetime or 0),
            ),
            no_store="no-store" in policy,
            no_cache="no-cache" in policy,
            must_revalidate="must-revalidate" in policy or "proxy-revalidate" in policy,
            age_s=min(2147483647, int(age)),
            last_modified=entry.last_modified,
            stale=entry.stale,
        )

    async def upstream(
        self, request: AssetRequest, key: str, stale: Entry | None, referer: str | None
    ) -> Entry:
        generation = self.cache.generation
        headers = {
            "User-Agent": USER_AGENT,
            "Accept-Encoding": "identity",
            **(stale.validators if stale else {}),
        }
        if referer:
            headers["Referer"] = referer
        try:
            async with self.session.get(
                f"https://tile.openstreetmap.org/{request.z}/{request.x}/{request.y}.png",
                headers=headers,
                allow_redirects=False,
                auto_decompress=False,
                timeout=ClientTimeout(total=25, connect=10, sock_read=10),
            ) as response:
                if response.status not in (200, 304):
                    raise ProviderError(response.status, response.headers.get("Retry-After"))
                now = self.clock()
                metadata = policy_entry(
                    response.headers,
                    now,
                    stale or Entry(key, "osm_standard", "standard", now, now, "image/png", b""),
                    fallback=604800,
                    shared=True,
                    revalidated=response.status == 304,
                )
                if "no-store" in metadata.cache_control:
                    await self.cache.discard(key, generation=generation)
                if response.status == 304:
                    if stale is None:
                        raise InvalidAsset("Unexpected revalidation")
                    self.counters["revalidations"] += 1
                    entry = stale
                else:
                    body = await read_image(response, {"image/png"})
                    self.counters["received_bytes"] += len(body)
                    payload = await off_loop(normalize, body, photo=False)
                    entry = Entry(key, "osm_standard", "standard", now, now, "image/png", payload)
                return policy_entry(
                    response.headers,
                    now,
                    entry,
                    fallback=604800,
                    shared=True,
                    revalidated=response.status == 304,
                )
        except ClientError:
            raise ProviderError(503) from None
