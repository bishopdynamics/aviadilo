"""Real authenticated HA route, injected upstream responses; no provider calls."""

import asyncio
import struct
import time
import zlib
from collections.abc import AsyncIterator
from typing import Any
from urllib.parse import urlencode

import pytest
from aiohttp.test_utils import TestClient
from homeassistant.core import HomeAssistant

from custom_components.aviadilo.cache import Entry
from custom_components.aviadilo.const import DOMAIN
from custom_components.aviadilo.http import (
    MAX_TILE_BYTES,
    Tile,
    TileSource,
    UpstreamRejected,
    validate_png,
)
from custom_components.aviadilo.service import AviadiloService
from tests.backend.test_websocket import fixture, socket, subscribe


def png(size: int = 256) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
        )

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress((b"\0" + b"\xff\0\0\xff" * size) * size))
        + chunk(b"IEND", b"")
    )


class Response:
    def __init__(
        self,
        payload: bytes | None = None,
        *,
        status: int = 200,
        headers: dict[str, str] | None = None,
        content_type: str = "image/png",
        gate: asyncio.Event | None = None,
        length: int | None = None,
    ):
        self.payload = png() if payload is None else payload
        self.status, self.content_type = status, content_type
        self.headers = (
            headers if headers is not None else {"Cache-Control": "max-age=3600", "ETag": '"frame"'}
        )
        self.content_length = length
        self.content = self
        self.gate = gate

    async def __aenter__(self) -> Response:
        return self

    async def __aexit__(self, *args: Any) -> None:
        pass

    async def iter_chunked(self, count: int) -> AsyncIterator[bytes]:
        if self.gate:
            await self.gate.wait()
        for offset in range(0, len(self.payload), count):
            yield self.payload[offset : offset + count]


async def setup_radar(
    hass: HomeAssistant, transport: tuple[TestClient[Any, Any], str]
) -> tuple[Any, dict[str, str]]:
    service = hass.data[DOMAIN]
    ws = await socket(transport)
    selected = subscribe(service)
    selected["layers"]["radar"] = True
    await ws.send_json(selected)
    await ws.receive_json()
    await ws.receive_json()
    service.tiles.register(
        "rainviewer",
        TileSource(
            frozenset({"tiles.example"}),
            frozenset({"radar"}),
            lambda tile: "https://tiles.example/tile.png",
        ),
    )
    payload = fixture("radar")
    # Opaque data includes slash/dot/percent/query/unicode: it remains one value.
    payload["frames"][0]["id"] = "../opaque/%2F?x=1&snow=雪"
    for field in ("schema_version", "subscription_id", "revision"):
        del payload[field]
    assert service.publish(service.capture("rainviewer"), payload)
    await ws.receive_json()
    return ws, {
        "schema_version": "1",
        "entry_id": service.entry_id,
        "provider": "rainviewer",
        "product": "radar",
        "frame": payload["frames"][0]["id"],
        "z": "0",
        "x": "0",
        "y": "0",
        "size": "256",
        "style": "default",
        "subscription_id": "1",
        "revision": "0",
    }


def route(query: dict[str, str]) -> str:
    return "/api/aviadilo/radar?" + urlencode(query)


def intercept(
    monkeypatch: pytest.MonkeyPatch, service: AviadiloService, responses: list[Response]
) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []

    def get(url: Any, **kwargs: Any) -> Response:
        calls.append({"url": str(url), **kwargs})
        return responses[min(len(calls) - 1, len(responses) - 1)]

    monkeypatch.setattr(service.session, "get", get)
    return calls


