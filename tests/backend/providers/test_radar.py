"""Frozen-shape radar metadata, trusted resolvers, cache and shared lifecycle."""

import asyncio
import json
import time
from collections.abc import AsyncIterator
from copy import deepcopy
from pathlib import Path
from typing import Any, cast
from urllib.parse import parse_qs, urlsplit

import pytest
from aiohttp import ClientSession
from homeassistant.core import HomeAssistant

from custom_components.aviadilo.cache import Cache
from custom_components.aviadilo.const import DEFAULTS
from custom_components.aviadilo.http import Tile
from custom_components.aviadilo.models import Viewport
from custom_components.aviadilo.providers.noaa_ksox import NoaaKsoxProvider
from custom_components.aviadilo.providers.noaa_mrms import NoaaMrmsProvider, mercator_bbox
from custom_components.aviadilo.providers.rainviewer import MAX_METADATA_BYTES, RainViewerProvider
from custom_components.aviadilo.scheduler import ProviderError
from custom_components.aviadilo.service import AviadiloService, Demand, Viewer
from custom_components.aviadilo.websocket import validate_event

SPIKE = Path(__file__).resolve().parents[3] / "docs/spikes/claremont-weather/cache"
NOW = time.time()
VIEW: Viewport = {"south": 33.0, "north": 35.0, "west": -119.0, "east": -116.0, "zoom": 7.0}


def raw(name: str = "rainviewer-manifest.json") -> bytes:
    return (SPIKE / name).read_bytes()


def normalized(adapter: Any, body: bytes) -> dict[str, Any]:
    result = adapter.normalize(body, NOW)
    validate_event({**result, "schema_version": 1, "subscription_id": 1, "revision": 0})
    return cast(dict[str, Any], result)


class Response:
    def __init__(
        self, body: bytes = b"", status: int = 200, headers: dict[str, str] | None = None
    ) -> None:
        self.raw, self.status, self.headers = body, status, headers or {}
        self.content_type = "application/json"
        self.content_length: int | None = len(body)
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
        for i in range(0, len(self.raw), size):
            yield self.raw[i : i + size]


class Session:
    def __init__(self, *responses: Response) -> None:
        self.responses = list(responses)
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def get(self, url: str, **kwargs: Any) -> Response:
        self.calls.append((url, kwargs))
        assert self.responses, "Unexpected upstream request"
        return self.responses.pop(0)


def provider(tmp_path: Path) -> RainViewerProvider:
    return RainViewerProvider(cast(ClientSession, Session()), Cache(tmp_path))


def test_rainviewer_opaque_past_only_and_empty(tmp_path: Path) -> None:
    adapter = provider(tmp_path)
    data = json.loads(raw())
    data["radar"]["nowcast"] = [{"path": "evil", "time": 1}]
    result = normalized(adapter, json.dumps(data).encode())
    assert len(result["frames"]) == 13
    assert result["frames"][0]["id"] == data["radar"]["past"][0]["path"]
    assert result["native_max_zoom"] == 7 and result["coverage"] is None
    tile = Tile("rainviewer", "radar", result["frames"][0]["id"], 7, 1, 2, 256, "default")
    assert (
        adapter.resolve(tile) == f"https://tilecache.rainviewer.com{tile.frame}/256/7/1/2/2/1_0.png"
    )
    assert str(data["radar"]["past"][0]["time"]) not in adapter.resolve(tile)
    data["radar"]["past"] = []
    assert normalized(adapter, json.dumps(data).encode())["frames"] == []


@pytest.mark.parametrize(
    "host",
    [
        "http://tilecache.rainviewer.com",
        "https://evil.example",
        "https://tilecache.rainviewer.com/",
        "https://u@tilecache.rainviewer.com",
        "https://tilecache.rainviewer.com:443",
    ],
)
def test_reject_hosts(tmp_path: Path, host: str) -> None:
    data = json.loads(raw())
    data["host"] = host
    with pytest.raises(ValueError):
        provider(tmp_path).normalize(json.dumps(data).encode(), NOW)


