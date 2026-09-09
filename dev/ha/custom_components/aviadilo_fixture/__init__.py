"""Development-only synthetic provider HTTP; never shipped in the integration ZIP."""

import json
import math
import struct
import sys
import time
import zlib
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any, cast

import voluptuous as vol
from aiohttp import ClientSession
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from yarl import URL

DOMAIN = "aviadilo_fixture"


def timestamp(value: float) -> str:
    return datetime.fromtimestamp(value, UTC).isoformat().replace("+00:00", "Z")


def png(size: int = 256) -> bytes:
    """Small unmistakably synthetic green/yellow precipitation bands."""

    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
        )

    raw = b"".join(
        b"\x00" + bytes((40, 210, 90 if row % 64 < 32 else 220, 100)) * size for row in range(size)
    )
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def wind_description(now: float) -> bytes:
    return f"""<wcs:CoverageDescriptions xmlns:wcs="http://www.opengis.net/wcs/2.0"
xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:swe="http://www.opengis.net/swe/2.0"
xmlns:gs="http://www.geoserver.org/wcsgs/2.0"><wcs:CoverageDescription>
<wcs:CoverageId>dwd__Icon_reg025_fd_sl_UV10M</wcs:CoverageId>
<gml:boundedBy><gml:EnvelopeWithTimePeriod axisLabels="Lat Long time"
srsName="http://www.opengis.net/def/crs/EPSG/0/4326"><gml:lowerCorner>-90 -180.125</gml:lowerCorner>
<gml:upperCorner>90 179.875</gml:upperCorner></gml:EnvelopeWithTimePeriod></gml:boundedBy>
<gml:domainSet><gml:RectifiedGrid><gml:offsetVector>0 0.25</gml:offsetVector>
<gml:offsetVector>0.25 0</gml:offsetVector></gml:RectifiedGrid></gml:domainSet>
<swe:DataRecord><swe:field name="u"><swe:Quantity><swe:uom code="m/s" /></swe:Quantity></swe:field>
<swe:field name="v"><swe:Quantity><swe:uom code="m/s" /></swe:Quantity></swe:field></swe:DataRecord>
<gs:TimeDomain><gml:timePosition>{timestamp(now)}</gml:timePosition></gs:TimeDomain>
</wcs:CoverageDescription></wcs:CoverageDescriptions>""".encode()


def wind_grid(query: dict[str, list[str]]) -> bytes:
    subsets = query.get("subset", [])
    lat = next(value[4:-1].split(",") for value in subsets if value.startswith("Lat("))
    lon = next(value[5:-1].split(",") for value in subsets if value.startswith("Long("))
    south, north = map(float, lat)
    west, east = map(float, lon)
    width = min(32, max(2, math.ceil((east - west) / 0.25) + 1))
    height = min(32, max(2, math.ceil((north - south) / 0.25) + 1))
    dx, dy = (east - west) / (width - 1), (south - north) / (height - 1)
    return (
        f"Grid bounds: GeneralBounds[({west - dx / 2}, {south + dy / 2}), "
        f"({east + dx / 2}, {north - dy / 2})]\n"
        f"""Grid CRS: GEOGCS["WGS84(DD)", AXIS["Geodetic longitude", EAST],
AXIS["Geodetic latitude", NORTH], AUTHORITY["EPSG","4326"]]
Grid range: GridEnvelope2D[0..{width - 1}, 0..{height - 1}]
Grid to world: PARAM_MT["Affine", PARAMETER["num_row", 3], PARAMETER["num_col", 3],
PARAMETER["elt_0_0", {dx}], PARAMETER["elt_0_2", {west}],
PARAMETER["elt_1_1", {dy}], PARAMETER["elt_1_2", {north}]]
Contents:
Band 0:
"""
        + "\n".join([" ".join(["8"] * width)] * height)
        + "\nBand 1:\n"
        + "\n".join([" ".join(["3"] * width)] * height)
    ).encode()


