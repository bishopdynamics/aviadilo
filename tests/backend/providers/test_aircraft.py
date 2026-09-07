"""Synthetic radius responses and real shared-service/cache lifecycle checks."""

import asyncio
import json
import time
from collections.abc import AsyncIterator
from copy import deepcopy
from pathlib import Path
from typing import Any, cast

import pytest
from aiohttp import ClientSession
from homeassistant.core import HomeAssistant

from custom_components.aviadilo.cache import Cache
from custom_components.aviadilo.const import DEFAULTS
from custom_components.aviadilo.models import CollectionArea
from custom_components.aviadilo.providers.adsb_fi import AdsbFiProvider
from custom_components.aviadilo.providers.adsb_lol import AdsbLolProvider
from custom_components.aviadilo.providers.base import MAX_BODY_BYTES, normalize
from custom_components.aviadilo.scheduler import ProviderError
from custom_components.aviadilo.service import AviadiloService, Demand, Viewer
from custom_components.aviadilo.websocket import validate_event

NOW = 1788782400.0
AREA: CollectionArea = {"latitude": 0, "longitude": 0, "radius_m": 50000}
RAW: dict[str, Any] = {
    "hex": "ABCDEF",
    "lat": 0,
    "lon": 0,
    "seen_pos": 0,
    "seen": 999,
    "alt_baro": 0,
    "gs": 0,
    "track": 0,
    "baro_rate": 0,
    "flight": " ZERO ",
    "squawk": "0000",
}


def payload(records: list[Any] | None = None, now: float = NOW) -> dict[str, Any]:
    return {
        "ac": [deepcopy(RAW)] if records is None else records,
        "now": now * 1000,
        "msg": "No error",
    }


class Response:
    def __init__(
        self, body: Any = None, status: int = 200, headers: dict[str, str] | None = None
    ) -> None:
        self.status = status
        self.headers = headers or {}
        self.content_type = "application/json"
        self.raw = json.dumps(payload() if body is None else body).encode()
        self.content_length: int | None = len(self.raw)
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
        for offset in range(0, len(self.raw), size):
            yield self.raw[offset : offset + size]


class Session:
    def __init__(self, *responses: Response) -> None:
        self.responses = list(responses)
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def get(self, url: str, **kwargs: Any) -> Response:
        self.calls.append((url, kwargs))
        assert self.responses, "Unexpected provider fetch"
        return self.responses.pop(0)


def validated(result: dict[str, Any]) -> dict[str, Any]:
    return validate_event(
        {"kind": "aircraft", "schema_version": 1, "subscription_id": 1, "revision": 0, **result}
    )


def test_normalization_zero_unknown_units_identity_and_duplicates() -> None:
    raw = payload(
        [
            RAW,
            {**RAW, "seen_pos": 20, "flight": "OLDER"},
            {
                "hex": "~ABCDEF",
                "lat": 0,
                "alt_baro": "ground",
                "true_heading": 90,
                "gs": 100,
                "geom_rate": -100,
            },
            {
                "hex": "000001",
                "lat": 1,
                "lon": 1,
                "seen": 0,
                "alt_geom": 1000,
                "flight": "<script>untrusted</script>",
            },
            {"hex": "bad"},
            None,
            {**RAW, "hex": "000002", "alt_baro": True, "gs": -1, "track": 360, "squawk": "9999"},
        ]
    )
    result = normalize(raw, "adsb_fi", NOW + 5)
    validated(cast(dict[str, Any], result))
    records = {r["id"]: r for r in result["aircraft"]}
    zero = records["adsb_fi:abcdef"]
    assert (
        zero["latitude"]
        == zero["longitude"]
        == zero["altitude_m"]
        == zero["speed_mps"]
        == zero["course_deg"]
        == 0
    )
    assert zero["position_age_s"] == 5 and zero["callsign"] == "ZERO" and zero["on_ground"] is False
    ground = records["adsb_fi:nonicao-abcdef"]
    assert ground["icao"] is None and ground["latitude"] is None and ground["longitude"] is None
    assert (
        ground["altitude_m"] is None
        and ground["on_ground"] is True
        and ground["course_deg"] is None
    )
    assert ground["speed_mps"] == pytest.approx(100 * 1852 / 3600)
    assert ground["vertical_rate_mps"] == pytest.approx(-0.508)
    unknown = records["adsb_fi:000001"]
    assert (
        unknown["altitude_m"] == 304.8
        and unknown["on_ground"] is None
        and unknown["position_age_s"] is None
    )
    invalid = records["adsb_fi:000002"]
    assert all(
        dict(invalid)[key] is None
        for key in ("altitude_m", "on_ground", "speed_mps", "course_deg", "squawk")
    )


