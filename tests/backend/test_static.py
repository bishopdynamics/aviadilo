"""Real HA static route and frontend module membership behavior."""

import json
from pathlib import Path

import pytest
from aiohttp.test_utils import TestClient, TestServer
from homeassistant.components.frontend import DATA_EXTRA_MODULE_URL
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryError

from custom_components.aviadilo import static
from custom_components.aviadilo.const import VERSION


async def test_static_registration_reload_and_owned_removal(
    hass: HomeAssistant, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    bundle = tmp_path / "aviadilo.js"
    bundle.write_text("export const fixture = true;")
    monkeypatch.setattr(static, "BUNDLE", bundle)
    hass.data[DATA_EXTRA_MODULE_URL].add("/someone-else.js")
    await static.async_register(hass)
    initial_routes = list(hass.http.app.router.routes())
    assert len(initial_routes) == 2
    assert static.MODULE_URL in hass.data[DATA_EXTRA_MODULE_URL].urls
    await static.async_register(hass)
    assert list(hass.http.app.router.routes()) == initial_routes
    static.async_unregister(hass)
    assert hass.data[DATA_EXTRA_MODULE_URL].urls == {"/someone-else.js"}
    await static.async_register(hass)
    assert list(hass.http.app.router.routes()) == initial_routes
    static.async_unregister(hass)
    static.async_unregister(hass)


async def test_missing_bundle(
    hass: HomeAssistant, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(static, "BUNDLE", tmp_path / "missing.js")
    with pytest.raises(ConfigEntryError, match="bundle is missing"):
        await static.async_register(hass)
    assert not hass.data[DATA_EXTRA_MODULE_URL].urls


def test_static_package_version_agreement() -> None:
    manifest = json.loads(Path("custom_components/aviadilo/manifest.json").read_text())
    package = json.loads(Path("package.json").read_text())
    assert VERSION == manifest["version"] == package["version"]
    assert f"/{VERSION}/" in static.MODULE_URL
    assert "?" not in static.MODULE_URL
    assert f"/{VERSION}/" in static.BUNDLE_URL
    assert static.BUNDLE_URL in static.BOOTSTRAP


async def test_public_bootstrap_http_waits_before_versioned_bundle_import(
    hass: HomeAssistant, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    bundle = tmp_path / "aviadilo.js"
    bundle.write_text("export const fixture = true;")
    monkeypatch.setattr(static, "BUNDLE", bundle)
    await static.async_register(hass)
    async with TestClient(TestServer(hass.http.app)) as client:
        # These immutable public assets accept no credentials or configuration.
        response = await client.get(static.MODULE_URL)
        assert response.status == 200
        assert response.content_type == "application/javascript"
        assert response.headers["Cache-Control"] == "public, max-age=31536000, immutable"
        javascript = await response.text()
        assert javascript == static.BOOTSTRAP
        assert javascript.index(
            'await customElements.whenDefined("home-assistant")'
        ) < javascript.index("await import(")
        assert static.BUNDLE_URL in javascript
        assert not any(secret in javascript for secret in ("token", "latitude", "longitude"))
        response = await client.get(static.BUNDLE_URL)
        assert response.status == 200
        assert await response.text() == "export const fixture = true;"
        static.async_unregister(hass)
        assert static.MODULE_URL not in hass.data[DATA_EXTRA_MODULE_URL].urls
        # HA cannot remove routes after startup; reload restores only membership.
        await static.async_register(hass)
        assert static.MODULE_URL in hass.data[DATA_EXTRA_MODULE_URL].urls
        response = await client.get(static.MODULE_URL)
        assert response.status == 200
        assert await response.text() == javascript
