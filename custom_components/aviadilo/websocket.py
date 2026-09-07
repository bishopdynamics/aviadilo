"""Authenticated v1 commands and packaged transport validation.

These runtime schemas mirror contracts/*.schema.json; shared fixture tests guard
both implementations. Installed integrations need neither jsonschema nor docs.
"""

import math
import re
from datetime import datetime
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.components.websocket_api.connection import ActiveConnection
from homeassistant.core import HomeAssistant, callback

from .const import DEFAULTS, DOMAIN
from .models import validate_geometry
from .service import AviadiloService, Demand, Viewer

MAX_ID = 2147483647
RADAR = ("rainviewer", "noaa_mrms", "noaa_ksox")
AIRCRAFT = ("adsb_fi", "adsb_lol")
PROVIDERS = (*AIRCRAFT, *RADAR, "dwd_icon_global")


def number(low: float, high: float, *, integer: bool = False, exclusive: bool = False) -> Any:
    def check(value: Any) -> Any:
        if (
            type(value) not in ((int,) if integer else (int, float))
            or not math.isfinite(value)
            or value < low
            or value > high
            or (exclusive and value == high)
        ):
            raise vol.Invalid("Expected finite bounded number")
        return value

    return check


def text(maximum: int = 256, minimum: int = 0) -> Any:
    return vol.All(str, vol.Length(min=minimum, max=maximum))


def obj(fields: dict[str, Any]) -> vol.Schema:
    return vol.Schema({vol.Required(key): value for key, value in fields.items()})


def utc(value: Any) -> str:
    if not isinstance(value, str) or not re.fullmatch(
        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z", value
    ):
        raise vol.Invalid("Expected UTC timestamp")
    try:
        datetime.fromisoformat(value)
    except ValueError as error:
        raise vol.Invalid("Invalid calendar date") from error
    return value


def version(value: Any) -> int:
    if type(value) is not int or value != 1:
        raise vol.Invalid("Unsupported Aviadilo schema version")
    return 1


VIEWPORT = obj(
    {
        "south": number(-90, 90),
        "north": number(-90, 90),
        "west": number(-180, 180),
        "east": number(-180, 180),
        "zoom": number(0, 22),
    }
)
LAYERS = obj({"aircraft": bool, "radar": bool, "wind": bool})
SELECTION = {
    "entry_id": text(),
    "layers": LAYERS,
    "radar_provider": vol.In(RADAR),
    "viewport": VIEWPORT,
    "revision": number(0, MAX_ID, integer=True),
}
COMMANDS = {
    "aviadilo/info": {"entry_id": vol.Any(None, text())},
    "aviadilo/subscribe": SELECTION,
    "aviadilo/update_subscription": {
        **SELECTION,
        "subscription_id": number(1, MAX_ID, integer=True),
    },
    "aviadilo/heartbeat": {"subscription_id": number(1, MAX_ID, integer=True)},
}
STATUS = obj(
    {
        "layer": vol.In(("aircraft", "radar", "wind")),
        "state": vol.In(("loading", "current", "stale", "unavailable", "outside-coverage")),
        "provider": vol.In(PROVIDERS),
        "last_success": vol.Any(None, utc),
        "effective_interval_s": vol.Any(None, number(0, 86400)),
        "message": vol.Any(None, text()),
    }
)
AIRCRAFT_RECORD = obj(
    {
        "id": vol.All(str, vol.Match(r"^(adsb_fi|adsb_lol):[A-Za-z0-9_-]{1,64}$")),
        "icao": vol.Any(None, vol.All(str, vol.Match(r"^[0-9a-f]{6}$"))),
        "latitude": vol.Any(None, number(-90, 90)),
        "longitude": vol.Any(None, number(-180, 180)),
        "position_age_s": vol.Any(None, number(0, 86400)),
        **{
            key: vol.Any(None, text())
            for key in ("callsign", "registration", "aircraft_type", "category")
        },
        "on_ground": vol.Any(None, bool),
        "altitude_m": vol.Any(None, number(-1000, 100000)),
        "speed_mps": vol.Any(None, number(0, 2000)),
        "course_deg": vol.Any(None, number(0, 360, exclusive=True)),
        "vertical_rate_mps": vol.Any(None, number(-1000, 1000)),
        "squawk": vol.Any(None, vol.All(str, vol.Match(r"^[0-7]{4}$"))),
    }
)


def array(item: Any, maximum: int, minimum: int = 0) -> Any:
    return vol.All(list, vol.Length(min=minimum, max=maximum), [item])


EVENTS = {
    "aircraft": {
        "provider": vol.In(AIRCRAFT),
        "fetched_at": utc,
        "aircraft": array(AIRCRAFT_RECORD, 10000),
    },
    "radar-manifest": {
        "provider": vol.In(RADAR),
        "product": text(),
        "generated_at": utc,
        "frames": array(obj({"id": text(minimum=1), "time": utc}), 288),
        "native_max_zoom": number(0, 22, integer=True),
        "attribution": text(),
        "coverage": vol.Any(None, obj({"bounds": VIEWPORT, "description": text()})),
    },
    "wind-grid": {
        "provider": "dwd_icon_global",
        "coverage_id": text(),
        "valid_time": utc,
        "run_time": vol.Any(None, utc),
        "width": number(1, 4096, integer=True),
        "height": number(1, 4096, integer=True),
        "first_latitude": number(-90, 90),
        "first_longitude": number(-180, 180),
        "latitude_step": number(-180, 0, exclusive=True),
        "longitude_step": vol.All(number(0, 360), vol.Range(min=0, min_included=False)),
        "crs": "EPSG:4326",
        "row_order": "north-to-south",
        "u_mps": array(vol.Any(None, number(-200, 200)), 4096, 1),
        "v_mps": array(vol.Any(None, number(-200, 200)), 4096, 1),
        "effective_resolution_deg": number(0.001, 360),
        "attribution": text(),
    },
    "status": {"statuses": array(STATUS, 3)},
}


