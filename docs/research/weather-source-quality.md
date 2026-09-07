# Weather sources and visual quality for California

Researched 2026-09-06. This supplements [the combined-map design](everything-map.md) and records the provider research, static spike, and resulting user selection. Production performance, coverage, and forecast-skill evaluation remain outside the completed spike.

## User selection after the spike

Approved 2026-09-06: **RainViewer (default), NOAA MRMS, and NOAA KSOX for radar; DWD ICON global only for wind.** This selection supersedes the earlier recommendations below. NDFD, HRRR, ECCC, IEM, and other weather-source candidates are outside the selected implementation scope. Preserve the seven-image spike as the comparison record.

## Confirmed requirements

- Optimize for California, with wider North American coverage.
- Retain RainViewer and NOAA/NWS radar choices. The user described the NOAA/NWS choice in their current card as experimental; that label alone does not identify its exact product or endpoint, or classify all NOAA services as experimental.
- Preserve the current DWD wind option, identified in the user's editor as **“DWD ICON-D2 (global, ~28 km)”**.
- Evaluate additional sources where they provide better visuals while retaining free household use and conservative requests.
- Keep radar and wind source selection independent, with all supported choices available graphically.

## Research recommendation before the spike (superseded)

Keep the existing sources as the compatibility baseline. For California, evaluate **NOAA NDFD wind first** as an additional wind choice. For radar, use a suitable **NOAA MRMS regional mosaic** as the initial quality reference and compare **single-site NEXRAD super-resolution reflectivity** for close views.

Investigate HRRR wind after NDFD if its forecast behaviour or playback adds value. Keep ECCC GeoMet as a useful North American radar alternative. Additional adapters remain proposals pending a visual comparison; retaining the existing choices is already required.

## Radar research comparison

