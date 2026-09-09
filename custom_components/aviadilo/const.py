"""Shared defaults matching the frozen integration configuration contract."""

from typing import Any

DOMAIN = "aviadilo"
VERSION = "0.2.0-dev.5"
HEARTBEAT_SECONDS = 20
LEASE_SECONDS = 60
MEMORY_BYTES = 64 * 1024 * 1024
DEFAULTS: dict[str, Any] = {
    "schema_version": 1,
    "anchor": {"kind": "home"},
    "aircraft_provider": "adsb_fi",
    "aircraft_radius_m": 50000,
    "aircraft_interval_s": 10,
    "disk_cache_mib": 512,
    "background_collection": False,
    "provider_pacing": {
        "adsb_fi_min_interval_s": 2,
        "adsb_lol_min_interval_s": 10,
        "rainviewer_requests_per_minute": 50,
        "noaa_requests_per_minute": 30,
        "dwd_requests_per_minute": 10,
        "osm_min_interval_s": 1,
        "photo_min_interval_s": 2,
    },
    "aircraft_radius_unit": "km",
}
