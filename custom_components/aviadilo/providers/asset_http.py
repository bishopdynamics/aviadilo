"""Bounded raster and HTTP policy helpers used only by the two asset adapters."""

import asyncio
import io
import re
import struct
import zlib
from collections.abc import Callable, Mapping
from dataclasses import replace
from datetime import UTC
from email.utils import format_datetime, parsedate_to_datetime
from typing import Any

from aiohttp import ClientResponse
from PIL import Image, ImageOps

from ..cache import Entry

MAX_BYTES = 2 * 1024 * 1024
USER_AGENT = "Aviadilo/1 (+https://github.com/bishopdynamics/aviadilo)"


class InvalidAsset(ValueError):
    """Safe, URL-free upstream validation failure."""


def date(value: str | None) -> float | None:
    try:
        parsed = parsedate_to_datetime(value or "")
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.timestamp()
    except (ValueError, TypeError, OverflowError):
        return None


def validator(value: str | None, *, modified: bool = False) -> str | None:
    if value is None or len(value) > 512:
        return None
    if modified:
        stamp = date(value)
        if stamp is None:
            return None
        try:
            from datetime import datetime

            return format_datetime(datetime.fromtimestamp(stamp, UTC), usegmt=True)
        except (ValueError, OverflowError):
            return None
    return value if re.fullmatch(r'(?:W/)?"[\x21\x23-\x7e]*"', value) else None


def directives(control: str) -> dict[str, str | None]:
    result: dict[str, str | None] = {}
    for piece in control.lower().split(","):
        key, _, value = piece.strip().partition("=")
        key = key.strip()
        if key in ("no-store", "no-cache", "must-revalidate", "private", "proxy-revalidate"):
            result[key] = None
        elif key in ("max-age", "s-maxage", "stale-if-error"):
            value = value.strip().strip('"')
            if value.isascii() and value.isdigit() and len(value) <= 12:
                result[key] = str(min(7776000, int(value))) if key not in result else "0"
            else:
                result[key] = "0"
    return result


def policy_entry(
    headers: Mapping[str, str],
    now: float,
    entry: Entry,
    *,
    fallback: int,
    shared: bool,
    revalidated: bool = False,
) -> Entry:
    """Retain sanitized origin policy, corrected age and a separate freshness lifetime.

    304 omissions retain original policy/lifetime and validators. Unsafe Vary and
    private shared responses are transient only. Unknown headers never escape.
    """
    control = headers.get("Cache-Control", entry.cache_control if revalidated else "")
    policy = directives(control)
    vary = headers.get("Vary", "")
    if (vary and {part.strip().lower() for part in vary.split(",")} - {"accept-encoding"}) or (
        shared and "private" in policy
    ):
        policy["no-store"] = None
    lifetime: float = float(fallback)
    if revalidated and entry.freshness_lifetime is not None:
        lifetime = entry.freshness_lifetime
    if shared and "s-maxage" in policy:
        lifetime = float(policy["s-maxage"] or 0)
        policy["must-revalidate"] = None
    elif "max-age" in policy:
        lifetime = float(policy["max-age"] or 0)
    elif "Expires" in headers and (expires := date(headers["Expires"])) is not None:
        lifetime = max(
            0, expires - (stamp if (stamp := date(headers.get("Date"))) is not None else now)
        )
    if "no-cache" in policy:
        lifetime = 0
    lifetime = min(7776000, lifetime)
    raw_age = headers.get("Age", "0")
    age = float(raw_age) if re.fullmatch(r"[0-9]{1,12}", raw_age) else lifetime
    age = max(
        age, max(0, now - (stamp if (stamp := date(headers.get("Date"))) is not None else now))
    )
    control = ", ".join(key if value is None else f"{key}={value}" for key, value in policy.items())
    return replace(
        entry,
        expires_at=now + lifetime - age,
        validated_at=now,
        freshness_lifetime=lifetime,
        age_at_validation=age,
        cache_control=control,
        etag=validator(headers.get("ETag", entry.etag if revalidated else None)),
        last_modified=validator(
            headers.get("Last-Modified", entry.last_modified if revalidated else None),
            modified=True,
        ),
    )


def stale_allowed(entry: Entry, now: float) -> bool:
    policy = directives(entry.cache_control)
    return (
        not {"no-cache", "no-store", "must-revalidate", "proxy-revalidate"}.intersection(policy)
        and "stale-if-error" in policy
        and now < entry.expires_at + int(policy["stale-if-error"] or 0)
    )


