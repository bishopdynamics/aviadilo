"""Bounded-work lanes: FIFO within each user and round-robin across ready users.

The gateway bounds outstanding requests before entering these lanes. No producer
task is created here; cancellation removes a waiter, including a granted waiter
whose coroutine has not resumed yet.
"""

import asyncio
from collections import deque
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager


class AssetLane:
    def __init__(self, per_user: int = 8, total: int = 32) -> None:
        self.per_user, self.total = per_user, total
        self.active: dict[str, int] = {}
        self.waiting: dict[str, deque[asyncio.Future[None]]] = {}
        self.ready: deque[str] = deque()

    def _pump(self) -> None:
        skipped = 0
        while self.ready and sum(self.active.values()) < self.total:
            user = self.ready.popleft()
            if self.active.get(user, 0) >= self.per_user:
                self.ready.append(user)
                skipped += 1
                if skipped >= len(self.ready):
                    break
                continue
            skipped = 0
            queue = self.waiting[user]
            waiter = queue.popleft()
            if queue:
                self.ready.append(user)
            else:
                del self.waiting[user]
            self.active[user] = self.active.get(user, 0) + 1
            waiter.set_result(None)

    @asynccontextmanager
    async def slot(self, user: str) -> AsyncIterator[None]:
        waiter = asyncio.get_running_loop().create_future()
        if user not in self.waiting:
            self.waiting[user] = deque()
            self.ready.append(user)
        self.waiting[user].append(waiter)
        self._pump()
        try:
            # Shield lets cleanup distinguish cancelled-before-grant from the
            # grant/cancel race; cancelling a task must not cancel its marker.
            await asyncio.shield(waiter)
            yield
        finally:
            if waiter.done():
                self.active[user] -= 1
                if not self.active[user]:
                    del self.active[user]
            else:
                queue = self.waiting[user]
                queue.remove(waiter)
                waiter.cancel()
                if not queue:
                    del self.waiting[user]
                    self.ready.remove(user)
            self._pump()