async def test_authenticated_opaque_cached_and_coalesced(
    hass: HomeAssistant,
    transport: tuple[TestClient[Any, Any], str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ws, query = await setup_radar(hass, transport)
    client, token = transport
    gate = asyncio.Event()
    calls = intercept(monkeypatch, hass.data[DOMAIN], [Response(gate=gate)])
    response = await client.get(route(query))
    assert response.status == 401 and not calls
    response = await client.get(route(query), headers={"Authorization": "Bearer invalid"})
    assert response.status == 401 and not calls
    headers = {"Authorization": f"Bearer {token}"}
    a = asyncio.create_task(client.get(route(query), headers=headers))
    b = asyncio.create_task(client.get(route(query), headers=headers))
    for _ in range(100):
        await asyncio.sleep(0.001)
        if calls:
            break
    assert len(calls) == 1
    gate.set()
    first, second = await asyncio.gather(a, b)
    assert first.status == second.status == 200
    assert await first.read() == await second.read() == png()
    assert first.headers["Cache-Control"] == "no-store"
    assert calls[0]["allow_redirects"] is False
    again = await client.get(route(query), headers=headers)
    assert again.status == 200 and len(calls) == 1
    await ws.close()


@pytest.mark.parametrize(
    "patch",
    [
        {"provider": "other"},
        {"product": "other"},
        {"frame": "not-advertised"},
        {"z": "8"},
        {"z": "9999999999"},
        {"x": "1"},
        {"y": "-1"},
        {"size": "8192"},
        {"style": "arbitrary"},
        {"url": "https://evil.example"},
        {"schema_version": "2"},
        {"revision": "1"},
        {"subscription_id": "0"},
    ],
)
async def test_parameters_rejected_before_provider(
    hass: HomeAssistant,
    transport: tuple[TestClient[Any, Any], str],
    monkeypatch: pytest.MonkeyPatch,
    patch: dict[str, str],
) -> None:
    ws, query = await setup_radar(hass, transport)
    calls = intercept(monkeypatch, hass.data[DOMAIN], [Response()])
    response = await transport[0].get(
        route({**query, **patch}), headers={"Authorization": f"Bearer {transport[1]}"}
    )
    assert response.status == 400 and not calls
    await ws.close()


@pytest.mark.parametrize(
    "response",
    [
        Response(b"not png"),
        Response(status=302),
        Response(content_type="text/html"),
        Response(length=MAX_TILE_BYTES + 1),
        Response(b"x" * (MAX_TILE_BYTES + 1)),
        Response(png(512)),
    ],
)
async def test_upstream_rejections_are_gateway_errors(
    hass: HomeAssistant,
    transport: tuple[TestClient[Any, Any], str],
    monkeypatch: pytest.MonkeyPatch,
    response: Response,
) -> None:
    ws, query = await setup_radar(hass, transport)
    intercept(monkeypatch, hass.data[DOMAIN], [response])
    result = await transport[0].get(
        route(query), headers={"Authorization": f"Bearer {transport[1]}"}
    )
    assert result.status == 502
    assert not hass.data[DOMAIN].tiles.users
    assert not hass.data[DOMAIN].cache.index
    await ws.close()


@pytest.mark.parametrize(
    "url",
    [
        "http://tiles.example/image.png",
        "https://evil.example/image.png",
        "https://user:password@tiles.example/image.png",
        "https://tiles.example:444/image.png",
        "https://tiles.example/image.png#fragment",
    ],
)
async def test_untrusted_resolver_url_rejected_before_io(
    hass: HomeAssistant,
    transport: tuple[TestClient[Any, Any], str],
    monkeypatch: pytest.MonkeyPatch,
    url: str,
) -> None:
    ws, query = await setup_radar(hass, transport)
    service = hass.data[DOMAIN]
    service.tiles.sources["rainviewer"] = TileSource(
        frozenset({"tiles.example"}), frozenset({"radar"}), lambda tile: url
    )
    calls = intercept(monkeypatch, service, [Response()])
    result = await transport[0].get(
        route(query), headers={"Authorization": f"Bearer {transport[1]}"}
    )
    assert result.status == 502 and not calls
    await ws.close()


async def test_304_inherits_cache_policy_and_validators(
    hass: HomeAssistant,
    transport: tuple[TestClient[Any, Any], str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ws, query = await setup_radar(hass, transport)
    service = hass.data[DOMAIN]
    tile = Tile("rainviewer", "radar", query["frame"], 0, 0, 0, 256, "default")
    observed = time.time() - 4000
    await service.cache.put(
        Entry(
            tile.key,
            tile.provider,
            tile.product,
            observed,
            observed + 3600,
            "image/png",
            png(),
            etag='"frame"',
            cache_control="max-age=3600",
        )
    )
    calls = intercept(monkeypatch, service, [Response(status=304, headers={})])
    headers = {"Authorization": f"Bearer {transport[1]}"}
    result = await transport[0].get(route(query), headers=headers)
    assert result.status == 200
    assert calls[0]["headers"] == {"If-None-Match": '"frame"'}
    cached = await service.cache.get(tile.key)
    assert cached is not None and cached.fetched_at == observed and cached.expires_at > time.time()
    result = await transport[0].get(route(query), headers=headers)
    assert result.status == 200 and len(calls) == 1
    await ws.close()


async def test_source_edit_cancels_inflight_and_releases_users(
    hass: HomeAssistant,
    transport: tuple[TestClient[Any, Any], str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ws, query = await setup_radar(hass, transport)
    service = hass.data[DOMAIN]
    gate = asyncio.Event()
    calls = intercept(monkeypatch, service, [Response(gate=gate)])
    user = next(iter(service.viewers.values())).user_id
    tile = Tile("rainviewer", "radar", query["frame"], 0, 0, 0, 256, "default")
    request = asyncio.create_task(service.tiles.get(user, tile, 1, 0))
    for _ in range(100):
        await asyncio.sleep(0.001)
        if calls:
            break
    selected = {
        **subscribe(service, 2, 1),
        "type": "aviadilo/update_subscription",
        "subscription_id": 1,
    }
    selected["radar_provider"] = "noaa_mrms"
    await ws.send_json(selected)
    await ws.receive_json()
    await ws.receive_json()
    with pytest.raises(asyncio.CancelledError):
        await request
    assert not service.tiles.users and not service.tiles.jobs and not service.cache.inflight
    await ws.close()


async def test_per_user_bound_and_cancellation(
    hass: HomeAssistant,
    transport: tuple[TestClient[Any, Any], str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from custom_components.aviadilo.scheduler import QueueFull

    ws, query = await setup_radar(hass, transport)
    service = hass.data[DOMAIN]
    calls = intercept(monkeypatch, service, [Response(gate=asyncio.Event())])
    user = next(iter(service.viewers.values())).user_id
    tile = Tile("rainviewer", "radar", query["frame"], 0, 0, 0, 256, "default")
    requests = [asyncio.create_task(service.tiles.get(user, tile, 1, 0)) for _ in range(8)]
    for _ in range(100):
        await asyncio.sleep(0.001)
        if calls:
            break
    with pytest.raises(QueueFull):
        await service.tiles.get(user, tile, 1, 0)
    for request in requests:
        request.cancel()
    await asyncio.gather(*requests, return_exceptions=True)
    assert not service.tiles.users and not service.tiles.jobs and not service.cache.inflight
    await ws.close()


def test_png_crc_and_structure() -> None:
    validate_png(png(), 256)
    for invalid in (png()[:-1], png() + b"trailing", png()[:40] + b"corruption" + png()[40:]):
        with pytest.raises(UpstreamRejected):
            validate_png(invalid, 256)


async def test_transient_failures_have_total_deadline_and_keep_cooldown(
    hass: HomeAssistant,
    transport: tuple[TestClient[Any, Any], str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from custom_components.aviadilo import http

    ws, query = await setup_radar(hass, transport)
    service = hass.data[DOMAIN]
    monkeypatch.setattr(http, "TILE_TIMEOUT_SECONDS", 0.03)
    now = service.clock()

    async def sleep(delay: float) -> None:
        nonlocal now
        now += delay
        await asyncio.sleep(0)

    service.scheduler.clock = lambda: now
    service.scheduler.sleep = sleep
    calls = intercept(monkeypatch, service, [Response(status=500)])
    result = await transport[0].get(
        route(query), headers={"Authorization": f"Bearer {transport[1]}"}
    )
    assert result.status == 502 and len(calls) > 1
    assert service.scheduler.buckets["rainviewer"].cooldown > 0
    assert not service.tiles.users and not service.tiles.jobs and not service.cache.inflight
    await ws.close()


async def test_new_revision_waits_for_canceled_same_key_work(
    hass: HomeAssistant,
    transport: tuple[TestClient[Any, Any], str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from dataclasses import replace

    ws, query = await setup_radar(hass, transport)
    service = hass.data[DOMAIN]
    first_started, drain = asyncio.Event(), asyncio.Event()

    class SlowCancel(Response):
        async def iter_chunked(self, count: int) -> AsyncIterator[bytes]:
            first_started.set()
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                await drain.wait()
                raise
            yield b""

    calls = intercept(monkeypatch, service, [SlowCancel(), Response()])
    lease_id, viewer = next(iter(service.viewers.items()))
    tile = Tile("rainviewer", "radar", query["frame"], 0, 0, 0, 256, "default")
    old = asyncio.create_task(service.tiles.get(viewer.user_id, tile, 1, 0))
    await first_started.wait()
    service.watch(lease_id, replace(viewer, revision=1))
    new = asyncio.create_task(service.tiles.get(viewer.user_id, tile, 1, 1))
    await asyncio.sleep(0)
    drain.set()
    service.scheduler.buckets["rainviewer"].next_start = 0
    with pytest.raises(asyncio.CancelledError):
        await old
    result = await new
    assert result.payload == png() and len(calls) == 2
    assert not service.tiles.users and not service.tiles.jobs
    await ws.close()
