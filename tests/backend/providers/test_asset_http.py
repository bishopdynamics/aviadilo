"""HTTP age/policy and real raster decode bounds, independent of network IO."""

import asyncio
import io
import threading
from dataclasses import replace
from datetime import UTC, datetime
from email.utils import format_datetime

import pytest
from PIL import Image

from custom_components.aviadilo.cache import Entry
from custom_components.aviadilo.providers.asset_http import (
    InvalidAsset,
    normalize,
    off_loop,
    policy_entry,
    stale_allowed,
    validator,
)


def image_bytes(size: tuple[int, int] = (256, 256), kind: str = "PNG") -> bytes:
    stream = io.BytesIO()
    Image.new("RGB", size, (30, 90, 120)).save(stream, format=kind)
    return stream.getvalue()


def entry() -> Entry:
    return Entry("key", "osm_standard", "standard", 100, 100, "image/png", b"payload")


def http_date(stamp: float) -> str:
    return format_datetime(datetime.fromtimestamp(stamp, UTC), usegmt=True)


@pytest.mark.parametrize(
    "headers,lifetime,age",
    [
        ({}, 604800, 0),
        ({"Cache-Control": "max-age=3600, s-maxage=60"}, 60, 0),
        ({"Cache-Control": "max-age=60", "Date": http_date(0)}, 60, 100),
        ({"Cache-Control": "max-age=0"}, 0, 0),
        ({"Cache-Control": "no-cache, max-age=800"}, 0, 0),
        ({"Cache-Control": 'MAX-AGE="50"', "Age": "20"}, 50, 20),
        ({"Cache-Control": "max-age=broken"}, 0, 0),
        ({"Cache-Control": "max-age=500, max-age=5000"}, 0, 0),
        ({"Expires": http_date(500), "Date": http_date(90)}, 410, 10),
        ({"Expires": http_date(50)}, 0, 0),
        ({"Cache-Control": "max-age=500", "Age": "invalid"}, 500, 500),
        ({"Cache-Control": "max-age=500", "Date": http_date(90), "Age": "2"}, 500, 10),
    ],
)
def test_corrected_http_freshness(headers: dict[str, str], lifetime: int, age: int) -> None:
    result = policy_entry(headers, 100, entry(), fallback=604800, shared=True)
    assert result.freshness_lifetime == lifetime
    assert result.age_at_validation == age
    assert result.expires_at == 100 + lifetime - age


@pytest.mark.parametrize(
    "headers,retained",
    [
        ({"Cache-Control": "no-store"}, False),
        ({"Cache-Control": "private"}, False),
        ({"Vary": "Referer"}, False),
        ({"Vary": "*"}, False),
        ({"Vary": "Accept-Encoding"}, True),
        ({"Cache-Control": 'no-cache="private-field"'}, True),
    ],
)
def test_shared_policy_and_vary(headers: dict[str, str], retained: bool) -> None:
    result = policy_entry(headers, 100, entry(), fallback=604800, shared=True)
    assert ("no-store" not in result.cache_control) is retained
    if "no-cache" in result.cache_control:
        assert result.expires_at == 100


def test_304_renews_policy_without_changing_payload_observation() -> None:
    previous = policy_entry(
        {"ETag": '"v1"', "Cache-Control": "max-age=60", "Age": "30"},
        100,
        entry(),
        fallback=604800,
        shared=True,
    )
    result = policy_entry(
        {"ETag": 'W/"v2"'}, 150, previous, fallback=604800, shared=True, revalidated=True
    )
    assert result.fetched_at == 100 and result.validated_at == 150
    assert result.expires_at == 210 and result.payload == previous.payload
    assert result.validators == {"If-None-Match": 'W/"v2"'}
    result = policy_entry(
        {"Cache-Control": "no-store"}, 200, result, fallback=604800, shared=True, revalidated=True
    )
    assert "no-store" in result.cache_control


@pytest.mark.parametrize(
    "control,allowed",
    [
        ("max-age=10", False),
        ("max-age=10, stale-if-error=20", True),
        ("no-cache, stale-if-error=20", False),
        ("no-store, stale-if-error=20", False),
        ("must-revalidate, stale-if-error=20", False),
        ("proxy-revalidate, stale-if-error=20", False),
    ],
)
def test_only_explicit_permitted_stale(control: str, allowed: bool) -> None:
    old = replace(entry(), expires_at=110, cache_control=control)
    assert stale_allowed(old, 115) is allowed
    assert not stale_allowed(old, 130)


@pytest.mark.parametrize(
    "bad", ['"ok"\r\nSecret: x', "https://secret.invalid", 'W/"x"\n', '"' + "x" * 513 + '"']
)
def test_validator_sanitization(bad: str) -> None:
    assert validator(bad) is None


@pytest.mark.parametrize("kind", ["PNG", "JPEG", "WEBP"])
def test_photo_raster_normalized_and_bounded(kind: str) -> None:
    body = normalize(image_bytes((1000, 1000), kind), photo=True)
    with Image.open(io.BytesIO(body)) as image:
        assert image.size == (128, 128) and image.format == "PNG" and not image.info


@pytest.mark.parametrize(
    "body,photo",
    [
        (b"<svg/>", True),
        (b"<html>", True),
        (image_bytes((1001, 1000)), True),
        (image_bytes((512, 512)), False),
        (image_bytes(kind="JPEG"), False),
        (image_bytes()[:100], False),
        (b"x" * (2 * 1024 * 1024 + 1), True),
    ],
)
def test_invalid_raster_rejected(body: bytes, photo: bool) -> None:
    with pytest.raises(InvalidAsset):
        normalize(body, photo=photo)


async def test_cancellation_keeps_decode_lane_until_thread_stops() -> None:
    started, release = threading.Event(), threading.Event()

    def work() -> int:
        started.set()
        assert release.wait(5)
        return 1

    task = asyncio.create_task(off_loop(work))
    assert await asyncio.to_thread(started.wait, 5)
    task.cancel()
    await asyncio.sleep(0)
    assert not task.done()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task


def test_old_upstream_age_does_not_restart_stale_allowance() -> None:
    result = policy_entry(
        {"Cache-Control": "max-age=60, stale-if-error=120", "Age": "3600"},
        10000,
        entry(),
        fallback=604800,
        shared=True,
    )
    assert result.expires_at == 6460
    assert not stale_allowed(result, 10001)


async def test_cancelled_inner_decode_task_terminates() -> None:
    def cancelled() -> None:
        raise asyncio.CancelledError

    with pytest.raises(asyncio.CancelledError):
        async with asyncio.timeout(1):
            await off_loop(cancelled)


def test_compressed_png_metadata_removed_before_decoder() -> None:
    import struct
    import zlib

    raw = image_bytes()
    data = b"metadata\0\0" + zlib.compress(b"x" * 2_000_000)
    chunk = (
        struct.pack(">I", len(data))
        + b"zTXt"
        + data
        + struct.pack(">I", zlib.crc32(b"zTXt" + data))
    )
    body = raw[:33] + chunk + raw[33:]
    # Pillow normally rejects this over its per-text-chunk limit. The asset
    # decoder discards the compressed metadata without ever inflating it.
    assert normalize(body, photo=False) == normalize(raw, photo=False)
