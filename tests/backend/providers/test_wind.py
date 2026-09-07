"""Offline source geometry and demand/pacing regressions."""

import asyncio
import json
from copy import deepcopy
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from homeassistant.core import HomeAssistant

from custom_components.aviadilo.cache import Cache
from custom_components.aviadilo.const import DEFAULTS
from custom_components.aviadilo.models import Viewport
from custom_components.aviadilo.providers.dwd_icon import (
    COVERAGE,
    DwdIconProvider,
    Metadata,
    parse_grid,
    parse_metadata,
    region_for,
)
from custom_components.aviadilo.scheduler import Scheduler
from custom_components.aviadilo.service import AviadiloService, Demand, Viewer

FIXTURES = Path("docs/spikes/claremont-weather/cache")
DESCRIPTION = (FIXTURES / "dwd-description.xml").read_bytes()
GRID = (FIXTURES / "dwd-grid.txt").read_bytes()
NOW = datetime.fromisoformat("2026-09-06T21:00:00Z").timestamp()
VIEW: Viewport = {"south": 33.8, "north": 34.2, "west": -118, "east": -117.5, "zoom": 7}


def test_metadata_identity_times_units() -> None:
    metadata = parse_metadata(DESCRIPTION, NOW)
    assert metadata.valid_time(NOW) == "2026-09-06T21:00:00.000Z"
    assert metadata.run_time is None
    assert metadata.valid_time(NOW + 1800) == "2026-09-06T21:00:00.000Z"
    for bad in [
        DESCRIPTION.replace(COVERAGE.encode(), b"other"),
        DESCRIPTION.replace(b'code="m/s"', b'code="knots"'),
        DESCRIPTION.replace(b'name="u"', b'name="v"'),
        b"<!DOCTYPE x>" + DESCRIPTION,
        DESCRIPTION.replace(b"Lat Long", b"Long Lat"),
    ]:
        with pytest.raises(ValueError):
            parse_metadata(bad, NOW)


def test_frozen_nonzero_geometry() -> None:
    metadata = parse_metadata(DESCRIPTION, NOW)
    grid = parse_grid(GRID, metadata, metadata.valid_time(NOW))
    assert (grid["width"], grid["height"]) == (9, 6)
    assert (grid["first_longitude"], grid["first_latitude"]) == (-118.75, 34.75)
    assert (grid["longitude_step"], grid["latitude_step"]) == (0.25, -0.25)
    assert grid["u_mps"][0] == -1.5983543395996094
    assert grid["v_mps"][-1] == -1.7655982971191406
    assert grid["effective_resolution_deg"] == 0.25


def test_geometry_rejects_malformed_rotated_oversize_and_pairs_nulls() -> None:
    metadata = parse_metadata(DESCRIPTION, NOW)
    for bad in [
        GRID.replace(b"245..253", b"245..9999"),
        GRID.replace(b"-118.875", b"-118.8"),
        GRID.replace(b'"elt_0_0", 0.25', b'"elt_0_1", 0.25'),
        GRID.replace(b"Band 1:", b"Band 2:"),
        GRID.replace(b'"4326"', b'"3857"'),
    ]:
        with pytest.raises((ValueError, KeyError)):
            parse_grid(bad, metadata, metadata.valid_time(NOW))
    missing = GRID.replace(b"-1.5983543395996094", b"NaN").replace(b"-1.7655982971191406", b"-9999")
    grid = parse_grid(missing, replace(metadata, nils=(-9999,)), metadata.valid_time(NOW))
    assert grid["u_mps"][0] is grid["v_mps"][0] is None
    assert grid["u_mps"][-1] is grid["v_mps"][-1] is None


def synthetic_grid(width: int, height: int, dx: float, dy: float, lon: float, lat: float) -> bytes:
    return (
        f"Grid bounds: GeneralBounds[({lon - dx / 2}, {lat + (height - 0.5) * dy}), "
        f"({lon + (width - 0.5) * dx}, {lat - dy / 2})]\n"
        f"""
Grid CRS: GEOGCS["WGS84(DD)", AXIS["Geodetic longitude", EAST],
AXIS["Geodetic latitude", NORTH], AUTHORITY["EPSG","4326"]]
Grid range: GridEnvelope2D[13..{12 + width}, 19..{18 + height}]
Grid to world: PARAM_MT["Affine", PARAMETER["num_row", 3], PARAMETER["num_col", 3],
PARAMETER["elt_0_0", {dx}], PARAMETER["elt_0_2", {lon - 13 * dx}],
PARAMETER["elt_1_1", {dy}], PARAMETER["elt_1_2", {lat - 19 * dy}]]
Contents:
Band 0:
"""
        + ("\n".join([" ".join(["3"] * width)] * height))
        + "\nBand 1:\n"
        + "\n".join([" ".join(["4"] * width)] * height)
    ).encode()


