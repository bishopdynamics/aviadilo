"""Graphical shared settings and explicitly confirmed cache maintenance."""

import math
import re
from copy import deepcopy
from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.config_entries import ConfigFlowResult
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import selector

from .const import DEFAULTS, DOMAIN

UNIT_SCALE = {"km": 1000, "mi": 1609.344, "nmi": 1852}


def settings(data: dict[str, Any], options: dict[str, Any]) -> dict[str, Any]:
    """Fill defaults and preserve future fields on unrelated edits."""
    result = deepcopy(DEFAULTS)
    result.update(deepcopy(data))
    result.update(deepcopy(options))
    result["provider_pacing"] = {
        **DEFAULTS["provider_pacing"],
        **data.get("provider_pacing", {}),
        **options.get("provider_pacing", {}),
    }
    return result


def number(value: Any, low: float, high: float, *, integer: bool = False) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("Invalid number")
    if not math.isfinite(value) or not low <= value <= high or (integer and int(value) != value):
        raise ValueError("Number out of range")
    return float(value)


def resolve_anchor(hass: HomeAssistant, anchor: dict[str, Any]) -> tuple[float, float]:
    """Unavailable anchors never turn into the real, valid location (0, 0)."""
    lat: Any
    lon: Any
    kind = anchor.get("kind")
    if kind == "home":
        lat, lon = hass.config.latitude, hass.config.longitude
    elif kind == "zone":
        entity_id = anchor.get("entity_id", "")
        if not isinstance(entity_id, str) or not re.fullmatch(r"zone\.[a-z0-9_]{1,251}", entity_id):
            raise ValueError("Invalid zone")
        state = hass.states.get(entity_id)
        if state is None or state.state in ("unavailable", "unknown"):
            raise ValueError("Zone unavailable")
        lat, lon = state.attributes.get("latitude"), state.attributes.get("longitude")
    elif kind == "custom":
        lat, lon = anchor.get("latitude"), anchor.get("longitude")
    else:
        raise ValueError("Invalid anchor")
    return number(lat, -90, 90), number(lon, -180, 180)


def validate_settings(hass: HomeAssistant, config: dict[str, Any]) -> None:
    if config.get("schema_version") != 1:
        raise ValueError("Unsupported configuration version")
    resolve_anchor(hass, config["anchor"])
    if config["aircraft_provider"] not in ("adsb_fi", "adsb_lol"):
        raise ValueError("Invalid provider")
    if config["aircraft_radius_unit"] not in UNIT_SCALE:
        raise ValueError("Invalid unit")
    number(config["aircraft_radius_m"], 1, 463000)
    number(config["aircraft_interval_s"], 2, 86400)
    number(config["disk_cache_mib"], 128, 4096, integer=True)
    if not isinstance(config["background_collection"], bool):
        raise ValueError("Invalid background option")
    for key, default in DEFAULTS["provider_pacing"].items():
        interval = key.endswith("interval_s")
        number(
            config["provider_pacing"][key],
            default if interval else 1,
            86400 if interval else default,
            integer=not interval,
        )


def numeric(low: float, high: float, unit: str | None = None) -> selector.NumberSelector:
    config: selector.NumberSelectorConfig = {
        "min": low,
        "max": high,
        "mode": selector.NumberSelectorMode.BOX,
        "step": "any",
    }
    if unit:
        config["unit_of_measurement"] = unit
    return selector.NumberSelector(config)


def choice(values: list[str]) -> selector.SelectSelector:
    return selector.SelectSelector(
        selector.SelectSelectorConfig(
            options=[
                selector.SelectOptionDict(
                    value=value,
                    label={"adsb_fi": "adsb.fi", "adsb_lol": "ADSB.lol"}.get(value, value),
                )
                for value in values
            ],
            mode=selector.SelectSelectorMode.DROPDOWN,
        )
    )


