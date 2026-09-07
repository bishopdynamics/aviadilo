"""Actual HA handlers/serializers and authenticated WebSocket lifecycle."""

import asyncio
import json
import logging
from copy import deepcopy
from pathlib import Path
from typing import Any

import pytest
import voluptuous as vol
from aiohttp import ClientWebSocketResponse
from aiohttp.test_utils import TestClient
from homeassistant.auth.models import User
from homeassistant.auth.permissions import PermissionLookup
from homeassistant.components.websocket_api.connection import ActiveConnection
from homeassistant.components.websocket_api.http import WebSocketAdapter
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry, entity_registry

from custom_components.aviadilo.const import DOMAIN
from custom_components.aviadilo.models import ContractError
from custom_components.aviadilo.service import AviadiloService
from custom_components.aviadilo.websocket import register, validate_command, validate_event

CASES = json.loads(Path("contracts/fixtures/cases.json").read_text())


def fixture(name: str) -> dict[str, Any]:
    return deepcopy(next(case["value"] for case in CASES if case["name"] == name))


async def socket(transport: tuple[TestClient[Any, Any], str]) -> ClientWebSocketResponse:
    client, token = transport
    ws = await client.ws_connect("/api/websocket")
    assert (await ws.receive_json())["type"] == "auth_required"
    await ws.send_json({"type": "auth", "access_token": token})
    assert (await ws.receive_json())["type"] == "auth_ok"
    return ws


def subscribe(service: AviadiloService, identity: int = 1, revision: int = 0) -> dict[str, Any]:
    return {
        **fixture("subscribe"),
        "entry_id": service.entry_id,
        "id": identity,
        "revision": revision,
    }


def connection(hass: HomeAssistant) -> tuple[ActiveConnection, list[dict[str, Any]]]:
    register(hass)
    messages: list[dict[str, Any]] = []

    def send(value: bytes | str | dict[str, Any]) -> None:
        messages.append(json.loads(value) if isinstance(value, (bytes, str)) else value)

    return ActiveConnection(
        WebSocketAdapter(logging.getLogger(__name__), {"connid": 1}),
        hass,
        send,
        User(
            perm_lookup=PermissionLookup(
                entity_registry.async_get(hass), device_registry.async_get(hass)
            ),
            name="Test",
            id="test",
            is_active=True,
        ),
        None,
        None,
    ), messages


@pytest.mark.parametrize(
    "case", [c for c in CASES if c["schema"] in ("command", "event")], ids=lambda case: case["name"]
)
def test_packaged_runtime_shared_corpus(case: dict[str, Any]) -> None:
    validate = validate_command if case["schema"] == "command" else validate_event
    if case["valid"]:
        assert validate(case["value"]) == case["value"]
    else:
        with pytest.raises((vol.Invalid, ContractError)):
            validate(case["value"])


@pytest.mark.parametrize("value", [None, True, False, 1.0, 0, 2, "1"])
def test_strict_version(value: Any) -> None:
    with pytest.raises(vol.Invalid, match="version"):
        validate_command({**fixture("info"), "schema_version": value})


async def test_real_auth_update_ownership_and_cleanup(
    hass: HomeAssistant, transport: tuple[TestClient[Any, Any], str]
) -> None:
    service = hass.data[DOMAIN]
    a, b = await socket(transport), await socket(transport)
    await a.send_json(subscribe(service))
    assert (await a.receive_json())["success"]
    initial = (await a.receive_json())["event"]
    validate_event(initial)
    assert initial["subscription_id"] == 1 and initial["kind"] == "status"
    await b.send_json(
        {"type": "aviadilo/heartbeat", "id": 2, "schema_version": 1, "subscription_id": 1}
    )
    assert (await b.receive_json())["error"]["code"] == "not_found"
    update = {
        **subscribe(service, 3, 1),
        "type": "aviadilo/update_subscription",
        "subscription_id": 1,
    }
    await b.send_json(update)
    assert (await b.receive_json())["error"]["code"] == "not_found"
    await a.send_json(update)
    assert (await a.receive_json())["success"]
    assert (await a.receive_json())["event"]["revision"] == 1
    await a.send_json({**update, "id": 4})
    assert (await a.receive_json())["error"]["code"] == "stale_revision"
    await a.send_json({"id": 5, "type": "unsubscribe_events", "subscription": 1})
    assert (await a.receive_json())["success"]
    assert not service.leases and not service.viewers
    await a.send_json(subscribe(service, 6))
    await a.receive_json()
    await a.receive_json()
    await a.close()
    await b.close()
    for _ in range(20):
        await asyncio.sleep(0)
    assert not service.leases and not service.viewers