def test_scaled_geometry_and_wrapped_sampling_plan() -> None:
    metadata = parse_metadata(DESCRIPTION, NOW)
    grid = parse_grid(
        synthetic_grid(8, 6, 0.5, -1 / 3, -1.625, 17 / 24), metadata, metadata.valid_time(NOW)
    )
    assert grid["width"] * grid["height"] == 48
    assert grid["effective_resolution_deg"] == 0.5
    local = region_for(VIEW)
    assert local and local.resolution == 0.25
    assert region_for({**VIEW, "zoom": 18, "west": -117.99}) == local
    wrapped = region_for({**VIEW, "west": 179, "east": -179})
    assert wrapped and wrapped.west == -180.125 and wrapped.east == 179.875
    huge = region_for({"south": -90, "north": 90, "west": -180, "east": 180, "zoom": 0})
    assert huge and huge.resolution >= 4


class Response:
    def __init__(
        self, body: bytes, status: int = 200, headers: dict[str, str] | None = None
    ) -> None:
        self.status = status
        self.headers = headers or {"Cache-Control": "public,max-age=3600", "ETag": "example"}
        self.content_type = "text/plain"
        self.content_length = len(body)
        self.body = body
        self.content = self

    async def iter_chunked(self, size: int) -> Any:
        yield self.body

    async def __aenter__(self) -> Response:
        return self

    async def __aexit__(self, *args: Any) -> None:
        pass


async def test_paced_shared_metadata_cache_and_hourly_unknown_run(tmp_path: Path) -> None:
    now = [NOW]
    cache = Cache(tmp_path / "cache", clock=lambda: now[0])
    await cache.start()
    session = MagicMock()
    session.get.side_effect = [
        Response(DESCRIPTION),
        Response(GRID),
        Response(DESCRIPTION, 304),
        Response(GRID),
    ]
    scheduler = Scheduler(DEFAULTS["provider_pacing"])
    scheduler.buckets["dwd"].interval = 0
    adapter = DwdIconProvider(session, cache, clock=lambda: now[0])
    try:
        a, b = await asyncio.gather(
            adapter.describe(scheduler, lambda: True), adapter.describe(scheduler, lambda: True)
        )
        assert a == b and session.get.call_count == 1
        region = region_for(VIEW)
        assert region
        first = await adapter.grid(scheduler, a, region, lambda: True)
        await adapter.grid(scheduler, a, region, lambda: True)
        assert session.get.call_count == 2
        now[0] += 3600
        metadata = await adapter.describe(scheduler, lambda: True)
        second = await adapter.grid(scheduler, metadata, region, lambda: True)
        assert session.get.call_count == 4
        assert session.get.call_args_list[2].kwargs["headers"] == {"If-None-Match": "example"}
        assert first["run_time"] is second["run_time"] is None
        assert all(call.kwargs["allow_redirects"] is False for call in session.get.call_args_list)
        assert len(scheduler.buckets["dwd"].starts) == 4
    finally:
        await scheduler.close()
        await cache.close()


async def test_scaled_request_and_cancel_demand(tmp_path: Path) -> None:
    cache = Cache(tmp_path / "cache")
    await cache.start()
    session = MagicMock()
    session.get.return_value = Response(synthetic_grid(2, 2, 10, -10, -10, 10))
    scheduler = Scheduler(DEFAULTS["provider_pacing"])
    adapter = DwdIconProvider(session, cache, clock=lambda: NOW)
    metadata = parse_metadata(DESCRIPTION, NOW)
    region = region_for({"south": -80, "north": 80, "west": -180, "east": 180, "zoom": 0})
    assert region
    try:
        await adapter.grid(scheduler, metadata, region, lambda: True)
        params = session.get.call_args.kwargs["params"]
        assert any(k == "scaleSize" for k, v in params)
        assert ("rangeSubset", "u,v") in params
        with pytest.raises(asyncio.CancelledError):
            await adapter.describe(scheduler, lambda: False)
        assert session.get.call_count == 1
    finally:
        await scheduler.close()
        await cache.close()


