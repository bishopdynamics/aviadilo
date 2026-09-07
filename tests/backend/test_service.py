"""Lifecycle, shared leases, cancellation and demand expiry using real HA."""

import asyncio
from copy import deepcopy
from pathlib import Path

import pytest
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryError

from custom_components.aviadilo import async_setup_entry, async_unload_entry, static
from custom_components.aviadilo.const import DEFAULTS, DOMAIN
from custom_components.aviadilo.service import AviadiloService, Demand, Producer


async def settle() -> None:
    for _ in range(15):
        await asyncio.sleep(0)


async def test_setup_unload_reload_shared_client_and_policy_history(
    hass: HomeAssistant, entry: ConfigEntry, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    bundle = tmp_path / "module.js"
    bundle.write_text("export {}")
    monkeypatch.setattr(static, "BUNDLE", bundle)
    assert await async_setup_entry(hass, entry)
    first = entry.runtime_data
    first.scheduler.buckets["adsb_fi"].cooldown = 123456
    with pytest.raises(ConfigEntryError, match="one Aviadilo"):
        await async_setup_entry(hass, entry)
    assert await async_unload_entry(hass, entry)
    assert first.closed and first.cache.fd is None and not first.session.closed
    assert DOMAIN not in hass.data
    assert await async_setup_entry(hass, entry)
    assert entry.runtime_data.session is first.session
    assert entry.runtime_data.scheduler.buckets["adsb_fi"].cooldown == 123456
    assert await async_unload_entry(hass, entry)


async def test_setup_missing_bundle_closes_cache(
    hass: HomeAssistant, entry: ConfigEntry, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(static, "BUNDLE", tmp_path / "missing.js")
    with pytest.raises(ConfigEntryError):
        await async_setup_entry(hass, entry)
    assert DOMAIN not in hass.data


async def test_shared_viewers_heartbeat_expiry_and_cancel(hass: HomeAssistant) -> None:
    now = 0.0
    service = AviadiloService(hass, deepcopy(DEFAULTS), clock=lambda: now)
    calls: list[int] = []
    started = asyncio.Event()

    async def fetch() -> int:
        calls.append(1)
        started.set()
        await asyncio.Future[None]()
        return 1

    service.register_producer(
        "aircraft", Producer("adsb_fi", "area", 10, fetch, lambda value: None)
    )
    await service.start()
    await settle()
    assert not calls
    service.subscribe("one", Demand(aircraft=True))
    service.subscribe("two", Demand(aircraft=True))
    await started.wait()
    assert len(calls) == 1
    service.unsubscribe("one")
    assert "aircraft" in service.tasks
    now = 11
    assert service.heartbeat("two")
    assert service.expiry_timer is not None
    assert service.expiry_timer.when() == pytest.approx(hass.loop.time() + 60, abs=0.02)
    now = 71
    service.reconcile()
    await settle()
    assert not service.leases and not service.tasks
    assert not service.heartbeat("two")
    assert not service.scheduler.jobs
    await service.close()
    assert not service.session.closed


async def test_expired_queued_demand_never_reaches_producer(hass: HomeAssistant) -> None:
    now = 0.0
    service = AviadiloService(hass, deepcopy(DEFAULTS), clock=lambda: now)
    bucket = service.scheduler.buckets["adsb_fi"]
    await bucket.lock.acquire()
    calls = []

    async def fetch() -> None:
        calls.append(1)

    service.register_producer("aircraft", Producer("adsb_fi", "x", 10, fetch, lambda value: None))
    await service.start()
    service.subscribe("viewer", Demand(aircraft=True))
    await settle()
    now = 60
    bucket.lock.release()
    await settle()
    assert calls == []
    assert not service.leases
    await service.close()


async def test_background_only_selected_aircraft_and_invalid_anchor(hass: HomeAssistant) -> None:
    config = deepcopy(DEFAULTS)
    config["background_collection"] = True
    service = AviadiloService(hass, config)
    calls = []

    async def fetch() -> None:
        calls.append(1)
        await asyncio.Future[None]()

    for product, provider in (
        ("aircraft", "adsb_fi"),
        ("rainviewer", "rainviewer"),
        ("wind", "dwd_icon_global"),
    ):
        service.register_producer(
            product, Producer(provider, product, 10, fetch, lambda value: None)
        )
    await service.start()
    await settle()
    assert set(service.tasks) == {"aircraft"}
    assert len(calls) == 1
    hass.config.latitude = float("nan")
    service.reconcile()
    await settle()
    assert service.anchor_state == "invalid_anchor"
    assert not service.tasks
    await service.close()


async def test_viewer_bounds(hass: HomeAssistant) -> None:
    service = AviadiloService(hass, deepcopy(DEFAULTS))
    await service.start()
    for i in range(128):
        service.subscribe(str(i), Demand())
    with pytest.raises(ValueError, match="limit"):
        service.subscribe("extra", Demand())
    service.subscribe("0", Demand(aircraft=True))
    with pytest.raises(ValueError, match="radar"):
        service.subscribe("0", Demand(radar="unknown"))
    await service.close()


async def test_concurrent_setup_only_creates_one_runtime(
    hass: HomeAssistant, entry: ConfigEntry, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    bundle = tmp_path / "module.js"
    bundle.write_text("export {}")
    monkeypatch.setattr(static, "BUNDLE", bundle)
    results = await asyncio.gather(
        async_setup_entry(hass, entry), async_setup_entry(hass, entry), return_exceptions=True
    )
    assert sum(result is True for result in results) == 1
    assert sum(isinstance(result, ConfigEntryError) for result in results) == 1
    assert entry.runtime_data is hass.data[DOMAIN]
    await async_unload_entry(hass, entry)
