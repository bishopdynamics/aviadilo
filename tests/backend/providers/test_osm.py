"""Offline OSM HTTP, shared cache, lane bypass and persistent retention evidence."""

import asyncio
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any, cast

import pytest
from aiohttp import ClientSession

from custom_components.aviadilo.assets import AssetRequest
from custom_components.aviadilo.cache import Cache
from custom_components.aviadilo.const import DEFAULTS
from custom_components.aviadilo.providers.asset_http import InvalidAsset
from custom_components.aviadilo.providers.osm import OsmProvider
from custom_components.aviadilo.scheduler import ProviderError, Scheduler
from tests.backend.providers.test_asset_http import image_bytes


class Response:
    def __init__(
        self,
        headers: dict[str, str] | None = None,
        *,
        status: int = 200,
        body: bytes | None = None,
        content_type: str = "image/png",
    ) -> None:
        self.headers, self.status = headers or {}, status
        self.body = image_bytes() if body is None else body
        self.content_type = content_type
        self.content_length: int | None = len(self.body)
        self.content = self
        self.started = asyncio.Event()
        self.gate: asyncio.Event | None = None
        self.closed = False

    async def __aenter__(self) -> Response:
        self.started.set()
        return self

    async def __aexit__(self, *args: Any) -> None:
        self.closed = True

    async def iter_chunked(self, size: int) -> AsyncIterator[bytes]:
        if self.gate:
            await self.gate.wait()
        for start in range(0, len(self.body), size):
            yield self.body[start : start + size]


class Session:
    def __init__(self, *responses: Response) -> None:
        self.responses = list(responses)
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def get(self, url: str, **kwargs: Any) -> Response:
        self.calls.append((str(url), kwargs))
        assert self.responses, "Unexpected external request"
        return self.responses.pop(0)


REQUEST = AssetRequest("basemap", "0" * 32 + ":0", z=2, x=3, y=1)


@pytest.fixture
async def setup(tmp_path: Path) -> AsyncIterator[tuple[Cache, Scheduler]]:
    cache = Cache(tmp_path / "public", clock=lambda: 100)
    scheduler = Scheduler(DEFAULTS["provider_pacing"])
    await cache.start()
    yield cache, scheduler
    await scheduler.close()
    await cache.close()


async def test_cold_coalescing_fresh_hits_bypass_blocked_busy_cooldown(
    setup: tuple[Cache, Scheduler],
) -> None:
    cache, scheduler = setup
    response = Response({"Cache-Control": "max-age=1000"})
    response.gate = asyncio.Event()
    session = Session(response)
    osm = OsmProvider(cast(ClientSession, session), cache, scheduler, clock=lambda: 100)
    first = asyncio.create_task(osm.fetch(REQUEST, "https://ha.example/"))
    await response.started.wait()
    second = asyncio.create_task(osm.fetch(REQUEST, None))
    while sum(cache.waiters.values()) < 2:
        await asyncio.sleep(0)
    first.cancel()
    with pytest.raises(asyncio.CancelledError):
        await first
    response.gate.set()
    result = await second
    lane = scheduler.buckets["osm_standard"]
    lane.cooldown = scheduler.clock() + 10000
    lane.blocked = True
    await lane.lock.acquire()
    try:
        async with asyncio.timeout(1):
            replay = await osm.fetch(REQUEST, None)
        assert replay == result
    finally:
        lane.lock.release()
    assert len(session.calls) == 1
    url, opts = session.calls[0]
    assert url == "https://tile.openstreetmap.org/2/3/1.png"
    assert "github.com/bishopdynamics/aviadilo" in opts["headers"]["User-Agent"]
    assert opts["headers"]["Referer"] == "https://ha.example/"
    assert opts["headers"]["Accept-Encoding"] == "identity"
    assert opts["allow_redirects"] is False and opts["auto_decompress"] is False
    assert osm.counters["hits"] == 1


async def test_no_store_only_current_consumers_and_removes_old(
    setup: tuple[Cache, Scheduler],
) -> None:
    cache, scheduler = setup
    first_response = Response({"Cache-Control": "no-cache", "ETag": '"old"'})
    transient = Response({"Cache-Control": "no-store"})
    transient.gate = asyncio.Event()
    session = Session(first_response, transient, Response({"Cache-Control": "no-store"}))
    osm = OsmProvider(cast(ClientSession, session), cache, scheduler, clock=lambda: 100)
    await osm.fetch(REQUEST, None)
    assert await cache.get(osm.key(REQUEST), stale=True)
    scheduler.buckets["osm_standard"].next_start = 0
    pending = asyncio.create_task(osm.fetch(REQUEST, None))
    await transient.started.wait()
    other = asyncio.create_task(osm.fetch(REQUEST, None))
    while sum(cache.waiters.values()) < 2:
        await asyncio.sleep(0)
    transient.gate.set()
    assert (await pending).no_store and (await other).no_store
    assert await cache.get(osm.key(REQUEST), stale=True) is None
    assert len(session.calls) == 2
    scheduler.buckets["osm_standard"].next_start = 0
    assert (await osm.fetch(REQUEST, None)).no_store
    assert len(session.calls) == 3


