"""NOAA KSOX base reflectivity only; no arbitrary station selection."""

from .noaa_mrms import NoaaMrmsProvider


class NoaaKsoxProvider(NoaaMrmsProvider):
    provider = "noaa_ksox"
    product = "ksox_sr_bref"
    base_url = "https://opengeo.ncep.noaa.gov/geoserver/ksox/ows"
    # z9 gives ~250m pixels in California; azimuthal/range resolution varies.
    max_zoom = 9
    coverage_description = (
        "KSOX product envelope; radar coverage varies with terrain and range. "
        "Single-site reflectivity, not uniform pixel accuracy."
    )
