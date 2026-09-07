"""Normal HA diagnostics function returns only bounded operational counts/state."""

import json
from copy import deepcopy

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from custom_components.aviadilo.const import DEFAULTS, DOMAIN
from custom_components.aviadilo.diagnostics import async_get_config_entry_diagnostics
from custom_components.aviadilo.service import AviadiloService, Demand


async def test_diagnostics_allowlist(hass: HomeAssistant, entry: ConfigEntry) -> None:
    config = deepcopy(DEFAULTS)
    config["anchor"] = {"kind": "custom", "latitude": 34.12345, "longitude": -117.12345}
    config["future_secret"] = "private-password"
    service = AviadiloService(hass, config)
    await service.start()
    hass.data[DOMAIN] = service
    service.subscribe("device_tracker.private_name", Demand(aircraft=True))
    report = await async_get_config_entry_diagnostics(hass, entry)
    encoded = json.dumps(report)
    for private in (
        "34.12345",
        "117.12345",
        "private-password",
        "device_tracker",
        "latitude",
        "longitude",
        'anchor"',
    ):
        assert private not in encoded
    assert report["runtime"]["viewers"] == 1
    assert report["runtime"]["cache"]["entries"] == 0
    await service.close()
    del hass.data[DOMAIN]
    assert (await async_get_config_entry_diagnostics(hass, entry))["loaded"] is False
