window.SPIKE_DATA = {
  "schemaVersion": 1,
  "title": "Claremont · frozen weather source comparison",
  "capturedAt": "2026-09-06T19:28:17.589301+00:00",
  "location": {
    "name": "Claremont, California",
    "latitude": 34.0967,
    "longitude": -117.7198
  },
  "extent": {
    "west": -118.52828375570759,
    "south": 33.64919263468146,
    "east": -116.91131624429245,
    "north": 34.54185365645977,
    "description": "Shared ~150 × 100 km extent · 900 × 600 images"
  },
  "summary": "Seven real, saved source images over one Claremont-centred map. Compare radar products and wind fields without live updates or repeated provider calls.",
  "notes": [
    "Every image uses the same 900 × 600 map extent and cached OpenStreetMap basemap, approximately 150 × 100 km on the ground.",
    "Radar observations are around 11:40–11:42 a.m. PDT; all three wind forecasts are valid at 2:00 p.m. PDT on September 6, 2026. These are separate observation/forecast comparisons.",
    "Radar panels preserve provider palettes and show 65% opacity. ECCC measures precipitation rate; NOAA and RainViewer show reflectivity. Colours are not directly interchangeable.",
    "Wind panels share one scale, rendering method and arrow spacing. Compare spatial variation; a denser-looking field is not automatically a more accurate forecast.",
    "All seven images are frozen locally. Filtering, enlarging, reopening, and offline use make no weather-provider or map-tile requests. Only an explicitly clicked Source link leaves the page."
  ],
  "snapshots": [
    {
      "id": "rainviewer",
      "kind": "radar",
      "name": "RainViewer",
      "product": "Retained source · precipitation radar",
      "status": "ok",
      "image": "assets/rainviewer-radar.png",
      "validAt": "2026-09-06T18:40:00Z",
      "capturedAt": "2026-09-06T19:08:24.101379+00:00",
      "resolution": "Native tile zoom 7; 512 px tiles",
      "units": "dBZ",
      "description": "Same extent and 65% overlay opacity; original provider palette.",
      "attribution": "RainViewer · © OpenStreetMap contributors",
      "sourceUrl": "https://www.rainviewer.com/api/weather-maps-api.html",
      "notes": [
        "Blue/yellow palette is supplied by RainViewer. Colour appearance is not normalized against NOAA."
      ],
      "error": null
    },
    {
      "id": "mrms",
      "kind": "radar",
      "name": "NOAA / NWS · MRMS",
      "product": "Retained source · regional reflectivity mosaic",
      "status": "ok",
      "image": "assets/mrms-radar.png",
      "validAt": "2026-09-06T18:40:12.000Z",
      "capturedAt": "2026-09-06T19:08:02.198858+00:00",
      "resolution": "Nominal 1 km source grid",
      "units": "dBZ",
      "description": "Same extent and 65% overlay opacity; original provider palette.",
      "attribution": "NOAA / NWS · © OpenStreetMap contributors",
      "sourceUrl": "https://www.nssl.noaa.gov/projects/mrms/",
      "notes": [
        "Exact advertised frame timestamp, about 12 seconds after the RainViewer frame."
      ],
      "error": null
    },
    {
      "id": "sox",
      "kind": "radar",
      "name": "NOAA / NWS · KSOX",
      "product": "Candidate · Santiago Peak single-site reflectivity",
      "status": "ok",
      "image": "assets/sox-radar.png",
      "validAt": "2026-09-06T18:42:08.000Z",
      "capturedAt": "2026-09-06T19:08:04.608395+00:00",
      "resolution": "250 m range gates × 0.5° azimuth",
      "units": "dBZ",
      "description": "Same extent and 65% overlay opacity; original provider palette.",
      "attribution": "NOAA / NWS · © OpenStreetMap contributors",
      "sourceUrl": "https://opengeo.ncep.noaa.gov/geoserver/www/index.html",
      "notes": [
        "Single radar site; sampling is polar and effective ground detail varies with distance.",
        "This is a different radar product from the quality-controlled regional mosaic."
      ],
      "error": null
    },
    {
      "id": "eccc",
      "kind": "radar",
      "name": "ECCC · North American composite",
      "product": "Candidate · radar precipitation rate",
      "status": "ok",
      "image": "assets/eccc-radar.png",
      "validAt": "2026-09-06T18:42:00Z",
      "capturedAt": "2026-09-06T19:08:05.090384+00:00",
      "resolution": "Nominal 1 km source grid",
      "units": "mm/h",
      "description": "Same extent and 65% overlay opacity; original provider palette.",
      "attribution": "ECCC / Meteorological Service of Canada · © OpenStreetMap contributors",
      "sourceUrl": "https://eccc-msc.github.io/open-data/msc-geomet/readme_en/",
      "notes": [
        "Precipitation rate, not reflectivity: use its native legend rather than comparing colours numerically with dBZ panels."
      ],
      "error": null
    },
    {
      "id": "dwd",
      "kind": "wind",
      "name": "DWD · ICON global",
      "product": "Retained wind source · 10 m forecast",
      "status": "ok",
      "image": "assets/dwd-wind.png",
      "validAt": "2026-09-06T21:00:00Z",
      "capturedAt": "2026-09-06T19:24:06.168137+00:00",
      "resolution": "0.25° grid (~23 × 28 km here)",
      "units": "km/h · 10 m above ground",
      "description": "Identical 0–40+ km/h scale and arrow spacing. Arrows point downwind; interpolation smooths display without adding source detail.",
      "attribution": "Deutscher Wetterdienst · © OpenStreetMap contributors",
      "sourceUrl": "https://maps.dwd.de/",
      "notes": [
        "Same feed identified by your card’s “ICON-D2 global” label; provider metadata actually names ICON global.",
        "The WCS response does not identify the model run; its requested valid time is explicit."
      ],
      "error": null
    },
    {
      "id": "ndfd",
      "kind": "wind",
      "name": "NOAA / NWS · NDFD",
      "product": "Candidate wind source · regional 10 m forecast",
      "status": "ok",
      "image": "assets/ndfd-wind.png",
      "validAt": "2026-09-06T21:00:00Z",
      "capturedAt": "2026-09-06T19:21:29.384645+00:00",
      "resolution": "5.079 km regional grid (actual file)",
      "units": "km/h · 10 m above ground",
      "description": "Identical 0–40+ km/h scale and arrow spacing. Arrows point downwind; interpolation smooths display without adding source detail.",
      "attribution": "NOAA / NWS · © OpenStreetMap contributors",
      "sourceUrl": "https://www.weather.gov/mdl/ndfd_home",
      "notes": [
        "This regional download is ~5 km, not the finer 2.5 km CONUS product discussed in the research.",
        "The first wind-tile service failed; this image uses verified regional GRIB data instead."
      ],
      "error": null
    },
    {
      "id": "hrrr",
      "kind": "wind",
      "name": "NOAA · HRRR",
      "product": "Candidate wind source · 10 m forecast",
      "status": "ok",
      "image": "assets/hrrr-wind.png",
      "validAt": "2026-09-06T21:00:00Z",
      "capturedAt": "2026-09-06T19:24:06.856467+00:00",
      "resolution": "3 km grid (actual file)",
      "units": "km/h · 10 m above ground",
      "description": "Identical 0–40+ km/h scale and arrow spacing. Arrows point downwind; interpolation smooths display without adding source detail.",
      "attribution": "NOAA / NWS · © OpenStreetMap contributors",
      "sourceUrl": "https://emc.ncep.noaa.gov/emc/pages/numerical_forecast_systems/hrrr.php",
      "notes": [
        "17:00 UTC model run, four-hour forecast valid at 21:00 UTC.",
        "Grid-relative wind vectors were rotated to true east/north before plotting."
      ],
      "error": null
    }
  ]
};
