"""Integration-owned bounded cache with single-file atomic entries and safe recovery."""

import asyncio
import hashlib
import json
import math
import os
import stat
import time
import uuid
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from dataclasses import asdict, dataclass, replace
from pathlib import Path
from typing import Any

from .const import MEMORY_BYTES

MAX_METADATA_BYTES = 8192
MAX_ENTRIES = 4096


@dataclass(frozen=True)
class Entry:
    key: str
    provider: str
    product: str
    fetched_at: float
    expires_at: float
    content_type: str
    payload: bytes
    etag: str | None = None
    last_modified: str | None = None
    cache_control: str = ""
    validated_at: float | None = None
    age_at_validation: float = 0
    freshness_lifetime: float | None = None
    stale: bool = False

    @property
    def validators(self) -> dict[str, str]:
        result = {}
        if self.etag:
            result["If-None-Match"] = self.etag
        if self.last_modified:
            result["If-Modified-Since"] = self.last_modified
        return result


@dataclass(frozen=True)
class FetchResult:
    """A producer returns a new entry, or a validated 304 response."""

    entry: Entry | None = None
    not_modified: bool = False
    expires_at: float | None = None
    cache_control: str | None = None
    store: bool = True


class Cache:
    """Public response cache; all filesystem operations execute off the event loop.

    Each file is a bounded JSON header followed by payload bytes. Directory-fd
    relative operations and O_NOFOLLOW prevent traversal and symlink escapes.
    Clear advances a generation so old in-flight fetches cannot repopulate it.
    """

    def __init__(
        self,
        directory: Path,
        *,
        disk_bytes: int = 512 * 1024 * 1024,
        memory_bytes: int = MEMORY_BYTES,
        max_entries: int = MAX_ENTRIES,
        retained_memory_bytes: int | None = None,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.directory = directory.absolute()
        self.disk_budget = disk_bytes
        # Reserve half the memory budget for temporary encode/decode buffers.
        self.memory_budget = (
            min(memory_bytes // 2, retained_memory_bytes)
            if retained_memory_bytes is not None
            else memory_bytes // 2
        )
        self.entry_budget = min(disk_bytes, memory_bytes // 8)
        self.max_entries = min(max_entries, MAX_ENTRIES)
        self.clock = clock
        self.index: OrderedDict[str, int] = OrderedDict()
        self.memory: OrderedDict[str, bytes] = OrderedDict()
        self.disk_size = 0
        self.memory_size = 0
        self.fd: int | None = None
        self.lock = asyncio.Lock()
        self.inflight: dict[str, asyncio.Task[Entry]] = {}
        self.waiters: dict[asyncio.Task[Entry], int] = {}
        self.counters = {"hits": 0, "misses": 0, "revalidations": 0, "evictions": 0}
        self.generation = 0
        self.closed = False

    async def _io[T](self, function: Callable[..., T], *args: Any) -> T:
        """Keep the lock/fd alive until the real thread has stopped, even on cancellation."""
        task = asyncio.create_task(asyncio.to_thread(function, *args))
        cancellation = None
        while True:
            try:
                result = await asyncio.shield(task)
                break
            except asyncio.CancelledError as error:
                cancellation = error
                if task.done():
                    result = task.result()
                    break
        if cancellation is not None:
            raise cancellation
        return result

    async def start(self) -> None:
        async with self.lock:
            await self._io(self._start)

    def _start(self) -> None:
        # Walk each component without following symlinks, including the parent.
        fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
        try:
            for part in self.directory.parts[1:]:
                try:
                    next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                except FileNotFoundError:
                    os.mkdir(part, mode=0o700, dir_fd=fd)
                    next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                os.close(fd)
                fd = next_fd
            self.fd = fd
            recovered = []
            for name in os.listdir(fd):
                info = os.stat(name, dir_fd=fd, follow_symlinks=False)
                if not stat.S_ISREG(info.st_mode):
                    # Unlink links themselves only; leave unknown directories alone.
                    if stat.S_ISLNK(info.st_mode):
                        os.unlink(name, dir_fd=fd)
                    continue
                try:
                    if not self._valid_name(name) or info.st_size > self.entry_budget:
                        raise ValueError("Unknown or oversized cache entry")
                    raw = self._read_file(name)
                    entry = self._decode(raw)
                    if self._name(entry.key) != name or self._retention_expired(entry):
                        raise ValueError("Invalid cache identity or retention")
                    recovered.append((info.st_mtime_ns, name, len(raw)))
                except (OSError, ValueError, TypeError, KeyError):
                    os.unlink(name, dir_fd=fd)
            for _, name, size in sorted(recovered):
                self.index[name] = size
                self.disk_size += size
            self._evict()
        except BaseException:
            os.close(fd)
            self.fd = None
            raise

    @staticmethod
    def _valid_name(name: str) -> bool:
        return (
            len(name) == 70
            and name.endswith(".cache")
            and all(c in "0123456789abcdef" for c in name[:64])
        )

    @staticmethod
    def _name(key: str) -> str:
        return hashlib.sha256(key.encode()).hexdigest() + ".cache"

    def _read_file(self, name: str) -> bytes:
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=self.fd)
        with os.fdopen(fd, "rb") as stream:
            if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                raise ValueError("Cache entry is not a regular file")
            raw = stream.read(self.entry_budget + 1)
        if len(raw) > self.entry_budget:
            raise ValueError("Oversized cache entry")
        return raw

    @staticmethod
    def _encode(entry: Entry) -> bytes:
        meta = asdict(entry)
        del meta["payload"]
        del meta["stale"]
        meta.update(
            version=1, size=len(entry.payload), sha256=hashlib.sha256(entry.payload).hexdigest()
        )
        header = json.dumps(meta, allow_nan=False, separators=(",", ":")).encode()
        if len(header) > MAX_METADATA_BYTES:
            raise ValueError("Cache metadata is too large")
        return len(header).to_bytes(4, "big") + header + entry.payload

    @staticmethod
    def _decode(raw: bytes) -> Entry:
        size = int.from_bytes(raw[:4], "big")
        if not 0 < size <= MAX_METADATA_BYTES or len(raw) < size + 4:
            raise ValueError("Invalid metadata length")
        meta = json.loads(raw[4 : 4 + size])
        if not isinstance(meta, dict):
            raise ValueError("Cache metadata must be an object")
        payload = raw[4 + size :]
        if (
            meta.pop("version") != 1
            or meta.pop("size") != len(payload)
            or meta.pop("sha256") != hashlib.sha256(payload).hexdigest()
        ):
            raise ValueError("Invalid cache version, size or hash")
        entry = Entry(payload=payload, **meta)
        for value in (entry.fetched_at, entry.expires_at, entry.age_at_validation):
            if (
                isinstance(value, bool)
                or not isinstance(value, (float, int))
                or not math.isfinite(value)
            ):
                raise ValueError("Invalid cache timestamp")
        if entry.age_at_validation < 0:
            raise ValueError("Invalid corrected age")
        for text_value in (
            entry.key,
            entry.provider,
            entry.product,
            entry.content_type,
            entry.cache_control,
        ):
            if not isinstance(text_value, str):
                raise ValueError("Invalid cache metadata")
        if entry.validated_at is not None and (
            isinstance(entry.validated_at, bool)
            or not isinstance(entry.validated_at, (float, int))
            or not math.isfinite(entry.validated_at)
        ):
            raise ValueError("Invalid validation timestamp")
        if entry.freshness_lifetime is not None and (
            type(entry.freshness_lifetime) not in (float, int)
            or not math.isfinite(entry.freshness_lifetime)
            or not 0 <= entry.freshness_lifetime <= 7776000
        ):
            raise ValueError("Invalid freshness lifetime")
        for validator in (entry.etag, entry.last_modified):
            if validator is not None and not isinstance(validator, str):
                raise ValueError("Invalid validator")
        return entry

    def _retention_expired(self, entry: Entry) -> bool:
        return (
            entry.provider == "osm_standard"
            and self.clock()
            >= (entry.validated_at if entry.validated_at is not None else entry.fetched_at)
            + 7776000
        ) or (
            entry.provider in ("rainviewer", "noaa_mrms", "noaa_ksox")
            and self.clock() >= entry.fetched_at + 86400
        )

    def _forget(self, name: str) -> None:
        self.disk_size -= self.index.pop(name, 0)
        self.memory_size -= len(self.memory.pop(name, b""))
        try:
            os.unlink(name, dir_fd=self.fd)
        except FileNotFoundError:
            pass

    def _evict(self) -> None:
        while self.index and (
            self.disk_size > self.disk_budget or len(self.index) > self.max_entries
        ):
            self.counters["evictions"] += 1
            self._forget(next(iter(self.index)))
        while self.memory and self.memory_size > self.memory_budget:
            _, raw = self.memory.popitem(last=False)
            self.memory_size -= len(raw)

    def _remember(self, name: str, raw: bytes) -> None:
        self.memory_size -= len(self.memory.pop(name, b""))
        if len(raw) <= self.memory_budget:
            self.memory[name] = raw
            self.memory_size += len(raw)
        self._evict()

    async def get(self, key: str, *, stale: bool = False) -> Entry | None:
        async with self.lock:
            if self.closed:
                return None
            entry = await self._io(self._get, key, stale)
            if not stale:
                self.counters["hits" if entry is not None else "misses"] += 1
            return entry

    def _get(self, key: str, stale: bool) -> Entry | None:
        name = self._name(key)
        if name not in self.index:
            return None
        try:
            raw = self.memory.get(name)
            if raw is None:
                raw = self._read_file(name)
            entry = self._decode(raw)
            if entry.key != key or self._retention_expired(entry):
                self._forget(name)
                return None
            self.index.move_to_end(name)
            os.utime(name, dir_fd=self.fd, follow_symlinks=False)
            self._remember(name, raw)
            if not stale and (
                self.clock() >= entry.expires_at or "no-cache" in entry.cache_control
            ):
                return None
            return entry
        except (OSError, ValueError, TypeError, KeyError):
            self._forget(name)
            return None

    async def discard(self, key: str, *, generation: int) -> None:
        """An upstream no-store directive invalidates an older retained response."""
        async with self.lock:
            if not self.closed and generation == self.generation:
                await self._io(self._forget, self._name(key))

    async def put(self, entry: Entry, *, generation: int | None = None) -> bool:
        async with self.lock:
            if self.closed or (generation is not None and generation != self.generation):
                return False
            return await self._io(self._put, entry)

    def _put(self, entry: Entry) -> bool:
        if len(entry.payload) > self.entry_budget:
            return False
        name = self._name(entry.key)
        directives = entry.cache_control.lower()
        if "no-store" in directives:
            self._forget(name)
            return False
        if entry.provider in ("rainviewer", "noaa_mrms", "noaa_ksox"):
            entry = replace(entry, expires_at=min(entry.expires_at, entry.fetched_at + 86400))
        if self._retention_expired(entry):
            return False
        if "no-cache" in directives:
            entry = replace(entry, expires_at=min(entry.expires_at, self.clock()))
        for directive in directives.split(",") if entry.freshness_lifetime is None else ():
            if directive.strip().startswith("max-age="):
                try:
                    age = max(0, int(directive.strip()[8:].strip('"')))
                    entry = replace(
                        entry,
                        expires_at=min(
                            entry.expires_at,
                            (
                                entry.validated_at
                                if entry.validated_at is not None
                                else entry.fetched_at
                            )
                            + age,
                        ),
                    )
                except ValueError:
                    entry = replace(entry, expires_at=min(entry.expires_at, self.clock()))
        raw = self._encode(entry)
        self._decode(raw)
        if len(raw) > self.entry_budget:
            return False
        temporary = uuid.uuid4().hex + ".tmp"
        fd = os.open(
            temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=self.fd
        )
        try:
            with os.fdopen(fd, "wb") as stream:
                stream.write(raw)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, name, src_dir_fd=self.fd, dst_dir_fd=self.fd)
            os.fsync(self.fd if self.fd is not None else -1)
        finally:
            try:
                os.unlink(temporary, dir_fd=self.fd)
            except FileNotFoundError:
                pass
        self.disk_size -= self.index.pop(name, 0)
        self.index[name] = len(raw)
        self.disk_size += len(raw)
        self._remember(name, raw)
        return name in self.index

    async def fetch(
        self, key: str, producer: Callable[[Entry | None], Awaitable[FetchResult]]
    ) -> Entry:
        if self.closed:
            raise RuntimeError("Cache is closed")
        task = self.inflight.get(key)
        if task is None:
            if len(self.inflight) >= 128:
                raise RuntimeError("Cache fetch queue is full")
            task = asyncio.create_task(self._fetch(key, producer, self.generation))
            self.inflight[key] = task
            task.add_done_callback(lambda done: self._fetch_done(key, done))
        self.waiters[task] = self.waiters.get(task, 0) + 1
        try:
            return await asyncio.shield(task)
        finally:
            self.waiters[task] -= 1
            if not self.waiters[task]:
                del self.waiters[task]
                if self.inflight.get(key) is task:
                    del self.inflight[key]
                if not task.done():
                    task.cancel()
                await asyncio.gather(task, return_exceptions=True)

    def _fetch_done(self, key: str, task: asyncio.Task[Entry]) -> None:
        if self.inflight.get(key) is task:
            del self.inflight[key]
        if not task.cancelled():
            task.exception()  # Retrieve failures even when all original waiters left.

    async def _fetch(
        self, key: str, producer: Callable[[Entry | None], Awaitable[FetchResult]], generation: int
    ) -> Entry:
        if (cached := await self.get(key)) is not None:
            return cached
        stale = await self.get(key, stale=True)
        if self.closed:
            raise RuntimeError("Cache is closed")
        result = await producer(stale)
        if result.not_modified:
            self.counters["revalidations"] += 1
            if stale is None or result.expires_at is None:
                raise ValueError("304 requires a cached entry and expiry")
            # Revalidation changes expiry, never the data's original observation time.
            entry = replace(
                stale,
                expires_at=result.expires_at,
                validated_at=self.clock(),
                cache_control=result.cache_control
                if result.cache_control is not None
                else stale.cache_control,
            )
        elif result.entry is not None and result.entry.key == key:
            entry = result.entry
        else:
            raise ValueError("Missing cache response or mismatched key")
        if result.store:
            await self.put(entry, generation=generation)
        return entry

    async def clear(self) -> None:
        async with self.lock:
            self.generation += 1
            if not self.closed:
                await self._io(self._clear)

    def _clear(self) -> None:
        for name in list(self.index):
            self._forget(name)

    async def close(self) -> None:
        async with self.lock:
            self.closed = True
            self.generation += 1
            if self.fd is not None:
                fd, self.fd = self.fd, None
                await self._io(os.close, fd)
            self.memory.clear()
            self.memory_size = 0
        tasks = list(self.inflight.values())
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self.inflight.clear()

    def diagnostics(self) -> dict[str, int]:
        return {
            **self.counters,
            "entries": len(self.index),
            "disk_bytes": self.disk_size,
            "memory_bytes": self.memory_size,
        }
