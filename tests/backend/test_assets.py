"""Offline paired contracts plus actual HA view/WS interfaces; no provider IO."""

import asyncio
import hashlib
import json
import math
import struct
import zlib
from pathlib import Path
from typing import Any, cast
from unittest.mock import MagicMock

import pytest
import voluptuous as vol
from aiohttp import web
from aiohttp.test_utils import make_mocked_request
from homeassistant.auth.models import User
from homeassistant.components.websocket_api.connection import ActiveConnection
from homeassistant.core import HomeAssistant
from homeassistant.helpers.http import KEY_HASS

from custom_components.aviadilo.assets import (
    ASSETS_CHANGED,
    GENERATION_HEADER,
    AssetFailure,
    AssetGateway,
    AssetGeneration,
    AssetPayload,
    AssetRequest,
    BasemapView,
    PhotoView,
    UnavailableAssetService,
    parse_asset_path,
    register,
    validate_asset,
)

ROOT = Path(__file__).resolve().parents[2]
PATHS = json.loads((ROOT / "contracts/fixtures/asset-paths.json").read_text())
GENERATION = "0123456789abcdef0123456789abcdef:0"


@pytest.mark.parametrize("case", PATHS, ids=[case["name"] for case in PATHS])
def test_paired_request_parser(case: dict[str, Any]) -> None:
    if case["valid"]:
        assert parse_asset_path(case["path"]).as_dict() == case["value"]
    else:
        with pytest.raises(AssetFailure):
            parse_asset_path(case["path"])


@pytest.mark.parametrize("number", [True, False, "2", 2.5, math.nan, math.inf, -math.inf])
def test_runtime_rejects_noncanonical_integer(number: Any) -> None:
    with pytest.raises(AssetFailure):
        validate_asset({**PATHS[0]["value"], "z": number})


def png(width: int = 256, height: int = 256) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
        )

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress((b"\0" + b"\0\x80\xff\xff" * width) * height))
        + chunk(b"IEND", b"")
    )


class Backend(UnavailableAssetService):
    def __init__(self) -> None:
        super().__init__("synthetic-entry", generation=AssetGeneration(GENERATION.split(":")[0]))
        self.calls: list[tuple[AssetRequest, str | None]] = []
        self.payload = png()
        self.wait: asyncio.Event | None = None
        self.crash = False

    async def fetch(self, request: AssetRequest, user: User, referer: str | None) -> AssetPayload:
        self.calls.append((request, referer))
        if self.wait:
            await self.wait.wait()
        if self.crash:
            raise RuntimeError("https://private.invalid/?token=secret")
        return AssetPayload(self.payload, 60)


def request(
    path: str | None = None, *, authenticated: bool = True, photo: bool = False
) -> web.Request:
    req = make_mocked_request(
        "GET",
        path or PATHS[1 if photo else 0]["path"],
        headers={
            "Host": "ha.invalid",
            "Referer": "http://ha.invalid/dashboard/secret?token=secret",
        },
    )
    hass = MagicMock()
    hass.states.get.return_value.attributes = {"entity_picture": "https://photo.invalid/avatar"}
    req.app[KEY_HASS] = cast(HomeAssistant, hass)
    if authenticated:
        user = MagicMock()
        user.id = "synthetic-user"
        user.permissions.check_entity.return_value = True
        req["hass_user"] = user
    return req


def photo_request() -> web.Request:
    key = hashlib.sha256(b"https://photo.invalid/avatar").hexdigest()
    return request(PATHS[1]["path"].replace("0" * 64, key))


async def test_ha_views_enforce_entry_generation_and_auth_before_backend() -> None:
    backend = Backend()
    gateway = AssetGateway(lambda: backend)
    view = BasemapView(gateway)
    assert view.requires_auth is True
    assert PhotoView(gateway).requires_auth is True
    for req, status, code in [
        (request(authenticated=False), 401, "unauthorized"),
        (request(PATHS[0]["path"].replace("synthetic-entry", "other")), 404, "not_found"),
        (request(PATHS[0]["path"].replace("%3A0", "%3A1")), 409, "stale_generation"),
        (request(PATHS[0]["path"] + "&url=https://secret.invalid"), 400, "invalid_request"),
    ]:
        result = await view.get(req, "2", "3", "1")
        assert result.status == status
        body = json.loads(result.text or "{}")
        assert body["code"] == code
        validate_asset(body)
        assert result.headers["Cache-Control"] == "no-store"
        if status == 409:
            assert result.headers[GENERATION_HEADER] == GENERATION
    assert backend.calls == []


