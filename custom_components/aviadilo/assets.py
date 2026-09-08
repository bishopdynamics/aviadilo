"""Authenticated shared asset transport with strict generation and permission guards."""

import asyncio
import hashlib
import math
import re
import struct
import uuid
import zlib
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol, TypedDict, cast
from urllib.parse import parse_qsl

import voluptuous as vol
from aiohttp import web
from homeassistant.auth.models import User
from homeassistant.auth.permissions.const import POLICY_READ
from homeassistant.components import websocket_api
from homeassistant.components.websocket_api.connection import ActiveConnection
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.http import KEY_HASS, HomeAssistantView
from yarl import URL

GENERATION_HEADER = "X-Aviadilo-Generation"
ASSETS_CHANGED = "aviadilo/assets_changed"
MAX_BYTES = 2 * 1024 * 1024
MAX_COUNTER = 999999999999999
ENTRY = r"[A-Za-z0-9_-]{1,128}"
GENERATION = r"[a-f0-9]{32}:(0|[1-9][0-9]{0,14})"
ENTITY = r"device_tracker\.[a-z0-9_]{1,240}"
PICTURE_KEY = r"[a-f0-9]{64}"
ERRORS = {
    "invalid_request": (400, "Invalid asset request"),
    "unauthorized": (401, "Authentication required"),
    "forbidden": (403, "Asset access denied"),
    "not_found": (404, "Asset or entry is unavailable"),
    "stale_generation": (409, "Asset generation has changed"),
    "picture_changed": (409, "Entity picture has changed"),
    "busy": (429, "Asset capacity reached"),
    "upstream_error": (502, "Asset source is unavailable"),
    "unavailable": (503, "Asset service is unavailable"),
}


class AssetInfo(TypedDict):
    schema_version: Literal[1]
    entry_id: str
    generation: str


class AssetFailure(ValueError):
    def __init__(self, code: str, generation: str | None = None) -> None:
        if code not in ERRORS:
            raise ValueError("Unknown asset error code")
        self.code = code
        self.status, message = ERRORS[code]
        self.body: dict[str, Any] = {"schema_version": 1, "code": code, "message": message}
        if code == "stale_generation":
            _text(generation, GENERATION)
            self.body["generation"] = generation
        elif generation is not None:
            raise ValueError("Only stale generation errors carry generation")
        super().__init__(message)


def _text(value: Any, pattern: str) -> str:
    if type(value) is not str or re.fullmatch(pattern, value) is None:
        raise AssetFailure("invalid_request")
    return value


def _integer(value: Any, maximum: int) -> int:
    if (
        type(value) not in (int, float)
        or not math.isfinite(value)
        or not 0 <= value <= maximum
        or value != int(value)
    ):
        raise AssetFailure("invalid_request")
    return int(value)


def validate_asset(value: Any) -> dict[str, Any]:
    """Validate every schema variant, with no scalar coercion or bool-as-int."""
    if type(value) is not dict:
        raise AssetFailure("invalid_request")
    if _integer(value.get("schema_version"), 1) != 1:
        raise AssetFailure("invalid_request")
    # JSON Schema integers are mathematically integral JSON numbers: JS cannot
    # distinguish 1 from 1.0. HTTP spelling is validated separately before parsing.
    data = dict(cast(dict[str, Any], value))
    data["schema_version"] = 1
    required = {"schema_version"}
    optional: set[str] = set()
    if "kind" in data:
        required |= {"kind", "generation"}
        optional.add("entry_id")
        if data["kind"] == "basemap":
            required |= {"z", "x", "y"}
            z = data["z"] = _integer(data.get("z"), 19)
            data["x"] = _integer(data.get("x"), 2**z - 1)
            data["y"] = _integer(data.get("y"), 2**z - 1)
        elif data["kind"] == "photo":
            required |= {"entity_id", "picture_key"}
            _text(data.get("entity_id"), ENTITY)
            _text(data.get("picture_key"), PICTURE_KEY)
        else:
            raise AssetFailure("invalid_request")
    elif "type" in data:
        required |= {"id", "type"}
        optional.add("entry_id")
        if data["type"] != "aviadilo/assets_info" or _integer(data.get("id"), 2147483647) < 1:
            raise AssetFailure("invalid_request")
        data["id"] = int(data["id"])
    elif "code" in data:
        required |= {"code", "message"}
        code = data["code"]
        if type(code) is not str or code not in ERRORS or data.get("message") != ERRORS[code][1]:
            raise AssetFailure("invalid_request")
        if code == "stale_generation":
            required.add("generation")
    else:
        required |= {"entry_id", "generation"}
    if not required <= data.keys() or not data.keys() <= required | optional:
        raise AssetFailure("invalid_request")
    if "generation" in data:
        _text(data["generation"], GENERATION)
    if "entry_id" in data:
        _text(data["entry_id"], ENTRY)
    return dict(data)


