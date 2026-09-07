"""ADSB.lol compatible v2 radius adapter; attribution: https://adsb.lol."""

from ..models import AircraftSource
from .base import RadiusProvider


class AdsbLolProvider(RadiusProvider):
    provider: AircraftSource = "adsb_lol"
    endpoint = "https://api.adsb.lol/v2/lat/{0}/lon/{1}/dist/{2}"