async def test_success_is_png_with_generation_safe_referer_and_validators() -> None:
    backend = Backend()
    gateway = AssetGateway(lambda: backend)
    response = await gateway.get(request())
    assert response.status == 200
    assert response.body == backend.payload
    assert response.headers[GENERATION_HEADER] == GENERATION
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["Cache-Control"] == "private, max-age=60"
    assert response.headers["ETag"] == '"' + hashlib.sha256(backend.payload).hexdigest() + '"'
    assert backend.calls[0][1] == "http://ha.invalid/"
    assert gateway.users == {}
    # Auto selection uses the only loaded entry without an entry_id query key.
    assert (
        await gateway.get(request(PATHS[0]["path"].replace("&entry_id=synthetic-entry", "")))
    ).status == 200


async def test_photo_permission_and_current_key_are_rechecked_on_every_hit() -> None:
    backend = Backend()
    backend.payload = png(128, 64)
    gateway = AssetGateway(lambda: backend)
    req = photo_request()
    result = await PhotoView(gateway).get(req)
    assert result.status == 200
    assert result.headers["Cache-Control"] == "no-store"
    req["hass_user"].permissions.check_entity.return_value = False
    assert (await gateway.get(req)).status == 403
    req["hass_user"].permissions.check_entity.return_value = True
    cast(Any, req.app[KEY_HASS]).states.get.return_value.attributes = {
        "entity_picture": "https://photo.invalid/new"
    }
    result = await gateway.get(req)
    assert result.status == 409
    assert json.loads(result.text or "{}")["code"] == "picture_changed"
    assert len(backend.calls) == 1


async def test_late_generation_and_permission_changes_prevent_publication() -> None:
    backend = Backend()
    backend.wait = asyncio.Event()
    gateway = AssetGateway(lambda: backend)
    pending = asyncio.create_task(gateway.get(request()))
    await asyncio.sleep(0)
    backend.generation.counter += 1
    backend.wait.set()
    result = await pending
    assert result.status == 409
    assert result.headers[GENERATION_HEADER].endswith(":1")
    backend.generation.counter = 0
    backend.wait.clear()
    req = photo_request()
    pending = asyncio.create_task(gateway.get(req))
    await asyncio.sleep(0)
    req["hass_user"].permissions.check_entity.return_value = False
    backend.wait.set()
    assert (await pending).status == 403


async def test_shared_admission_limits_and_cancellation_release_slots() -> None:
    backend = Backend()
    backend.wait = asyncio.Event()
    gateway = AssetGateway(lambda: backend)
    pending = [asyncio.create_task(gateway.get(request())) for _ in range(8)]
    await asyncio.sleep(0)
    req = photo_request()
    result = await gateway.get(req)
    assert result.status == 429
    assert result.headers["Retry-After"] == "1"
    for i in range(3):
        for _ in range(8):
            req = request()
            req["hass_user"].id = f"synthetic-user-{i}"
            pending.append(asyncio.create_task(gateway.get(req)))
    await asyncio.sleep(0)
    req = request()
    req["hass_user"].id = "extra"
    assert (await gateway.get(req)).status == 429
    for task in pending:
        task.cancel()
    await asyncio.gather(*pending, return_exceptions=True)
    assert gateway.users == {}


async def test_unavailable_stub_and_service_exception_never_fabricate_success() -> None:
    service = UnavailableAssetService(
        "synthetic-entry", generation=AssetGeneration(GENERATION.split(":")[0])
    )
    response = await AssetGateway(lambda: service).get(request())
    assert response.status == 503
    validate_asset(json.loads(response.text or "{}"))
    backend = Backend()
    backend.crash = True
    response = await AssetGateway(lambda: backend).get(request())
    assert response.status == 503
    assert "secret" not in (response.text or "")
    assert "http" not in (response.text or "")
    assert (await AssetGateway(lambda: None).get(request())).status == 404
    assert (
        await AssetGateway(lambda: None).get(
            request(PATHS[0]["path"].replace("&entry_id=synthetic-entry", ""))
        )
    ).status == 503


@pytest.mark.parametrize(
    "payload",
    [b"", b"<svg></svg>", png(512), png()[:-1], png() + b"extra", b"x" * (2 * 1024 * 1024 + 1)],
)
async def test_invalid_backend_payload_never_returns_success(payload: bytes) -> None:
    backend = Backend()
    backend.payload = payload
    assert (await AssetGateway(lambda: backend).get(request())).status == 502


