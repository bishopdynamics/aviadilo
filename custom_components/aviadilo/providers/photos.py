"""User-private, memory-only external pictures with connection-level SSRF guards."""

import asyncio
import hashlib
import ipaddress
import json
import re
import socket
import time
from collections import OrderedDict
from collections.abc import Callable
from typing import Any

from aiohttp import ClientError, ClientSession, ClientTimeout, DummyCookieJar, TCPConnector
from aiohttp.abc import ResolveResult
from aiohttp.resolver import ThreadedResolver
from yarl import URL

from ..assets import AssetPayload
from ..cache import Entry
from ..scheduler import ProviderError, Scheduler
from .asset_http import USER_AGENT, InvalidAsset, normalize, off_loop, policy_entry, read_image

PHOTO_BYTES = 8 * 1024 * 1024
PHOTO_ENTRIES = 128


def public_address(value: str) -> None:
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        raise InvalidAsset("Invalid photo destination") from None
    if (
        not address.is_global
        or address.is_multicast
        or address.is_reserved
        or (
            isinstance(address, ipaddress.IPv6Address)
            and (
                address.ipv4_mapped is not None
                or address.sixtofour is not None
                or address.teredo is not None
                or address.scope_id is not None
            )
        )
    ):
        raise InvalidAsset("Invalid photo destination")


def external_url(value: str, origins: set[str]) -> URL:
    try:
        url = URL(value)
        host = url.host or ""
        if (
            len(value) > 8192
            or url.scheme != "https"
            or not host
            or url.user is not None
            or url.password is not None
            or url.fragment
            or url.port != 443
            or str(url.origin()) in origins
            or "%" in host
            or "\\" in value
            or any(ord(c) < 33 for c in value)
        ):
            raise ValueError from None
        try:
            ipaddress.ip_address(host)
        except ValueError:
            # Exclude legacy inet_aton spellings (127.1, octal, hex, integer).
            labels = host.rstrip(".").split(".")
            if all(re.fullmatch(r"(?:[0-9]+|0x[0-9a-f]+)", label, re.I) for label in labels):
                raise ValueError from None
            if len(labels) < 2 or any(
                not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label, re.I)
                for label in labels
            ):
                raise ValueError from None
        else:
            public_address(host)
        return url
    except (ValueError, UnicodeError):
        raise InvalidAsset("Invalid photo destination") from None


class PublicResolver(ThreadedResolver):
    async def resolve(
        self, host: str, port: int = 0, family: socket.AddressFamily = socket.AF_INET
    ) -> list[ResolveResult]:
        answers = await super().resolve(host, port, family)
        if not answers or len(answers) > 32:
            raise InvalidAsset("Invalid photo destination")
        # Fail the complete answer set, rather than choosing a public answer and
        # leaving private answers available to happy-eyeballs fallback.
        for answer in answers:
            public_address(answer["host"])
        return answers


def public_socket(address_info: tuple[Any, ...]) -> socket.socket:
    """Runs on the address used by connect(), including literal-IP bypasses of DNS."""
    family, kind, protocol, _, address = address_info
    public_address(address[0])
    return socket.socket(family=family, type=kind, proto=protocol)


