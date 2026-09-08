"""Private caching, image bounds, and the addresses actually used by aiohttp."""

import asyncio
import hashlib
import io
import json
import socket
from typing import Any, cast
from unittest.mock import MagicMock

import pytest
from aiohttp import ClientSession, DummyCookieJar, TCPConnector
from aiohttp.abc import ResolveResult
from aiohttp.resolver import ThreadedResolver
from homeassistant.auth.models import User
from homeassistant.core import HomeAssistant
from PIL import Image
from yarl import URL

from custom_components.aviadilo.assets import AssetFailure, AssetRequest
from custom_components.aviadilo.cache import Entry
from custom_components.aviadilo.const import DEFAULTS
from custom_components.aviadilo.providers.asset_http import InvalidAsset
from custom_components.aviadilo.providers.photos import (
    PHOTO_BYTES,
    PhotoProvider,
    PublicResolver,
    external_url,
    public_address,
    public_socket,
)
from custom_components.aviadilo.scheduler import Scheduler
from custom_components.aviadilo.service import AviadiloService
from tests.backend.providers.test_asset_http import image_bytes
from tests.backend.providers.test_osm import Response, Session

URL_VALUE = "https://pictures.example/avatar?private-token=secret"
KEY = hashlib.sha256(URL_VALUE.encode()).hexdigest()


@pytest.mark.parametrize(
    "value",
    [
        "http://pictures.example/avatar",
        "/api/image/local",
        "//pictures.example/a",
        "https://u:secret@pictures.example/a",
        "https://pictures.example:444/a",
        "https://127.0.0.1/a",
        "https://10.0.0.1/a",
        "https://169.254.169.254/a",
        "https://[::1]/a",
        "https://[::ffff:127.0.0.1]/a",
        "https://[fe80::1%25eth0]/a",
        "https://2130706433/a",
        "https://127.1/a",
        "https://0177.0.0.1/a",
        "https://0x7f000001/a",
        "https://localhost/a",
        "https://pictures.example/a#secret",
        "https://pictures.example/\na",
        "https://[2002:7f00:1::]/a",
        "https://224.0.0.1/a",
        "https://100.64.0.1/a",
        "https://pictures.example\\@public.example/a",
    ],
)
def test_untrusted_urls(value: str) -> None:
    with pytest.raises(InvalidAsset, match="destination"):
        external_url(value, set())


def test_public_https_and_firstparty() -> None:
    assert external_url(URL_VALUE, set()) == URL(URL_VALUE)
    assert external_url("https://8.8.8.8/a", set()).host == "8.8.8.8"
    assert external_url("https://[2606:4700:4700::1111]/a", set()).host == "2606:4700:4700::1111"
    with pytest.raises(InvalidAsset):
        external_url(URL_VALUE, {"https://pictures.example"})


