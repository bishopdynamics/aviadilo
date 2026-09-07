"""Authenticated bounded PNG proxy, with trusted source registration.

Frame IDs are query values, never path components. This first transport rejects
all upstream redirects; adapters must register exact HTTPS hosts and products.
"""

import asyncio
import json
import math
import re
import struct
import time
import zlib
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from aiohttp import web
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.http import KEY_HASS, HomeAssistantView
from yarl import URL

from .cache import Entry, FetchResult
from .const import DOMAIN
from .models import Viewport
from .scheduler import ProviderBlocked, ProviderError, QueueFull

if TYPE_CHECKING:
    from .service import AviadiloService, Viewer

TILE_TIMEOUT_SECONDS = 120
MAX_TILE_BYTES = 2 * 1024 * 1024
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


@dataclass(frozen=True)
class Tile:
    provider: str
    product: str
    frame: str
    z: int
    x: int
    y: int
    size: int
    style: str

    @property
    def key(self) -> str:
        return json.dumps(
            [
                "radar-v1",
                self.provider,
                self.product,
                self.frame,
                self.style,
                self.z,
                self.x,
                self.y,
                self.size,
            ],
            separators=(",", ":"),
        )


@dataclass(frozen=True)
class TileSource:
    """Trusted adapter maps advertised opaque identities to exact upstream URLs.

    Resolver performs no IO. Gateway owns every request/retry/cache revalidation.
    No user-controlled host, credentials, URL, or arbitrary provider is accepted.
    """

    hosts: frozenset[str]
    products: frozenset[str]
    resolve: Callable[[Tile], str]
    sizes: frozenset[int] = frozenset({256})
    styles: frozenset[str] = frozenset({"default"})


@dataclass
class TileJob:
    tile: Tile
    audiences: dict[object, tuple[tuple[str, Viewer], ...]] = field(default_factory=dict)
    task: asyncio.Task[Entry] | None = None


class UpstreamRejected(ValueError):
    """Trusted source returned an unsafe URL or invalid image response."""


class TileRejected(ValueError):
    """A malformed, unavailable or no-longer-demanded tile."""


def validate_png(payload: bytes, size: int) -> None:
    """Check bounded dimensions, chunk structure/CRCs, and complete PNG framing."""
    if len(payload) > MAX_TILE_BYTES or not payload.startswith(PNG_SIGNATURE):
        raise UpstreamRejected("Invalid PNG response")
    offset, seen_header, seen_data, ended = 8, False, False, False
    while offset + 12 <= len(payload):
        length = int.from_bytes(payload[offset : offset + 4], "big")
        kind = payload[offset + 4 : offset + 8]
        end = offset + 12 + length
        if end > len(payload):
            raise UpstreamRejected("Truncated PNG response")
        data = payload[offset + 8 : end - 4]
        if zlib.crc32(kind + data) != int.from_bytes(payload[end - 4 : end], "big"):
            raise UpstreamRejected("Invalid PNG checksum")
        if not seen_header:
            if kind != b"IHDR" or length != 13:
                raise UpstreamRejected("Invalid PNG header")
            width, height = struct.unpack(">II", data[:8])
            if width != size or height != size:
                raise UpstreamRejected("Unexpected PNG dimensions")
            seen_header = True
        elif kind == b"IHDR":
            raise UpstreamRejected("Duplicate PNG header")
        if kind == b"IDAT":
            seen_data = True
        if kind == b"IEND":
            ended = length == 0 and end == len(payload)
            break
        offset = end
    if not ended or not seen_data:
        raise UpstreamRejected("Incomplete PNG response")


def intersects(tile: Tile, viewport: Viewport) -> bool:
    count = 2**tile.z
    west, east = tile.x / count * 360 - 180, (tile.x + 1) / count * 360 - 180
    north = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * tile.y / count))))
    south = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (tile.y + 1) / count))))
    longitude = (
        east >= viewport["west"] and west <= viewport["east"]
        if viewport["west"] <= viewport["east"]
        else east >= viewport["west"] or west <= viewport["east"]
    )
    return longitude and north >= viewport["south"] and south <= viewport["north"]