@pytest.mark.parametrize(
    "path",
    [
        "/v2/radar/../foo",
        "/v2/radar/%2e%2e",
        "/v2/radar/foo?x=1",
        "https://evil.example/x",
        "/v2/radar/foo#hash",
        "/v2/radar/foo\\bar",
        "//evil.example",
    ],
)
def test_reject_unsafe_paths(tmp_path: Path, path: str) -> None:
    data = json.loads(raw())
    data["radar"]["past"][0]["path"] = path
    with pytest.raises(ValueError):
        provider(tmp_path).normalize(json.dumps(data).encode(), NOW)


@pytest.mark.parametrize(
    "kind,file,count,zoom",
    [
        (NoaaMrmsProvider, "mrms-capabilities.xml", 60, 7),
        (NoaaKsoxProvider, "sox-capabilities.xml", 20, 9),
    ],
)
def test_noaa_explicit_times_envelope_style_bbox(
    tmp_path: Path, kind: Any, file: str, count: int, zoom: int
) -> None:
    adapter = kind(cast(ClientSession, Session()), Cache(tmp_path))
    result = normalized(adapter, raw(file))
    assert len(result["frames"]) == count
    assert result["native_max_zoom"] == zoom
    tile = Tile(
        adapter.provider, adapter.product, result["frames"][0]["id"], 2, 0, 1, 256, "default"
    )
    query = parse_qs(urlsplit(adapter.resolve(tile)).query)
    assert query["time"] == [tile.frame]
    assert query["layers"] == [adapter.product]
    assert query["styles"] == ["radar_reflectivity"]
    assert query["version"] == ["1.1.1"] and query["srs"] == ["EPSG:3857"]
    assert query["transparent"] == ["true"] and query["format"] == ["image/png"]
    assert list(map(float, query["bbox"][0].split(","))) == pytest.approx(mercator_bbox(tile))
    west, south, east, north = mercator_bbox(tile)
    assert west < east < 0 and south == 0 and north > 0
    assert result["coverage"]["bounds"]["south"] < result["coverage"]["bounds"]["north"]
    if kind is NoaaKsoxProvider:
        from datetime import datetime

        values = [datetime.fromisoformat(f["time"]).timestamp() for f in result["frames"]]
        assert len({b - a for a, b in zip(values, values[1:], strict=False)}) > 1


@pytest.mark.parametrize(
    "body",
    [
        b'<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x/>',
        b"<x/>",
        b"<x",
        b"\xff\xfe<\x00!\x00D\x00O\x00C\x00T\x00Y\x00P\x00E\x00",
    ],
)
def test_noaa_hostile_or_missing(tmp_path: Path, body: bytes) -> None:
    adapter = NoaaMrmsProvider(cast(ClientSession, Session()), Cache(tmp_path))
    with pytest.raises(ValueError):
        adapter.normalize(body, NOW)


async def test_cache_304_preserves_generation_and_frame_times(tmp_path: Path) -> None:
    now = [NOW]
    cache = Cache(tmp_path, clock=lambda: now[0])
    await cache.start()
    session = Session(
        Response(raw(), headers={"Cache-Control": "max-age=300", "ETag": '"one"'}),
        Response(status=304),
    )
    adapter = RainViewerProvider(cast(ClientSession, session), cache, clock=lambda: now[0])
    try:
        first = await adapter.fetch()
        assert await adapter.fetch() == first and len(session.calls) == 1
        now[0] += 301
        assert await adapter.fetch() == first and len(session.calls) == 2
        assert session.calls[-1][1] == {
            "headers": {"If-None-Match": '"one"'},
            "allow_redirects": False,
        }
        assert await adapter.fetch() == first and len(session.calls) == 2
    finally:
        await cache.close()