async def flush() -> None:
    for _ in range(60):
        await asyncio.sleep(0)


async def test_service_regions_revisions_sharing_pruning(
    hass: HomeAssistant, monkeypatch: pytest.MonkeyPatch
) -> None:
    service = AviadiloService(hass, deepcopy(DEFAULTS))
    service._register_wind()
    adapter = service.wind_adapter
    assert adapter
    metadata = parse_metadata(DESCRIPTION, NOW)
    ready = asyncio.Event()

    async def describe(*args: Any) -> Metadata:
        await ready.wait()
        return metadata

    monkeypatch.setattr(adapter, "describe", describe)
    payload = parse_grid(GRID, metadata, metadata.valid_time(NOW))
    grid = AsyncMock(return_value=payload)
    monkeypatch.setattr(adapter, "grid", grid)
    events: list[tuple[str, dict[str, Any]]] = []

    def viewer(name: str, viewport: Viewport, revision: int = 0) -> Viewer:
        return Viewer(
            1,
            revision,
            name,
            Demand(wind=True),
            viewport,
            lambda e: events.append((name, e)),
            lambda reason: None,
        )

    try:
        service.watch("a", viewer("a", VIEW))
        service.watch("b", viewer("b", {**VIEW, "zoom": 12}))
        await flush()
        assert len(service.wind_tasks) == 1
        other: Viewport = {**VIEW, "west": 10.0, "east": 11.0}
        service.watch("a", viewer("a", other, 1))
        ready.set()
        await flush()
        assert len(service.wind_tasks) == 2 and grid.await_count == 2
        winds = [(name, event) for name, event in events if event["kind"] == "wind-grid"]
        assert [(name, e["revision"]) for name, e in winds].count(("a", 0)) == 0
        assert ("a", 1) in [(name, e["revision"]) for name, e in winds]
        service.heartbeat("a")
        service.heartbeat("b")
        await flush()
        assert grid.await_count == 2
        service.unsubscribe("b")
        await flush()
        assert len(service.wind_tasks) == 1
        assert all(json.loads(key)[1] == region_for(other).key for key in service.snapshots)  # type: ignore[union-attr]
        service.unsubscribe("a")
        await flush()
        assert not service.wind_tasks and not service.wind_states and not service.snapshots
    finally:
        await service.close()


async def test_wind_cancellation_region_bound_and_stale_status(
    hass: HomeAssistant, monkeypatch: pytest.MonkeyPatch
) -> None:
    service = AviadiloService(hass, deepcopy(DEFAULTS))
    service._register_wind()
    adapter = service.wind_adapter
    assert adapter
    started = asyncio.Event()
    cancelled = asyncio.Event()

    async def describe(*args: Any) -> Metadata:
        started.set()
        try:
            await asyncio.Future[None]()
        finally:
            cancelled.set()
        raise AssertionError

    monkeypatch.setattr(adapter, "describe", describe)
    try:
        for i in range(20):
            viewport: Viewport = {**VIEW, "west": float(i * 4), "east": float(i * 4 + 1)}
            service.watch(
                str(i),
                Viewer(
                    i + 1,
                    0,
                    "user",
                    Demand(wind=True),
                    viewport,
                    lambda event: None,
                    lambda reason: None,
                ),
            )
        await started.wait()
        await flush()
        assert len(service.wind_tasks) == 12
        status = service.status_event(service.viewers["19"])["statuses"][0]
        assert status["state"] == "unavailable" and "limit" in status["message"]
        for i in range(20):
            service.unsubscribe(str(i))
        await flush()
        assert cancelled.is_set() and not service.wind_tasks
    finally:
        await service.close()


async def test_no_store_cache_policy_and_xml_entity_encoding(tmp_path: Path) -> None:
    unsafe = (
        '<?xml version="1.0" encoding="UTF-16"?><!DOCTYPE x [<!ENTITY x "x">]><x>&x;</x>'.encode(
            "utf-16"
        )
    )
    with pytest.raises((ValueError, UnicodeError)):
        parse_metadata(unsafe, NOW)
    cache = Cache(tmp_path / "cache")
    await cache.start()
    session = MagicMock()
    session.get.return_value = Response(DESCRIPTION, headers={"Cache-Control": "no-store"})
    scheduler = Scheduler(DEFAULTS["provider_pacing"])
    adapter = DwdIconProvider(session, cache, clock=lambda: NOW)
    try:
        await adapter.describe(scheduler, lambda: True)
        assert cache.diagnostics()["entries"] == 0
        await adapter.describe(scheduler, lambda: True)
        assert session.get.call_count == 1  # Shared active timeline's hourly cadence.
    finally:
        await scheduler.close()
        await cache.close()


