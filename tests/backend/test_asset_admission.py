"""Queue fairness and the cancellation/grant race, without producers or IO."""

import asyncio

from custom_components.aviadilo.asset_admission import AssetLane


async def test_round_robin_users_with_fifo_jobs_and_saturated_user_skip() -> None:
    lane = AssetLane(per_user=1, total=1)
    order: list[str] = []

    async def run(name: str) -> None:
        async with lane.slot(name[0]):
            order.append(name)
            await asyncio.sleep(0)

    async with lane.slot("occupied"):
        tasks = [asyncio.create_task(run(name)) for name in ["a1", "a2", "b1", "b2", "c1"]]
        await asyncio.sleep(0)
    await asyncio.gather(*tasks)
    assert order == ["a1", "b1", "c1", "a2", "b2"]
    assert not lane.active and not lane.waiting and not lane.ready

    lane = AssetLane(per_user=1, total=2)
    async with lane.slot("a"):
        blocked = asyncio.create_task(run("a3"))
        ready = asyncio.create_task(run("b3"))
        await ready
        assert not blocked.done() and order[-1] == "b3"
    await blocked
    assert not lane.active and not lane.waiting and not lane.ready


async def test_cancel_before_and_immediately_after_grant_releases_exactly_once() -> None:
    lane = AssetLane(per_user=1, total=1)

    async def run() -> None:
        async with lane.slot("viewer"):
            await asyncio.sleep(10)

    async with lane.slot("viewer"):
        before = asyncio.create_task(run())
        await asyncio.sleep(0)
        before.cancel()
        await asyncio.gather(before, return_exceptions=True)
        assert not lane.waiting and lane.active == {"viewer": 1}
        after = asyncio.create_task(run())
        await asyncio.sleep(0)
    # Release granted after's future synchronously, but it has not resumed.
    after.cancel()
    await asyncio.gather(after, return_exceptions=True)
    assert not lane.active and not lane.waiting and not lane.ready
    async with lane.slot("viewer"):
        assert lane.active == {"viewer": 1}
