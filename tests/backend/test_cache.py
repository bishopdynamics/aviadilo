"""Actual filesystem restart/recovery, budgets and async race coverage."""

import asyncio
import hashlib
import threading
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest

from custom_components.aviadilo.cache import Cache, Entry, FetchResult


def sample(key: str = "x", payload: bytes = b"data", **kwargs: Any) -> Entry:
    return replace(
        Entry(key, "rainviewer", "radar-tile", 100, 200, "image/png", payload, etag='"v1"'),
        **kwargs,
    )


async def test_disk_and_memory_lru_restart(tmp_path: Path) -> None:
    cache = Cache(tmp_path / "cache", disk_bytes=1800, memory_bytes=16000, clock=lambda: 150)
    await cache.start()
    for key in "abc":
        assert await cache.put(sample(key, b"x" * 200))
    assert await cache.get("a")
    assert await cache.put(sample("d", b"x" * 200))
    assert await cache.get("b") is None
    assert cache.disk_size == sum(p.stat().st_size for p in cache.directory.iterdir())
    assert cache.memory_size <= cache.memory_budget
    await cache.close()
    cache = Cache(tmp_path / "cache", disk_bytes=1800, memory_bytes=16000, clock=lambda: 150)
    await cache.start()
    assert await cache.get("a")
    assert await cache.get("b") is None
    assert cache.disk_size <= 1800
    await cache.close()


async def test_zero_entries_metadata_and_oversized_bounds(tmp_path: Path) -> None:
    cache = Cache(
        tmp_path / "cache", disk_bytes=10000, memory_bytes=8000, max_entries=2, clock=lambda: 150
    )
    await cache.start()
    for key in "abc":
        assert await cache.put(sample(key, b""))
    assert len(cache.index) == 2
    assert not await cache.put(sample("huge", b"x" * 1001))
    with pytest.raises(ValueError, match="metadata"):
        await cache.put(sample("z", b"", etag="x" * 9000))
    await cache.close()


@pytest.mark.parametrize("bad", [b"bad", b"\x00\x00\x00\x04null", b"\x00\x00\x00\x02[]"])
async def test_recovery_corrupt_incomplete_and_symlinks(tmp_path: Path, bad: bytes) -> None:
    directory = tmp_path / "cache"
    directory.mkdir()
    outside = tmp_path / "outside"
    outside.write_bytes(b"preserve")
    (directory / "link.cache").symlink_to(outside)
    (directory / "interrupted.tmp").write_bytes(b"partial")
    (directory / (hashlib.sha256(b"bad").hexdigest() + ".cache")).write_bytes(bad)
    cache = Cache(directory, clock=lambda: 150)
    await cache.start()
    assert list(directory.iterdir()) == []
    assert outside.read_bytes() == b"preserve"
    assert await cache.put(sample("../../outside"))
    assert outside.read_bytes() == b"preserve"
    await cache.close()


async def test_symlink_cache_root_refused(tmp_path: Path) -> None:
    outside = tmp_path / "outside"
    outside.mkdir()
    (tmp_path / "cache").symlink_to(outside, target_is_directory=True)
    cache = Cache(tmp_path / "cache")
    with pytest.raises(OSError):
        await cache.start()
    assert list(outside.iterdir()) == []


async def test_hash_corruption_detected_after_restart(tmp_path: Path) -> None:
    cache = Cache(tmp_path / "cache", clock=lambda: 150)
    await cache.start()
    await cache.put(sample())
    await cache.close()
    path = next(cache.directory.iterdir())
    path.write_bytes(path.read_bytes()[:-1] + b"!")
    cache = Cache(cache.directory, clock=lambda: 150)
    await cache.start()
    assert await cache.get("x") is None
    assert list(cache.directory.iterdir()) == []
    await cache.close()


async def test_directives_validators_revalidation_and_original_stale_time(tmp_path: Path) -> None:
    now = 150.0
    cache = Cache(tmp_path / "cache", clock=lambda: now)
    await cache.start()
    await cache.put(sample(cache_control="no-cache, max-age=20"))
    assert await cache.get("x") is None

    async def validate(stale: Entry | None) -> FetchResult:
        assert stale and stale.fetched_at == 100
        assert stale.validators == {"If-None-Match": '"v1"'}
        return FetchResult(not_modified=True, expires_at=200, cache_control="max-age=20")

    entry = await cache.fetch("x", validate)
    assert entry.fetched_at == 100
    cached = await cache.get("x")
    assert cached and cached.expires_at == 170
    now = 180

    async def fail(stale: Entry | None) -> FetchResult:
        raise OSError("offline")

    with pytest.raises(OSError):
        await cache.fetch("x", fail)
    stale = await cache.get("x", stale=True)
    assert stale and stale.fetched_at == 100 and stale.expires_at == 170
    assert not await cache.put(sample(cache_control="no-store"))
    assert await cache.get("x", stale=True) is None
    now = 100 + 86400
    assert not await cache.put(sample(expires_at=now + 100))
    await cache.close()


async def test_concurrent_misses_cancelled_waiter_and_clear_race(tmp_path: Path) -> None:
    cache = Cache(tmp_path / "cache", clock=lambda: 150)
    await cache.start()
    started, release = asyncio.Event(), asyncio.Event()
    calls = 0

    async def fetch(stale: Entry | None) -> FetchResult:
        nonlocal calls
        calls += 1
        started.set()
        await release.wait()
        return FetchResult(entry=sample())

    first = asyncio.create_task(cache.fetch("x", fetch))
    await started.wait()
    second = asyncio.create_task(cache.fetch("x", fetch))
    await asyncio.sleep(0)
    first.cancel()
    with pytest.raises(asyncio.CancelledError):
        await first
    await cache.clear()
    release.set()
    assert (await second).payload == b"data"
    assert calls == 1
    assert await cache.get("x", stale=True) is None
    await cache.close()