@pytest.mark.parametrize(
    "value", ["127.0.0.1", "::ffff:8.8.8.8", "10.0.0.1", "fc00::1", "192.0.2.1"]
)
def test_socket_guard_blocks_literal_and_rebinding_destinations(
    value: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    create = MagicMock()
    monkeypatch.setattr(socket, "socket", create)
    with pytest.raises(InvalidAsset):
        public_socket((socket.AF_INET, socket.SOCK_STREAM, 0, "", (value, 443)))
    create.assert_not_called()


@pytest.mark.parametrize(
    "addresses,accepted",
    [
        (["8.8.8.8"], True),
        (["8.8.8.8", "127.0.0.1"], False),
        (["10.0.0.1", "8.8.8.8"], False),
        (["::ffff:127.0.0.1"], False),
        ([], False),
    ],
)
async def test_resolver_rejects_complete_mixed_answer_set(
    addresses: list[str], accepted: bool, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def resolve(
        self: ThreadedResolver,
        host: str,
        port: int = 0,
        family: socket.AddressFamily = socket.AF_INET,
    ) -> list[ResolveResult]:
        return [
            ResolveResult(hostname=host, host=value, port=port, family=family, proto=0, flags=0)
            for value in addresses
        ]

    monkeypatch.setattr(ThreadedResolver, "resolve", resolve)
    resolver = PublicResolver()
    if accepted:
        assert [
            answer["host"] for answer in await resolver.resolve("pictures.example", 443)
        ] == addresses
    else:
        with pytest.raises(InvalidAsset):
            await resolver.resolve("pictures.example", 443)
    await resolver.close()


async def test_real_connector_uses_guarded_dns_and_actual_socket(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Exercise aiohttp's real connector path, stopping before any network connect."""

    async def resolve(
        self: ThreadedResolver,
        host: str,
        port: int = 0,
        family: socket.AddressFamily = socket.AF_INET,
    ) -> list[ResolveResult]:
        return [
            ResolveResult(
                hostname=host, host="8.8.8.8", port=port, family=socket.AF_INET, proto=0, flags=0
            )
        ]

    monkeypatch.setattr(ThreadedResolver, "resolve", resolve)
    seen = []

    def stop_socket(address_info: tuple[Any, ...]) -> socket.socket:
        seen.append(address_info[4][0])
        public_address(address_info[4][0])
        raise InvalidAsset("Stopped before network")

    connector = TCPConnector(
        resolver=PublicResolver(), socket_factory=stop_socket, use_dns_cache=False
    )
    async with ClientSession(connector=connector) as session:
        for value in ["https://pictures.example/a", "https://8.8.8.8/a"]:
            with pytest.raises(InvalidAsset):
                await session.get(value)
    assert seen == ["8.8.8.8", "8.8.8.8"]


async def test_owned_session_has_no_shared_cookies_auth_or_proxy() -> None:
    scheduler = Scheduler(DEFAULTS["provider_pacing"])
    provider = PhotoProvider(scheduler)
    session = provider._session()
    assert isinstance(session.cookie_jar, DummyCookieJar)
    assert session.trust_env is False and session.auth is None
    assert session.connector and session.connector.limit == 1
    assert session.connector.force_close
    await provider.close()
    assert session.closed
    await scheduler.close()


async def test_private_hits_permission_identity_and_user_isolation(hass: HomeAssistant) -> None:
    service = AviadiloService(hass, DEFAULTS)
    await service.start()
    response = Response({"Cache-Control": "max-age=1000"}, body=image_bytes((800, 600)))
    session = Session(response, Response(body=image_bytes((800, 600))))
    service.photos.session = cast(ClientSession, session)
    hass.states.async_set("device_tracker.fixture", "home", {"entity_picture": URL_VALUE})
    user = MagicMock(spec=User)
    user.id = "user-one"
    user.permissions = MagicMock()
    user.permissions.check_entity.return_value = True
    request = AssetRequest(
        "photo", service.generation.value, entity_id="device_tracker.fixture", picture_key=KEY
    )
    try:
        result = await service.fetch(request, user, None)
        assert result.no_store
        with Image.open(io.BytesIO(result.payload)) as image:
            assert image.size == (128, 96)
        assert await service.fetch(request, user, None) == result
        assert len(session.calls) == 1
        assert not service.cache.index
        user.permissions.check_entity.return_value = False
        with pytest.raises(AssetFailure, match="denied"):
            await service.fetch(request, user, None)
        user.permissions.check_entity.return_value = True
        user.id = "user-two"
        service.scheduler.buckets["photos"].next_start = 0
        await service.fetch(request, user, None)
        assert len(session.calls) == 2 and len(service.photos.memory) == 2
        hass.states.async_set(
            "device_tracker.fixture", "home", {"entity_picture": URL_VALUE + "new"}
        )
        with pytest.raises(AssetFailure, match="changed"):
            await service.fetch(request, user, None)
        encoded = json.dumps(service.diagnostics())
        for private in ["fixture", "user-one", "pictures.example", "secret", KEY]:
            assert private not in encoded
    finally:
        service.photos.session = None
        await service.close()


async def test_revoked_permission_after_download_prevents_private_retention() -> None:
    scheduler = Scheduler(DEFAULTS["provider_pacing"])
    provider = PhotoProvider(scheduler)
    response = Response()
    response.gate = asyncio.Event()
    provider.session = cast(ClientSession, Session(response))
    permitted = True

    def authorized() -> None:
        if not permitted:
            raise AssetFailure("forbidden")

    task = asyncio.create_task(provider.fetch("user", "entity", KEY, URL_VALUE, set(), authorized))
    await response.started.wait()
    permitted = False
    response.gate.set()
    with pytest.raises(AssetFailure):
        await task
    assert not provider.memory and provider.size == 0
    provider.session = None
    await provider.close()
    await scheduler.close()


async def test_transient_coalescing_last_waiter_and_clear() -> None:
    scheduler = Scheduler(DEFAULTS["provider_pacing"])
    provider = PhotoProvider(scheduler)
    response = Response({"Cache-Control": "no-store"})
    response.gate = asyncio.Event()
    session = Session(response)
    provider.session = cast(ClientSession, session)

    async def fetch() -> Any:
        return await provider.fetch("user", "entity", KEY, URL_VALUE, set(), lambda: None)

    first = asyncio.create_task(fetch())
    await response.started.wait()
    second = asyncio.create_task(fetch())
    await asyncio.sleep(0)
    first.cancel()
    with pytest.raises(asyncio.CancelledError):
        await first
    response.gate.set()
    assert (await second).no_store and not provider.memory
    assert len(session.calls) == 1
    scheduler.buckets["photos"].next_start = 0
    response = Response()
    response.gate = asyncio.Event()
    session.responses.append(response)
    last = asyncio.create_task(fetch())
    await response.started.wait()
    await provider.clear()
    with pytest.raises(asyncio.CancelledError):
        await last
    assert response.closed and not provider.jobs and not provider.memory
    provider.session = None
    await provider.close()
    await scheduler.close()


async def test_thumbnail_lru_bytes_and_count_bounds(monkeypatch: pytest.MonkeyPatch) -> None:
    scheduler = Scheduler(DEFAULTS["provider_pacing"])
    provider = PhotoProvider(scheduler, clock=lambda: 100)
    # Bounded output PNG data is normally much smaller; exercise both eviction
    # ceilings independently with controlled entries returned at the scheduler.
    payload = b"x" * (128 * 128 * 4)

    async def request(provider_name: str, key: str, producer: Any, *, retry: bool = True) -> Entry:
        return Entry(key, "photos", "thumbnail", 100, 200, "image/png", payload)

    monkeypatch.setattr(scheduler, "request", request)
    for i in range(130):
        await provider.fetch("user", str(i), KEY, URL_VALUE, set(), lambda: None)
    assert provider.size <= PHOTO_BYTES and len(provider.memory) == 128
    assert provider.counters["evictions"] == 2
    payload = b"x" * (128 * 128 * 4 + 500)
    for i in range(130, 160):
        await provider.fetch("user", str(i), KEY, URL_VALUE, set(), lambda: None)
    assert provider.size <= PHOTO_BYTES and len(provider.memory) < 128
    await provider.close()
    await scheduler.close()


@pytest.mark.parametrize("status", [403, 404])
async def test_missing_avatar_does_not_block_another_avatar(status: int) -> None:
    from custom_components.aviadilo.scheduler import ProviderError

    scheduler = Scheduler(DEFAULTS["provider_pacing"])
    provider = PhotoProvider(scheduler)
    session = Session(Response(status=status), Response())
    provider.session = cast(ClientSession, session)
    with pytest.raises(ProviderError):
        await provider.fetch("user", "missing", KEY, URL_VALUE, set(), lambda: None)
    assert not scheduler.buckets["photos"].blocked
    scheduler.buckets["photos"].next_start = 0
    result = await provider.fetch("user", "available", KEY, URL_VALUE, set(), lambda: None)
    assert result.payload and len(session.calls) == 2
    provider.session = None
    await provider.close()
    await scheduler.close()


async def test_photo_conditional_revalidation_and_no_store_removes_old_thumbnail() -> None:
    now = 100.0
    scheduler = Scheduler(DEFAULTS["provider_pacing"])
    provider = PhotoProvider(scheduler, clock=lambda: now)
    session = Session(
        Response({"Cache-Control": "max-age=5", "ETag": '"v1"'}),
        Response({"Cache-Control": "max-age=20", "ETag": '"v2"'}, status=304),
        Response({"Cache-Control": "no-store"}, status=304),
    )
    provider.session = cast(ClientSession, session)

    async def fetch() -> Any:
        return await provider.fetch("user", "entity", KEY, URL_VALUE, set(), lambda: None)

    original = await fetch()
    now = 105
    scheduler.buckets["photos"].next_start = 0
    renewed = await fetch()
    assert renewed.payload == original.payload
    assert session.calls[1][1]["headers"] == {"If-None-Match": '"v1"'}
    assert provider.counters["revalidations"] == 1
    now = 125
    scheduler.buckets["photos"].next_start = 0
    transient = await fetch()
    assert transient.no_store and not provider.memory
    assert session.calls[2][1]["headers"] == {"If-None-Match": '"v2"'}
    provider.session = None
    await provider.close()
    await scheduler.close()