class TileGateway:
    def __init__(self, service: AviadiloService) -> None:
        self.service = service
        self.sources: dict[str, TileSource] = {}
        self.jobs: dict[str, TileJob] = {}
        self.users: dict[str, int] = {}

    def register(self, provider: str, source: TileSource) -> None:
        if provider not in ("rainviewer", "noaa_mrms", "noaa_ksox") or provider in self.sources:
            raise ValueError("Invalid or duplicate radar source")
        if not source.hosts or not source.products or not source.sizes <= {256, 512}:
            raise ValueError("Source requires explicit hosts, products and bounded sizes")
        self.sources[provider] = source

    def advertised(self, tile: Tile) -> bool:
        source = self.sources.get(tile.provider)
        manifest = self.service.snapshots.get(self.service._snapshot_key(tile.provider, None))
        return bool(
            source
            and manifest
            and tile.product in source.products
            and tile.product == manifest["product"]
            and tile.size in source.sizes
            and tile.style in source.styles
            and 0 <= tile.z <= manifest["native_max_zoom"]
            and 0 <= tile.x < 2**tile.z
            and 0 <= tile.y < 2**tile.z
            and any(frame["id"] == tile.frame for frame in manifest["frames"])
        )

    def current(self, job: TileJob) -> bool:
        return (
            not self.service.closed
            and self.advertised(job.tile)
            and any(
                self.service.viewers.get(key) is viewer
                and key in self.service.leases
                and self.service.leases[key].expires > self.service.clock()
                for audience in job.audiences.values()
                for key, viewer in audience
            )
        )

    def reconcile(self) -> None:
        for job in list(self.jobs.values()):
            if job.task and not self.current(job):
                job.task.cancel()
                # Cache.fetch shields its producer. Cancel its owned work too when
                # this gateway has no remaining demand; no other caller uses this key.
                if task := self.service.cache.inflight.get(job.tile.key):
                    task.cancel()

    async def get(self, user: str, tile: Tile, subscription: int, revision: int) -> Entry:
        self.service.reconcile()
        if not self.advertised(tile):
            raise TileRejected("Tile is not currently advertised")
        audience = tuple(
            (key, viewer)
            for key, viewer in self.service.viewers.items()
            if viewer.user_id == user
            and viewer.subscription_id == subscription
            and viewer.revision == revision
            and viewer.demand.radar == tile.provider
            and intersects(tile, viewer.viewport)
        )
        if not audience:
            raise TileRejected("No active viewer demand for this tile")
        if self.users.get(user, 0) >= 8 or sum(self.users.values()) >= 32:
            raise QueueFull("Tile request limit reached")
        self.users[user] = self.users.get(user, 0) + 1
        token = object()
        job: TileJob | None = None
        try:
            async with asyncio.timeout(TILE_TIMEOUT_SECONDS):
                while True:
                    job = self.jobs.get(tile.key)
                    if job and job.task and (job.task.cancelling() or job.task.cancelled()):
                        # A new revision can arrive before the old HTTP waiter's
                        # finally block finishes. Drain its exact cache producer
                        # before joining/creating replacement work for this key.
                        pending = self.service.cache.inflight.get(tile.key)
                        await asyncio.gather(job.task, return_exceptions=True)
                        if pending:
                            await asyncio.gather(pending, return_exceptions=True)
                        if self.jobs.get(tile.key) is job:
                            del self.jobs[tile.key]
                        continue
                    if job is None:
                        job = TileJob(tile)
                        self.jobs[tile.key] = job
                    job.audiences[token] = audience
                    if not self.current(job):
                        raise TileRejected("Viewer changed while queuing tile")
                    if job.task is None:
                        job.task = asyncio.create_task(self._get(job))
                    result = await asyncio.shield(job.task)
                    if not self.current(job) or not any(
                        self.service.viewers.get(k) is v for k, v in audience
                    ):
                        raise TileRejected("Viewer changed while fetching tile")
                    return result
        finally:
            if job:
                job.audiences.pop(token, None)
            self.users[user] -= 1
            if not self.users[user]:
                del self.users[user]
            self.reconcile()
            if job and not job.audiences and self.jobs.get(tile.key) is job:
                pending = self.service.cache.inflight.get(tile.key)
                if job.task:
                    await asyncio.gather(job.task, return_exceptions=True)
                if pending:
                    await asyncio.gather(pending, return_exceptions=True)
                if self.jobs.get(tile.key) is job and not job.audiences:
                    del self.jobs[tile.key]

    async def _get(self, job: TileJob) -> Entry:
        async def fetch(stale: Entry | None) -> FetchResult:
            async def upstream() -> FetchResult:
                if not self.current(job):
                    raise TileRejected("Tile demand ended")
                return await self._upstream(job.tile, stale)

            return await self.service.scheduler.request(job.tile.provider, job.tile.key, upstream)

        entry = await self.service.cache.fetch(job.tile.key, fetch)
        validate_png(entry.payload, job.tile.size)
        return entry

    async def _upstream(self, tile: Tile, stale: Entry | None) -> FetchResult:
        source = self.sources[tile.provider]
        url = URL(source.resolve(tile))
        if (
            url.scheme != "https"
            or url.host not in source.hosts
            or url.user is not None
            or url.password is not None
            or url.port != 443
            or url.fragment
        ):
            raise UpstreamRejected("Untrusted tile URL")
        async with self.service.session.get(
            url, headers=stale.validators if stale else {}, allow_redirects=False
        ) as response:
            if response.status not in (200, 304):
                if 300 <= response.status < 400:
                    raise UpstreamRejected("Tile redirects are not accepted")
                raise ProviderError(response.status, response.headers.get("Retry-After"))
            now = time.time()
            control = response.headers.get(
                "Cache-Control", stale.cache_control if response.status == 304 and stale else ""
            )
            expiry = now
            match = re.search(r'(?:^|,)\s*max-age="?(\d+)"?(?:,|$)', control, re.I)
            if match:
                expiry = now + min(86400, int(match[1]))
            age = response.headers.get("Age", "0")
            try:
                expiry = max(now, expiry - max(0, int(age)))
            except ValueError:
                expiry = now
            if response.status == 304:
                if stale is None:
                    raise UpstreamRejected("Unexpected cache revalidation")
                return FetchResult(
                    not_modified=True,
                    expires_at=expiry,
                    cache_control=control or stale.cache_control,
                )
            if response.content_type != "image/png":
                raise UpstreamRejected("Expected image/png")
            if response.content_length is not None and response.content_length > MAX_TILE_BYTES:
                raise UpstreamRejected("Tile response exceeds byte limit")
            data = bytearray()
            async for chunk in response.content.iter_chunked(65536):
                if len(data) + len(chunk) > MAX_TILE_BYTES:
                    raise UpstreamRejected("Tile response exceeds byte limit")
                data.extend(chunk)
            payload = bytes(data)
            validate_png(payload, tile.size)
            return FetchResult(
                entry=Entry(
                    tile.key,
                    tile.provider,
                    tile.product,
                    now,
                    expiry,
                    "image/png",
                    payload,
                    response.headers.get("ETag"),
                    response.headers.get("Last-Modified"),
                    control,
                )
            )

    async def close(self) -> None:
        for job in list(self.jobs.values()):
            if job.task:
                job.task.cancel()
        await asyncio.gather(
            *(job.task for job in self.jobs.values() if job.task), return_exceptions=True
        )
        self.sources.clear()


