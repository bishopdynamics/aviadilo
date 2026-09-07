"""Frozen provider adapter boundary; no network or scheduler implementation."""

from typing import Protocol

from ..models import AircraftResult, CollectionArea


class AircraftProvider(Protocol):
    """Return normalized SI records; caller owns all pacing and retries."""

    async def fetch(self, area: CollectionArea) -> AircraftResult:
        """Fetch one bounded collection area via the shared provider queue."""
        ...
