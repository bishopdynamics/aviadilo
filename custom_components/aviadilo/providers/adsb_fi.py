"""adsb.fi public v3 radius adapter; attribution: https://adsb.fi."""

from ..models import AircraftSource
from .base import RadiusProvider


class AdsbFiProvider(RadiusProvider):
    provider: AircraftSource = "adsb_fi"
    endpoint = "https://opendata.adsb.fi/api/v3/lat/{0}/lon/{1}/dist/{2}"
