"""Deterministic provider aggregate rate, retry and cancellation regressions."""

import asyncio
from copy import deepcopy
from datetime import UTC, datetime
from email.utils import format_datetime

import pytest

from custom_components.aviadilo.const import DEFAULTS
from custom_components.aviadilo.scheduler import (
    ProviderBlocked,
    ProviderError,
    QueueFull,
    Scheduler,
)


class Clock:
    def __init__(self) -> None:
        self.now = 0.0
        self.delays: list[float] = []

    def __call__(self) -> float:
        return self.now

    async def sleep(self, delay: float) -> None:
        self.delays.append(delay)
        self.now += delay
        await asyncio.sleep(0)


@pytest.mark.parametrize(
    "provider,interval,count",
    [
        ("adsb_fi", 2, 4),
        ("adsb_lol", 10, 4),
        ("rainviewer", 1.2, 101),
        ("noaa_mrms", 2, 61),
        ("dwd_icon_global", 6, 21),
    ],
)
async def test_pacing(provider: str, interval: float, count: int) -> None:
    clock = Clock()
    queue = Scheduler(DEFAULTS["provider_pacing"], clock=clock, sleep=clock.sleep)
    starts = []

    async def fetch() -> float:
        starts.append(clock())
        return clock()

    for i in range(count):
        await queue.request(provider, str(i), fetch)
    assert all(b - a >= interval - 1e-9 for a, b in zip(starts, starts[1:], strict=False))
    if provider == "rainviewer":
        assert all(starts[i + 50] - starts[i] >= 60 - 1e-9 for i in range(51))
    await queue.close()


async def test_noaa_bucket_and_conservative_options() -> None:
    clock = Clock()
    pacing = deepcopy(DEFAULTS["provider_pacing"])
    pacing["noaa_requests_per_minute"] = 15
    queue = Scheduler(pacing, clock=clock, sleep=clock.sleep)

    async def fetch() -> float:
        return clock()

    assert await queue.request("noaa_mrms", "metadata", fetch) == 0
    assert await queue.request("noaa_ksox", "tile", fetch) == 4
    await queue.close()


async def test_coalescing_one_waiter_cancel_bound_and_unload() -> None:
    started, release = asyncio.Event(), asyncio.Event()
    calls = 0
    queue = Scheduler(DEFAULTS["provider_pacing"], max_pending=1)

    async def fetch() -> int:
        nonlocal calls
        calls += 1
        started.set()
        await release.wait()
        return 7

    first = asyncio.create_task(queue.request("adsb_fi", "same", fetch))
    await started.wait()
    second = asyncio.create_task(queue.request("adsb_fi", "same", fetch))
    await asyncio.sleep(0)
    first.cancel()
    with pytest.raises(asyncio.CancelledError):
        await first
    with pytest.raises(QueueFull):
        await queue.request("adsb_fi", "other", fetch)
    release.set()
    assert await second == 7
    assert calls == 1
    release.clear()
    pending = asyncio.create_task(queue.request("adsb_fi", "next", fetch))
    await asyncio.sleep(0)
    await queue.close()
    with pytest.raises(asyncio.CancelledError):
        await pending
    assert not queue.jobs


@pytest.mark.parametrize("header", ["120", format_datetime(datetime.fromtimestamp(1120, UTC))])
async def test_retry_after_seconds_and_date(header: str) -> None:
    clock = Clock()
    queue = Scheduler(
        DEFAULTS["provider_pacing"],
        clock=clock,
        wall_clock=lambda: 1000 + clock(),
        sleep=clock.sleep,
        jitter=lambda: 0,
    )
    calls = 0

    async def fetch() -> str:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise ProviderError(429, header)
        return "ok"

    assert await queue.request("rainviewer", "retry", fetch) == "ok"
    assert clock() == 120
    await queue.close()


async def test_backoff_permanent_error_and_no_repetition() -> None:
    clock = Clock()
    queue = Scheduler(DEFAULTS["provider_pacing"], clock=clock, sleep=clock.sleep, jitter=lambda: 0)
    calls = 0

    async def fetch() -> None:
        nonlocal calls
        calls += 1
        raise ProviderError(503 if calls < 8 else 401)

    with pytest.raises(ProviderBlocked):
        await queue.request("adsb_fi", "retry", fetch)
    assert clock.delays == [30, 60, 120, 240, 480, 900, 900]
    with pytest.raises(ProviderBlocked):
        await queue.request("adsb_fi", "different", fetch)
    assert calls == 8
    await queue.close()