async def test_304_revalidation_retention_and_restart(tmp_path: Path) -> None:
    now = 100.0
    cache = Cache(tmp_path / "public", clock=lambda: now)
    scheduler = Scheduler(DEFAULTS["provider_pacing"])
    await cache.start()
    session = Session(
        Response({"Cache-Control": "max-age=50", "ETag": '"v1"', "Age": "10"}),
        Response({"Cache-Control": "max-age=100", "ETag": '"v2"'}, status=304),
    )
    osm = OsmProvider(cast(ClientSession, session), cache, scheduler, clock=lambda: now)
    try:
        original = await osm.fetch(REQUEST, None)
        now = 140
        scheduler.buckets["osm_standard"].next_start = 0
        renewed = await osm.fetch(REQUEST, None)
        assert renewed.payload == original.payload
        assert session.calls[1][1]["headers"]["If-None-Match"] == '"v1"'
        assert osm.counters["revalidations"] == 1
        saved = await cache.get(osm.key(REQUEST), stale=True)
        assert saved and saved.fetched_at == 100 and saved.validated_at == 140
        await cache.close()
        cache = Cache(tmp_path / "public", clock=lambda: now)
        await cache.start()
        assert await cache.get(osm.key(REQUEST)) == saved
        now = 140 + 7776000 - 1
        assert await cache.get(osm.key(REQUEST), stale=True)
        now += 1
        assert await cache.get(osm.key(REQUEST), stale=True) is None
    finally:
        await cache.close()
        await scheduler.close()


@pytest.mark.parametrize(
    "control,stale",
    [
        ("max-age=0, stale-if-error=100", True),
        ("no-cache, stale-if-error=100", False),
        ("max-age=0, must-revalidate, stale-if-error=100", False),
    ],
)
async def test_stale_failure_preserves_age_and_retention(
    setup: tuple[Cache, Scheduler], control: str, stale: bool
) -> None:
    cache, scheduler = setup
    session = Session(Response({"Cache-Control": control, "Age": "20"}), Response(status=503))
    osm = OsmProvider(cast(ClientSession, session), cache, scheduler, clock=lambda: 100)
    await osm.fetch(REQUEST, None)
    before = await cache.get(osm.key(REQUEST), stale=True)
    scheduler.buckets["osm_standard"].next_start = 0
    if stale:
        result = await osm.fetch(REQUEST, None)
        assert result.stale and result.age_s == 20
    else:
        with pytest.raises(ProviderError):
            await osm.fetch(REQUEST, None)
    assert await cache.get(osm.key(REQUEST), stale=True) == before
    assert scheduler.buckets["osm_standard"].cooldown > scheduler.clock()


@pytest.mark.parametrize(
    "response",
    [
        Response(status=302),
        Response(content_type="text/html"),
        Response(body=b"invalid"),
        Response(body=image_bytes((512, 512))),
        Response(body=b"x" * (2 * 1024 * 1024 + 1)),
        Response({"Content-Encoding": "gzip"}),
        Response(status=304),
    ],
)
async def test_invalid_upstream_never_cached(
    setup: tuple[Cache, Scheduler], response: Response
) -> None:
    cache, scheduler = setup
    osm = OsmProvider(cast(ClientSession, Session(response)), cache, scheduler, clock=lambda: 100)
    with pytest.raises((InvalidAsset, ProviderError)):
        await osm.fetch(REQUEST, None)
    assert not cache.index


async def test_last_waiter_stops_running_download_and_preserves_slot(
    setup: tuple[Cache, Scheduler],
) -> None:
    cache, scheduler = setup
    response = Response()
    response.gate = asyncio.Event()
    osm = OsmProvider(cast(ClientSession, Session(response)), cache, scheduler, clock=lambda: 100)
    task = asyncio.create_task(osm.fetch(REQUEST, None))
    await response.started.wait()
    consumed = scheduler.buckets["osm_standard"].next_start
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert response.closed and not cache.inflight and not scheduler.jobs
    assert scheduler.buckets["osm_standard"].next_start == consumed
    assert not cache.index


@pytest.mark.parametrize("status", [401, 403, 404, 429])
async def test_stale_if_error_never_masks_missing_denied_or_throttled_resource(
    setup: tuple[Cache, Scheduler], status: int
) -> None:
    cache, scheduler = setup
    session = Session(
        Response({"Cache-Control": "max-age=0, stale-if-error=100"}), Response(status=status)
    )
    osm = OsmProvider(cast(ClientSession, session), cache, scheduler, clock=lambda: 100)
    await osm.fetch(REQUEST, None)
    scheduler.buckets["osm_standard"].next_start = 0
    with pytest.raises(ProviderError):
        await osm.fetch(REQUEST, None)
    assert not scheduler.buckets["osm_standard"].blocked
    assert osm.counters["stale"] == 0


async def test_no_store_invalid_refresh_also_removes_old_retention(
    setup: tuple[Cache, Scheduler],
) -> None:
    cache, scheduler = setup
    session = Session(
        Response({"Cache-Control": "no-cache"}),
        Response({"Cache-Control": "no-store"}, body=b"bad PNG"),
    )
    osm = OsmProvider(cast(ClientSession, session), cache, scheduler, clock=lambda: 100)
    await osm.fetch(REQUEST, None)
    assert await cache.get(osm.key(REQUEST), stale=True)
    scheduler.buckets["osm_standard"].next_start = 0
    with pytest.raises(InvalidAsset):
        await osm.fetch(REQUEST, None)
    assert await cache.get(osm.key(REQUEST), stale=True) is None


async def test_stream_byte_limit_without_content_length(setup: tuple[Cache, Scheduler]) -> None:
    cache, scheduler = setup
    response = Response(body=b"x" * (2 * 1024 * 1024 + 1))
    response.content_length = None
    osm = OsmProvider(cast(ClientSession, Session(response)), cache, scheduler, clock=lambda: 100)
    with pytest.raises(InvalidAsset):
        await osm.fetch(REQUEST, None)
    assert not cache.index