class RadarView(HomeAssistantView):
    url = "/api/aviadilo/radar"
    name = "api:aviadilo:radar"
    requires_auth = True

    async def get(self, request: web.Request) -> web.Response:
        query = request.query
        required = {
            "entry_id",
            "provider",
            "product",
            "frame",
            "z",
            "x",
            "y",
            "size",
            "style",
            "subscription_id",
            "revision",
            "schema_version",
        }
        if set(query) != required or len(query) != len(required):
            raise web.HTTPBadRequest(text="Invalid tile parameters")
        if any(len(value) > 256 for value in query.values()) or query["schema_version"] != "1":
            raise web.HTTPBadRequest(text="Invalid tile parameters or schema version")
        numbers = ("z", "x", "y", "size", "subscription_id", "revision")
        if any(not re.fullmatch(r"0|[1-9][0-9]{0,9}", query[key]) for key in numbers):
            raise web.HTTPBadRequest(text="Invalid tile coordinates")
        if (
            not 1 <= int(query["subscription_id"]) <= 2147483647
            or int(query["revision"]) > 2147483647
        ):
            raise web.HTTPBadRequest(text="Invalid viewer identity")
        service = request.app[KEY_HASS].data.get(DOMAIN)
        if not service or service.closed or service.entry_id != query["entry_id"]:
            raise web.HTTPNotFound(text="Aviadilo entry is unavailable")
        tile = Tile(
            query["provider"],
            query["product"],
            query["frame"],
            int(query["z"]),
            int(query["x"]),
            int(query["y"]),
            int(query["size"]),
            query["style"],
        )
        task = asyncio.create_task(
            service.tiles.get(
                request["hass_user"].id, tile, int(query["subscription_id"]), int(query["revision"])
            )
        )
        try:
            # HA/aiohttp may keep a handler alive after a browser abort. Explicitly
            # stop its bounded work so a canceled tile never becomes orphan demand.
            while not task.done():
                await asyncio.wait({task}, timeout=0.1)
                if request.transport is None or request.transport.is_closing():
                    raise asyncio.CancelledError
            entry = await task
            return web.Response(
                body=entry.payload, content_type="image/png", headers={"Cache-Control": "no-store"}
            )
        except TileRejected as error:
            raise web.HTTPBadRequest(text=str(error)) from error
        except QueueFull as error:
            raise web.HTTPTooManyRequests(text="Tile request limit reached") from error
        except (UpstreamRejected, ProviderBlocked, ProviderError, TimeoutError, OSError) as error:
            raise web.HTTPBadGateway(text="Radar source is unavailable") from error
        finally:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)


@callback
def register(hass: HomeAssistant) -> None:
    if not hass.data.get("aviadilo_http_registered"):
        hass.http.register_view(RadarView())
        hass.data["aviadilo_http_registered"] = True