| Source/product | Evidence | Expected value and limits |
| --- | --- | --- |
| RainViewer — retain | Current API offers two hours of past radar in ten-minute steps, with a maximum native tile zoom of 7. | Broad coverage and continuity with the user's current setup. Enlargement at close zooms cannot recover finer data. [API documentation](https://www.rainviewer.com/api/weather-maps-api.html). |
| NOAA MRMS mosaic — retain NOAA, validate this product | NSSL documents 1 km resolution and a two-minute update cycle for the MRMS system. NOAA publishes regional radar composites through its OGC service directory. | Strong reference for California radar detail and temporal sampling. Upstream production cadence does not guarantee equal end-to-end tile availability or latency. [MRMS](https://www.nssl.noaa.gov/projects/mrms/), [NOAA service directory](https://opengeo.ncep.noaa.gov/geoserver/www/index.html). |
| NOAA single-site NEXRAD super-resolution — candidate product | NOAA documents 250 m range gates and 0.5-degree azimuthal sampling for super-resolution reflectivity. Its service directory lists site-level SR_BREF. | Candidate for sharper local structure near an appropriate radar site. This is polar sampling, not uniform 250 m pixels everywhere; effective detail depends on range, beam geometry, and the served product. It does not replace the wider mosaic. [NOAA NEXRAD metadata](https://data.noaa.gov/onestop/collections/details/7ff2fb25-b159-468a-bc11-620fb90590e7), [available products](https://opengeo.ncep.noaa.gov/geoserver/www/index.html). |
| ECCC GeoMet North American composite — candidate provider | Canada's official product description specifies a 1 km mosaic combining Canadian and U.S. radars. GeoMet offers anonymous, free WMS/WCS access. | Useful wider Canada/U.S. option with different processing/presentation. Not inherently higher resolution than 1 km MRMS. Rain-rate and reflectivity products need different legends. [Composite description](https://open.canada.ca/data/en/dataset/37aecae5-7783-4274-b595-df02aa003ac3), [GeoMet access](https://eccc-msc.github.io/open-data/msc-geomet/readme_en/). |
| Iowa Environmental Mesonet — secondary candidate | IEM publishes timestamped radar tile services, including mosaics and individual-site products. | Another access/rendering path, with documented caching behaviour. It uses NEXRAD data, so a different host does not automatically mean better observations. [IEM services](https://mesonet.agron.iastate.edu/ogc/). |

Do not promise a fixed image-quality ranking from these specifications alone. RainViewer and NOAA may use overlapping underlying observations, and tile sampling, palette, processing, frame age, and chosen map zoom all affect what the user actually sees.

DWD's regional precipitation products are not a California radar upgrade. Retaining a DWD **global wind** option is a separate matter from German/European radar coverage; do not conflate the two.

## Wind research comparison

| Source/product | Evidence | Recommendation |
| --- | --- | --- |
| Current DWD option — retain | The user's current label identifies a global ~28 km wind product; upstream's provider registry maps its `dwd_icon` choice to `dwd__Icon_reg025_fd_sl_UV10M`. | Preserve access to this source, subject to checking the actual coverage metadata. Do not silently replace it with a different model. [Upstream registry](https://github.com/jpettitt/weather-radar-card/blob/main/src/wind-source-caps.ts). |
| NOAA NDFD surface wind — first addition to evaluate | The official NWS directive specifies a 2.5 km CONUS grid and sustained 10 m wind speed/direction, with hourly near-term valid times. Other regions and later forecast periods have different resolutions. | Substantially finer sampling than the current source's advertised ~28 km grid. A promising way to show more local wind structure in California. Exact data served by the selected WCS adapter still needs verification. [NWS NDFD directive, sections 4.5 and A.3.10–11](https://www.weather.gov/media/directives/010_pdfs/pd01002001curr.pdf). |
| NOAA HRRR surface wind — next comparison | NOAA describes a 3 km CONUS forecast model run hourly. NOMADS currently lists HRRR and HRRR sub-hourly data access. | Useful for comparing short-range wind structure and time evolution. It is not finer than 2.5 km NDFD simply because its name says high resolution. Grid spacing alone does not establish forecast skill. [HRRR model](https://emc.ncep.noaa.gov/emc/pages/numerical_forecast_systems/hrrr.php), [current NOMADS catalogue](https://nomads.ncep.noaa.gov/). |

**Label correction to carry into implementation:** DWD describes actual ICON-D2 as a regional central-European model. The upstream card's global “ICON-D2” label is inconsistent with that description. Preserve the user's source selection by its verified endpoint/coverage identity, while displaying accurate model metadata. Do not infer a global model's identity from the friendly label. [DWD model documentation](https://www.dwd.de/SharedDocs/downloads/DE/modelldokumentationen/nwv/icon_d2/icon_d2_dbbeschr_aktuell.pdf?nn=344870&view=nasPublication).

A finer valid wind grid can supply more local variation to arrows and streamlines. It does not guarantee better predictions at a particular house, nor does drawing more particles create more weather detail. Compare fields at the same height and valid time, preserve no-data masks, and keep interpolation within valid coverage.

NDFD is attractive as the first addition partly because the existing card already has a bulk-grid adapter pattern. Direct HRRR ingestion may require regional GRIB subsetting, decoding, projection handling, and more backend packaging work. NOMADS offers regional filtering and asks automated filter users to wait ten seconds between fetches. Aviadilo's half-rate policy would make that at least twenty seconds for repeated requests using that path; other service-wide limits must also be respected. Avoid scraping model-viewer graphics. [NOMADS filtering guidance](https://nomads.ncep.noaa.gov/info.php?page=gribfilter).

## Visual improvements independent of provider

These are proposed rendering requirements, not claims about existing implementation:

- Preserve each source's useful native detail; distinguish display zoom from upstream tile zoom or grid resolution.
- Crossfade cached radar frames without blank flashes. Loading a loop should not hide the useful latest image while older frames buffer.
- Keep a provider-appropriate legend and units. Reflectivity in dBZ and precipitation rate in mm/h are different quantities; never relabel one as the other.
- Use consistent opacity and a legible basemap so weather remains readable underneath aircraft and household markers.
- Render wind with local vector interpolation and bounded particle counts; keep source grid resolution separate from visual density.
- Stop animation in hidden views, and offer static wind styles for reduced motion and slower kiosk hardware.
- Preserve source attribution and timestamp information. Displaying a newer frame and making an older frame move smoothly are different quality improvements.

The shared backend remains valuable whichever sources win: radar tiles and wind grids can be downloaded once and reused by multiple clients. Smooth playback and particle animation should operate on cached data without multiplying upstream requests.

## Paid alternatives considered

Windy's free API trial is for development rather than production integration. meteoblue publishes paid map API offerings and states that caching is not allowed by default. These are not suitable defaults under the current free-use/shared-cache requirements. No paid-provider decision is needed for this shortlist. [Windy API terms](https://account.windy.com/agreements/windy-forecast-api-terms-of-use), [meteoblue pricing and caching](https://business.meteoblue.com/pricing).

## Comparison needed before adding a provider

Use the same California extent, display size, weather variable, and comparable valid times. Choose examples with precipitation and meaningful wind variation, not just a clear-weather screenshot. Compare the existing source with each candidate for:

1. Actual visible detail and useful local wind structure at typical kiosk zooms.
2. Frame age, publication delay, animation continuity, and missing coverage.
3. Readability with aircraft and people enabled.
4. Cold-cache requests, replay cache hits, bandwidth, CPU/memory, and recovery after a provider failure.
5. Free-use conditions, attribution, request limits, and a sustainable provider endpoint.

These were the criteria used to plan the spike. The source-selection discussion is now complete; implement the selected set above.

## Static Claremont spike — 2026-09-06

The user requested a one-image-per-source comparison, with no refresh. [Open the offline artifact](../spikes/claremont-weather/comparison.html) or read [capture/verification details](../spikes/claremont-weather/README.md).

Seven real source images now share the same Claremont-centred extent: RainViewer, NOAA MRMS, NOAA KSOX single-site radar, ECCC, DWD wind, NDFD wind, and HRRR wind. Radar frames are around 18:40–18:42 UTC; all wind forecasts are valid at 21:00 UTC. Both times are labelled in the page.

The NDFD WCS request failed, so the spike used regional GRIB files. Their actual spacing is **5,079.406 m**, not the 2.5 km CONUS product. HRRR is 3 km and the DWD endpoint supplies a 0.25° ICON-global grid. These metadata findings qualify the earlier documentation comparison. The artifact supports visual review; forecast-skill conclusions and a production endurance benchmark remain outside this spike.