@pytest.mark.parametrize(
    "body",
    [
        None,
        {},
        {"ac": {}},
        {"ac": [], "msg": "error"},
        {"ac": [], "error": "failed"},
        {"ac": [None] * 10001},
    ],
)
def test_rejects_malformed_snapshot(body: Any) -> None:
    with pytest.raises(ProviderError):
        normalize(body, "adsb_fi", NOW)


def test_seconds_timestamp_http_age_unknown_position_age_and_empty_success() -> None:
    assert (
        normalize({"aircraft": [RAW], "now": NOW}, "adsb_lol", NOW + 2, 10)["aircraft"][0][
            "position_age_s"
        ]
        == 10
    )
    assert normalize({"ac": [RAW]}, "adsb_fi", NOW)["aircraft"][0]["position_age_s"] is None
    validated(cast(dict[str, Any], normalize(payload([]), "adsb_fi", NOW)))


async def test_cache_revalidation_keeps_observation_time_and_headers(tmp_path: Path) -> None:
    clock = [NOW]
    cache = Cache(tmp_path / "cache", clock=lambda: clock[0])
    await cache.start()
    session = Session(
        Response(
            headers={
                "Cache-Control": "max-age=10",
                "ETag": '"x"',
                "Last-Modified": "Mon, 07 Sep 2026 12:00:00 GMT",
            }
        ),
        Response(status=304, headers={}),
    )
    provider = AdsbFiProvider(cast(ClientSession, session), cache, clock=lambda: clock[0])
    try:
        first = await provider.fetch(AREA)
        validated(cast(dict[str, Any], first))
        clock[0] += 5
        assert await provider.fetch(AREA) == first and len(session.calls) == 1
        clock[0] += 10
        assert await provider.fetch(AREA) == first and len(session.calls) == 2
        assert session.calls[-1][1] == {
            "headers": {
                "If-None-Match": '"x"',
                "If-Modified-Since": "Mon, 07 Sep 2026 12:00:00 GMT",
            },
            "allow_redirects": False,
        }
        assert session.calls[0][0] == "https://opendata.adsb.fi/api/v3/lat/0/lon/0/dist/27"
        cached = await cache.get(provider.address(AREA)[0])
        assert cached is not None and cached.fetched_at == NOW
    finally:
        await cache.close()


async def test_no_store_age_body_delay_and_date_fallback(tmp_path: Path) -> None:
    clock = [NOW + 20]
    cache = Cache(tmp_path / "cache")
    await cache.start()
    body = {"ac": [RAW]}
    response = Response(
        body,
        headers={"Cache-Control": "no-store", "Date": "Mon, 07 Sep 2026 12:00:00 GMT", "Age": "20"},
    )
    response.gate = asyncio.Event()
    session = Session(response)
    provider = AdsbLolProvider(cast(ClientSession, session), cache, clock=lambda: clock[0])
    try:
        task = asyncio.create_task(provider.fetch(AREA))
        await response.started.wait()
        clock[0] += 5
        response.gate.set()
        result = await task
        assert result["aircraft"][0]["position_age_s"] == 25
        assert result["fetched_at"].endswith("Z")
        assert cache.diagnostics()["entries"] == 0
        assert session.calls[0][0].endswith("/dist/27")
    finally:
        await cache.close()


@pytest.mark.parametrize("status", [301, 401, 429, 503])
async def test_error_status_and_retry_after_without_adapter_retry(
    tmp_path: Path, status: int
) -> None:
    cache = Cache(tmp_path / "cache")
    await cache.start()
    session = Session(Response(status=status, headers={"Retry-After": "120"}))
    try:
        with pytest.raises(ProviderError) as error:
            await AdsbFiProvider(cast(ClientSession, session), cache).fetch(AREA)
        assert error.value.status == status and error.value.retry_after == "120"
        assert len(session.calls) == 1
    finally:
        await cache.close()


@pytest.mark.parametrize("kind", ["size", "stream", "type", "json", "304"])
async def test_bounded_http_response(tmp_path: Path, kind: str) -> None:
    cache = Cache(tmp_path / "cache")
    await cache.start()
    response = Response()
    if kind == "size":
        response.content_length = MAX_BODY_BYTES + 1
    if kind == "stream":
        response.content_length = None
        response.raw = b"x" * (MAX_BODY_BYTES + 1)
    if kind == "type":
        response.content_type = "text/html"
    if kind == "json":
        response.raw = b"invalid"
    if kind == "304":
        response.status = 304
    try:
        with pytest.raises(ProviderError):
            await AdsbFiProvider(cast(ClientSession, Session(response)), cache).fetch(AREA)
    finally:
        await cache.close()