async def test_close_cancels_fetch_without_resurrection(tmp_path: Path) -> None:
    cache = Cache(tmp_path / "cache", clock=lambda: 150)
    await cache.start()
    started = asyncio.Event()

    async def fetch(stale: Entry | None) -> FetchResult:
        started.set()
        await asyncio.Future[None]()
        return FetchResult(entry=sample())

    task = asyncio.create_task(cache.fetch("x", fetch))
    await started.wait()
    await cache.close()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert list(cache.directory.iterdir()) == []


async def test_cancelled_disk_write_finishes_before_close(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    cache = Cache(tmp_path / "cache", clock=lambda: 150)
    await cache.start()
    started, release = threading.Event(), threading.Event()
    original = cache._put

    def slow(entry: Entry) -> bool:
        started.set()
        assert release.wait(5)
        return original(entry)

    monkeypatch.setattr(cache, "_put", slow)
    writing = asyncio.create_task(cache.put(sample()))
    await asyncio.to_thread(started.wait, 5)
    writing.cancel()
    closing = asyncio.create_task(cache.close())
    await asyncio.sleep(0)
    assert not closing.done()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await writing
    await closing
    assert cache.fd is None
    assert len(list(cache.directory.iterdir())) == 1


async def test_start_rejects_over_budget_file_before_read(tmp_path: Path) -> None:
    directory = tmp_path / "cache"
    directory.mkdir()
    path = directory / (hashlib.sha256(b"x").hexdigest() + ".cache")
    with path.open("wb") as stream:
        stream.truncate(2 * 1024 * 1024)
    cache = Cache(directory, memory_bytes=1024 * 1024)
    await cache.start()
    assert not path.exists()
    await cache.close()


@pytest.mark.parametrize(
    "provider,product",
    [("rainviewer", "radar"), ("noaa_mrms", "conus_bref_qcd"), ("noaa_ksox", "ksox_sr_bref")],
)
async def test_radar_product_retention(tmp_path: Path, provider: str, product: str) -> None:
    now = 100.0
    cache = Cache(tmp_path / "cache", clock=lambda: now)
    await cache.start()
    await cache.put(sample(provider=provider, product=product, expires_at=1000000))
    now = 86500
    assert await cache.get("x", stale=True) is None
    assert not cache.index
    await cache.close()


async def test_close_during_cache_miss_does_not_start_producer(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    cache = Cache(tmp_path / "cache")
    await cache.start()
    entered, release = asyncio.Event(), asyncio.Event()

    async def get(key: str, *, stale: bool = False) -> Entry | None:
        entered.set()
        await release.wait()
        return None

    monkeypatch.setattr(cache, "get", get)
    calls = []

    async def fetch(stale: Entry | None) -> FetchResult:
        calls.append(1)
        return FetchResult(entry=sample())

    task = asyncio.create_task(cache.fetch("x", fetch))
    await entered.wait()
    await cache.close()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert calls == [] and not cache.inflight


async def test_cancelled_start_can_be_closed_safely(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    cache = Cache(tmp_path / "cache")
    entered, release = threading.Event(), threading.Event()
    original = cache._start

    def slow() -> None:
        entered.set()
        assert release.wait(5)
        original()

    monkeypatch.setattr(cache, "_start", slow)
    task = asyncio.create_task(cache.start())
    assert await asyncio.to_thread(entered.wait, 5)
    task.cancel()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    await cache.close()
    assert cache.fd is None


async def test_last_waiter_owns_even_pending_cache_lookup(tmp_path: Path) -> None:
    cache = Cache(tmp_path / "cache")
    await cache.start()
    started = asyncio.Event()
    stopped = asyncio.Event()

    async def fetch(stale: Entry | None) -> FetchResult:
        started.set()
        try:
            await asyncio.Future[None]()
        finally:
            stopped.set()
        return FetchResult(entry=sample())

    task = asyncio.create_task(cache.fetch("x", fetch))
    await started.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert stopped.is_set() and not cache.inflight and not cache.waiters
    await cache.close()


@pytest.mark.parametrize(
    "field,value",
    [
        ("freshness_lifetime", -1),
        ("freshness_lifetime", True),
        ("freshness_lifetime", "forever"),
        ("freshness_lifetime", 7776001),
        ("age_at_validation", -1),
        ("age_at_validation", True),
        ("age_at_validation", "secret"),
    ],
)
def test_asset_policy_metadata_validation(field: str, value: Any) -> None:
    with pytest.raises(ValueError):
        Cache._decode(Cache._encode(replace(sample(), **{field: value})))


async def test_retained_public_budget_preserves_eight_mib_entry_cap(tmp_path: Path) -> None:
    cache = Cache(tmp_path / "cache", retained_memory_bytes=24 * 1024 * 1024)
    assert cache.memory_budget == 24 * 1024 * 1024
    assert cache.entry_budget == 8 * 1024 * 1024
    assert cache.max_entries == 4096 and cache.disk_budget == 512 * 1024 * 1024
    await cache.start()
    await cache.close()