class Response:
    def __init__(self, body: bytes, content_type: str) -> None:
        self.body = body
        self.status = 200
        self.content_type = content_type
        self.content_length = len(body)
        self.headers = {"Content-Type": content_type, "Cache-Control": "public,max-age=300"}
        self.content = self

    async def iter_chunked(self, size: int) -> AsyncIterator[bytes]:
        for offset in range(0, len(self.body), size):
            yield self.body[offset : offset + size]

    async def __aenter__(self) -> Response:
        return self

    async def __aexit__(self, *args: Any) -> None:
        pass


class FixtureSession:
    """Only known public provider hosts are handled; nothing falls through to I/O."""

    def __init__(self) -> None:
        self.requests: dict[str, int] = {}

    async def close(self) -> None:
        pass

    def get(self, url: str | URL, **kwargs: Any) -> Response:
        # Match aiohttp's URL + params convention, preserving repeated WCS subset
        # keys and any query already present in a resolved tile URL.
        parsed = URL(url)
        if kwargs.get("params") is not None:
            parsed = parsed.extend_query(kwargs["params"])
        host = parsed.host or ""
        self.requests[host] = self.requests.get(host, 0) + 1
        now = time.time()
        query = {key: parsed.query.getall(key) for key in parsed.query}
        if host == "tile.openstreetmap.org":
            response = Response(png(), "image/png")
            response.headers["Cache-Control"] = "public,max-age=604800"
            response.headers["ETag"] = '"fixture-basemap-v1"'
            return response
        if host == "photos.aviadilo.invalid":
            return Response(png(128), "image/png")
        if host in {"opendata.adsb.fi", "api.adsb.lol"}:
            body = json.dumps(
                {
                    "now": now,
                    "aircraft": [
                        {
                            "hex": f"ff000{index}",
                            "flight": f"DEMO{index + 1}",
                            "lat": 34.1 + index * 0.05,
                            "lon": -117.72 + index * 0.04,
                            "alt_baro": 3000 + index * 1000,
                            "gs": 100,
                            "track": index * 90,
                            "seen_pos": 0,
                            "r": "SYNTHETIC",
                            "category": ["A1", "A7", None][index],
                        }
                        for index in range(3)
                    ],
                }
            ).encode()
            return Response(body, "application/json")
        if host == "api.rainviewer.com":
            frames = [
                {"time": int(now - offset * 300), "path": f"/v2/radar/{int(now - offset * 300)}"}
                for offset in [2, 1, 0]
            ]
            return Response(
                json.dumps(
                    {
                        "host": "https://tilecache.rainviewer.com",
                        "generated": int(now),
                        "radar": {"past": frames},
                    }
                ).encode(),
                "application/json",
            )
        if host == "tilecache.rainviewer.com":
            size = int(parsed.path.split("/")[4])
            if size not in (256, 512):
                raise ValueError("Unsupported synthetic radar tile size")
            return Response(png(size), "image/png")
        if host == "opengeo.ncep.noaa.gov":
            if query.get("request") == ["GetMap"]:
                size = int(query.get("width", ["256"])[0])
                if size not in (256, 512):
                    raise ValueError("Unsupported synthetic radar tile size")
                return Response(png(size), "image/png")
            product = "ksox_sr_bref" if "ksox" in parsed.path else "conus_bref_qcd"
            times = ",".join(timestamp(now - offset * 300) for offset in [2, 1, 0])
            xml = f"""<WMS_Capabilities><Capability><Layer><Name>{product}</Name>
<Style><Name>radar_reflectivity</Name></Style><Dimension name="time">{times}</Dimension>
<EX_GeographicBoundingBox><southBoundLatitude>20</southBoundLatitude>
<northBoundLatitude>55</northBoundLatitude><westBoundLongitude>-130</westBoundLongitude>
<eastBoundLongitude>-60</eastBoundLongitude></EX_GeographicBoundingBox>
</Layer></Capability></WMS_Capabilities>"""
            return Response(xml.encode(), "text/xml")
        if host == "maps.dwd.de":
            body = (
                wind_description(now)
                if query.get("request") == ["DescribeCoverage"]
                else wind_grid(query)
            )
            return Response(body, "text/plain")
        raise RuntimeError(f"Synthetic HA refuses unrecognized provider host: {host}")


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    from custom_components.aviadilo import service
    from custom_components.aviadilo.providers import photos

    session = FixtureSession()

    def provider_session(_hass: HomeAssistant) -> ClientSession:
        return cast(ClientSession, session)

    vars(service)["async_get_clientsession"] = provider_session

    # Only replace upstream HTTP, preserving authorization, URL policy, image
    # normalization, scheduler and private/public production caches.
    def photo_session(_provider: Any) -> ClientSession:
        return cast(ClientSession, session)

    cast(Any, photos.PhotoProvider)._session = photo_session

    @callback
    def fixture_stats(_hass: HomeAssistant, connection: Any, message: dict[str, Any]) -> None:
        current = hass.data.get("aviadilo")
        integration = sys.modules.get("custom_components.aviadilo")
        connection.send_result(
            message["id"],
            {
                "upstream_requests": dict(session.requests),
                "integration_module_path": getattr(integration, "__file__", None),
                "fixture_module_path": __file__,
                "service_session_is_fixture": getattr(current, "session", None) is session,
                "osm_session_is_fixture": getattr(getattr(current, "osm", None), "session", None)
                is session,
            },
        )

    websocket_api.async_register_command(
        hass,
        "aviadilo_fixture/stats",
        fixture_stats,
        vol.Schema({vol.Required("id"): int, vol.Required("type"): "aviadilo_fixture/stats"}),
    )
    hass.data[DOMAIN] = session
    for index, name in enumerate(["Alex", "Sam"]):
        hass.states.async_set(
            f"device_tracker.synthetic_{index}",
            "home",
            {
                "latitude": 34.11 + index * 0.04,
                "longitude": -117.7 + index * 0.04,
                "friendly_name": f"{name} · SYNTHETIC",
                "gps_accuracy": 100,
                "entity_picture": (
                    "https://photos.aviadilo.invalid/avatar.png?fixture=alex"
                    if index == 0
                    else "/local/aviadilo-fixture-avatar.png"
                ),
            },
        )
    # Additional unselected entities preserve the original tracker acceptance counts.
    hass.states.async_set(
        "person.synthetic",
        "home",
        {
            "latitude": 34.12,
            "longitude": -117.71,
            "friendly_name": "Casey · SYNTHETIC person",
            "source": "device_tracker.synthetic_0",
            "gps_accuracy": 75,
            "entity_picture": "https://photos.aviadilo.invalid/avatar.png?fixture=person",
        },
    )
    hass.states.async_set(
        "zone.synthetic_person",
        "0",
        {
            "latitude": 34.1,
            "longitude": -117.72,
            "friendly_name": "Synthetic person zone",
            "passive": False,
        },
    )
    hass.states.async_set(
        "person.zone_only",
        "Synthetic person zone",
        {
            "friendly_name": "Jordan · SYNTHETIC zone person",
            "in_zones": ["zone.synthetic_person"],
            "entity_picture": "/local/aviadilo-fixture-avatar.png",
        },
    )
    # First-party resource is written only into this isolated dev HA instance.
    from pathlib import Path

    def write_avatar() -> None:
        target = Path(hass.config.path("www", "aviadilo-fixture-avatar.png"))
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(png(128))

    await hass.async_add_executor_job(write_avatar)
    hass.states.async_set(
        "device_tracker.synthetic_unsupported",
        "home",
        {
            "latitude": 34.13,
            "longitude": -117.71,
            "friendly_name": "Unsupported photo · SYNTHETIC",
            "entity_picture": "http://192.168.1.1/avatar.png?private=fixture",
        },
    )
    return True