def viewer(identifier: int, events: list[dict[str, Any]], revision: int = 0) -> Viewer:
    return Viewer(
        identifier,
        revision,
        "test",
        Demand(aircraft=True),
        {"south": -1, "north": 1, "west": -1, "east": 1, "zoom": 5},
        events.append,
        lambda reason: None,
    )


async def until(predicate: Any) -> None:
    async with asyncio.timeout(3):
        while not predicate():
            await asyncio.sleep(0.005)


async def test_installed_source_shared_late_join_revision_and_cancellation(
    hass: HomeAssistant, monkeypatch: pytest.MonkeyPatch
) -> None:
    response = Response(payload(now=time.time()), headers={"Cache-Control": "no-store"})
    response.gate = asyncio.Event()
    session = Session(response)
    service = AviadiloService(hass, deepcopy(DEFAULTS))
    monkeypatch.setattr(service.session, "get", session.get)
    await service.start()
    try:
        assert not session.calls and service.info()["capabilities"]["aircraft"] == ["adsb_fi"]
        first: list[dict[str, Any]] = []
        second: list[dict[str, Any]] = []
        updated: list[dict[str, Any]] = []
        service.watch("one", viewer(1, first))
        service.initial("one")
        await response.started.wait()
        service.watch("two", viewer(2, second))
        service.initial("two")
        service.watch("one", viewer(1, updated, 1))
        service.initial("one")
        response.gate.set()
        await until(lambda: any(e["kind"] == "aircraft" for e in second))
        assert len(session.calls) == 1
        assert not any(e["kind"] == "aircraft" for e in first)
        assert [e["revision"] for e in updated if e["kind"] == "aircraft"] == [1]
        assert service.info()["statuses"][0]["state"] == "current"
        service.unsubscribe("one")
        service.unsubscribe("two")
        await until(lambda: not service.tasks)
        assert not service.scheduler.jobs and not service.snapshots
        assert service.cache.diagnostics()["entries"] == 0
    finally:
        await service.close()


async def test_old_area_response_rejected_and_http_cancelled_on_last_viewer(
    hass: HomeAssistant, monkeypatch: pytest.MonkeyPatch
) -> None:
    response = Response()
    response.gate = asyncio.Event()
    session = Session(response)
    service = AviadiloService(hass, deepcopy(DEFAULTS))
    monkeypatch.setattr(service.session, "get", session.get)
    await service.start()
    events: list[dict[str, Any]] = []
    try:
        service.watch("one", viewer(1, events))
        await response.started.wait()
        hass.config.latitude = 10
        response.gate.set()
        await until(lambda: response.closed)
        assert not any(e["kind"] == "aircraft" for e in events)
        assert not service.snapshots
    finally:
        await service.close()
    response = Response()
    response.gate = asyncio.Event()
    session = Session(response)
    service = AviadiloService(hass, deepcopy(DEFAULTS))
    monkeypatch.setattr(service.session, "get", session.get)
    # Preserve rate history but avoid waiting on the previous real-time slot.
    service.scheduler.buckets["adsb_fi"].next_start = 0
    await service.start()
    try:
        service.watch("one", viewer(1, []))
        await response.started.wait()
        service.unsubscribe("one")
        await until(lambda: response.closed)
        assert not service.scheduler.jobs and not service.snapshots
    finally:
        await service.close()


async def test_rate_limit_status_recovery_and_area_freshness(
    hass: HomeAssistant, monkeypatch: pytest.MonkeyPatch
) -> None:
    monotonic = [0.0]
    cooldown_started, release = asyncio.Event(), asyncio.Event()
    now = time.time()
    session = Session(
        Response(status=429, headers={"Retry-After": "100000"}),
        Response(payload(now=now), headers={"Cache-Control": "no-store"}),
    )
    service = AviadiloService(hass, deepcopy(DEFAULTS), clock=lambda: monotonic[0])
    monkeypatch.setattr(service.session, "get", session.get)

    async def cooldown(delay: float) -> None:
        cooldown_started.set()
        await release.wait()
        monotonic[0] += delay
        # Keep the test viewer's lease alive across the synthetic cooldown.
        service.leases["one"].expires = monotonic[0] + 60

    service.scheduler.sleep = cooldown
    await service.start()
    events: list[dict[str, Any]] = []
    current = viewer(1, events)
    service.watch("one", current)
    previous = normalize(payload(now=now - 5), "adsb_fi", now - 5)
    service.publish(service.capture("aircraft"), {"kind": "aircraft", **previous})
    try:
        await cooldown_started.wait()
        status = service.status_event(current)
        validate_event(status)
        assert status["statuses"][0]["state"] == "stale"
        assert status["statuses"][0]["last_success"] == previous["fetched_at"]
        assert status["statuses"][0]["effective_interval_s"] == 86400
        assert service.scheduler.buckets["adsb_fi"].cooldown >= 100000
        release.set()
        await until(lambda: len([e for e in events if e["kind"] == "aircraft"]) == 2)
        assert service.status_event(current)["statuses"][0]["state"] == "current"
        assert len(session.calls) == 2
        hass.config.latitude = 20
        assert service.status_event(current)["statuses"][0]["last_success"] is None
        replay: list[dict[str, Any]] = []
        service.watch("two", viewer(2, replay))
        service.initial("two")
        assert not any(e["kind"] == "aircraft" for e in replay)
        hass.config.latitude = float("nan")
        assert service.status_event(current)["statuses"][0]["state"] == "unavailable"
    finally:
        await service.close()


