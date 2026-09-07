"""Versioned bundled module registration, isolated from frontend API details."""

from pathlib import Path

from aiohttp import web
from homeassistant.components.frontend import add_extra_js_url, remove_extra_js_url
from homeassistant.components.http.server import StaticPathConfig
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import ConfigEntryError
from homeassistant.helpers.http import HomeAssistantView

from .const import VERSION

BUNDLE_URL = f"/aviadilo_static/{VERSION}/aviadilo.js"
MODULE_URL = f"/aviadilo_static/{VERSION}/bootstrap.js"
BOOTSTRAP = f'await customElements.whenDefined("home-assistant");\nawait import("{BUNDLE_URL}");\n'
BUNDLE = Path(__file__).parent / "frontend" / "aviadilo.js"
ROUTES_KEY = "aviadilo_static_routes"
MODULE_KEY = "aviadilo_static_module"


class BootstrapView(HomeAssistantView):
    """Constant public JavaScript only, with no configuration or request data.

    HA 2026.9 replaces the native custom-element registry during app startup.
    Waiting before importing Lit/card code registers it in HA's final registry.
    The original native whenDefined also resolves when HA defines its root via
    the replacement registry, so this works both before and after HA startup.
    """

    url = MODULE_URL
    name = f"aviadilo:bootstrap:{VERSION}"
    requires_auth = False

    @callback
    def get(self, request: web.Request) -> web.Response:
        return web.Response(
            text=BOOTSTRAP,
            content_type="application/javascript",
            headers={"Cache-Control": "public, max-age=31536000, immutable"},
        )


async def async_register(hass: HomeAssistant) -> None:
    if not await hass.async_add_executor_job(BUNDLE.is_file):
        raise ConfigEntryError(
            "Aviadilo frontend bundle is missing; reinstall the complete HACS release"
        )
    routes = hass.data.setdefault(ROUTES_KEY, set())
    if BUNDLE_URL not in routes:
        await hass.http.async_register_static_paths(
            [StaticPathConfig(BUNDLE_URL, str(BUNDLE), True)]
        )
        routes.add(BUNDLE_URL)
    if MODULE_URL not in routes:
        hass.http.register_view(BootstrapView())
        routes.add(MODULE_URL)
    if not hass.data.get(MODULE_KEY):
        add_extra_js_url(hass, MODULE_URL)
        hass.data[MODULE_KEY] = True


def async_unregister(hass: HomeAssistant) -> None:
    if hass.data.pop(MODULE_KEY, False):
        remove_extra_js_url(hass, MODULE_URL)
    # aiohttp routes cannot be removed after startup. Retain the owned immutable
    # route for this HA process; reload only re-adds the extra-module membership.