async def read_image(response: ClientResponse, allowed: set[str]) -> bytes:
    # Reject compressed transfer bodies even if the server ignores identity, so
    # both transfer bytes and decoded raster input are independently bounded.
    if (
        response.content_type not in allowed
        or response.headers.get("Content-Encoding", "identity").lower() != "identity"
        or (response.content_length is not None and response.content_length > MAX_BYTES)
    ):
        raise InvalidAsset("Invalid image response")
    body = bytearray()
    async for chunk in response.content.iter_chunked(65536):
        if len(body) + len(chunk) > MAX_BYTES:
            raise InvalidAsset("Image exceeds byte limit")
        body.extend(chunk)
    return bytes(body)


def png_raster_chunks(payload: bytes) -> bytes:
    """Drop compressed text/ICC/EXIF/APNG before Pillow can allocate metadata.

    Preserve only raster-critical chunks and palette transparency. Validate CRC,
    framing and dimensions before processing any compressed metadata or pixels.
    """
    if not payload.startswith(b"\x89PNG\r\n\x1a\n"):
        return payload
    output = bytearray(payload[:8])
    offset = 8
    ended = False
    while offset + 12 <= len(payload):
        length = int.from_bytes(payload[offset : offset + 4], "big")
        kind = payload[offset + 4 : offset + 8]
        end = offset + length + 12
        if end > len(payload) or zlib.crc32(payload[offset + 4 : end - 4]) != int.from_bytes(
            payload[end - 4 : end], "big"
        ):
            raise InvalidAsset("Invalid PNG framing")
        if offset == 8:
            if kind != b"IHDR" or length != 13:
                raise InvalidAsset("Invalid PNG header")
            width, height = struct.unpack(">II", payload[offset + 8 : offset + 16])
            if width < 1 or height < 1 or width * height > 1_000_000:
                raise InvalidAsset("Image exceeds pixel limit")
        elif kind == b"IHDR":
            raise InvalidAsset("Invalid PNG header")
        if kind in (b"IHDR", b"PLTE", b"IDAT", b"IEND", b"tRNS"):
            output.extend(payload[offset:end])
        elif not kind[0] & 32:
            raise InvalidAsset("Unsupported PNG critical chunk")
        if kind == b"IEND":
            ended = length == 0 and end == len(payload)
            break
        offset = end
    if not ended:
        raise InvalidAsset("Incomplete PNG")
    return bytes(output)


def normalize(payload: bytes, *, photo: bool) -> bytes:
    """Check header bounds before raster allocation, fully decode, strip metadata."""
    if not payload or len(payload) > MAX_BYTES:
        raise InvalidAsset("Image exceeds byte limit")
    try:
        payload = png_raster_chunks(payload)
        with Image.open(
            io.BytesIO(payload), formats=["PNG", "JPEG", "WEBP"] if photo else ["PNG"]
        ) as source:
            if (photo and source.width * source.height > 1_000_000) or (
                not photo and source.size != (256, 256)
            ):
                raise InvalidAsset("Image exceeds pixel limit")
            source.verify()
        with Image.open(
            io.BytesIO(payload), formats=["PNG", "JPEG", "WEBP"] if photo else ["PNG"]
        ) as source:
            source.load()
            raster = ImageOps.exif_transpose(source) if photo else source
            if photo:
                raster.thumbnail((128, 128), Image.Resampling.LANCZOS)
            # A new RGBA image carries no external EXIF/ICC/text metadata.
            clean = Image.new("RGBA", raster.size)
            clean.paste(raster.convert("RGBA"))
            output = io.BytesIO()
            clean.save(output, format="PNG")
            result = output.getvalue()
            if len(result) > MAX_BYTES:
                raise InvalidAsset("Image exceeds byte limit")
            return result
    except Exception:
        raise InvalidAsset("Invalid raster image") from None


async def off_loop[T](function: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """Do not release the single decode lane until its actual thread has ended."""
    task = asyncio.create_task(asyncio.to_thread(function, *args, **kwargs))
    cancelled = False
    while True:
        try:
            result = await asyncio.shield(task)
            break
        except asyncio.CancelledError:
            if task.cancelled():
                raise
            cancelled = True
    if cancelled:
        raise asyncio.CancelledError
    return result
