"""Bounded DWD WCS2 ICON-global U/V adapter; every HTTP request is paced.

Text GridEnvelope indices are inclusive and the affine maps cell centres, not
corners. DescribeCoverage axis order (Lat, Long) differs from text (Long, Lat).
"""

import asyncio
import json
import math
import re
import time
import xml.etree.ElementTree as ET
from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import datetime
from typing import Any

from aiohttp import ClientError, ClientSession

from ..cache import Cache, Entry
from ..models import Viewport
from ..scheduler import ProviderError, Scheduler

COVERAGE = "dwd__Icon_reg025_fd_sl_UV10M"
ENDPOINT = "https://maps.dwd.de/geoserver/dwd/wcs"
INTERVAL = 3600
MAX_BYTES = 1024 * 1024
NS = {
    "wcs": "http://www.opengis.net/wcs/2.0",
    "gml": "http://www.opengis.net/gml/3.2",
    "swe": "http://www.opengis.net/swe/2.0",
    "gs": "http://www.geoserver.org/wcsgs/2.0",
}


@dataclass(frozen=True)
class Metadata:
    times: tuple[str, ...]
    nils: tuple[float, ...]
    validated_at: float
    run_time: str | None = None

    def valid_time(self, now: float) -> str:
        # Nearest advertised time, with earlier time winning an exact tie.
        return min(self.times, key=lambda t: (abs(datetime.fromisoformat(t).timestamp() - now), t))


def parse_metadata(body: bytes, validated_at: float) -> Metadata:
    text = body.decode("utf-8")
    if (
        len(body) > MAX_BYTES
        or "\x00" in text
        or "<!DOCTYPE" in text.upper()
        or "<!ENTITY" in text.upper()
    ):
        raise ValueError("Unsafe coverage XML")
    root = ET.fromstring(text)
    descriptions = root.findall("wcs:CoverageDescription", NS)
    if len(descriptions) != 1:
        raise ValueError("Expected one coverage")
    description = descriptions[0]
    if description.findtext("wcs:CoverageId", namespaces=NS) != COVERAGE:
        raise ValueError("Unexpected coverage")
    envelope = description.find("gml:boundedBy/gml:EnvelopeWithTimePeriod", NS)
    if (
        envelope is None
        or envelope.get("axisLabels", "").split()[:2] != ["Lat", "Long"]
        or envelope.get("srsName") != "http://www.opengis.net/def/crs/EPSG/0/4326"
    ):
        raise ValueError("Unexpected coverage CRS/axes")
    offsets = [
        tuple(map(float, (node.text or "").split()))
        for node in description.findall(".//gml:RectifiedGrid/gml:offsetVector", NS)
    ]
    if offsets != [(0.0, 0.25), (0.25, 0.0)]:
        raise ValueError("Unexpected ICON native grid spacing")
    lower = tuple(map(float, (envelope.findtext("gml:lowerCorner", namespaces=NS) or "").split()))
    upper = tuple(map(float, (envelope.findtext("gml:upperCorner", namespaces=NS) or "").split()))
    if len(lower) < 2 or len(upper) < 2 or (lower[1], upper[1]) != (-180.125, 179.875):
        raise ValueError("Unexpected ICON longitude period")
    fields = description.findall(".//swe:DataRecord/swe:field", NS)
    if [field.get("name") for field in fields] != ["u", "v"]:
        raise ValueError("Expected east/north U/V fields")
    for field in fields:
        unit = field.find("swe:Quantity/swe:uom", NS)
        if unit is None or unit.get("code") != "m/s":
            raise ValueError("Expected m/s")
    # TimeDomain only: REFERENCE_TIME's positions are not model-valid times.
    times = tuple(
        sorted(
            {
                node.text or ""
                for node in description.findall(".//gs:TimeDomain//gml:timePosition", NS)
            }
        )
    )
    if not times or len(times) > 512:
        raise ValueError("Invalid advertised timeline")
    for value in times:
        if not value.endswith("Z") or not math.isfinite(datetime.fromisoformat(value).timestamp()):
            raise ValueError("Expected explicit UTC time")
    nils = tuple(float(node.text or "nan") for node in description.findall(".//swe:nilValue", NS))
    return Metadata(times, nils, validated_at)