@pytest.mark.parametrize(
    "failure", ["oversize", "stream", "content-type", "redirect", "invalid-json", "304"]
)
async def test_bounded_transport_rejects(tmp_path: Path, failure: str) -> None:
    response = Response(raw())
    if failure == "oversize":
        response.content_length = MAX_METADATA_BYTES + 1
    elif failure == "stream":
        response.content_length = None
        response.raw = b" " * (MAX_METADATA_BYTES + 1)
    elif failure == "content-type":
        response.content_type = "text/html"
    elif failure == "redirect":
        response.status = 302
    elif failure == "invalid-json":
        response.raw = b"{"
    else:
        response.status = 304
    cache = Cache(tmp_path)
    await cache.start()
    try:
        with pytest.raises(ProviderError):
            await RainViewerProvider(cast(ClientSession, Session(response)), cache).fetch()
        assert response.closed
    finally:
        await cache.close()


async def eventually(check: Any) -> None:
    for _ in range(100):
        if check():
            return
        await asyncio.sleep(0.005)
    assert check()


async def test_registration_shared_fetch_late_revision_replay_cancel(hass: HomeAssistant) -> None:
    response = Response(raw(), headers={"Cache-Control": "max-age=300"})
    response.gate = asyncio.Event()
    session = Session(response)
    service = AviadiloService(hass, deepcopy(DEFAULTS))
    service.session = cast(ClientSession, session)
    await service.start()
    messages: list[dict[str, Any]] = []
    old: list[dict[str, Any]] = []
    try:
        assert service.info()["capabilities"]["radar"] == ["rainviewer", "noaa_mrms", "noaa_ksox"]
        assert not session.calls and not service.tasks
        viewer = Viewer(1, 0, "user", Demand(radar="rainviewer"), VIEW, old.append, lambda _: None)
        service.watch("a", viewer)
        await response.started.wait()
        replacement = Viewer(1, 1, "user", viewer.demand, VIEW, messages.append, lambda _: None)
        service.watch("a", replacement)
        service.watch(
            "b", Viewer(2, 0, "user", viewer.demand, VIEW, messages.append, lambda _: None)
        )
        response.gate.set()
        await eventually(lambda: any(e["kind"] == "radar-manifest" for e in messages))
        assert not any(e["kind"] == "radar-manifest" for e in old)
        manifests = [e for e in messages if e["kind"] == "radar-manifest"]
        assert {(e["subscription_id"], e["revision"]) for e in manifests} == {(1, 1), (2, 0)}
        assert len(session.calls) == 1
        assert len(service.scheduler.buckets["rainviewer"].starts) == 1
        service.initial("a")
        assert len(session.calls) == 1
        service.unsubscribe("a")
        service.unsubscribe("b")
        await eventually(lambda: not service.tasks)
        assert not service.scheduler.jobs and not service.tiles.jobs
    finally:
        await service.close()


async def test_last_viewer_cancels_metadata(hass: HomeAssistant) -> None:
    response = Response(raw())
    response.gate = asyncio.Event()
    service = AviadiloService(hass, deepcopy(DEFAULTS))
    service.session = cast(ClientSession, Session(response))
    await service.start()
    try:
        service.watch(
            "a", Viewer(1, 0, "u", Demand(radar="rainviewer"), VIEW, lambda _: None, lambda _: None)
        )
        await response.started.wait()
        service.unsubscribe("a")
        await eventually(lambda: response.closed and not service.tasks)
        assert not service.snapshots and not service.cache.inflight
    finally:
        await service.close()


async def test_recent_metadata_old_frames_stale_and_empty_unavailable(hass: HomeAssistant) -> None:
    service = AviadiloService(hass, deepcopy(DEFAULTS))
    await service.start()
    try:
        viewer = Viewer(1, 0, "u", Demand(radar="noaa_mrms"), VIEW, lambda _: None, lambda _: None)
        # Install a demand without allowing a network scheduling turn.
        service.watch("a", viewer)
        adapter = NoaaMrmsProvider(cast(ClientSession, Session()), service.cache)
        payload = normalized(adapter, raw("mrms-capabilities.xml"))
        assert service.publish(service.capture("noaa_mrms"), payload)
        assert service.status_event(viewer)["statuses"][0]["state"] == "stale"
        payload["frames"] = []
        assert service.publish(service.capture("noaa_mrms"), payload)
        assert service.status_event(viewer)["statuses"][0]["state"] == "unavailable"
    finally:
        await service.close()