class SettingsForm:
    """Shared form engine, used through HA's normal config/options flow managers."""

    def __init__(
        self, owner: config_entries.ConfigFlow | config_entries.OptionsFlow, value: dict[str, Any]
    ) -> None:
        self.owner, self.value = owner, value
        self.anchor_kind = value["anchor"]["kind"]

    async def basic(self, user_input: dict[str, Any] | None) -> ConfigFlowResult:
        errors = {}
        value = self.value
        if user_input is not None:
            try:
                candidate = deepcopy(value)
                self.anchor_kind = user_input["anchor_kind"]
                if self.anchor_kind not in ("home", "zone", "custom"):
                    raise ValueError("Invalid anchor")
                unit = user_input["aircraft_radius_unit"]
                candidate.update(
                    {
                        key: user_input[key]
                        for key in (
                            "aircraft_provider",
                            "aircraft_interval_s",
                            "disk_cache_mib",
                            "background_collection",
                            "aircraft_radius_unit",
                        )
                    }
                )
                candidate["aircraft_radius_m"] = (
                    number(user_input["aircraft_radius"], 0, 463000) * UNIT_SCALE[unit]
                )
                # Validate scalars independently before requesting custom/zone coordinates.
                check = {**candidate, "anchor": {"kind": "custom", "latitude": 0, "longitude": 0}}
                validate_settings(self.owner.hass, check)
                self.value = candidate
                if self.anchor_kind == "home":
                    self.value["anchor"] = {"kind": "home"}
                    try:
                        resolve_anchor(self.owner.hass, self.value["anchor"])
                    except ValueError:
                        errors["base"] = "invalid_anchor"
                    else:
                        return await self.advanced(None)
                else:
                    return await self.anchor(None)
            except (ValueError, KeyError, TypeError):
                errors["base"] = "invalid_settings"
        schema = vol.Schema(
            {
                vol.Required("anchor_kind", default=value["anchor"]["kind"]): choice(
                    ["home", "zone", "custom"]
                ),
                vol.Required("aircraft_provider", default=value["aircraft_provider"]): choice(
                    ["adsb_fi", "adsb_lol"]
                ),
                vol.Required(
                    "aircraft_radius",
                    default=value["aircraft_radius_m"] / UNIT_SCALE[value["aircraft_radius_unit"]],
                ): numeric(1 / 1852, 463),
                vol.Required("aircraft_radius_unit", default=value["aircraft_radius_unit"]): choice(
                    list(UNIT_SCALE)
                ),
                vol.Required("aircraft_interval_s", default=value["aircraft_interval_s"]): numeric(
                    2, 86400, "s"
                ),
                vol.Required("disk_cache_mib", default=value["disk_cache_mib"]): numeric(
                    128, 4096, "MiB"
                ),
                vol.Required(
                    "background_collection", default=value["background_collection"]
                ): selector.BooleanSelector(),
            }
        )
        return self.owner.async_show_form(step_id="user", data_schema=schema, errors=errors)

    async def anchor(self, user_input: dict[str, Any] | None) -> ConfigFlowResult:
        errors = {}
        previous = self.value["anchor"]
        if user_input is not None:
            anchor = {"kind": self.anchor_kind, **user_input}
            try:
                resolve_anchor(self.owner.hass, anchor)
                self.value["anchor"] = anchor
                return await self.advanced(None)
            except (ValueError, KeyError, TypeError):
                errors["base"] = "invalid_anchor"
        if self.anchor_kind == "zone":
            schema = vol.Schema(
                {
                    vol.Required(
                        "entity_id", default=previous.get("entity_id", "zone.home")
                    ): selector.EntitySelector(selector.EntitySelectorConfig(domain="zone"))
                }
            )
        else:
            fields: dict[Any, Any] = {}
            for key, bound in (("latitude", 90), ("longitude", 180)):
                marker = (
                    vol.Required(key, default=previous[key])
                    if key in previous
                    else vol.Required(key)
                )
                fields[marker] = numeric(-bound, bound, "°")
            schema = vol.Schema(fields)
        return self.owner.async_show_form(step_id="anchor", data_schema=schema, errors=errors)

    async def advanced(self, user_input: dict[str, Any] | None) -> ConfigFlowResult:
        errors = {}
        if user_input is not None:
            candidate = deepcopy(self.value)
            candidate["provider_pacing"].update(user_input)
            try:
                validate_settings(self.owner.hass, candidate)
            except (ValueError, TypeError, KeyError):
                errors["base"] = "invalid_settings"
            else:
                return self.owner.async_create_entry(title="Aviadilo", data=candidate)
        fields = {}
        for key, default in DEFAULTS["provider_pacing"].items():
            interval = key.endswith("interval_s")
            fields[vol.Required(key, default=self.value["provider_pacing"][key])] = numeric(
                default if interval else 1,
                86400 if interval else default,
                "s" if interval else "requests/min",
            )
        return self.owner.async_show_form(
            step_id="advanced", data_schema=vol.Schema(fields), errors=errors
        )


class AviadiloConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Exactly one shared collection area per HA installation."""

    VERSION = 1

    def __init__(self) -> None:
        self.form = SettingsForm(self, deepcopy(DEFAULTS))

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> config_entries.OptionsFlow:
        return AviadiloOptionsFlow()

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        return await self.form.basic(user_input)

    async def async_step_anchor(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        return await self.form.anchor(user_input)

    async def async_step_advanced(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        return await self.form.advanced(user_input)


class AviadiloOptionsFlow(config_entries.OptionsFlowWithReload):
    """HA automatically reloads changed settings; maintenance does not save options."""

    form: SettingsForm

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        self.form = SettingsForm(
            self, settings(dict(self.config_entry.data), dict(self.config_entry.options))
        )
        return self.async_show_menu(step_id="init", menu_options=["user", "clear_cache"])

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        return await self.form.basic(user_input)

    async def async_step_anchor(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        return await self.form.anchor(user_input)

    async def async_step_advanced(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        return await self.form.advanced(user_input)

    async def async_step_clear_cache(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        if user_input is not None:
            if user_input.get("confirm") is not True:
                return self.async_abort(reason="cache_clear_cancelled")
            service = self.hass.data.get(DOMAIN)
            if service is None:
                return self.async_abort(reason="integration_not_loaded")
            await service.cache.clear()
            return self.async_abort(reason="cache_cleared")
        return self.async_show_form(
            step_id="clear_cache",
            data_schema=vol.Schema(
                {vol.Required("confirm", default=False): selector.BooleanSelector()}
            ),
        )