def test_generation_event_shape_and_opt_in_registration(monkeypatch: pytest.MonkeyPatch) -> None:
    hass = MagicMock()
    backend = Backend()
    commands: list[Any] = []
    monkeypatch.setattr(
        "custom_components.aviadilo.assets.websocket_api.async_register_command",
        lambda *args: commands.append(args),
    )
    gateway = register(cast(HomeAssistant, hass), lambda: backend)
    views = [call.args[0] for call in hass.http.register_view.call_args_list]
    assert [view.url for view in views] == [
        "/api/aviadilo/basemap/{z}/{x}/{y}",
        "/api/aviadilo/photo",
    ]
    assert all(view.gateway is gateway for view in views)
    _, name, handler, schema = commands[0]
    assert name == "aviadilo/assets_info"
    msg = {"id": 1, "type": name, "schema_version": 1}
    assert schema(msg) == msg
    with pytest.raises(vol.Invalid):
        schema({**msg, "schema_version": True})
    with pytest.raises(vol.Invalid):
        schema({**msg, "entry_id": None})
    connection = MagicMock()
    handler(hass, cast(ActiveConnection, connection), msg)
    result = connection.send_result.call_args.args[1]
    validate_asset(result)
    assert result == backend.generation.info(backend.entry_id)
    handler(hass, cast(ActiveConnection, connection), {**msg, "entry_id": "other"})
    assert connection.send_error.call_args.args[1] == "not_found"
    changed = backend.generation.advance(hass, backend.entry_id)
    assert changed["generation"].endswith(":1")
    hass.bus.async_fire.assert_called_once_with(ASSETS_CHANGED, changed)
    validate_asset(changed)
    assert AssetGeneration().value != AssetGeneration().value


async def test_real_ha_http_auth_websocket_info_and_generation_event(hass: HomeAssistant) -> None:
    """Exercise real router/auth/WS serialization on loopback before router freeze."""
    from aiohttp.test_utils import TestClient, TestServer
    from homeassistant.auth import auth_manager_from_config
    from homeassistant.components import websocket_api
    from homeassistant.components.http.auth import async_setup_auth
    from homeassistant.helpers import device_registry, entity_registry

    device_registry.async_setup(hass)
    await device_registry.async_load(hass)
    await entity_registry.async_load(hass)
    hass.auth = await auth_manager_from_config(hass, [], [])
    user = await hass.auth.async_create_user("Asset transport fixture")
    refresh = await hass.auth.async_create_refresh_token(user, client_id="http://test.local")
    token = hass.auth.async_create_access_token(refresh)
    hass.http.app[KEY_HASS] = hass
    await async_setup_auth(hass, hass.http.app)
    await websocket_api.async_setup(hass, {})
    backend = Backend()
    register(hass, lambda: backend)
    async with TestClient(TestServer(hass.http.app)) as client:
        unauthenticated = await client.get(PATHS[0]["path"])
        assert unauthenticated.status == 401
        assert backend.calls == []
        headers = {"Authorization": f"Bearer {token}"}
        response = await client.get(PATHS[0]["path"], headers=headers)
        assert response.status == 200
        assert await response.read() == backend.payload
        assert response.headers[GENERATION_HEADER] == GENERATION
        invalid = await client.get(PATHS[0]["path"] + "&schema_version=1", headers=headers)
        assert invalid.status == 400
        validate_asset(await invalid.json())
        async with client.ws_connect("/api/websocket") as ws:
            assert (await ws.receive_json())["type"] == "auth_required"
            await ws.send_json({"type": "auth", "access_token": token})
            assert (await ws.receive_json())["type"] == "auth_ok"
            await ws.send_json({"id": 1, "type": "subscribe_events", "event_type": ASSETS_CHANGED})
            assert (await ws.receive_json())["success"] is True
            await ws.send_json({"id": 2, "type": "aviadilo/assets_info", "schema_version": 1})
            result = await ws.receive_json()
            assert result["success"] is True
            validate_asset(result["result"])
            assert result["result"] == backend.generation.info(backend.entry_id)
            changed = backend.generation.advance(hass, backend.entry_id)
            event = (await ws.receive_json())["event"]
            assert event["event_type"] == ASSETS_CHANGED
            assert event["data"] == changed
            validate_asset(event["data"])
            stale = await client.get(PATHS[0]["path"], headers=headers)
            assert stale.status == 409
            assert (await stale.json())["generation"] == changed["generation"]
            await ws.send_json({"id": 3, "type": "aviadilo/assets_info", "schema_version": True})
            assert (await ws.receive_json())["success"] is False
