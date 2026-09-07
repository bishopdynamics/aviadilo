"""Aviadilo shared integration lifecycle; live providers arrive in later slices."""

import asyncio

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryError

from .config_flow import settings, validate_settings
from .const import DOMAIN
from .service import AviadiloService
from .static import async_register, async_unregister

type AviadiloConfigEntry = ConfigEntry[AviadiloService]


async def async_setup_entry(hass: HomeAssistant, entry: AviadiloConfigEntry) -> bool:
    lock = hass.data.setdefault("aviadilo_setup_lock", asyncio.Lock())
    async with lock:
        return await _async_setup_entry(hass, entry)


async def _async_setup_entry(hass: HomeAssistant, entry: AviadiloConfigEntry) -> bool:
    if DOMAIN in hass.data:
        raise ConfigEntryError("Only one Aviadilo integration entry is supported")
    config = settings(dict(entry.data), dict(entry.options))
    try:
        validate_settings(hass, config)
    except (ValueError, TypeError, KeyError) as error:
        raise ConfigEntryError(
            "Invalid Aviadilo settings or unavailable location anchor"
        ) from error
    service = AviadiloService(hass, config)
    try:
        await service.start()
        await async_register(hass)
    except BaseException:
        await service.close()
        raise
    entry.runtime_data = service
    hass.data[DOMAIN] = service
    return True


async def async_unload_entry(hass: HomeAssistant, entry: AviadiloConfigEntry) -> bool:
    await entry.runtime_data.close()
    async_unregister(hass)
    if hass.data.get(DOMAIN) is entry.runtime_data:
        del hass.data[DOMAIN]
    return True
