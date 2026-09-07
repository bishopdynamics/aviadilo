# Claremont frozen weather comparison

User-requested research spike, captured 2026-09-06. This is a static artifact, not the production Home Assistant card.

Open **comparison.html** directly in a browser. It embeds all seven PNGs, CSS, JavaScript, and metadata in one file and works offline. The smaller **index.html** uses the adjacent local assets instead. Both support filtering and image enlargement, with no polling, animation, external fonts, or automatic provider requests.

## Captures

All images use a 900 × 600 Web Mercator viewport centred on Claremont (34.0967, -117.7198), approximately 150 × 100 km on the ground. All use the same cached OpenStreetMap basemap.

| Image | Actual valid time (UTC, 2026-09-06) | Product |
| --- | --- | --- |
| RainViewer | 18:40:00 | Zoom-7 radar tiles, Universal Blue palette |
| NOAA MRMS | 18:40:12 | conus_bref_qcd regional reflectivity |
| NOAA NEXRAD | 18:42:08 | ksox_sr_bref, Santiago Peak radar |
| ECCC | 18:42:00 | RADAR_1KM_RRAI precipitation rate |
| DWD wind | 21:00:00 | ICON global 0.25° 10 m U/V |
| NDFD wind | 21:00:00 | Pacific Southwest regional GRIB, **5,079.406 m** spacing |
| HRRR wind | 21:00:00 | 3 km 10 m U/V, 17:00 model run + 4 h |

Radar is shown at 65% opacity with original provider colours. ECCC mm/h colours are not numerically comparable with reflectivity in dBZ. Wind uses a common 0–40+ km/h scale, opacity, bilinear vector interpolation, and arrow spacing. No interpolation is claimed to add source detail.

## Findings from actual data

- The retained DWD endpoint is advertised by the provider as ICON global, rather than the upstream card's ICON-D2 label. Its run time is not confirmed by the returned text; valid time comes from the explicit request and service metadata.
- NDFD's initially requested WCS feed failed. The comparison uses its compact regional GRIB product instead, which is about 5 km, **not** the 2.5 km CONUS product from the research.
- The regional NDFD data began at 21:00 UTC. DWD and HRRR were captured again for that same valid time; earlier inputs remain cached for provenance.
- GRIB metadata supplies actual units. HRRR grid-relative vectors were rotated to true east/north. NDFD alternating scan rows were normalized before rendering.
- The wind images show different fields and source detail. This is a visual comparison, not a forecast-skill evaluation.

## Reproduction without requests

The acquisition list is frozen in `cache/requests.json`. `cache/download-log.json` records final-data request URLs, timestamps, byte counts, HTTP status, and hashes. Saved capabilities/descriptions and failed responses provide additional evidence. Derived reports record bounds, units, timing, rendering choices, and geometry checks.

The renderer needs Python, Pillow, NumPy, and ecCodes. The session used a temporary environment at `/tmp/aviadilo-spike-venv`; the HTML artifact needs none of those dependencies.

```sh
python3 render_radar.py
/tmp/aviadilo-spike-venv/bin/python render_wind.py
python3 package_page.py
```

Run from this directory; the scripts themselves resolve inputs relative to their file paths. `snapshots.json` and `snapshots.js` contain the page's frozen metadata.

`fetch_once.py` is a separate explicit acquisition command. It never runs from the page, skips existing/previously attempted requests, and spaces source requests. Do not remove its cached inputs to create an automatic refresh workflow. This frozen research archive is separate from production cache-expiry behaviour.

## Verification

- All seven images rendered at 900 × 600.
- Wind valid times, units, grid geometry, vector rotation, interpolation, and no-data handling verified from actual source inputs. See `cache/wind-render-report.json`.
- Desktop and mobile browser checks: all images loaded, no horizontal overflow, category filters work, enlargement opens and Escape restores focus, no JavaScript errors.
- The self-contained file loaded over both local HTTP and `file://`, with zero HTTP(S) subresource requests. No provider traffic occurs when browsing the artifact.

Source references and provider constraints remain in [weather-source-quality.md](../../research/weather-source-quality.md) and [everything-map.md](../../research/everything-map.md). Basemap attribution: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).