async def test_headerless_grid_reused_on_reopen_within_hour(tmp_path: Path) -> None:
    now = [NOW]
    cache = Cache(tmp_path / "cache", clock=lambda: now[0])
    await cache.start()
    session = MagicMock()
    description = Response(DESCRIPTION)
    description.headers = {}
    grid_response = Response(GRID)
    grid_response.headers = {}
    session.get.side_effect = [description, grid_response]
    scheduler = Scheduler(DEFAULTS["provider_pacing"])
    scheduler.buckets["dwd"].interval = 0
    adapter = DwdIconProvider(session, cache, clock=lambda: now[0])
    region = region_for(VIEW)
    assert region
    try:
        metadata = await adapter.describe(scheduler, lambda: True)
        first = await adapter.grid(scheduler, metadata, region, lambda: True)
        now[0] += 3500
        reopened = DwdIconProvider(session, cache, clock=lambda: now[0])
        cached_metadata = await reopened.describe(scheduler, lambda: True)
        cached = await reopened.grid(scheduler, cached_metadata, region, lambda: True)
        assert cached == first and session.get.call_count == 2
    finally:
        await scheduler.close()
        await cache.close()


async def test_metadata_demand_outlives_first_region(
    hass: HomeAssistant, monkeypatch: pytest.MonkeyPatch
) -> None:
    service = AviadiloService(hass, deepcopy(DEFAULTS))
    service._register_wind()
    adapter = service.wind_adapter
    assert adapter
    await service.cache.start()
    session = MagicMock()
    session.get.return_value = Response(DESCRIPTION)
    monkeypatch.setattr(adapter, "session", session)
    monkeypatch.setattr(adapter, "clock", lambda: NOW)
    grid = AsyncMock(
        return_value=parse_grid(GRID, parse_metadata(DESCRIPTION, NOW), "2026-09-06T21:00:00.000Z")
    )
    monkeypatch.setattr(adapter, "grid", grid)
    bucket = service.scheduler.buckets["dwd"]
    await bucket.lock.acquire()
    try:
        for i in range(2):
            viewport: Viewport = {**VIEW, "west": float(i * 4), "east": float(i * 4 + 1)}
            service.watch(
                str(i),
                Viewer(
                    i + 1,
                    0,
                    "user",
                    Demand(wind=True),
                    viewport,
                    lambda event: None,
                    lambda reason: None,
                ),
            )
        await flush()
        async with asyncio.timeout(2):
            while (
                not service.scheduler.jobs
                or next(iter(service.scheduler.jobs.values())).waiters != 2
            ):
                await asyncio.sleep(0.01)
        job = next(iter(service.scheduler.jobs.values()))
        assert job.waiters == 2
        service.unsubscribe("0")
        await flush()
        bucket.lock.release()
        for _ in range(20):
            await asyncio.sleep(0.01)
            if grid.await_count:
                break
        assert session.get.call_count == 1 and grid.await_count == 1
    finally:
        if bucket.lock.locked():
            bucket.lock.release()
        await service.close()


def test_verified_periodic_band_geometry() -> None:
    metadata = parse_metadata(DESCRIPTION, NOW)
    # Actual bounded ocean probe: source edges[-180.125,179.875],16×4.
    grid = parse_grid(
        synthetic_grid(16, 4, 22.5, -0.5, -168.875, 0.625), metadata, metadata.valid_time(NOW)
    )
    assert grid["width"] * grid["longitude_step"] == 360
    assert grid["first_longitude"] >= -180
    assert grid["first_longitude"] + (grid["width"] - 1) * grid["longitude_step"] <= 180


