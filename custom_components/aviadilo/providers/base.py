"""Bounded readsb radius transport and SI normalization; caller owns pacing."""

import json
import math
import re
import time
from collections.abc import Callable
from dataclasses import replace
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any, Protocol, cast

from aiohttp import ClientError, ClientSession

from ..cache import Cache, Entry
from ..models import Aircraft, AircraftResult, AircraftSource, CollectionArea
from ..scheduler import ProviderError

MAX_BODY_BYTES = 4 * 1024 * 1024
MAX_RECORDS = 10000


class AircraftProvider(Protocol):
    async def fetch(self, area: CollectionArea) -> AircraftResult:
        """Fetch one bounded area via the shared provider queue."""
        ...


def number(value: Any, low: float = -math.inf, high: float = math.inf) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if math.isfinite(value) and low <= value <= high else None


def text(value: Any) -> str | None:
    return value.strip()[:256] or None if isinstance(value, str) else None


def scaled(value: Any, factor: float, low: float, high: float) -> float | None:
    parsed = number(value)
    return number(parsed * factor, low, high) if parsed is not None else None


def normalize(
    payload: Any, provider: AircraftSource, fetched: float, http_age: float = 0
) -> AircraftResult:
    """Position ages include response age, never message age or invented heading."""
    if not isinstance(payload, dict):
        raise ProviderError(502)
    if payload.get("msg") not in (None, "No error") or payload.get("error") not in (None, False, 0):
        raise ProviderError(502)
    records = payload.get("aircraft", payload.get("ac"))
    if not isinstance(records, list) or len(records) > MAX_RECORDS:
        raise ProviderError(502)
    upstream_now = number(payload.get("now"), 0)
    if upstream_now is not None and upstream_now > 100_000_000_000:
        upstream_now /= 1000
    response_age = max(http_age, fetched - upstream_now, 0) if upstream_now is not None else None
    items: dict[str, Aircraft] = {}
    for record in records:
        if not isinstance(record, dict):
            continue
        identity = record.get("hex")
        if not isinstance(identity, str) or not re.fullmatch(r"~?[0-9a-fA-F]{6}", identity):
            continue
        identity = identity.lower()
        non_icao = identity.startswith("~")
        identifier = f"{provider}:{'nonicao-' + identity[1:] if non_icao else identity}"
        latitude, longitude = (
            number(record.get("lat"), -90, 90),
            number(record.get("lon"), -180, 180),
        )
        if latitude is None or longitude is None:
            latitude = longitude = None
        age = number(record.get("seen_pos"), 0)
        age = (
            number(age + response_age, 0, 86400)
            if age is not None and response_age is not None
            else None
        )
        baro = record.get("alt_baro")
        ground = True if baro == "ground" else False if number(baro) is not None else None
        altitude = scaled(baro, 0.3048, -1000, 100000)
        if altitude is None and ground is not True:
            altitude = scaled(record.get("alt_geom"), 0.3048, -1000, 100000)
        course = number(record.get("track"), 0, 360)
        vertical = scaled(record.get("baro_rate"), 0.00508, -1000, 1000)
        if vertical is None:
            vertical = scaled(record.get("geom_rate"), 0.00508, -1000, 1000)
        squawk = record.get("squawk")
        item: Aircraft = {
            "id": identifier,
            "icao": None if non_icao else identity,
            "latitude": latitude,
            "longitude": longitude,
            "position_age_s": age,
            "callsign": text(record.get("flight")),
            "registration": text(record.get("r")),
            "aircraft_type": text(record.get("t")),
            "category": text(record.get("category")),
            "on_ground": ground,
            "altitude_m": altitude,
            "speed_mps": scaled(record.get("gs"), 1852 / 3600, 0, 2000),
            "course_deg": course if course is not None and course < 360 else None,
            "vertical_rate_mps": vertical,
            "squawk": squawk
            if isinstance(squawk, str) and re.fullmatch(r"[0-7]{4}", squawk)
            else None,
        }
        previous = items.get(identifier)
        # Prefer a known, newer position when a source repeats an identifier.
        score = (latitude is not None, age is not None, -(age or 0))
        previous_score = (
            (
                previous["latitude"] is not None,
                previous["position_age_s"] is not None,
                -(previous["position_age_s"] or 0),
            )
            if previous
            else None
        )
        if previous_score is None or score > previous_score:
            items[identifier] = item
    return {
        "provider": provider,
        "fetched_at": datetime.fromtimestamp(fetched, UTC).isoformat().replace("+00:00", "Z"),
        "aircraft": list(items.values()),
    }