async def test_cacheable_response_replaced_by_no_store(tmp_path: Path) -> None:
    clock = [NOW]
    cache = Cache(tmp_path / "cache", clock=lambda: clock[0])
    await cache.start()
    session = Session(
        Response(headers={"Cache-Control": "max-age=1"}),
        Response(headers={"Cache-Control": "no-store"}),
    )
    provider = AdsbFiProvider(cast(ClientSession, session), cache, clock=lambda: clock[0])
    try:
        await provider.fetch(AREA)
        assert cache.diagnostics()["entries"] == 1
        clock[0] += 2
        await provider.fetch(AREA)
        assert cache.diagnostics()["entries"] == 0
    finally:
        await cache.close()


@pytest.mark.parametrize("longitude", [0.0, 180.0])
async def test_exact_collection_radius_boundary_and_wrapped_longitude(
    tmp_path: Path, longitude: float
) -> None:
    import math

    radius = 1000.0
    delta = math.degrees(radius / 6371008.8)

    def wrapped(offset: float) -> float:
        return (longitude + offset + 180) % 360 - 180

    records = [
        {**RAW, "hex": "000001", "lon": wrapped(delta)},
        {**RAW, "hex": "000002", "lon": wrapped(delta * 0.99)},
        {**RAW, "hex": "000003", "lon": wrapped(delta * 1.01)},
        {"hex": "000004"},
    ]
    cache = Cache(tmp_path / "cache")
    await cache.start()
    session = Session(Response(payload(records), headers={"Cache-Control": "no-store"}))
    provider = AdsbFiProvider(cast(ClientSession, session), cache, clock=lambda: NOW)
    try:
        result = await provider.fetch({"latitude": 0, "longitude": longitude, "radius_m": radius})
        assert [record["id"] for record in result["aircraft"]] == [
            "adsb_fi:000001",
            "adsb_fi:000002",
            "adsb_fi:000004",
        ]
        assert result["aircraft"][-1]["latitude"] is None
        assert session.calls[0][0].endswith("/dist/1")
    finally:
        await cache.close()


async def test_status_memory_is_bounded_during_viewer_churn_expiry_and_close(
    hass: HomeAssistant,
) -> None:
    from dataclasses import replace

    now = [0.0]
    service = AviadiloService(hass, deepcopy(DEFAULTS), clock=lambda: now[0])
    await service.start()
    ended: list[str] = []
    try:
        # No active source or monitor tick can incidentally clean up these IDs.
        for index in range(512):
            key = str(index)
            events: list[dict[str, Any]] = []
            weather = replace(viewer(index + 1, events), demand=Demand(wind=True), end=ended.append)
            service.watch(key, weather)
            service.initial(key)
            assert events[-1]["statuses"][0]["state"] == "unavailable"
            assert len(service.status_signatures) == 1
            service.unsubscribe(key)
            assert not service.status_signatures
        assert not service.tasks and not service.scheduler.jobs
        for key in ("expires", "survives"):
            service.watch(key, replace(viewer(1, []), demand=Demand(wind=True), end=ended.append))
            service.initial(key)
        now[0] = 30
        service.heartbeat("survives")
        now[0] = 60
        service.reconcile()
        assert ended == ["aviadilo:lease_expired"]
        assert set(service.status_signatures) == {"survives"}
        assert set(service.status_signatures) == set(service.viewers)
    finally:
        await service.close()
    assert ended == ["aviadilo:lease_expired", "aviadilo:closed"]
    assert not service.status_signatures and not service.viewers