@dataclass(frozen=True)
class AssetRequest:
    kind: Literal["basemap", "photo"]
    generation: str
    entry_id: str | None = None
    z: int | None = None
    x: int | None = None
    y: int | None = None
    entity_id: str | None = None
    picture_key: str | None = None

    def as_dict(self) -> dict[str, Any]:
        fields = ("z", "x", "y") if self.kind == "basemap" else ("entity_id", "picture_key")
        return {
            "schema_version": 1,
            "kind": self.kind,
            "generation": self.generation,
            **({"entry_id": self.entry_id} if self.entry_id is not None else {}),
            **{name: getattr(self, name) for name in fields},
        }


def parse_asset_path(path: str) -> AssetRequest:
    match = re.fullmatch(
        r"/api/aviadilo/(photo|basemap/(0|[1-9][0-9]{0,5})/"
        r"(0|[1-9][0-9]{0,5})/(0|[1-9][0-9]{0,5}))\?([^#\\\s]+)",
        path,
    )
    if not match or re.search(r"%(?![0-9a-fA-F]{2})", path):
        raise AssetFailure("invalid_request")
    try:
        pairs = parse_qsl(match[5], keep_blank_values=True, errors="strict", max_num_fields=5)
    except (ValueError, UnicodeError) as error:
        raise AssetFailure("invalid_request") from error
    query = dict(pairs)
    photo = match[1] == "photo"
    allowed = {"schema_version", "generation", "entry_id"}
    if photo:
        allowed |= {"entity_id", "picture_key"}
    if (
        len(query) != len(pairs)
        or not query.keys() <= allowed
        or query.get("schema_version") != "1"
    ):
        raise AssetFailure("invalid_request")
    value = validate_asset(
        {
            **query,
            "schema_version": 1,
            "kind": "photo" if photo else "basemap",
            **({} if photo else {"z": int(match[2]), "x": int(match[3]), "y": int(match[4])}),
        }
    )
    value.pop("schema_version")
    return AssetRequest(**value)


@dataclass
class AssetGeneration:
    """Rotate only after a successful cache clear; new instance on process start."""

    instance: str = field(default_factory=lambda: uuid.uuid4().hex)
    counter: int = 0

    @property
    def value(self) -> str:
        return _text(f"{self.instance}:{self.counter}", GENERATION)

    def info(self, entry_id: str) -> AssetInfo:
        return {"schema_version": 1, "entry_id": _text(entry_id, ENTRY), "generation": self.value}

    def rotate(self) -> None:
        """Advance the opaque value without inventing an entry for unbound runtimes."""
        if self.counter >= MAX_COUNTER:
            self.instance, self.counter = uuid.uuid4().hex, 0
        else:
            self.counter += 1

    def advance(self, hass: HomeAssistant, entry_id: str) -> AssetInfo:
        self.rotate()
        info = self.info(entry_id)
        hass.bus.async_fire(ASSETS_CHANGED, dict(info))
        return info


@dataclass(frozen=True)
class AssetPayload:
    """Trusted backend's normalized PNG; photo HTTP caching is always no-store.

    Backend determines HTTP freshness. max_age_s is bounded by 90-day retention;
    default 0 requires a new authenticated request. ETag derives from the bytes.
    Conditional responses recheck authentication, entry and generation before 304.
    """

    payload: bytes
    max_age_s: int = 0
    no_store: bool = False
    no_cache: bool = False
    must_revalidate: bool = False
    age_s: int = 0
    last_modified: str | None = None
    stale: bool = False


class AssetService(Protocol):
    @property
    def entry_id(self) -> str | None: ...

    closed: bool
    generation: AssetGeneration

    async def fetch(self, request: AssetRequest, user: User, referer: str | None) -> AssetPayload:
        """No collector demand. Never accept a client URL or token."""
        ...


@dataclass
class UnavailableAssetService:
    entry_id: str
    closed: bool = False
    generation: AssetGeneration = field(default_factory=AssetGeneration)

    async def fetch(self, request: AssetRequest, user: User, referer: str | None) -> AssetPayload:
        raise AssetFailure("unavailable")