async def test_cancelled_cooldown_survives_reload() -> None:
    clock = Clock()
    sleeping = asyncio.Event()

    async def sleep(delay: float) -> None:
        sleeping.set()
        await asyncio.Future[None]()

    queue = Scheduler(DEFAULTS["provider_pacing"], clock=clock, sleep=sleep, jitter=lambda: 0)

    async def fail() -> None:
        raise ProviderError(429, "120")

    task = asyncio.create_task(queue.request("adsb_fi", "x", fail))
    await sleeping.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    await queue.close()
    replacement = Scheduler(
        DEFAULTS["provider_pacing"], clock=clock, sleep=clock.sleep, history=queue.buckets
    )

    async def fetch() -> float:
        return clock()

    assert await replacement.request("adsb_fi", "new", fetch) == 120
    await replacement.close()


async def test_hung_producer_is_timed_out_and_backed_off() -> None:
    clock = Clock()
    queue = Scheduler(
        DEFAULTS["provider_pacing"],
        clock=clock,
        sleep=clock.sleep,
        jitter=lambda: 0,
        request_timeout=0.001,
    )
    calls = 0

    async def fetch() -> str:
        nonlocal calls
        calls += 1
        if calls == 1:
            await asyncio.Future[None]()
        return "ok"

    assert await queue.request("adsb_fi", "x", fetch) == "ok"
    assert clock() == 30
    await queue.close()


async def test_explicit_reload_recovers_permanent_error_without_resetting_slot() -> None:
    clock = Clock()
    queue = Scheduler(DEFAULTS["provider_pacing"], clock=clock, sleep=clock.sleep)

    async def fail() -> None:
        raise ProviderError(400)

    with pytest.raises(ProviderBlocked):
        await queue.request("adsb_lol", "bad", fail)
    await queue.close()
    replacement = Scheduler(
        DEFAULTS["provider_pacing"], clock=clock, sleep=clock.sleep, history=queue.buckets
    )

    async def corrected() -> float:
        return clock()

    assert await replacement.request("adsb_lol", "corrected", corrected) == 10
    await replacement.close()


@pytest.mark.parametrize("provider,interval", [("osm_standard", 1), ("photos", 2)])
async def test_asset_lanes_serialize_and_backoff_survives_reload(
    provider: str, interval: int
) -> None:
    clock = Clock()
    scheduler = Scheduler(
        DEFAULTS["provider_pacing"], clock=clock, sleep=clock.sleep, jitter=lambda: 0
    )

    async def fetch() -> float:
        return clock()

    assert await scheduler.request(provider, "one", fetch, retry=False) == 0
    assert await scheduler.request(provider, "two", fetch, retry=False) == interval

    async def fail() -> None:
        raise ProviderError(429, "120")

    with pytest.raises(ProviderError):
        await scheduler.request(provider, "fail", fail, retry=False)
    assert clock() == 2 * interval
    await scheduler.close()
    replacement = Scheduler(
        DEFAULTS["provider_pacing"], clock=clock, sleep=clock.sleep, history=scheduler.buckets
    )
    assert await replacement.request(provider, "three", fetch) == 120 + 2 * interval
    await replacement.close()


@pytest.mark.parametrize("cancelled", [False, True])
@pytest.mark.parametrize("preserved", [None, "cooldown", "configuration_required"])
async def test_ended_asset_work_clears_only_requesting_state(
    cancelled: bool, preserved: str | None
) -> None:
    clock = Clock()
    scheduler = Scheduler(DEFAULTS["provider_pacing"], clock=clock, sleep=clock.sleep)
    bucket = scheduler.buckets["photos"]

    async def interrupted() -> None:
        if preserved == "cooldown":
            bucket.cooldown = 120
            bucket.state = preserved
        elif preserved == "configuration_required":
            bucket.blocked = True
            bucket.state = preserved
        if cancelled:
            raise asyncio.CancelledError
        raise ValueError("Synthetic unclassified resource error")

    with pytest.raises(asyncio.CancelledError if cancelled else ValueError):
        await scheduler.request("photos", "resource", interrupted, retry=False)
    assert bucket.state == (preserved or ("idle" if cancelled else "unavailable"))
    assert bucket.next_start == 2
    assert bucket.cooldown == (120 if preserved == "cooldown" else 0)
    assert bucket.blocked is (preserved == "configuration_required")
    assert not scheduler.jobs
    await scheduler.close()