def validate_event(value: dict[str, Any]) -> dict[str, Any]:
    kind = value.get("kind")
    if kind not in EVENTS:
        raise vol.Invalid("Unknown snapshot kind")
    result: dict[str, Any] = obj(
        {
            "schema_version": version,
            "subscription_id": number(1, MAX_ID, integer=True),
            "revision": number(0, MAX_ID, integer=True),
            "kind": kind,
            **EVENTS[kind],
        }
    )(value)
    validate_geometry("event", result)
    return result


def validate_command(value: dict[str, Any]) -> dict[str, Any]:
    command = value.get("type")
    if command not in COMMANDS:
        raise vol.Invalid("Unknown Aviadilo command")
    result: dict[str, Any] = obj(
        {
            "schema_version": version,
            "id": number(1, MAX_ID, integer=True),
            "type": command,
            **COMMANDS[command],
        }
    )(value)
    validate_geometry("command", result)
    return result


class Subscription:
    """Callable HA-owned cancellation handle; identity is the connection object."""

    def __init__(self, service: AviadiloService, connection: ActiveConnection, msg: dict[str, Any]):
        self.service, self.connection, self.id = service, connection, msg["id"]
        self.lease_id = f"{id(connection)}:{self.id}"
        self.active = True

    def __call__(self) -> None:
        # HA iterates subscriptions directly during close; never mutate it here.
        if self.active:
            self.active = False
            self.service.unsubscribe(self.lease_id)

    def end(self, reason: str) -> None:
        if not self.active:
            return
        self.active = False

        # Reconcile can expire a peer while HA is iterating this connection's
        # callbacks during close. Remove outside that synchronous drain, and
        # guard identity in case HA already cleared the registry.
        def remove() -> None:
            if self.connection.subscriptions.get(self.id) is self:
                self.connection.subscriptions.pop(self.id, None)

        self.service.hass.loop.call_soon(remove)
        viewer = self.service.viewers.get(self.lease_id)
        if viewer:
            self.connection.send_event(self.id, self.service.status_event(viewer, reason))

    def update(self, msg: dict[str, Any]) -> None:
        layers = msg["layers"]
        self.service.watch(
            self.lease_id,
            Viewer(
                self.id,
                msg["revision"],
                self.connection.user.id,
                Demand(
                    layers["aircraft"],
                    msg["radar_provider"] if layers["radar"] else None,
                    layers["wind"],
                ),
                msg["viewport"],
                lambda event: self.connection.send_event(self.id, event),
                self.end,
            ),
        )


@callback
def handle(hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]) -> None:
    """Called only through HA's authenticated ActiveConnection dispatch."""
    service: AviadiloService | None = hass.data.get(DOMAIN)
    command = msg["type"]
    if command == "aviadilo/info":
        if service and msg["entry_id"] not in (None, service.entry_id):
            connection.send_error(msg["id"], "not_found", "Aviadilo entry is unavailable")
        else:
            connection.send_result(
                msg["id"],
                service.info()
                if service
                else {
                    "schema_version": 1,
                    "entry_id": None,
                    "area": None,
                    "capabilities": {"aircraft": [], "radar": [], "wind": []},
                    "policies": dict(DEFAULTS["provider_pacing"]),
                    "statuses": [],
                    "heartbeat_s": 20,
                    "lease_s": 60,
                    "backend_memory_mib": 64,
                },
            )
        return
    if not service or service.closed or ("entry_id" in msg and msg["entry_id"] != service.entry_id):
        connection.send_error(msg["id"], "not_found", "Aviadilo entry is unavailable")
        return
    service.reconcile()
    if command == "aviadilo/subscribe":
        owned = sum(isinstance(item, Subscription) for item in connection.subscriptions.values())
        user_owned = sum(v.user_id == connection.user.id for v in service.viewers.values())
        if owned >= 4 or user_owned >= 16 or len(service.leases) >= 128:
            connection.send_error(msg["id"], "limit_reached", "Aviadilo viewer limit reached")
            return
        sub = Subscription(service, connection, msg)
        connection.subscriptions[sub.id] = sub
        try:
            sub.update(msg)
            connection.send_result(msg["id"])
            service.initial(sub.lease_id)
        except Exception:
            sub()
            connection.subscriptions.pop(sub.id, None)
            raise
        return
    candidate = connection.subscriptions.get(msg["subscription_id"])
    if not isinstance(candidate, Subscription):
        connection.send_error(msg["id"], "not_found", "Aviadilo subscription has ended")
        return
    sub = candidate
    if not isinstance(sub, Subscription) or sub.service is not service or not sub.active:
        connection.send_error(msg["id"], "not_found", "Aviadilo subscription has ended")
        return
    if command == "aviadilo/heartbeat":
        if not service.heartbeat(sub.lease_id):
            connection.send_error(msg["id"], "not_found", "Aviadilo subscription has ended")
            return
    else:
        if msg["revision"] <= service.viewers[sub.lease_id].revision:
            connection.send_error(msg["id"], "stale_revision", "Revision must increase")
            return
        sub.update(msg)
    connection.send_result(msg["id"])
    if command == "aviadilo/update_subscription":
        service.initial(sub.lease_id)


@callback
def register(hass: HomeAssistant) -> None:
    for command in COMMANDS:
        websocket_api.async_register_command(hass, command, handle, vol.Schema(validate_command))