@dataclass(frozen=True)
class Region:
    south: float
    north: float
    west: float
    east: float
    resolution: float

    @property
    def key(self) -> str:
        return json.dumps([self.south, self.north, self.west, self.east, self.resolution])


def region_for(viewport: Viewport) -> Region | None:
    full_longitude = (
        viewport["west"] > viewport["east"] or viewport["west"] <= -180 or viewport["east"] > 179.75
    )
    if full_longitude:
        viewport = {**viewport, "west": -180, "east": 180}
    # Sampling depends on geography only. Pad one output cell on every side,
    # then choose a dyadic native-grid multiple that stays below the hard cap.
    resolution = 0.25
    while True:
        south = max(-90, (math.floor(viewport["south"] / resolution) - 1) * resolution)
        north = min(90, (math.ceil(viewport["north"] / resolution) + 1) * resolution)
        west = max(-180, (math.floor(viewport["west"] / resolution) - 1) * resolution)
        east = min(179.75, (math.ceil(viewport["east"] / resolution) + 1) * resolution)
        if full_longitude:
            # Exact source cell-edge interval is a complete cyclic 360° band.
            west, east = -180.125, 179.875
        if (math.ceil((north - south) / resolution) + 2) * (
            math.ceil((east - west) / resolution) + 2
        ) <= 4096:
            return Region(south, north, west, east, resolution)
        resolution *= 2


def parse_grid(body: bytes, metadata: Metadata, valid_time: str) -> dict[str, Any]:
    if len(body) > MAX_BYTES or valid_time not in metadata.times:
        raise ValueError("Invalid grid/time")
    text = body.decode("utf-8")
    header, contents = text.split("Contents:", 1)
    if not re.search(r'AUTHORITY\["EPSG",\s*"4326"\]', header) or not re.search(
        r'AXIS\["Geodetic longitude",\s*EAST\].*AXIS\["Geodetic latitude",\s*NORTH\]', header, re.S
    ):
        raise ValueError("Unexpected text CRS/axis order")
    bounds = re.search(r"GeneralBounds\[\(([^,]+), ([^)]+)\), \(([^,]+), ([^)]+)\)\]", header)
    extent = re.search(r"GridEnvelope2D\[(-?\d+)\.\.(-?\d+),\s*(-?\d+)\.\.(-?\d+)\]", header)
    if bounds is None or extent is None or 'PARAM_MT["Affine"' not in header:
        raise ValueError("Missing grid geometry")
    west, south, east, north = map(float, bounds.groups())
    x0, x1, y0, y1 = map(int, extent.groups())
    width, height = x1 - x0 + 1, y1 - y0 + 1
    if min(width, height) < 1 or width * height > 4096:
        raise ValueError("Grid cell bound")
    pairs = re.findall(r'PARAMETER\["([a-z_0-9]+)",\s*([^\]]+)\]', header)
    params = {key: float(value) for key, value in pairs}
    if len(params) != len(pairs) or params.get("num_row") != 3 or params.get("num_col") != 3:
        raise ValueError("Invalid affine")
    for key in ("elt_0_1", "elt_1_0", "elt_2_0", "elt_2_1"):
        if params.get(key, 0) != 0:
            raise ValueError("Rotated/projective grid")
    if params.get("elt_2_2", 1) != 1:
        raise ValueError("Projective grid")
    dx, dy = params["elt_0_0"], params["elt_1_1"]
    lon, lat = params["elt_0_2"] + x0 * dx, params["elt_1_2"] + y0 * dy
    if (
        not all(math.isfinite(v) for v in [west, south, east, north, *params.values(), lon, lat])
        or dx <= 0
        or dy >= 0
    ):
        raise ValueError("Invalid affine spacing")
    expected = (lon - dx / 2, lat + (height - 0.5) * dy, lon + (width - 0.5) * dx, lat - dy / 2)
    if any(
        not math.isclose(a, b, abs_tol=1e-6)
        for a, b in zip((west, south, east, north), expected, strict=True)
    ):
        raise ValueError("Bounds disagree with cell centres")
    if lon < -180 or lon + (width - 1) * dx > 180 or lat > 90 or lat + (height - 1) * dy < -90:
        raise ValueError("Grid outside v1 coordinates")
    bands = re.split(r"Band (\d+):", contents)
    if len(bands) != 5 or bands[0].strip() or bands[1] != "0" or bands[3] != "1":
        raise ValueError("Expected two ordered bands")
    arrays = []
    for raw in (bands[2], bands[4]):
        rows = [row.split() for row in raw.strip().splitlines()]
        if len(rows) != height or any(len(row) != width for row in rows):
            raise ValueError("Band dimensions disagree")
        arrays.append([float(value) for row in rows for value in row])
    u: list[float | None] = []
    v: list[float | None] = []
    for a, b in zip(*arrays, strict=True):
        missing = (
            not math.isfinite(a) or not math.isfinite(b) or a in metadata.nils or b in metadata.nils
        )
        if not missing and (abs(a) > 200 or abs(b) > 200):
            raise ValueError("Wind exceeds v1 vector bounds")
        u.append(None if missing else a)
        v.append(None if missing else b)
    return {
        "kind": "wind-grid",
        "provider": "dwd_icon_global",
        "coverage_id": COVERAGE,
        "valid_time": valid_time,
        "run_time": metadata.run_time,
        "width": width,
        "height": height,
        "first_latitude": lat,
        "first_longitude": lon,
        "latitude_step": dy,
        "longitude_step": dx,
        "crs": "EPSG:4326",
        "row_order": "north-to-south",
        "u_mps": u,
        "v_mps": v,
        "effective_resolution_deg": max(dx, -dy),
        "attribution": "DWD ICON-global — https://www.dwd.de/",
    }