async def test_unload_expiry_and_info(
    hass: HomeAssistant, transport: tuple[TestClient[Any, Any], str]
) -> None:
    from jsonschema import Draft7Validator

    service = hass.data[DOMAIN]
    ws = await socket(transport)
    await ws.send_json({**fixture("info"), "id": 1, "entry_id": None})
    info = (await ws.receive_json())["result"]
    Draft7Validator(json.loads(Path("contracts/info.schema.json").read_text())).validate(info)
    assert info["capabilities"] == {"aircraft": ["adsb_fi"], "radar": [], "wind": []}
    await ws.send_json(subscribe(service, 2))
    await ws.receive_json()
    await ws.receive_json()
    for lease in service.leases.values():
        lease.expires = service.clock() - 1
    service.reconcile()
    assert (await ws.receive_json())["event"]["statuses"][0]["message"] == "aviadilo:lease_expired"
    assert not service.leases and not service.viewers
    await ws.send_json(subscribe(service, 3))
    await ws.receive_json()
    await ws.receive_json()
    await service.close()
    assert (await ws.receive_json())["event"]["statuses"][0]["message"] == "aviadilo:closed"
    assert not service.viewers and not service.leases
    del hass.data[DOMAIN]
    await ws.send_json({**fixture("info"), "id": 4, "entry_id": None})
    assert (await ws.receive_json())["result"]["entry_id"] is None
    await ws.close()


async def test_connection_user_and_total_bounds(
    hass: HomeAssistant, transport: tuple[TestClient[Any, Any], str]
) -> None:
    service = hass.data[DOMAIN]
    connections = [connection(hass) for _ in range(5)]
    for conn, messages in connections:
        for i in range(1, 6):
            conn.async_handle(subscribe(service, i))
        assert messages[-1]["error"]["code"] == "limit_reached"
    assert len(service.viewers) == 16
    for conn, _ in connections:
        conn.async_handle_close()
    assert not service.viewers and not service.leases


async def test_publication_fixtures_revision_scope_replay_and_rejection(
    hass: HomeAssistant, transport: tuple[TestClient[Any, Any], str]
) -> None:
    service = hass.data[DOMAIN]
    conn, messages = connection(hass)
    selected = subscribe(service)
    selected["layers"] = {"aircraft": True, "radar": True, "wind": True}
    conn.async_handle(selected)
    for name, product in (
        ("aircraft-zero-and-unknown", "aircraft"),
        ("radar", "rainviewer"),
        ("wind", "wind"),
    ):
        context = service.capture(product, selected["viewport"])
        payload = fixture(name)
        for field in ("schema_version", "subscription_id", "revision"):
            del payload[field]
        assert service.publish(context, payload)
        event = messages[-1]["event"]
        validate_event(event)
        assert event == {**fixture(name), "subscription_id": 1, "revision": 0}
    old = service.capture("rainviewer")
    conn.async_handle(
        {
            **selected,
            "id": 2,
            "type": "aviadilo/update_subscription",
            "subscription_id": 1,
            "revision": 1,
        }
    )
    payload = {
        key: value
        for key, value in fixture("radar").items()
        if key not in ("schema_version", "subscription_id", "revision")
    }
    count = len(messages)
    assert not service.publish(old, payload)
    assert len(messages) == count
    payload["provider"] = "noaa_ksox"
    with pytest.raises(ValueError, match="mismatch"):
        service.publish(service.capture("rainviewer"), payload)
    conn.async_handle_close()


