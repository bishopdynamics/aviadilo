"""Real HA core/flow/router fixtures, with no upstream providers or HA package stubs."""

import asyncio
from collections.abc import AsyncIterator
from copy import deepcopy
from pathlib import Path
from types import MappingProxyType
from unittest.mock import AsyncMock

import pytest
from aiohttp.resolver import ThreadedResolver
from homeassistant import config_entries, loader
from homeassistant.components.frontend import DATA_EXTRA_MODULE_URL, UrlManager
from homeassistant.components.http.cors import setup_cors
from homeassistant.components.http.server import HomeAssistantHTTP
from homeassistant.core import HomeAssistant
from homeassistant.helpers import aiohttp_client

from custom_components.aviadilo import config_flow
from custom_components.aviadilo.const import DEFAULTS, DOMAIN


class OfflineResolver(ThreadedResolver):
    """HA closes its shared resolver through this method at shutdown."""

    async def real_close(self) -> None:
        await self.close()


@pytest.fixture
async def hass(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[HomeAssistant]:
    # Avoid mDNS discovery in offline tests; retain HA's real shared ClientSession.
    monkeypatch.setattr(aiohttp_client, "_async_make_resolver", lambda hass: OfflineResolver())
    instance = HomeAssistant(str(tmp_path))
    instance.config.latitude = 0
    instance.config.longitude = 0
    loader.async_setup(instance)
    instance.data[loader.DATA_COMPONENTS][f"{DOMAIN}.config_flow"] = config_flow
    instance.config_entries = config_entries.ConfigEntries(instance, {})
    await instance.config_entries.async_initialize()
    instance.data[DATA_EXTRA_MODULE_URL] = UrlManager(lambda action, url: None, [])
    instance.http = HomeAssistantHTTP(instance, None, None, None, ["127.0.0.1"], 0, [], "modern")
    setup_cors(instance.http.app, [])
    yield instance
    service = instance.data.get(DOMAIN)
    if service:
        await service.close()
    await instance.async_stop(force=True)


@pytest.fixture
async def entry(hass: HomeAssistant, monkeypatch: pytest.MonkeyPatch) -> config_entries.ConfigEntry:
    result = config_entries.ConfigEntry(
        data=deepcopy(DEFAULTS),
        options={},
        domain=DOMAIN,
        version=1,
        minor_version=1,
        source="user",
        title="Aviadilo",
        unique_id=DOMAIN,
        discovery_keys=MappingProxyType({}),
        subentries_data=None,
    )
    # This fixture adds a real entry without setting up HA's complete frontend
    # dependency graph; integration setup/unload is separately exercised below.
    with monkeypatch.context() as patch:
        patch.setattr(hass.config_entries, "async_setup", AsyncMock(return_value=True))
        await hass.config_entries.async_add(result)
    return result


@pytest.fixture
async def transport(
    hass: HomeAssistant, entry: config_entries.ConfigEntry
) -> AsyncIterator[tuple[object, str]]:
    """Real HA authentication, WS router and HTTP middleware on local sockets."""
    from aiohttp.test_utils import TestClient, TestServer
    from homeassistant.auth import auth_manager_from_config
    from homeassistant.components import websocket_api
    from homeassistant.components.http.auth import async_setup_auth
    from homeassistant.helpers import device_registry, entity_registry

    from custom_components.aviadilo.http import register as register_http
    from custom_components.aviadilo.service import AviadiloService, Producer
    from custom_components.aviadilo.websocket import register as register_ws

    device_registry.async_setup(hass)
    await device_registry.async_load(hass)
    await entity_registry.async_load(hass)
    hass.auth = await auth_manager_from_config(hass, [], [])
    user = await hass.auth.async_create_user("Transport test")
    refresh = await hass.auth.async_create_refresh_token(user, client_id="http://test.local")
    token = hass.auth.async_create_access_token(refresh)
    from homeassistant.helpers.http import KEY_HASS

    hass.http.app[KEY_HASS] = hass
    await async_setup_auth(hass, hass.http.app)
    await websocket_api.async_setup(hass, {})
    register_ws(hass)
    register_http(hass)
    service = AviadiloService(hass, deepcopy(DEFAULTS))
    service.entry_id = entry.entry_id

    async def offline_aircraft() -> None:
        await asyncio.Future[None]()

    service.register_producer(
        "aircraft", Producer("adsb_fi", "offline", 10, offline_aircraft, lambda result: None)
    )
    await service.start()
    hass.data[DOMAIN] = service
    async with TestClient(TestServer(hass.http.app)) as client:
        yield client, token