class PhotoProvider:
    def __init__(self, scheduler: Scheduler, *, clock: Callable[[], float] = time.time) -> None:
        self.scheduler, self.clock = scheduler, clock
        self.session: ClientSession | None = None
        self.resolver: PublicResolver | None = None
        self.memory: OrderedDict[str, Entry] = OrderedDict()
        self.size = 0
        self.jobs: dict[str, asyncio.Task[Entry]] = {}
        self.waiters: dict[asyncio.Task[Entry], int] = {}
        self.generation = 0
        self.closed = False
        self.counters = {
            "hits": 0,
            "misses": 0,
            "revalidations": 0,
            "evictions": 0,
            "received_bytes": 0,
        }

    def _session(self) -> ClientSession:
        if self.session is None:
            self.resolver = PublicResolver()
            self.session = ClientSession(
                connector=TCPConnector(
                    resolver=self.resolver,
                    socket_factory=public_socket,
                    limit=1,
                    force_close=True,
                    use_dns_cache=False,
                ),
                cookie_jar=DummyCookieJar(),
                trust_env=False,
                timeout=ClientTimeout(total=25, connect=10, sock_read=10),
                headers={"User-Agent": USER_AGENT, "Accept-Encoding": "identity"},
                auto_decompress=False,
            )
        return self.session

    def _forget(self, key: str) -> None:
        if entry := self.memory.pop(key, None):
            self.size -= len(entry.payload)

    async def fetch(
        self,
        user_id: str,
        entity_id: str,
        picture_key: str,
        picture: str,
        origins: set[str],
        authorized: Callable[[], None],
    ) -> AssetPayload:
        authorized()
        if self.closed:
            raise InvalidAsset("Photo service unavailable")
        url = external_url(picture, origins)
        identity = hashlib.sha256(
            json.dumps([user_id, entity_id, picture_key]).encode()
        ).hexdigest()
        if entry := self.memory.get(identity):
            if self.clock() < entry.expires_at and "no-cache" not in entry.cache_control:
                self.counters["hits"] += 1
                self.memory.move_to_end(identity)
                authorized()
                return AssetPayload(entry.payload, no_store=True)
        self.counters["misses"] += 1
        task = self.jobs.get(identity)
        if task is None:
            if len(self.jobs) >= 32:
                raise InvalidAsset("Photo service capacity reached")
            task = asyncio.create_task(self._fetch(identity, url, authorized, self.generation))
            self.jobs[identity] = task
        self.waiters[task] = self.waiters.get(task, 0) + 1
        try:
            entry = await asyncio.shield(task)
            authorized()
            return AssetPayload(entry.payload, no_store=True)
        finally:
            self.waiters[task] -= 1
            if not self.waiters[task]:
                del self.waiters[task]
                if self.jobs.get(identity) is task:
                    del self.jobs[identity]
                if not task.done():
                    task.cancel()
                await asyncio.gather(task, return_exceptions=True)

    async def _fetch(
        self, identity: str, url: URL, authorized: Callable[[], None], generation: int
    ) -> Entry:
        stale = self.memory.get(identity)

        async def upstream() -> Entry:
            authorized()
            try:
                async with self._session().get(
                    url,
                    headers=stale.validators if stale else {},
                    allow_redirects=False,
                    proxy=None,
                    auth=None,
                ) as response:
                    if response.status not in (200, 304):
                        raise ProviderError(response.status, response.headers.get("Retry-After"))
                    now = self.clock()
                    metadata = policy_entry(
                        response.headers,
                        now,
                        stale or Entry(identity, "photos", "thumbnail", now, now, "image/png", b""),
                        fallback=3600,
                        shared=False,
                        revalidated=response.status == 304,
                    )
                    if "no-store" in metadata.cache_control and generation == self.generation:
                        self._forget(identity)
                    if response.status == 304:
                        if stale is None:
                            raise InvalidAsset("Unexpected revalidation")
                        entry = stale
                        self.counters["revalidations"] += 1
                    else:
                        body = await read_image(response, {"image/png", "image/jpeg", "image/webp"})
                        self.counters["received_bytes"] += len(body)
                        payload = await off_loop(normalize, body, photo=True)
                        entry = Entry(
                            identity, "photos", "thumbnail", now, now, "image/png", payload
                        )
                    return policy_entry(
                        response.headers,
                        now,
                        entry,
                        fallback=3600,
                        shared=False,
                        revalidated=response.status == 304,
                    )
            except ClientError:
                raise ProviderError(503) from None

        entry = await self.scheduler.request("photos", identity, upstream, retry=False)
        authorized()
        if self.closed or generation != self.generation:
            raise InvalidAsset("Photo service changed")
        self._forget(identity)
        if "no-store" not in entry.cache_control:
            self.memory[identity] = entry
            self.size += len(entry.payload)
            while self.size > PHOTO_BYTES or len(self.memory) > PHOTO_ENTRIES:
                self._forget(next(iter(self.memory)))
                self.counters["evictions"] += 1
        return entry

    async def clear(self) -> None:
        self.generation += 1
        self.memory.clear()
        self.size = 0
        tasks = list(self.jobs.values())
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self.jobs.clear()

    async def close(self) -> None:
        self.closed = True
        await self.clear()
        if self.session:
            await self.session.close()
        if self.resolver:
            await self.resolver.close()

    def diagnostics(self) -> dict[str, int]:
        return {
            **self.counters,
            "entries": len(self.memory),
            "memory_bytes": self.size,
            "pending": len(self.jobs),
        }