def within_area(aircraft: Aircraft, area: CollectionArea) -> bool:
    """Clip rounded-up provider circles to the saved radius; unknown stays unknown."""
    lat, lon = aircraft["latitude"], aircraft["longitude"]
    if lat is None or lon is None:
        return True
    delta_lat = math.radians(lat - area["latitude"])
    delta_lon = math.radians(lon - area["longitude"])
    haversine = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(math.radians(lat))
        * math.cos(math.radians(area["latitude"]))
        * math.sin(delta_lon / 2) ** 2
    )
    distance = 2 * 6371008.8 * math.asin(math.sqrt(max(0, min(1, haversine))))
    # Sub-micrometre allowance absorbs float error at an exact boundary.
    return distance <= area["radius_m"] + 1e-6


class RadiusProvider:
    """Uses HA's session and shared cache; never retries or closes the session.

    One service producer serializes fetches. Direct get/put keeps HTTP work under
    the scheduler's cancellation boundary (Cache.fetch shields its producer).
    """

    provider: AircraftSource
    endpoint: str

    def __init__(
        self, session: ClientSession, cache: Cache, *, clock: Callable[[], float] = time.time
    ) -> None:
        self.session, self.cache, self.clock = session, cache, clock

    def address(self, area: CollectionArea) -> tuple[str, str]:
        lat = number(area["latitude"], -90, 90)
        lon = number(area["longitude"], -180, 180)
        radius = number(area["radius_m"], 1, 250 * 1852)
        if lat is None or lon is None or radius is None:
            raise ValueError("Invalid aircraft collection area")
        # Stable round-trip decimal encoding, with negative zero canonicalized.
        coords = [format(value or 0, ".12g") for value in (lat, lon, radius / 1852)]
        return f"{self.provider}:aircraft:" + ":".join(coords), self.endpoint.format(
            coords[0], coords[1], math.ceil(radius / 1852)
        )

    async def fetch(self, area: CollectionArea) -> AircraftResult:
        key, url = self.address(area)
        cached = await self.cache.get(key)
        if cached is not None:
            return cast(AircraftResult, json.loads(cached.payload))
        stale = await self.cache.get(key, stale=True)
        generation = self.cache.generation
        try:
            async with self.session.get(
                url, headers=stale.validators if stale else {}, allow_redirects=False
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
                expiry = now + max(0, min(60, int(match[1])) - age) if match else now
                if response.status == 304:
                    if stale is None:
                        raise ProviderError(502)
                    entry = replace(
                        stale, expires_at=expiry, validated_at=now, cache_control=control
                    )
                else:
                    if response.content_type != "application/json" or (
                        response.content_length is not None
                        and response.content_length > MAX_BODY_BYTES
                    ):
                        raise ProviderError(502)
                    body = bytearray()
                    async for chunk in response.content.iter_chunked(65536):
                        if len(body) + len(chunk) > MAX_BODY_BYTES:
                            raise ProviderError(502)
                        body.extend(chunk)
                    try:
                        payload = json.loads(body)
                        received = self.clock()
                        if isinstance(payload, dict) and number(payload.get("now"), 0) is None:
                            try:
                                date = parsedate_to_datetime(response.headers.get("Date", ""))
                                payload["now"] = date.timestamp()
                            except (ValueError, TypeError, OverflowError):
                                pass
                        result = normalize(
                            payload, self.provider, received, age + max(0, received - now)
                        )
                        result["aircraft"] = [
                            item for item in result["aircraft"] if within_area(item, area)
                        ]
                    except (ValueError, RecursionError, OverflowError) as error:
                        raise ProviderError(502) from error
                    entry = Entry(
                        key,
                        self.provider,
                        "aircraft",
                        now,
                        expiry,
                        "application/json",
                        json.dumps(result, allow_nan=False).encode(),
                        response.headers.get("ETag"),
                        response.headers.get("Last-Modified"),
                        control,
                    )
                await self.cache.put(entry, generation=generation)
                return cast(AircraftResult, json.loads(entry.payload))
        except ClientError as error:
            raise ProviderError(503) from error
