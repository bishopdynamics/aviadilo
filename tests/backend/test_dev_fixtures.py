"""Development HTTP shim exercised through real provider and tile call boundaries."""

import asyncio
from copy import deepcopy
from pathlib import Path
from typing import Any, cast

import pytest
from aiohttp import ClientSession
from homeassistant.core import HomeAssistant
from yarl import URL

from custom_components.aviadilo.cache import Cache
from custom_components.aviadilo.const import DEFAULTS
from custom_components.aviadilo.http import Tile, validate_png
from custom_components.aviadilo.models import Viewport
from custom_components.aviadilo.providers.adsb_fi import AdsbFiProvider
from custom_components.aviadilo.providers.adsb_lol import AdsbLolProvider
from custom_components.aviadilo.providers.dwd_icon import (
    COVERAGE,
    ENDPOINT,
    parse_grid,
    parse_metadata,
)
from custom_components.aviadilo.service import AviadiloService, Demand, Viewer
from custom_components.aviadilo.websocket import validate_event
from dev.ha.custom_components.aviadilo_fixture import FixtureSession

VIEW: Viewport = {"south": 33.8, "north": 34.4, "west": -118.2, "east": -117.2, "zoom": 7}


@pytest.mark.parametrize("source", ["rainviewer", "noaa_mrms", "noaa_ksox"])
async def test_fixture_service_collects_all_layers_and_gateway_serves_cached_tiles(
    hass: HomeAssistant, source: str
) -> None:
    hass.config.latitude, hass.config.longitude = 34.1, -117.72
    service = AviadiloService(hass, deepcopy(DEFAULTS))
    fixture = FixtureSession()
    service.session = cast(ClientSession, fixture)
    # This is exclusively synthetic I/O. Retain the real scheduler and cache,
    # removing wall-clock pacing from this transport compatibility regression.
    for bucket in service.scheduler.buckets.values():
        bucket.interval = 0
    messages: list[dict[str, Any]] = []
    await service.start()
    try:
        service.watch(
            "fixture",
            Viewer(
                1,
                0,
                "synthetic-user",
                Demand(aircraft=True, radar=source, wind=True),
                VIEW,
                messages.append,
                lambda _: None,
            ),
        )
        async with asyncio.timeout(3):
            while not {"aircraft", "radar-manifest", "wind-grid"} <= {m["kind"] for m in messages}:
                await asyncio.sleep(0.01)
        for message in messages:
            validate_event(message)
        aircraft = next(m for m in messages if m["kind"] == "aircraft")
        wind = next(m for m in messages if m["kind"] == "wind-grid")
        manifest = next(m for m in messages if m["kind"] == "radar-manifest")
        assert len(aircraft["aircraft"]) == 3
        assert wind["u_mps"][0] == 8 and wind["v_mps"][0] == 3
        tile = Tile(
            source, manifest["product"], manifest["frames"][-1]["id"], 0, 0, 0, 256, "default"
        )
        entry = await service.tiles.get("synthetic-user", tile, 1, 0)
        validate_png(entry.payload, 256)
        requests = dict(fixture.requests)
        again = await service.tiles.get("synthetic-user", tile, 1, 0)
        assert again.payload == entry.payload and fixture.requests == requests
        assert fixture.requests["maps.dwd.de"] == 2
        assert set(fixture.requests) <= {
            "opendata.adsb.fi",
            "api.rainviewer.com",
            "tilecache.rainviewer.com",
            "opengeo.ncep.noaa.gov",
            "maps.dwd.de",
        }
    finally:
        await service.close()


@pytest.mark.parametrize("adapter_type", [AdsbFiProvider, AdsbLolProvider])
async def test_fixture_aircraft_hosts_use_actual_adapter_fetch(
    tmp_path: Path, adapter_type: type[AdsbFiProvider] | type[AdsbLolProvider]
) -> None:
    fixture = FixtureSession()
    cache = Cache(tmp_path / "cache")
    await cache.start()
    try:
        result = await adapter_type(cast(ClientSession, fixture), cache).fetch(
            {"latitude": 34.1, "longitude": -117.72, "radius_m": 50000}
        )
        assert len(result["aircraft"]) == 3
        assert all(a["callsign"].startswith("DEMO") for a in result["aircraft"] if a["callsign"])
    finally:
        await cache.close()


def test_fixture_merges_url_and_separate_repeated_wcs_parameters() -> None:
    import time

    fixture = FixtureSession()
    metadata = parse_metadata(
        fixture.get(
            URL(ENDPOINT), params={"request": "DescribeCoverage", "coverageId": COVERAGE}
        ).body,
        time.time(),
    )
    valid_time = metadata.valid_time(time.time())
    url = URL(ENDPOINT).with_query([("request", "GetCoverage"), ("subset", "Lat(33,35)")])
    response = fixture.get(
        url, params=[("subset", "Long(-119,-117)"), ("subset", f'time("{valid_time}")')]
    )
    grid = parse_grid(response.body, metadata, valid_time)
    assert grid["first_latitude"] == 35 and grid["first_longitude"] == -119
    assert grid["width"] == grid["height"] == 9
    validate_png(
        fixture.get(
            URL("https://opengeo.ncep.noaa.gov/geoserver/test"),
            params={"request": "GetMap", "width": 512},
        ).body,
        512,
    )
    validate_png(
        fixture.get(
            URL("https://tilecache.rainviewer.com/v2/radar/synthetic/512/0/0/0/2/1_0.png")
        ).body,
        512,
    )
    unknown_urls: list[str | URL] = [
        "https://unexpected.invalid/",
        URL("https://unexpected.invalid/"),
    ]
    for value in unknown_urls:
        with pytest.raises(RuntimeError, match="refuses"):
            fixture.get(value, params=[("subset", "Lat(33,35)")])
