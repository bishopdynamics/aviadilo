"""One shared integration runtime and bounded viewer-demand foundation."""

import asyncio
import json
import time
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from copy import deepcopy
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
from .models import Viewport
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


@dataclass(frozen=True)
class Viewer:
    subscription_id: int
    revision: int
    user_id: str
    demand: Demand
    viewport: Viewport
    send: Callable[[dict[str, Any]], None]
    end: Callable[[str], None]


@dataclass(frozen=True)
class Publication:
    """Capture before async work; wind is scoped to its captured viewport."""

    product: str
    audiences: tuple[tuple[str, Viewer], ...]
    viewport: Viewport | None
    area: tuple[float, float] | None = None


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
        self.entry_id: str | None = None
        self.viewers: dict[str, Viewer] = {}
        self.snapshots: OrderedDict[str, dict[str, Any]] = OrderedDict()
        self.snapshot_areas: dict[str, tuple[float, float] | None] = {}
        from .http import TileGateway

        self.tiles = TileGateway(self)

    def watch(self, lease_id: str, viewer: Viewer) -> None:
        self.subscribe(lease_id, viewer.demand)
        self.viewers[lease_id] = viewer
        self.tiles.reconcile()

    def capture(self, product: str, viewport: Viewport | None = None) -> Publication:
        self.reconcile()
        return Publication(
            product,
            tuple(
                (key, viewer)
                for key, viewer in self.viewers.items()
                if product in viewer.demand.products()
                and (product != "wind" or viewer.viewport == viewport)
            ),
            deepcopy(viewport),
            resolve_anchor(self.hass, self.config["anchor"]),
        )

    @staticmethod
    def _snapshot_key(product: str, viewport: Viewport | None) -> str:
        return json.dumps([product, viewport if product == "wind" else None], sort_keys=True)

    def publish(self, context: Publication, payload: dict[str, Any]) -> bool:
        """Publish normalized data to still-current captured audiences.

        Adapters capture before awaiting, then supply kind/provider/data without
        an envelope. Snapshot replay is bounded to 8 MiB and 16 viewport keys.
        """
        from .websocket import validate_event

        if any(key in payload for key in ("schema_version", "subscription_id", "revision")):
            raise ValueError("Publication payload must not contain a viewer envelope")
        sample = validate_event(
            {**payload, "schema_version": 1, "subscription_id": 1, "revision": 0}
        )
        expected = {
            "aircraft": ("aircraft", self.config["aircraft_provider"]),
            "wind": ("wind-grid", "dwd_icon_global"),
        }.get(context.product, ("radar-manifest", context.product))
        if (sample["kind"], sample.get("provider")) != expected:
            raise ValueError("Publication source/product mismatch")
        self.reconcile()
        audience = [
            (key, viewer)
            for key, viewer in context.audiences
            if self.viewers.get(key) is viewer and key in self.leases
        ]
        background = self.config["background_collection"] and context.product == "aircraft"
        try:
            same_area = context.area == resolve_anchor(self.hass, self.config["anchor"])
        except ValueError:
            same_area = False
        if self.closed or not same_area or not (audience or background):
            return False
        stored = deepcopy(payload)
        key = self._snapshot_key(context.product, context.viewport)
        if len(json.dumps(stored).encode()) > 8 * 1024 * 1024:
            raise ValueError("Snapshot exceeds memory bound")
        self.snapshots[key] = stored
        self.snapshot_areas[key] = context.area
        self.snapshots.move_to_end(key)
        while (
            len(self.snapshots) > 16
            or sum(len(json.dumps(v).encode()) for v in self.snapshots.values()) > 8 * 1024 * 1024
        ):
            expired_key, _ = self.snapshots.popitem(last=False)
            self.snapshot_areas.pop(expired_key, None)
        for _, viewer in audience:
            viewer.send(self.envelope(viewer, stored))
        self.tiles.reconcile()
        return True

    @staticmethod
    def envelope(viewer: Viewer, payload: dict[str, Any]) -> dict[str, Any]:
        return {
            **deepcopy(payload),
            "schema_version": 1,
            "subscription_id": viewer.subscription_id,
            "revision": viewer.revision,
        }

    def status_event(self, viewer: Viewer, reason: str | None = None) -> dict[str, Any]:
        statuses = []
        for layer, product, provider in (
            ("aircraft", "aircraft", self.config["aircraft_provider"]),
            ("radar", viewer.demand.radar, viewer.demand.radar),
            ("wind", "wind", "dwd_icon_global"),
        ):
            if product not in viewer.demand.products():
                continue
            available = product in self.producers
            interval = None
            if available:
                producer = self.producers[product]
                bucket = self.scheduler.buckets[self.scheduler.bucket_name(producer.provider)]
                interval = max(producer.interval, bucket.interval)
            statuses.append(
                {
                    "layer": layer,
                    "provider": provider,
                    "state": "loading" if available and not reason else "unavailable",
                    "last_success": None,
                    "effective_interval_s": interval,
                    "message": reason or (None if available else "Source adapter is not installed"),
                }
            )
        if reason and not statuses:
            statuses.append(
                {
                    "layer": "aircraft",
                    "provider": self.config["aircraft_provider"],
                    "state": "unavailable",
                    "last_success": None,
                    "effective_interval_s": None,
                    "message": reason,
                }
            )
        return self.envelope(viewer, {"kind": "status", "statuses": statuses})

    def initial(self, lease_id: str) -> None:
        viewer = self.viewers[lease_id]
        viewer.send(self.status_event(viewer))
        for product in viewer.demand.products():
            key = self._snapshot_key(product, viewer.viewport)
            payload = self.snapshots.get(key)
            try:
                current_area = resolve_anchor(self.hass, self.config["anchor"])
            except ValueError:
                continue
            if payload and self.snapshot_areas.get(key) == current_area:
                viewer.send(self.envelope(viewer, payload))

    def info(self) -> dict[str, Any]:
        try:
            latitude, longitude = resolve_anchor(self.hass, self.config["anchor"])
            area = {
                "latitude": latitude,
                "longitude": longitude,
                "radius_m": self.config["aircraft_radius_m"],
            }
        except ValueError:
            area = None
        viewer = Viewer(
            1,
            0,
            "",
            Demand(True, "rainviewer", True),
            {"south": -90, "north": 90, "west": -180, "east": 180, "zoom": 0},
            lambda event: None,
            lambda reason: None,
        )
        return {
            "schema_version": 1,
            "entry_id": self.entry_id,
            "area": area,
            "capabilities": {
                "aircraft": [self.config["aircraft_provider"]]
                if "aircraft" in self.producers
                else [],
                "radar": [
                    p
                    for p in ("rainviewer", "noaa_mrms", "noaa_ksox")
                    if p in self.producers and p in self.tiles.sources
                ],
                "wind": ["dwd_icon_global"] if "wind" in self.producers else [],
            },
            "policies": dict(self.config["provider_pacing"]),
            "statuses": self.status_event(viewer)["statuses"],
            "heartbeat_s": 20,
            "lease_s": 60,
            "backend_memory_mib": 64,
        }

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
        self.viewers.pop(lease_id, None)
        self.leases.pop(lease_id, None)
        self.reconcile()

    def reconcile(self) -> None:
        now = self.clock()
        for key, lease in list(self.leases.items()):
            if lease.expires <= now:
                if viewer := self.viewers.get(key):
                    viewer.end("aviadilo:lease_expired")
                self.viewers.pop(key, None)
                self.leases.pop(key, None)
        self.tiles.reconcile()
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
        if self.closed:
            return
        self.closed = True
        for viewer in list(self.viewers.values()):
            viewer.end("aviadilo:closed")
        self.viewers.clear()
        await self.tiles.close()
        self.snapshots.clear()
        self.snapshot_areas.clear()
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