class DwdIconProvider:
    provider = "dwd_icon_global"
    interval = INTERVAL

    def __init__(
        self, session: ClientSession, cache: Cache, *, clock: Callable[[], float] = time.time
    ) -> None:
        self.session, self.cache, self.clock = session, cache, clock
        self.metadata: Metadata | None = None

    async def _request(
        self,
        scheduler: Scheduler,
        key: str,
        params: list[tuple[str, str]],
        demanded: Callable[[], bool],
        *,
        previous_key: str | None = None,
        validate: Callable[[bytes, float], Any],
    ) -> Entry:
        cached = await self.cache.get(key)
        if cached and (cached.validated_at or cached.fetched_at) + INTERVAL > self.clock():
            return cached

        async def fetch() -> Entry:
            if not demanded():
                raise asyncio.CancelledError
            # Recheck after queue waiting; another caller may have filled it.
            cached = await self.cache.get(key)
            if cached and (cached.validated_at or cached.fetched_at) + INTERVAL > self.clock():
                return cached
            stale = await self.cache.get(key, stale=True)
            if stale is None and previous_key:
                stale = await self.cache.get(previous_key, stale=True)
            try:
                async with self.session.get(
                    ENDPOINT,
                    params=params,
                    headers=stale.validators if stale else {},
                    allow_redirects=False,
                ) as response:
                    if response.status not in (200, 304):
                        raise ProviderError(response.status, response.headers.get("Retry-After"))
                    now = self.clock()
                    control = response.headers.get(
                        "Cache-Control",
                        stale.cache_control if stale and response.status == 304 else "",
                    )
                    match = re.search(r'(?:^|,)\s*max-age="?(\d+)"?(?:,|$)', control, re.I)
                    try:
                        age = max(0, float(response.headers.get("Age", "0")))
                        if not math.isfinite(age):
                            raise ValueError
                    except ValueError:
                        age = INTERVAL
                    expiry = (
                        now + max(0, min(INTERVAL, int(match[1])) - age)
                        if match
                        else now + max(0, INTERVAL - age)
                    )
                    if response.status == 304:
                        if stale is None:
                            raise ProviderError(502)
                        entry = replace(
                            stale,
                            key=key,
                            validated_at=now,
                            expires_at=expiry,
                            cache_control=control,
                        )
                    else:
                        if response.content_type not in (
                            "text/plain",
                            "application/xml",
                            "text/xml",
                        ) or (
                            response.content_length is not None
                            and response.content_length > MAX_BYTES
                        ):
                            raise ProviderError(502)
                        body = bytearray()
                        async for chunk in response.content.iter_chunked(65536):
                            if len(body) + len(chunk) > MAX_BYTES:
                                raise ProviderError(502)
                            body.extend(chunk)
                        entry = Entry(
                            key,
                            self.provider,
                            "wind",
                            now,
                            expiry,
                            response.content_type,
                            bytes(body),
                            response.headers.get("ETag"),
                            response.headers.get("Last-Modified"),
                            control,
                            now,
                        )
                    try:
                        validate(entry.payload, entry.validated_at or entry.fetched_at)
                    except (ValueError, KeyError, OverflowError, ET.ParseError) as error:
                        raise ProviderError(502) from error
                    return entry
            except ClientError as error:
                raise ProviderError(503) from error

        entry = await scheduler.request(self.provider, key, fetch)
        # Parse before cache publication in each typed caller below.
        return entry

    async def describe(self, scheduler: Scheduler, demanded: Callable[[], bool]) -> Metadata:
        if self.metadata and self.metadata.validated_at + INTERVAL > self.clock():
            return self.metadata
        generation = self.cache.generation
        entry = await self._request(
            scheduler,
            f"{COVERAGE}:description",
            [
                ("service", "WCS"),
                ("version", "2.0.1"),
                ("request", "DescribeCoverage"),
                ("coverageId", COVERAGE),
            ],
            demanded,
            validate=parse_metadata,
        )
        metadata = parse_metadata(entry.payload, entry.validated_at or entry.fetched_at)
        await self.cache.put(entry, generation=generation)
        self.metadata = metadata
        return metadata

    async def grid(
        self, scheduler: Scheduler, metadata: Metadata, region: Region, demanded: Callable[[], bool]
    ) -> dict[str, Any]:
        valid_time = metadata.valid_time(metadata.validated_at)
        identity = metadata.run_time or f"unknown-{int(metadata.validated_at // INTERVAL)}"
        base = f"{COVERAGE}:{valid_time}:{region.key}"
        key = f"{base}:{identity}"
        previous = (
            f"{base}:unknown-{int(metadata.validated_at // INTERVAL) - 1}"
            if metadata.run_time is None
            else None
        )
        params = [
            ("service", "WCS"),
            ("version", "2.0.1"),
            ("request", "GetCoverage"),
            ("coverageId", COVERAGE),
            ("format", "text/plain"),
            ("subset", f"Lat({region.south},{region.north})"),
            ("subset", f"Long({region.west},{region.east})"),
            ("subset", f'time("{valid_time}")'),
        ]
        if region.resolution > 0.25:
            width = math.ceil((region.east - region.west) / region.resolution) + 1
            height = math.ceil((region.north - region.south) / region.resolution) + 1
            params.append(("scaleSize", f"i({width}),j({height})"))
        params.append(("rangeSubset", "u,v"))
        generation = self.cache.generation
        entry = await self._request(
            scheduler,
            key,
            params,
            demanded,
            previous_key=previous,
            validate=lambda body, fetched: parse_grid(body, metadata, valid_time),
        )
        result = parse_grid(entry.payload, metadata, valid_time)
        await self.cache.put(entry, generation=generation)
        return result
