"""RainViewer past radar and shared bounded metadata transport (caller owns pacing).

Universal Blue (2), smoothing on, snow off; native z7, 256px tiles.
https://www.rainviewer.com/api/weather-maps-api.html
"""

import json
import math
import re
import time
from collections.abc import Callable
from dataclasses import replace
from datetime import UTC, datetime
from typing import Any, cast

from aiohttp import ClientError, ClientSession

from ..cache import Cache, Entry
from ..http import Tile, TileSource
from ..scheduler import ProviderError

MAX_METADATA_BYTES = 2 * 1024 * 1024
HOST = "https://tilecache.rainviewer.com"


def utc(value: Any) -> str:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError("Invalid timestamp")
    return datetime.fromtimestamp(value, UTC).isoformat().replace("+00:00", "Z")


def frame_path(value: Any) -> str:
    # Opaque identifiers remain untouched. Reject encodings, dot segments and
    # URL syntax rather than trying to sanitize a path into a different frame.
    if not isinstance(value, str) or not re.fullmatch(r"/v2/radar/[A-Za-z0-9_-]{1,180}", value):
        raise ValueError("Invalid radar frame path")
    return value


class MetadataProvider:
    provider: str
    product: str
    endpoint: str
    interval: int
    content_types: frozenset[str] = frozenset({"application/json"})

    def __init__(
        self, session: ClientSession, cache: Cache, *, clock: Callable[[], float] = time.time
    ) -> None:
        self.session, self.cache, self.clock = session, cache, clock

    def normalize(self, body: bytes, fetched: float) -> dict[str, Any]:
        raise NotImplementedError

    async def fetch(self) -> dict[str, Any]:
        """One service producer coalesces calls; never nest a scheduler request.

        Direct cache access keeps all network work inside the scheduler's
        cancellation boundary. Cache freshness does not change frame timestamps.
        """
        key = f"{self.provider}:{self.product}:manifest-v1"
        cached = await self.cache.get(key)
        if cached:
            return cast(dict[str, Any], json.loads(cached.payload))
        stale = await self.cache.get(key, stale=True)
        generation = self.cache.generation
        try:
            async with self.session.get(
                self.endpoint, headers=stale.validators if stale else {}, allow_redirects=False
            ) as response:
                if response.status not in (200, 304):
                    raise ProviderError(response.status, response.headers.get("Retry-After"))
                now = self.clock()
                control = response.headers.get(
                    "Cache-Control", stale.cache_control if stale and response.status == 304 else ""
                )
                match = re.search(r'(?:^|,)\s*max-age="?(\d+)"?(?:,|$)', control, re.I)
                try:
                    age = max(0, float(response.headers.get("Age", "0")))
                    if not math.isfinite(age):
                        raise ValueError
                except ValueError:
                    age = 86400
                expiry = now + max(0, min(self.interval, int(match[1])) - age) if match else now
                if response.status == 304:
                    if stale is None:
                        raise ProviderError(502)
                    entry = replace(
                        stale, expires_at=expiry, validated_at=now, cache_control=control
                    )
                else:
                    if response.content_type not in self.content_types or (
                        response.content_length is not None
                        and response.content_length > MAX_METADATA_BYTES
                    ):
                        raise ProviderError(502)
                    body = bytearray()
                    async for chunk in response.content.iter_chunked(65536):
                        if len(body) + len(chunk) > MAX_METADATA_BYTES:
                            raise ProviderError(502)
                        body.extend(chunk)
                    try:
                        result = self.normalize(bytes(body), now)
                    except (
                        ValueError,
                        TypeError,
                        KeyError,
                        OverflowError,
                        RecursionError,
                    ) as error:
                        raise ProviderError(502) from error
                    entry = Entry(
                        key,
                        self.provider,
                        self.product,
                        now,
                        expiry,
                        "application/json",
                        json.dumps(result, allow_nan=False).encode(),
                        response.headers.get("ETag"),
                        response.headers.get("Last-Modified"),
                        control,
                    )
                await self.cache.put(entry, generation=generation)
                return cast(dict[str, Any], json.loads(entry.payload))
        except ClientError as error:
            raise ProviderError(503) from error


class RainViewerProvider(MetadataProvider):
    provider = "rainviewer"
    product = "radar"
    endpoint = "https://api.rainviewer.com/public/weather-maps.json"
    interval = 300

    def normalize(self, body: bytes, fetched: float) -> dict[str, Any]:
        data = json.loads(body)
        if not isinstance(data, dict) or data.get("host") != HOST:
            raise ValueError("Untrusted RainViewer host")
        past = data["radar"]["past"]
        if not isinstance(past, list) or len(past) > 288:
            raise ValueError("Invalid past frames")
        frames = [{"id": frame_path(frame["path"]), "time": utc(frame["time"])} for frame in past]
        if len({frame["id"] for frame in frames}) != len(frames):
            raise ValueError("Duplicate frame")
        frames.sort(key=lambda frame: datetime.fromisoformat(frame["time"]))
        return {
            "kind": "radar-manifest",
            "provider": self.provider,
            "product": self.product,
            "generated_at": utc(data["generated"]),
            "frames": frames,
            "native_max_zoom": 7,
            "attribution": "RainViewer — https://www.rainviewer.com",
            "coverage": None,
        }

    def resolve(self, tile: Tile) -> str:
        if (
            tile.provider != self.provider
            or tile.product != self.product
            or tile.style != "default"
        ):
            raise ValueError("Invalid RainViewer product/style")
        return f"{HOST}{frame_path(tile.frame)}/{tile.size}/{tile.z}/{tile.x}/{tile.y}/2/1_0.png"

    def tile_source(self) -> TileSource:
        return TileSource(
            frozenset({"tilecache.rainviewer.com"}), frozenset({self.product}), self.resolve
        )