@pytest.mark.parametrize(
    "patch",
    [
        {"schema_version": True},
        {"schema_version": 2},
        {"unexpected": 1},
        {"revision": -1},
        {"viewport": {"south": 4}},
        {"layers": {"aircraft": 1, "radar": False, "wind": False}},
    ],
)
async def test_actual_handler_rejects_malformed(
    hass: HomeAssistant, transport: tuple[TestClient[Any, Any], str], patch: dict[str, Any]
) -> None:
    ws = await socket(transport)
    await ws.send_json({**subscribe(hass.data[DOMAIN]), **patch})
    assert (await ws.receive_json())["error"]["code"] == "invalid_format"
    assert not hass.data[DOMAIN].leases
    await ws.close()


async def test_background_aircraft_retention_checks_captured_area(
    hass: HomeAssistant, transport: tuple[TestClient[Any, Any], str]
) -> None:
    service = hass.data[DOMAIN]
    payload = {
        key: value
        for key, value in fixture("aircraft-zero-and-unknown").items()
        if key not in ("schema_version", "subscription_id", "revision")
    }
    context = service.capture("aircraft")
    assert not service.publish(context, payload)
    service.config["background_collection"] = True
    assert service.publish(context, payload)
    assert len(service.snapshots) == 1
    hass.config.latitude = 1
    assert not service.publish(context, payload)
    await service.close()
    assert not service.publish(context, payload)


async def test_disconnect_drain_with_expired_peer_subscription(
    hass: HomeAssistant, transport: tuple[TestClient[Any, Any], str]
) -> None:
    service = hass.data[DOMAIN]
    conn, _ = connection(hass)
    conn.async_handle(subscribe(service, 1))
    conn.async_handle(subscribe(service, 2))
    service.leases[f"{id(conn)}:2"].expires = service.clock() - 1
    conn.async_handle_close()
    await asyncio.sleep(0)
    assert not conn.subscriptions and not service.leases and not service.viewers


async def test_precise_lease_timer_releases_callbacks(
    hass: HomeAssistant, transport: tuple[TestClient[Any, Any], str]
) -> None:
    service = hass.data[DOMAIN]
    ws = await socket(transport)
    await ws.send_json(subscribe(service))
    await ws.receive_json()
    await ws.receive_json()
    next(iter(service.leases.values())).expires = service.clock() + 0.02
    service.reconcile()
    async with asyncio.timeout(1):
        event = (await ws.receive_json())["event"]
    assert event["statuses"][0]["message"] == "aviadilo:lease_expired"
    assert not service.viewers and not service.leases
    await ws.close()


async def test_unauthenticated_websocket_cannot_subscribe(
    hass: HomeAssistant, transport: tuple[TestClient[Any, Any], str]
) -> None:
    ws = await transport[0].ws_connect("/api/websocket")
    assert (await ws.receive_json())["type"] == "auth_required"
    await ws.send_json(subscribe(hass.data[DOMAIN]))
    assert (await ws.receive_json())["type"] == "auth_invalid"
    assert not hass.data[DOMAIN].leases
    await ws.close()


async def test_shared_snapshot_replay_rejects_previous_area(
    hass: HomeAssistant, transport: tuple[TestClient[Any, Any], str]
) -> None:
    service = hass.data[DOMAIN]
    service.config["background_collection"] = True
    payload = {
        key: value
        for key, value in fixture("aircraft-zero-and-unknown").items()
        if key not in ("schema_version", "subscription_id", "revision")
    }
    assert service.publish(service.capture("aircraft"), payload)
    hass.config.latitude = 1
    conn, messages = connection(hass)
    conn.async_handle(subscribe(service))
    assert [message["event"]["kind"] for message in messages if message["type"] == "event"] == [
        "status"
    ]
    conn.async_handle_close()