def selected(service: AssetService | None, entry_id: str | None) -> AssetService:
    if service is None or service.closed or service.entry_id is None:
        raise AssetFailure("not_found" if entry_id is not None else "unavailable")
    if entry_id is not None and entry_id != service.entry_id:
        raise AssetFailure("not_found")
    validate_asset(service.generation.info(service.entry_id))
    return service


def authorize_photo(hass: HomeAssistant, user: User, request: AssetRequest) -> None:
    if request.kind != "photo":
        return
    entity = request.entity_id
    if entity is None or not user.permissions.check_entity(entity, POLICY_READ):
        raise AssetFailure("forbidden")
    state = hass.states.get(entity)
    picture = state.attributes.get("entity_picture") if state else None
    if not isinstance(picture, str) or not picture:
        raise AssetFailure("not_found")
    if hashlib.sha256(picture.encode("utf-8")).hexdigest() != request.picture_key:
        raise AssetFailure("picture_changed")


def error_response(error: AssetFailure) -> web.Response:
    headers = {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}
    if error.code == "stale_generation":
        headers[GENERATION_HEADER] = error.body["generation"]
    if error.code == "busy":
        headers["Retry-After"] = "1"
    return web.json_response(error.body, status=error.status, headers=headers)


def png_response(payload: AssetPayload, request: AssetRequest, headers: Any = None) -> web.Response:
    """Bound bytes/framing/dimensions even for buggy future service adapters.

    The service owns actual raster decode/normalization, not this transport stub.
    """
    raw = payload.payload
    if (
        not isinstance(raw, bytes)
        or not 33 <= len(raw) <= MAX_BYTES
        or raw[:8] != b"\x89PNG\r\n\x1a\n"
    ):
        raise AssetFailure("upstream_error")
    width, height = struct.unpack(">II", raw[16:24])
    if (request.kind == "basemap" and (width, height) != (256, 256)) or (
        request.kind == "photo" and not (1 <= width <= 128 and 1 <= height <= 128)
    ):
        raise AssetFailure("upstream_error")
    offset, data_seen, ended = 8, False, False
    while offset + 12 <= len(raw):
        length = int.from_bytes(raw[offset : offset + 4], "big")
        kind = raw[offset + 4 : offset + 8]
        end = offset + 12 + length
        if end > len(raw) or zlib.crc32(raw[offset + 4 : end - 4]) != int.from_bytes(
            raw[end - 4 : end], "big"
        ):
            raise AssetFailure("upstream_error")
        if (offset == 8 and (kind != b"IHDR" or length != 13)) or (offset != 8 and kind == b"IHDR"):
            raise AssetFailure("upstream_error")
        data_seen |= kind == b"IDAT"
        if kind == b"IEND":
            ended = length == 0 and end == len(raw)
            break
        offset = end
    if (
        not data_seen
        or not ended
        or type(payload.max_age_s) is not int
        or not 0 <= payload.max_age_s <= 7776000
    ):
        raise AssetFailure("upstream_error")
    from .providers.asset_http import date, validator

    control = (
        "no-store"
        if request.kind == "photo" or payload.no_store
        else (
            f"private, max-age={payload.max_age_s}"
            + (", no-cache" if payload.no_cache else "")
            + (", must-revalidate" if payload.must_revalidate else "")
        )
    )
    response_headers = {
        GENERATION_HEADER: request.generation,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": control,
        "ETag": '"' + hashlib.sha256(raw).hexdigest() + '"',
    }
    if request.kind == "basemap":
        response_headers["Age"] = str(max(0, min(2147483647, payload.age_s)))
        response_headers["X-Aviadilo-Cache"] = "stale" if payload.stale else "current"
        if modified := validator(payload.last_modified, modified=True):
            response_headers["Last-Modified"] = modified
    not_modified = False
    if headers is not None and control != "no-store" and not payload.stale:
        if (match := headers.get("If-None-Match")) is not None:
            not_modified = match.strip() == "*" or any(
                tag.strip().removeprefix("W/") == response_headers["ETag"]
                for tag in match[:8192].split(",")
            )
        elif (since := date(headers.get("If-Modified-Since"))) is not None and (
            modified_at := date(response_headers.get("Last-Modified"))
        ) is not None:
            not_modified = modified_at <= since
    return web.Response(
        status=304 if not_modified else 200,
        body=None if not_modified else raw,
        content_type="image/png",
        headers=response_headers,
    )


