"""Bounded, coalescing provider queues; every adapter request must enter here."""

import asyncio
import random
import time
from collections import deque
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC
from email.utils import parsedate_to_datetime
from typing import Any


class ProviderError(Exception):
    """An adapter-classified HTTP failure without response bodies or URLs."""

    def __init__(self, status: int, retry_after: str | None = None) -> None:
        super().__init__(f"Provider HTTP status {status}")
        self.status = status
        self.retry_after = retry_after


class QueueFull(Exception):
    """The shared provider queue is full; callers must shed demand."""


class ProviderBlocked(Exception):
    """Permanent provider failure; configuration/action is required before retry."""


@dataclass
class Bucket:
    interval: float
    limit: int | None = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    starts: deque[float] = field(default_factory=deque)
    next_start: float = 0
    cooldown: float = 0
    failures: int = 0
    blocked: bool = False
    state: str = "idle"


@dataclass
class Job:
    task: asyncio.Task[Any]
    waiters: int = 0


class Scheduler:
    """One serial lane per provider, with MRMS and KSOX sharing NOAA's lane.

    Cancellation never resets a consumed slot or cooldown. Coalescing keys must
    identify the complete request (including validators); adapters supply them.
    """

    def __init__(
        self,
        pacing: dict[str, Any],
        *,
        clock: Callable[[], float] = time.monotonic,
        wall_clock: Callable[[], float] = time.time,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        jitter: Callable[[], float] = random.random,
        max_pending: int = 128,
        history: dict[str, Bucket] | None = None,
        request_timeout: float = 60,
    ) -> None:
        self.clock, self.wall_clock, self.sleep, self.jitter = clock, wall_clock, sleep, jitter
        self.max_pending = max_pending
        self.request_timeout = request_timeout
        self.buckets = {
            "adsb_fi": Bucket(max(2, pacing["adsb_fi_min_interval_s"])),
            "adsb_lol": Bucket(max(10, pacing["adsb_lol_min_interval_s"])),
        }
        for name, ceiling in (("rainviewer", 50), ("noaa", 30), ("dwd", 10)):
            limit = max(1, min(ceiling, pacing[f"{name}_requests_per_minute"]))
            self.buckets[name] = Bucket(60 / limit, limit)
        if history:
            for name, previous in history.items():
                current = self.buckets[name]
                previous.interval, previous.limit = current.interval, current.limit
                # An explicit reload is the recovery action for corrected
                # configuration; consumed slots/cooldowns remain in force.
                if previous.blocked:
                    previous.blocked = False
                    previous.state = "idle"
                self.buckets[name] = previous
        self.jobs: dict[tuple[str, str], Job] = {}
        self.closed = False

    @staticmethod
    def bucket_name(provider: str) -> str:
        return {"noaa_mrms": "noaa", "noaa_ksox": "noaa", "dwd_icon_global": "dwd"}.get(
            provider, provider
        )

    async def request[T](self, provider: str, key: str, producer: Callable[[], Awaitable[T]]) -> T:
        if self.closed:
            raise RuntimeError("Scheduler is closed")
        bucket_name = self.bucket_name(provider)
        bucket = self.buckets[bucket_name]
        identity = (provider, key)
        if bucket.blocked:
            raise ProviderBlocked("Correct provider configuration and reload the integration")
        job = self.jobs.get(identity)
        if job is None:
            if len(self.jobs) >= self.max_pending:
                raise QueueFull("Provider work queue is full")
            job = Job(asyncio.create_task(self._run(bucket, producer)))
            self.jobs[identity] = job
        job.waiters += 1
        try:
            result: T = await asyncio.shield(job.task)
            return result
        finally:
            job.waiters -= 1
            if job.waiters == 0:
                if not job.task.done():
                    job.task.cancel()
                if self.jobs.get(identity) is job:
                    del self.jobs[identity]
                await asyncio.gather(job.task, return_exceptions=True)

    def _retry_seconds(self, value: str | None) -> float:
        if value is None:
            return 0
        try:
            seconds = float(value)
            if seconds >= 0 and seconds < float("inf"):
                return seconds
        except ValueError:
            try:
                date = parsedate_to_datetime(value)
                if date.tzinfo is None:
                    date = date.replace(tzinfo=UTC)
                return max(0, date.timestamp() - self.wall_clock())
            except (ValueError, TypeError, OverflowError):
                pass
        return 0

    async def _run[T](self, bucket: Bucket, producer: Callable[[], Awaitable[T]]) -> T:
        async with bucket.lock:
            while True:
                if bucket.blocked:
                    raise ProviderBlocked(
                        "Correct provider configuration and reload the integration"
                    )
                now = self.clock()
                while bucket.starts and bucket.starts[0] <= now - 60:
                    bucket.starts.popleft()
                ready = max(bucket.next_start, bucket.cooldown)
                if bucket.limit and len(bucket.starts) >= bucket.limit:
                    ready = max(ready, bucket.starts[0] + 60)
                if ready > now:
                    await self.sleep(ready - now)
                    continue
                bucket.next_start = now + bucket.interval
                if bucket.limit:
                    bucket.starts.append(now)
                bucket.state = "requesting"
                try:
                    async with asyncio.timeout(self.request_timeout):
                        result = await producer()
                except ProviderError as error:
                    if error.status != 429 and error.status < 500:
                        bucket.blocked = True
                        bucket.state = "configuration_required"
                        raise ProviderBlocked(
                            "Provider rejected the request; correct configuration and reload"
                        ) from error
                    bucket.failures += 1
                    delay = min(900, 30 * 2 ** min(bucket.failures - 1, 5))
                    delay = min(900, delay * (1 + 0.2 * self.jitter()))
                    bucket.cooldown = self.clock() + max(
                        delay, self._retry_seconds(error.retry_after)
                    )
                    bucket.state = "cooldown"
                except (TimeoutError, OSError):
                    bucket.failures += 1
                    delay = min(900, 30 * 2 ** min(bucket.failures - 1, 5))
                    bucket.cooldown = self.clock() + min(900, delay * (1 + 0.2 * self.jitter()))
                    bucket.state = "cooldown"
                else:
                    bucket.failures = 0
                    bucket.state = "current"
                    return result

    async def close(self) -> None:
        self.closed = True
        tasks = [job.task for job in self.jobs.values()]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self.jobs.clear()

    def diagnostics(self) -> dict[str, Any]:
        return {
            "pending": len(self.jobs),
            "providers": {
                name: {"interval_s": bucket.interval, "state": bucket.state}
                for name, bucket in self.buckets.items()
            },
        }