@pytest.mark.parametrize("product", ["metadata", "grid"])
async def test_malformed_http_200_uses_scheduler_backoff_before_recovery(
    tmp_path: Path, product: str
) -> None:
    elapsed = [0.0]
    delays: list[float] = []
    starts: list[float] = []
    cache = Cache(tmp_path / "cache", clock=lambda: NOW + elapsed[0])
    await cache.start()

    async def sleep(delay: float) -> None:
        # A malformed success response must remain inside the provider lane.
        assert scheduler.buckets["dwd"].state == "cooldown"
        assert cache.diagnostics()["entries"] == 0
        delays.append(delay)
        elapsed[0] += delay
        await asyncio.sleep(0)

    scheduler = Scheduler(
        DEFAULTS["provider_pacing"],
        clock=lambda: elapsed[0],
        sleep=sleep,
        jitter=lambda: 0,
    )
    responses = iter(
        [
            Response(b"<ExceptionReport><Exception>Unavailable</Exception></ExceptionReport>"),
            Response(b"invalid source response"),
            Response(DESCRIPTION if product == "metadata" else GRID),
        ]
    )

    def get(*args: Any, **kwargs: Any) -> Response:
        starts.append(elapsed[0])
        return next(responses)

    session = MagicMock()
    session.get.side_effect = get
    adapter = DwdIconProvider(session, cache, clock=lambda: NOW + elapsed[0])
    try:
        if product == "metadata":
            metadata = await adapter.describe(scheduler, lambda: True)
            assert metadata.valid_time(NOW) == "2026-09-06T21:00:00.000Z"
        else:
            region = region_for(VIEW)
            assert region
            grid = await adapter.grid(
                scheduler, parse_metadata(DESCRIPTION, NOW), region, lambda: True
            )
            assert grid["u_mps"][0] == -1.5983543395996094
        assert delays == [30, 60]
        assert starts == [0, 30, 90]
        assert scheduler.buckets["dwd"].state == "current"
        assert scheduler.buckets["dwd"].failures == 0
        assert cache.diagnostics()["entries"] == 1
        assert not scheduler.jobs
    finally:
        await scheduler.close()
        await cache.close()


async def test_malformed_response_cooldown_remains_cancellable(tmp_path: Path) -> None:
    sleeping = asyncio.Event()
    cache = Cache(tmp_path / "cache")
    await cache.start()

    async def sleep(delay: float) -> None:
        sleeping.set()
        await asyncio.Future[None]()

    scheduler = Scheduler(DEFAULTS["provider_pacing"], sleep=sleep, jitter=lambda: 0)
    session = MagicMock()
    session.get.return_value = Response(b"<ExceptionReport/>")
    adapter = DwdIconProvider(session, cache)
    task = asyncio.create_task(adapter.describe(scheduler, lambda: True))
    try:
        await asyncio.wait_for(sleeping.wait(), 2)
        assert scheduler.buckets["dwd"].state == "cooldown"
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert not scheduler.jobs
        assert session.get.call_count == 1
        assert cache.diagnostics()["entries"] == 0
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        await scheduler.close()
        await cache.close()


async def test_service_reports_all_missing_field_but_preserves_calm_and_partial_data(
    hass: HomeAssistant,
) -> None:
    service = AviadiloService(hass, deepcopy(DEFAULTS))
    service._register_wind()
    viewer = Viewer(1, 0, "user", Demand(wind=True), VIEW, lambda event: None, lambda reason: None)
    service.watch("wind", viewer)
    metadata = parse_metadata(DESCRIPTION, NOW)
    payload = parse_grid(GRID, metadata, metadata.valid_time(NOW))
    payload["valid_time"] = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    region = region_for(VIEW)
    assert region
    service.wind_states[region.key] = ("current", datetime.now(UTC).timestamp())
    context = service.capture("wind", VIEW)
    try:
        cells = payload["width"] * payload["height"]
        for value, expected in ((None, "unavailable"), (0.0, "current")):
            field = {**payload, "u_mps": [value] * cells, "v_mps": [value] * cells}
            assert service.publish(context, field)
            status = service.status_event(viewer)["statuses"][0]
            assert status["state"] == expected
            if value is None:
                assert status["message"] == "No wind data is available for this model-valid field."
            assert (
                service.snapshots[service._snapshot_key("wind", VIEW)]["valid_time"]
                == payload["valid_time"]
            )
        partial = {
            **payload,
            "u_mps": [None] + [0.0] * (cells - 1),
            "v_mps": [None] + [0.0] * (cells - 1),
        }
        assert service.publish(context, partial)
        assert service.status_event(viewer)["statuses"][0]["state"] == "current"
    finally:
        await service.close()
