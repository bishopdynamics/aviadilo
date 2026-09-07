"""Selected NOAA WMS reflectivity: explicit advertised times, WebMercator tiles.

WMS has no native tile zoom. MRMS z7 (~1km pixels in California) is a
conservative display sampling cap, not a statement of WMS native resolution.
"""

import math
import re
from datetime import datetime
from typing import Any
from urllib.parse import urlencode
from xml.etree import ElementTree as ET

from ..http import Tile, TileSource
from .rainviewer import MetadataProvider, utc


def timestamp(value: str) -> str:
    if not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z", value):
        raise ValueError("Expected explicit UTC time")
    datetime.fromisoformat(value)
    return value


def mercator_bbox(tile: Tile) -> tuple[float, float, float, float]:
    half = math.pi * 6378137
    step = 2 * half / 2**tile.z
    return (
        -half + tile.x * step,
        half - (tile.y + 1) * step,
        -half + (tile.x + 1) * step,
        half - tile.y * step,
    )


class NoaaMrmsProvider(MetadataProvider):
    provider = "noaa_mrms"
    product = "conus_bref_qcd"
    base_url = "https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows"
    interval = 120
    max_zoom = 7
    coverage_description = (
        "CONUS product envelope; radar coverage and valid returns vary within it. MRMS ~1 km grid."
    )
    content_types = frozenset({"text/xml", "application/xml", "application/vnd.ogc.wms_xml"})

    @property
    def endpoint(self) -> str:  # type: ignore[override]
        return self.base_url + "?service=WMS&version=1.3.0&request=GetCapabilities"

    def normalize(self, body: bytes, fetched: float) -> dict[str, Any]:
        # Decode first so UTF-16 cannot disguise declarations. ElementTree never
        # needs a DTD for WMS; forbid all declarations/entities explicitly.
        text = body.decode("utf-8-sig")
        if re.search(r"<!\s*(?:DOCTYPE|ENTITY)", text, re.I):
            raise ValueError("XML declarations are forbidden")
        try:
            root = ET.fromstring(text)
        except ET.ParseError as error:
            raise ValueError("Invalid WMS XML") from error
        for element in root.iter():
            element.tag = element.tag.rsplit("}", 1)[-1]
        layers = [layer for layer in root.iter("Layer") if layer.findtext("Name") == self.product]
        if len(layers) != 1:
            raise ValueError("Selected NOAA layer missing or ambiguous")
        layer = layers[0]
        if not any(
            style.findtext("Name") == "radar_reflectivity" for style in layer.findall("Style")
        ):
            raise ValueError("Selected NOAA style missing")
        dimensions = [d for d in layer.findall("Dimension") if d.get("name") == "time"]
        if len(dimensions) != 1:
            raise ValueError("Explicit NOAA times missing")
        raw_times = (dimensions[0].text or "").strip()
        times = [timestamp(value.strip()) for value in raw_times.split(",")] if raw_times else []
        if len(times) > 288 or len(set(times)) != len(times):
            raise ValueError("Invalid NOAA frame count")
        times.sort(key=datetime.fromisoformat)
        geo = layer.find("EX_GeographicBoundingBox")
        if geo is None:
            raise ValueError("NOAA envelope missing")
        bounds = {
            name: float(geo.findtext(tag) or "nan")
            for name, tag in (
                ("south", "southBoundLatitude"),
                ("north", "northBoundLatitude"),
                ("west", "westBoundLongitude"),
                ("east", "eastBoundLongitude"),
            )
        }
        if not (
            -90 <= bounds["south"] < bounds["north"] <= 90
            and -180 <= bounds["west"] < bounds["east"] <= 180
        ):
            raise ValueError("Invalid NOAA envelope")
        return {
            "kind": "radar-manifest",
            "provider": self.provider,
            "product": self.product,
            # Capabilities has no creation time: generated_at is metadata receipt,
            # preserved across HTTP cache replay/304; frames retain observed TIME.
            "generated_at": utc(fetched),
            "frames": [{"id": value, "time": value} for value in times],
            "native_max_zoom": self.max_zoom,
            "attribution": "NOAA / National Weather Service — https://www.weather.gov",
            "coverage": {"bounds": {**bounds, "zoom": 0}, "description": self.coverage_description},
        }

    def resolve(self, tile: Tile) -> str:
        if (
            tile.provider != self.provider
            or tile.product != self.product
            or tile.style != "default"
        ):
            raise ValueError("Invalid NOAA product/style")
        return (
            self.base_url
            + "?"
            + urlencode(
                {
                    "service": "WMS",
                    "version": "1.1.1",
                    "request": "GetMap",
                    "layers": self.product,
                    "styles": "radar_reflectivity",
                    "srs": "EPSG:3857",
                    "format": "image/png",
                    "transparent": "true",
                    "width": tile.size,
                    "height": tile.size,
                    "bbox": ",".join(format(value, ".12g") for value in mercator_bbox(tile)),
                    "time": timestamp(tile.frame),
                }
            )
        )

    def tile_source(self) -> TileSource:
        return TileSource(
            frozenset({"opengeo.ncep.noaa.gov"}), frozenset({self.product}), self.resolve
        )