class AssetGateway:
    """One gateway shared by both routes: 8 active/user, 32 total; no wait queue."""

    def __init__(self, resolve: Callable[[], AssetService | None]) -> None:
        self.resolve = resolve
        self.users: dict[str, int] = {}

    async def get(self, request: web.Request) -> web.Response:
        try:
            user: User | None = request.get("hass_user")
            if user is None:
                raise AssetFailure("unauthorized")
            asset = parse_asset_path(request.raw_path)
            service = selected(self.resolve(), asset.entry_id)
            if asset.generation != service.generation.value:
                raise AssetFailure("stale_generation", service.generation.value)
            hass = request.app[KEY_HASS]
            authorize_photo(hass, user, asset)
            if self.users.get(user.id, 0) >= 8 or sum(self.users.values()) >= 32:
                raise AssetFailure("busy")
            self.users[user.id] = self.users.get(user.id, 0) + 1
            try:
                referer = request.headers.get("Referer")
                # Preserve only a legitimate HA origin. Paths, queries and auth
                # never reach the trusted provider service.
                origin = None
                if referer:
                    url = URL(referer)
                    if url.user is None and url.origin() == request.url.origin():
                        origin = str(url.origin()) + "/"
                task = asyncio.create_task(
                    service.fetch(
                        asset,
                        user,
                        origin if asset.kind == "basemap" else str(request.url.origin()) + "/",
                    )
                )
                try:
                    async with asyncio.timeout(120):
                        while not task.done():
                            await asyncio.wait({task}, timeout=0.1)
                            if request.transport is None or request.transport.is_closing():
                                raise asyncio.CancelledError
                        payload = await task
                finally:
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)
                if selected(self.resolve(), asset.entry_id) is not service:
                    raise AssetFailure("unavailable")
                if asset.generation != service.generation.value:
                    raise AssetFailure("stale_generation", service.generation.value)
                authorize_photo(hass, user, asset)
                return png_response(payload, asset, request.headers)
            finally:
                self.users[user.id] -= 1
                if not self.users[user.id]:
                    del self.users[user.id]
        except AssetFailure as error:
            return error_response(error)
        except Exception:
            # No raw errors, upstream response bodies, credentials or URLs.
            return error_response(AssetFailure("unavailable"))


class BasemapView(HomeAssistantView):
    url = "/api/aviadilo/basemap/{z}/{x}/{y}"
    name = "api:aviadilo:basemap"
    requires_auth = True

    def __init__(self, gateway: AssetGateway) -> None:
        self.gateway = gateway

    async def get(self, request: web.Request, z: str, x: str, y: str) -> web.Response:
        return await self.gateway.get(request)


class PhotoView(HomeAssistantView):
    url = "/api/aviadilo/photo"
    name = "api:aviadilo:photo"
    requires_auth = True

    def __init__(self, gateway: AssetGateway) -> None:
        self.gateway = gateway

    async def get(self, request: web.Request) -> web.Response:
        return await self.gateway.get(request)


@callback
def register(hass: HomeAssistant, resolve: Callable[[], AssetService | None]) -> AssetGateway:
    """Register once per HA router. Resolver always reads the current loaded entry.

    Resolver survives unload/reload. HA authenticates both views and ActiveConnection dispatch.
    """
    if isinstance(previous := hass.data.get("aviadilo_asset_gateway"), AssetGateway):
        previous.resolve = resolve
        return previous
    gateway = AssetGateway(resolve)
    hass.http.register_view(BasemapView(gateway))
    hass.http.register_view(PhotoView(gateway))

    @callback
    def handle(hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]) -> None:
        try:
            validate_asset(msg)
            if connection.user is None:
                raise AssetFailure("unauthorized")
            service = selected(gateway.resolve(), msg.get("entry_id"))
            assert service.entry_id is not None
            connection.send_result(msg["id"], service.generation.info(service.entry_id))
        except AssetFailure as error:
            connection.send_error(msg["id"], error.code, str(error))

    def validate_command(value: Any) -> dict[str, Any]:
        try:
            result = validate_asset(value)
            if result.get("type") != "aviadilo/assets_info":
                raise AssetFailure("invalid_request")
            return result
        except AssetFailure as error:
            raise vol.Invalid(str(error)) from error

    websocket_api.async_register_command(
        hass, "aviadilo/assets_info", handle, vol.Schema(validate_command)
    )
    hass.data["aviadilo_asset_gateway"] = gateway
    return gateway
