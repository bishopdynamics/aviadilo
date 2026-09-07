"""Real HA flow-manager branches, round trips and graphical maintenance."""

import json
from copy import deepcopy
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock

import pytest
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from jsonschema import validate

from custom_components.aviadilo.config_flow import AviadiloConfigFlow, resolve_anchor
from custom_components.aviadilo.const import DEFAULTS, DOMAIN
from custom_components.aviadilo.service import AviadiloService


def basic(**changes: Any) -> dict[str, Any]:
    return {
        "anchor_kind": "home",
        "aircraft_provider": "adsb_fi",
        "aircraft_radius": 50,
        "aircraft_radius_unit": "km",
        "aircraft_interval_s": 10,
        "disk_cache_mib": 512,
        "background_collection": False,
        **changes,
    }


@pytest.mark.parametrize("anchor", ["home", "zone", "custom"])
async def test_real_config_manager_all_anchor_branches(
    hass: HomeAssistant, monkeypatch: pytest.MonkeyPatch, anchor: str
) -> None:
    monkeypatch.setattr(hass.config_entries, "async_setup", AsyncMock(return_value=True))
    hass.states.async_set("zone.test", "0", {"latitude": 0, "longitude": 0})
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["type"] == FlowResultType.FORM
    assert result["data_schema"] is not None
    assert result["data_schema"]({}) == basic()
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], basic(anchor_kind=anchor)
    )
    if anchor != "home":
        assert result["step_id"] == "anchor"
        values: dict[str, Any] = (
            {"entity_id": "zone.test"} if anchor == "zone" else {"latitude": 0, "longitude": 0}
        )
        result = await hass.config_entries.flow.async_configure(result["flow_id"], values)
    assert result["step_id"] == "advanced"
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], deepcopy(DEFAULTS["provider_pacing"])
    )
    assert result["type"] == FlowResultType.CREATE_ENTRY
    validate(
        result["data"], json.loads(Path("contracts/integration-config.schema.json").read_text())
    )
    if anchor == "home":
        assert result["data"] == DEFAULTS
    duplicate = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert duplicate["type"] == FlowResultType.ABORT
    assert duplicate["reason"] == "single_instance_allowed"


@pytest.mark.parametrize(
    "changes",
    [
        {"aircraft_radius": 0},
        {"aircraft_radius": float("nan")},
        {"aircraft_radius": float("inf")},
        {"disk_cache_mib": 127},
        {"disk_cache_mib": 512.1},
        {"background_collection": "yes"},
        {"aircraft_provider": "unknown"},
        {"aircraft_interval_s": 1},
    ],
)
async def test_invalid_basic_inputs(hass: HomeAssistant, changes: dict[str, Any]) -> None:
    flow = AviadiloConfigFlow()
    flow.hass = hass
    flow.context = {"source": "user"}
    result = await flow.async_step_user(basic(**changes))
    assert result["errors"] == {"base": "invalid_settings"}


@pytest.mark.parametrize(
    "anchor",
    [
        {"kind": "custom", "latitude": None, "longitude": 0},
        {"kind": "custom", "latitude": float("nan"), "longitude": 0},
        {"kind": "custom", "latitude": False, "longitude": 0},
        {"kind": "custom", "latitude": 91, "longitude": 0},
        {"kind": "zone", "entity_id": "zone.missing"},
    ],
)
async def test_invalid_anchor_resolver(hass: HomeAssistant, anchor: dict[str, Any]) -> None:
    with pytest.raises(ValueError):
        resolve_anchor(hass, anchor)


async def test_anchor_and_advanced_errors(hass: HomeAssistant) -> None:
    flow = AviadiloConfigFlow()
    flow.hass = hass
    flow.context = {"source": "user"}
    await flow.async_step_user(basic(anchor_kind="custom"))
    result = await flow.async_step_anchor({"latitude": None, "longitude": 0})
    assert result["errors"] == {"base": "invalid_anchor"}
    await flow.async_step_anchor({"latitude": 0, "longitude": 0})
    for key in DEFAULTS["provider_pacing"]:
        pacing = deepcopy(DEFAULTS["provider_pacing"])
        pacing[key] = 0 if key.endswith("interval_s") else 100
        result = await flow.async_step_advanced(pacing)
        assert result["errors"] == {"base": "invalid_settings"}
    hass.config.latitude = float("nan")
    flow = AviadiloConfigFlow()
    flow.hass = hass
    flow.context = {"source": "user"}
    result = await flow.async_step_user(basic())
    assert result["errors"] == {"base": "invalid_anchor"}


@pytest.mark.parametrize("unit,expected", [("km", 10000), ("mi", 16093.44), ("nmi", 18520)])
async def test_options_preserve_future_fields_units_and_reload(
    hass: HomeAssistant,
    entry: ConfigEntry,
    monkeypatch: pytest.MonkeyPatch,
    unit: str,
    expected: float,
) -> None:
    data = {**dict(entry.data), "future": {"value": "keep"}}
    hass.config_entries.async_update_entry(entry, data=data)
    reload = AsyncMock(return_value=True)
    monkeypatch.setattr(hass.config_entries, "async_reload", reload)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["type"] == FlowResultType.MENU
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "user"}
    )
    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        basic(
            aircraft_radius=10,
            aircraft_radius_unit=unit,
            aircraft_provider="adsb_lol",
            disk_cache_mib=128,
            background_collection=True,
        ),
    )
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], deepcopy(DEFAULTS["provider_pacing"])
    )
    assert result["type"] == FlowResultType.CREATE_ENTRY
    assert entry.options["future"] == {"value": "keep"}
    assert entry.options["aircraft_radius_m"] == pytest.approx(expected)
    await hass.async_block_till_done()
    reload.assert_awaited_once_with(entry.entry_id)
    reopened = await hass.config_entries.options.async_init(entry.entry_id)
    reopened = await hass.config_entries.options.async_configure(
        reopened["flow_id"], {"next_step_id": "user"}
    )
    assert reopened["data_schema"] is not None
    assert reopened["data_schema"]({})["aircraft_radius"] == pytest.approx(10)


@pytest.mark.parametrize("confirm", [False, True])
async def test_cache_clear_requires_action_and_confirmation(
    hass: HomeAssistant, entry: ConfigEntry, monkeypatch: pytest.MonkeyPatch, confirm: bool
) -> None:
    service = AviadiloService(hass, deepcopy(DEFAULTS))
    await service.start()
    hass.data[DOMAIN] = service
    clear = AsyncMock()
    monkeypatch.setattr(service.cache, "clear", clear)
    before = dict(entry.options)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    clear.assert_not_called()
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "clear_cache"}
    )
    clear.assert_not_called()
    assert result["data_schema"] is not None
    assert result["data_schema"]({}) == {"confirm": False}
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"confirm": confirm}
    )
    assert result["type"] == FlowResultType.ABORT
    assert result["reason"] == ("cache_cleared" if confirm else "cache_clear_cancelled")
    assert clear.await_count == int(confirm)
    assert dict(entry.options) == before


async def test_clear_while_unloaded(hass: HomeAssistant, entry: ConfigEntry) -> None:
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "clear_cache"}
    )
    result = await hass.config_entries.options.async_configure(result["flow_id"], {"confirm": True})
    assert result["reason"] == "integration_not_loaded"
