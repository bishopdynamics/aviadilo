"""HA graphical diagnostics, using an allowlist with no location or response data."""

from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN, VERSION
from .service import AviadiloService


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: ConfigEntry[AviadiloService]
) -> dict[str, Any]:
    service = hass.data.get(DOMAIN)
    return {
        "version": VERSION,
        "loaded": service is not None,
        "runtime": service.diagnostics() if service is not None else None,
    }