async def test_reopen_replays_without_premature_no_cache_poll(hass: HomeAssistant) -> None:
    session = Session(Response(raw(), headers={"Cache-Control": "no-cache"}))
    service = AviadiloService(hass, deepcopy(DEFAULTS))
    service.session = cast(ClientSession, session)
    await service.start()
    messages: list[dict[str, Any]] = []
    viewer = Viewer(1, 0, "u", Demand(radar="rainviewer"), VIEW, messages.append, lambda _: None)
    try:
        service.watch("a", viewer)
        await eventually(lambda: bool(service.snapshots))
        service.unsubscribe("a")
        await eventually(lambda: not service.tasks)
        service.watch("b", viewer)
        service.initial("b")
        await asyncio.sleep(0.01)
        assert len(session.calls) == 1
        assert len([event for event in messages if event["kind"] == "radar-manifest"]) == 2
        assert not service.scheduler.jobs
    finally:
        await service.close()


@pytest.mark.parametrize(
    "dimension", ["", "2026-09-07T00:00:00Z/2026-09-07T01:00:00Z/PT5M", "not-a-time"]
)
def test_noaa_empty_or_nonexplicit_dimension(tmp_path: Path, dimension: str) -> None:
    from xml.etree import ElementTree as ET

    root = ET.fromstring(raw("mrms-capabilities.xml"))
    for element in root.iter():
        element.tag = element.tag.rsplit("}", 1)[-1]
    layer = next(
        element for element in root.iter("Layer") if element.findtext("Name") == "conus_bref_qcd"
    )
    target = next(
        element for element in layer.findall("Dimension") if element.get("name") == "time"
    )
    target.text = dimension
    adapter = NoaaMrmsProvider(cast(ClientSession, Session()), Cache(tmp_path))
    if dimension:
        with pytest.raises(ValueError):
            normalized(adapter, ET.tostring(root))
    else:
        assert normalized(adapter, ET.tostring(root))["frames"] == []


async def test_noaa_metadata_and_tiles_share_one_paced_bucket(tmp_path: Path) -> None:
    from custom_components.aviadilo.scheduler import Scheduler

    clock = [0.0]
    starts: list[tuple[str, float]] = []

    async def sleep(seconds: float) -> None:
        clock[0] += seconds
        await asyncio.sleep(0)

    scheduler = Scheduler(DEFAULTS["provider_pacing"], clock=lambda: clock[0], sleep=sleep)
    cache = Cache(tmp_path)
    await cache.start()
    mrms, ksox = Response(raw("mrms-capabilities.xml")), Response(raw("sox-capabilities.xml"))
    mrms.content_type = ksox.content_type = "text/xml"
    session = Session(mrms, ksox)
    a, b = (
        NoaaMrmsProvider(cast(ClientSession, session), cache),
        NoaaKsoxProvider(cast(ClientSession, session), cache),
    )

    async def fetch(adapter: Any) -> Any:
        starts.append((adapter.provider, clock[0]))
        return await adapter.fetch()

    async def tile() -> str:
        starts.append(("tile", clock[0]))
        return "synthetic PNG transport"

    try:
        await asyncio.gather(
            scheduler.request(a.provider, "metadata", lambda: fetch(a)),
            scheduler.request(b.provider, "metadata", lambda: fetch(b)),
            scheduler.request(a.provider, "tile-xyz", tile),
        )
        assert [time for _, time in starts] == [0, 2, 4]
        assert list(scheduler.buckets["noaa"].starts) == [0, 2, 4]
        assert len(session.calls) == 2
    finally:
        await scheduler.close()
        await cache.close()
