"""One shared integration runtime and bounded viewer-demand foundation."""

import asyncio
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from functools import partial
from pathlib import Path
from typing import Any

from aiohttp import ClientSession
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .cache import Cache
from .config_flow import resolve_anchor
from .const import HEARTBEAT_SECONDS, LEASE_SECONDS
from .scheduler import ProviderBlocked, Scheduler


@dataclass(frozen=True)
class Demand:
    """Transport-independent selection; socket ownership is enforced in slice 3."""

    aircraft: bool = False
    radar: str | None = None
    wind: bool = False

    def products(self) -> set[str]:
        products = set()
        if self.aircraft:
            products.add("aircraft")
        if self.radar:
            if self.radar not in ("rainviewer", "noaa_mrms", "noaa_ksox"):
                raise ValueError("Invalid radar source")
            products.add(self.radar)
        if self.wind:
            products.add("wind")
        return products


@dataclass
class Lease:
    demand: Demand
    expires: float


@dataclass(frozen=True)
class Producer:
    """Future adapters supply a fetch and consumer; every fetch uses the queue."""

    provider: str
    key: str
    interval: float
    fetch: Callable[[], Awaitable[Any]]
    consume: Callable[[Any], None]


class AviadiloService:
    def __init__(
        self,
        hass: HomeAssistant,
        config: dict[str, Any],
        *,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self.hass, self.config, self.clock, self.sleep = hass, config, clock, sleep
        self.session: ClientSession = async_get_clientsession(hass)
        self.scheduler = Scheduler(
            config["provider_pacing"],
            clock=clock,
            sleep=sleep,
            history=hass.data.get("aviadilo_provider_history"),
        )
        hass.data["aviadilo_provider_history"] = self.scheduler.buckets
        self.cache = Cache(
            Path(hass.config.config_dir) / "aviadilo_cache",
            disk_bytes=config["disk_cache_mib"] * 1024 * 1024,
        )
        self.leases: dict[str, Lease] = {}
        self.producers: dict[str, Producer] = {}
        self.tasks: dict[str, asyncio.Task[None]] = {}
        self.monitor: asyncio.Task[None] | None = None
        self.expiry_timer: asyncio.TimerHandle | None = None
        self.closed = False
        self.anchor_state = "current"
        self.product_states: dict[str, str] = {}

    async def start(self) -> None:
        resolve_anchor(self.hass, self.config["anchor"])
        parent = await self.hass.async_add_executor_job(Path(self.hass.config.config_dir).resolve)
        self.cache.directory = parent / "aviadilo_cache"
        await self.cache.start()
        self.monitor = asyncio.create_task(self._monitor())

    def register_producer(self, product: str, producer: Producer) -> None:
        """Install one adapter before collection; no adapters ship in this slice."""
        if self.closed or product in self.producers:
            raise ValueError("Service closed or producer already registered")
        if producer.interval <= 0:
            raise ValueError("Producer interval must be positive")
        self.producers[product] = producer
        self.reconcile()

    def subscribe(self, lease_id: str, demand: Demand) -> None:
        if self.closed:
            raise RuntimeError("Service is closed")
        demand.products()
        if lease_id not in self.leases and len(self.leases) >= 128:
            raise ValueError("Viewer lease limit reached")
        self.leases[lease_id] = Lease(demand, self.clock() + LEASE_SECONDS)
        self.reconcile()

    def heartbeat(self, lease_id: str) -> bool:
        self.reconcile()
        lease = self.leases.get(lease_id)
        if lease is None:
            return False
        lease.expires = self.clock() + LEASE_SECONDS
        self.reconcile()
        return True

    def unsubscribe(self, lease_id: str) -> None:
        self.leases.pop(lease_id, None)
        self.reconcile()

    def reconcile(self) -> None:
        now = self.clock()
        self.leases = {key: lease for key, lease in self.leases.items() if lease.expires > now}
        desired: set[str] = set()
        for lease in self.leases.values():
            desired.update(lease.demand.products())
        if self.config["background_collection"]:
            # Only aircraft has a saved shared provider/area. Weather remains
            # viewer-selected until there is a saved background-weather policy.
            desired.add("aircraft")
        try:
            resolve_anchor(self.hass, self.config["anchor"])
            self.anchor_state = "current"
        except ValueError:
            self.anchor_state = "invalid_anchor"
            desired.clear()
        if self.closed:
            desired.clear()
        if self.expiry_timer:
            self.expiry_timer.cancel()
            self.expiry_timer = None
        if self.leases and not self.closed:
            delay = min(lease.expires for lease in self.leases.values()) - now
            self.expiry_timer = self.hass.loop.call_later(delay, self.reconcile)
        for product, task in list(self.tasks.items()):
            if product not in desired:
                task.cancel()
        for product in desired & self.producers.keys():
            if product not in self.tasks:
                task = asyncio.create_task(self._collect(product, self.producers[product]))
                self.tasks[product] = task
                task.add_done_callback(partial(self._collected, product))

    def _collected(self, product: str, task: asyncio.Task[None]) -> None:
        if self.tasks.get(product) is task:
            del self.tasks[product]
        if not task.cancelled():
            task.exception()
        # A demand may have resumed while cancellation was being awaited.
        if task.cancelled() and not self.closed:
            self.reconcile()

    async def _collect(self, product: str, producer: Producer) -> None:
        async def demanded_fetch() -> Any:
            self.reconcile()
            active = any(product in lease.demand.products() for lease in self.leases.values())
            background = self.config["background_collection"] and product == "aircraft"
            if self.closed or self.anchor_state != "current" or not (active or background):
                raise asyncio.CancelledError
            return await producer.fetch()

        try:
            while not self.closed:
                result = await self.scheduler.request(
                    producer.provider, producer.key, demanded_fetch
                )
                producer.consume(result)
                self.product_states[product] = "current"
                await self.sleep(producer.interval)
        except ProviderBlocked:
            self.product_states[product] = "configuration_required"
        except Exception:
            # No exception details: adapter errors can include private URLs/data.
            self.product_states[product] = "unavailable"

    async def _monitor(self) -> None:
        while not self.closed:
            await self.sleep(HEARTBEAT_SECONDS)
            self.reconcile()

    async def close(self) -> None:
        self.closed = True
        if self.expiry_timer:
            self.expiry_timer.cancel()
            self.expiry_timer = None
        self.leases.clear()
        tasks = list(self.tasks.values())
        if self.monitor:
            tasks.append(self.monitor)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await self.scheduler.close()
        await self.cache.close()
        self.tasks.clear()
        # session is HA-owned and must remain open.

    def diagnostics(self) -> dict[str, Any]:
        return {
            "viewers": len(self.leases),
            "active_products": len(self.tasks),
            "anchor_state": self.anchor_state,
            "scheduler": self.scheduler.diagnostics(),
            "cache": self.cache.diagnostics(),
        }
