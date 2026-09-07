"""Version-one transport types and cross-field invariants.

Runtime imports are confined to the integration. JSON Schema validation belongs
in contract tests until the authenticated transport is implemented in slice 3.
Longitude bounds may cross the antimeridian (west > east); wind grids may not.
"""

import math
from typing import Any, Literal, TypedDict

SCHEMA_VERSION = 1
AircraftSource = Literal["adsb_fi", "adsb_lol"]
RadarSource = Literal["rainviewer", "noaa_mrms", "noaa_ksox"]


class CollectionArea(TypedDict):
    latitude: float
    longitude: float
    radius_m: float


class Viewport(TypedDict):
    south: float
    north: float
    west: float
    east: float
    zoom: float


class Aircraft(TypedDict):
    id: str
    icao: str | None
    latitude: float | None
    longitude: float | None
    position_age_s: float | None
    callsign: str | None
    registration: str | None
    aircraft_type: str | None
    category: str | None
    on_ground: bool | None
    altitude_m: float | None
    speed_mps: float | None
    course_deg: float | None
    vertical_rate_mps: float | None
    squawk: str | None


class Envelope(TypedDict):
    schema_version: Literal[1]
    subscription_id: int
    revision: int


class AircraftResult(TypedDict):
    """Shared collection payload, independent of viewer subscription metadata."""

    provider: AircraftSource
    fetched_at: str
    aircraft: list[Aircraft]


class AircraftSnapshot(Envelope, AircraftResult):
    kind: Literal["aircraft"]


class RadarFrame(TypedDict):
    id: str
    time: str


class Coverage(TypedDict):
    bounds: Viewport
    description: str


class RadarManifest(Envelope):
    kind: Literal["radar-manifest"]
    provider: RadarSource
    product: str
    generated_at: str
    frames: list[RadarFrame]
    native_max_zoom: int
    attribution: str
    coverage: Coverage | None


class WindGrid(Envelope):
    kind: Literal["wind-grid"]
    provider: Literal["dwd_icon_global"]
    coverage_id: str
    valid_time: str
    run_time: str | None
    width: int
    height: int
    first_latitude: float
    first_longitude: float
    latitude_step: float
    longitude_step: float
    crs: Literal["EPSG:4326"]
    row_order: Literal["north-to-south"]
    u_mps: list[float | None]
    v_mps: list[float | None]
    effective_resolution_deg: float
    attribution: str


class LayerStatus(TypedDict):
    layer: Literal["aircraft", "radar", "wind"]
    state: Literal["loading", "current", "stale", "unavailable", "outside-coverage"]
    provider: AircraftSource | RadarSource | Literal["dwd_icon_global"]
    last_success: str | None
    effective_interval_s: float | None
    message: str | None


class StatusSnapshot(Envelope):
    kind: Literal["status"]
    statuses: list[LayerStatus]


type SnapshotEvent = AircraftSnapshot | RadarManifest | WindGrid | StatusSnapshot


class ContractError(ValueError):
    """Unsupported schema version or inconsistent related fields."""


def validate_geometry(name: str, data: dict[str, Any]) -> None:
    """Check invariants after scalar/shape validation against the shared schema."""
    ensure_finite(data)
    if data.get("schema_version") != SCHEMA_VERSION:
        raise ContractError("Unsupported Aviadilo schema version")
    viewport = data.get("viewport")
    if viewport and viewport["south"] >= viewport["north"]:
        raise ContractError("Viewport south must precede north")
    if data.get("kind") == "wind-grid":
        cells = data["width"] * data["height"]
        if cells > 4096 or len(data["u_mps"]) != cells or len(data["v_mps"]) != cells:
            raise ContractError("Wind grid dimensions do not match bounded arrays")
        south = data["first_latitude"] + (data["height"] - 1) * data["latitude_step"]
        east = data["first_longitude"] + (data["width"] - 1) * data["longitude_step"]
        if south < -90 or east > 180:
            raise ContractError("Wind grid extends outside coordinate bounds")
        if any(
            (u is None) != (v is None) for u, v in zip(data["u_mps"], data["v_mps"], strict=True)
        ):
            raise ContractError("Wind vector components must share a missing-cell mask")
    if data.get("kind") == "radar-manifest":
        coverage = data["coverage"]
        if coverage and coverage["bounds"]["south"] >= coverage["bounds"]["north"]:
            raise ContractError("Invalid coverage bounds")
        ids = [frame["id"] for frame in data["frames"]]
        if len(set(ids)) != len(ids):
            raise ContractError("Duplicate frame IDs")
    if data.get("kind") == "aircraft":
        ids = [item["id"] for item in data["aircraft"]]
        if len(set(ids)) != len(ids):
            raise ContractError("Duplicate aircraft IDs")
        for item in data["aircraft"]:
            if not item["id"].startswith(data["provider"] + ":"):
                raise ContractError("Aircraft identity provider mismatch")
            if (item["latitude"] is None) != (item["longitude"] is None):
                raise ContractError("Position coordinates must both be known or null")
    if name == "card-config":
        view = data.get("map", {})
        if view.get("min_zoom", 2) > view.get("max_zoom", 18):
            raise ContractError("Minimum zoom exceeds maximum")
        aircraft = data.get("aircraft", {})
        low, high = aircraft.get("min_altitude_m"), aircraft.get("max_altitude_m")
        if low is not None and high is not None and low > high:
            raise ContractError("Minimum altitude exceeds maximum")
        ids = [item["entity_id"] for item in data.get("people", {}).get("trackers", [])]
        if len(set(ids)) != len(ids):
            raise ContractError("Duplicate trackers")


def ensure_finite(value: Any) -> None:
    """Reject non-JSON floating values accepted by Python's permissive decoder."""
    if isinstance(value, float) and not math.isfinite(value):
        raise ContractError("Numbers must be finite")
    if isinstance(value, dict):
        for child in value.values():
            ensure_finite(child)
    elif isinstance(value, list):
        for child in value:
            ensure_finite(child)
