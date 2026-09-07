#!/usr/bin/env python3
"""Render cached wind fields; no network access or provider requests.

Requires numpy, Pillow and ecCodes in the caller's Python environment.
All sources use bilinear interpolation of east/north vectors, a common
Web Mercator viewport, 48-pixel arrow spacing and a 0–40 km/h colour scale.
Interpolation is a display operation and does not increase source resolution.
"""

from datetime import datetime, timezone
import json
import math
from pathlib import Path
import re
from urllib.parse import parse_qs, urlparse

import eccodes as ec
import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
CACHE = ROOT / "cache"
ASSETS = ROOT / "assets"
EXTENT = json.loads((CACHE / "extent.json").read_text())
WIDTH, HEIGHT = EXTENT["width"], EXTENT["height"]
WEST, SOUTH, EAST, NORTH = EXTENT["mercator"]
MERCATOR_RADIUS = 6378137.0
SCALE_MAX = 40.0
ARROW_SPACING = 48
PALETTE = np.array([[232, 241, 225], [145, 209, 201], [76, 166, 199],
                    [76, 112, 188], [116, 79, 152]], dtype=float)


def mercator(lon, lat):
    return (MERCATOR_RADIUS * np.deg2rad(lon),
            MERCATOR_RADIUS * np.log(np.tan(np.pi / 4 + np.deg2rad(lat) / 2)))


def map_coordinates():
    x = WEST + (np.arange(WIDTH) + 0.5) / WIDTH * (EAST - WEST)
    y = NORTH - (np.arange(HEIGHT) + 0.5) / HEIGHT * (NORTH - SOUTH)
    xx, yy = np.meshgrid(x, y)
    lon = np.rad2deg(xx / MERCATOR_RADIUS)
    lat = np.rad2deg(2 * np.arctan(np.exp(yy / MERCATOR_RADIUS)) - np.pi / 2)
    return xx, yy, lon, lat


def bilinear(values, col, row):
    """No extrapolation; any contributing missing corner leaves a hole."""
    height, width = values.shape
    inside = ((col >= 0) & (row >= 0) & (col <= width - 1) & (row <= height - 1))
    clipped_x, clipped_y = np.clip(col, 0, width - 1), np.clip(row, 0, height - 1)
    x0, y0 = np.floor(clipped_x).astype(int), np.floor(clipped_y).astype(int)
    x1, y1 = np.minimum(x0 + 1, width - 1), np.minimum(y0 + 1, height - 1)
    fx, fy = clipped_x - x0, clipped_y - y0
    result = (values[y0, x0] * (1 - fx) * (1 - fy)
              + values[y0, x1] * fx * (1 - fy)
              + values[y1, x0] * (1 - fx) * fy
              + values[y1, x1] * fx * fy)
    return np.where(inside, result, np.nan)


def parse_wcs(path):
    text = path.read_text()
    match = re.search(r"Grid bounds: GeneralBounds\[\(([^)]+)\), \(([^)]+)\)\]", text)
    if not match:
        raise ValueError(f"{path.name}: missing WCS grid bounds")
    bounds = [float(value) for group in match.groups() for value in group.split(",")]
    parts = re.split(r"Band \d+:\s*\n", text)
    bands = []
    for part in parts[1:]:
        rows = [[float(value) for value in line.split()] for line in part.strip().splitlines()]
        band = np.array(rows, dtype=float)
        band[(np.abs(band) > 1e6) | (band == -9999) | (band == 9999)] = np.nan
        bands.append(band)
    if len(bands) != 2 or bands[0].shape != bands[1].shape:
        raise ValueError("Expected two equally shaped WCS bands")
    envelope = re.search(r"GridEnvelope2D\[(-?\d+)\.\.(-?\d+), (-?\d+)\.\.(-?\d+)\]", text)
    if not envelope:
        raise ValueError("Missing WCS integer grid envelope")
    x0, x1, y0, y1 = map(int, envelope.groups())
    if bands[0].shape != (y1 - y0 + 1, x1 - x0 + 1):
        raise ValueError("WCS array and integer grid envelope disagree")
    affine_text = text.split("Grid to world:", 1)[1].split("Contents:", 1)[0]
    affine = {key: float(value) for key, value in re.findall(
        r'PARAMETER\["(elt_\d_\d)", ([^\]]+)\]', affine_text)}
    dx, dy = affine["elt_0_0"], affine["elt_1_1"]
    if dx <= 0 or dy >= 0 or affine.get("elt_0_1", 0) or affine.get("elt_1_0", 0):
        raise ValueError("Only north-to-south, unrotated WCS grids are supported")
    first_x = x0 * dx + affine["elt_0_2"]
    first_y = y0 * dy + affine["elt_1_2"]
    last_x, last_y = x1 * dx + affine["elt_0_2"], y1 * dy + affine["elt_1_2"]
    derived_bounds = [first_x - dx / 2, last_y + dy / 2,
                      last_x + dx / 2, first_y - dy / 2]
    error = float(np.max(np.abs(np.array(derived_bounds) - bounds)))
    if error > 1e-5:
        raise ValueError(f"WCS cell centres do not match edge bounds: {error}")
    geometry = {"edgeBounds": bounds, "gridEnvelope": [x0, x1, y0, y1],
                "firstCellCenter": [first_x, first_y],
                "lastCellCenter": [last_x, last_y], "cellStep": [dx, dy],
                "edgeBoundsValidationMaxError": error}
    return bands, geometry


def wcs_time(source):
    requests = json.loads((CACHE / "requests.json").read_text())
    filename = EXTENT.get("windFiles", {}).get(source)
    request = next((item for item in requests if filename and item.get("file") == filename), None)
    if request is None and filename:
        return EXTENT["windTime"]
    if request is None:
        request = next(item for item in requests if item["name"] == source)
    subsets = parse_qs(urlparse(request["url"]).query).get("subset", [])
    selected = next(value for value in subsets if value.startswith("time("))
    return selected[len('time("'):-len('")')]


def dwd_field():
    filename = EXTENT.get("windFiles", {}).get("dwd", "dwd-grid.txt")
    (u, v), geometry = parse_wcs(CACHE / filename)
    valid = wcs_time("dwd")
    description = (CACHE / "dwd-description.xml").read_text()
    if valid.replace("Z", ".000Z") not in description and valid not in description:
        raise ValueError("DWD requested valid time is absent from saved service metadata")
    report = {
        "product": "DWD ICON global 0.25° 10 m wind", "validTime": valid,
        "timeEvidence": "Explicit configured/requested WCS time subset, also advertised in saved DescribeCoverage; text response has no embedded time.",
        "inputFile": filename,
        "modelRun": None, "sourceUnits": ["U east: m/s", "V north: m/s"],
        "geometry": geometry, "rotation": "Already true east/north; no rotation required",
        "notes": ["Provider product is ICON global, not ICON-D2.",
                  "Model run is not confirmed by the cached WCS response."]}

    def coordinates(_x, _y, lon, lat):
        x0, y0 = geometry["firstCellCenter"]
        dx, dy = geometry["cellStep"]
        return (lon - x0) / dx, (lat - y0) / dy

    return u, v, coordinates, report


def grib_time(handle, prefix):
    day = str(ec.codes_get(handle, prefix + "Date"))
    clock = str(ec.codes_get(handle, prefix + "Time")).zfill(4)
    return datetime.strptime(day + clock, "%Y%m%d%H%M").replace(
        tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


def get_optional(handle, key, default=None):
    try:
        return ec.codes_get(handle, key)
    except ec.CodesInternalError:
        return default


def available_grib_times(path, short_name):
    times = set()
    with path.open("rb") as stream:
        while (handle := ec.codes_grib_new_from_file(stream)) is not None:
            try:
                if ec.codes_get(handle, "shortName") == short_name:
                    times.add(grib_time(handle, "validity"))
            finally:
                ec.codes_release(handle)
    return times


GRIB_KEYS = ["shortName", "name", "units", "Nx", "Ny", "gridType", "radius",
             "latitudeOfFirstGridPointInDegrees", "longitudeOfFirstGridPointInDegrees",
             "LoVInDegrees", "Latin1InDegrees", "Latin2InDegrees", "DxInMetres",
             "DyInMetres", "iScansNegatively", "jScansPositively", "jPointsAreConsecutive",
             "alternativeRowScanning", "uvRelativeToGrid", "numberOfMissing"]


def read_grib(path, valid_time, short_name=None):
    with path.open("rb") as stream:
        while (handle := ec.codes_grib_new_from_file(stream)) is not None:
            try:
                valid = grib_time(handle, "validity")
                name = ec.codes_get(handle, "shortName")
                if valid != valid_time or (short_name and name != short_name):
                    continue
                metadata = {key: get_optional(handle, key) for key in GRIB_KEYS}
                metadata.update(validTime=valid, modelRun=grib_time(handle, "data"))
                nx, ny = metadata["Nx"], metadata["Ny"]
                def unpack(key):
                    values = np.array(ec.codes_get_array(handle, key), dtype=float)
                    values = (values.reshape(nx, ny).T if metadata["jPointsAreConsecutive"]
                              else values.reshape(ny, nx))
                    # ecCodes returns packed field/bitmap values in GRIB scan
                    # order, but its Lambert geographic arrays are regular.
                    # Normalize the alternating data rows; full-grid geometry
                    # validation below independently checks coordinate order.
                    if metadata["alternativeRowScanning"] and key in ["values", "bitmap"]:
                        values = values.copy()
                        if metadata["jPointsAreConsecutive"]:
                            values[:, 1::2] = values[::-1, 1::2]
                        else:
                            values[1::2, :] = values[1::2, ::-1]
                    return values

                values = unpack("values")
                missing = get_optional(handle, "missingValue")
                if missing is not None:
                    values[values == missing] = np.nan
                if get_optional(handle, "bitmapPresent", 0):
                    values[unpack("bitmap") == 0] = np.nan
                values[np.abs(values) > 1e6] = np.nan
                lat, lon = unpack("latitudes"), unpack("longitudes")
                lon = (lon + 180) % 360 - 180
                metadata["scanNormalization"] = ("Reversed alternate data/bitmap scan rows; ecCodes geographic arrays validated in regular grid order"
                                                   if metadata["alternativeRowScanning"] else "Regular scan order")
                return values, lon, lat, metadata
            finally:
                ec.codes_release(handle)
    raise ValueError(f"{path.name}: no {short_name or 'wind'} record valid at {valid_time}")


class LambertGrid:
    """Spherical Lambert conformal conic with an arbitrary y origin.

    The origin cancels when subtracting the first grid point. Validate every
    grid position against ecCodes, plus the local vector basis independently
    using inverse-projection finite differences.
    """

    def __init__(self, metadata, lon, lat):
        if metadata["gridType"] != "lambert":
            raise ValueError(f"Unsupported GRIB projection: {metadata['gridType']}")
        self.radius = metadata["radius"]
        if not self.radius:
            raise ValueError("Spherical earth radius is required")
        p1, p2 = np.deg2rad([metadata["Latin1InDegrees"], metadata["Latin2InDegrees"]])
        self.n = (np.sin(p1) if abs(p1 - p2) < 1e-10 else
                  np.log(np.cos(p1) / np.cos(p2)) /
                  np.log(np.tan(np.pi / 4 + p2 / 2) / np.tan(np.pi / 4 + p1 / 2)))
        self.f = np.cos(p1) * np.tan(np.pi / 4 + p1 / 2) ** self.n / self.n
        self.lon0 = (metadata["LoVInDegrees"] + 180) % 360 - 180
        self.x0, self.y0 = self.forward(metadata["longitudeOfFirstGridPointInDegrees"],
                                        metadata["latitudeOfFirstGridPointInDegrees"])
        self.dx = metadata["DxInMetres"] * (-1 if metadata["iScansNegatively"] else 1)
        self.dy = metadata["DyInMetres"] * (1 if metadata["jScansPositively"] else -1)
        xx, yy = np.meshgrid(self.x0 + np.arange(metadata["Nx"]) * self.dx,
                             self.y0 + np.arange(metadata["Ny"]) * self.dy)
        check_lon, check_lat = self.inverse(xx, yy)
        lon_error = np.abs((check_lon - lon + 180) % 360 - 180)
        position_error = self.radius * np.hypot(np.deg2rad(lon_error) * np.cos(np.deg2rad(lat)),
                                              np.deg2rad(check_lat - lat))
        max_position_error = float(np.max(position_error))
        if max_position_error > 2:
            raise ValueError(f"Lambert geometry disagrees with ecCodes by {max_position_error:.3f} m")

        theta = self.theta(lon)
        # Central differences along projected +x/+y independently determine
        # each grid-axis unit vector in true east/north coordinates.
        bases = []
        for delta_x, delta_y in [(1.0, 0.0), (0.0, 1.0)]:
            plus_lon, plus_lat = self.inverse(xx + delta_x, yy + delta_y)
            minus_lon, minus_lat = self.inverse(xx - delta_x, yy - delta_y)
            east = np.deg2rad(plus_lon - minus_lon) * np.cos(np.deg2rad(check_lat))
            north = np.deg2rad(plus_lat - minus_lat)
            norm = np.hypot(east, north)
            bases.append((east / norm, north / norm))
        formula_bases = [(np.cos(theta), -np.sin(theta)), (np.sin(theta), np.cos(theta))]
        basis_error = max(float(np.max(np.abs(actual - expected)))
                          for basis, formula in zip(bases, formula_bases)
                          for actual, expected in zip(basis, formula))
        if basis_error > 1e-6:
            raise ValueError(f"Lambert vector rotation failed independent check: {basis_error}")
        self.validation = {
            "projection": "Spherical Lambert conformal conic", "radiusMetres": self.radius,
            "maxPositionErrorVsEcCodesMetres": max_position_error,
            "rotationFiniteDifferenceMaxUnitVectorError": basis_error,
            "gridConvergenceDegreesMin": float(np.rad2deg(theta).min()),
            "gridConvergenceDegreesMax": float(np.rad2deg(theta).max()),
            "validationPointCount": int(lon.size),
            "cellStepMetres": [self.dx, self.dy],
        }

    def theta(self, lon):
        return self.n * np.deg2rad((np.asarray(lon) - self.lon0 + 180) % 360 - 180)

    def forward(self, lon, lat):
        rho = self.radius * self.f / np.tan(np.pi / 4 + np.deg2rad(lat) / 2) ** self.n
        theta = self.theta(lon)
        return rho * np.sin(theta), -rho * np.cos(theta)

    def inverse(self, x, y):
        rho = np.hypot(x, y)
        theta = np.arctan2(x, -y)
        lon = self.lon0 + np.rad2deg(theta / self.n)
        lat = np.rad2deg(2 * np.arctan((self.radius * self.f / rho) ** (1 / self.n)) - np.pi / 2)
        return lon, lat

    def coordinates(self, _x, _y, lon, lat):
        xx, yy = self.forward(lon, lat)
        return (xx - self.x0) / self.dx, (yy - self.y0) / self.dy

    def earth_vectors(self, u, v, lon):
        theta = self.theta(lon)
        return u * np.cos(theta) + v * np.sin(theta), -u * np.sin(theta) + v * np.cos(theta)


def compatible(first, second):
    for key in ["Nx", "Ny", "gridType", "latitudeOfFirstGridPointInDegrees",
                "longitudeOfFirstGridPointInDegrees", "DxInMetres", "DyInMetres",
                "LoVInDegrees", "Latin1InDegrees", "Latin2InDegrees", "radius",
                "iScansNegatively", "jScansPositively", "jPointsAreConsecutive",
                "uvRelativeToGrid", "modelRun", "validTime"]:
        if first[key] != second[key]:
            raise ValueError(f"Paired GRIB records disagree on {key}")


def hrrr_field():
    valid = EXTENT["windTime"]
    filename = EXTENT.get("windFiles", {}).get("hrrr", "hrrr-wind.grib2")
    u, lon, lat, metadata = read_grib(CACHE / filename, valid, "10u")
    v, other_lon, other_lat, other = read_grib(CACHE / filename, valid, "10v")
    compatible(metadata, other)
    if not np.array_equal(lon, other_lon) or not np.array_equal(lat, other_lat):
        raise ValueError("HRRR U/V geographic positions differ")
    if metadata["units"] != "m s**-1" or other["units"] != "m s**-1":
        raise ValueError("Unexpected HRRR vector units")
    projection = LambertGrid(metadata, lon, lat)
    before = np.hypot(u, v)
    if metadata["uvRelativeToGrid"]:
        u, v = projection.earth_vectors(u, v, lon)
    norm_error = float(np.nanmax(np.abs(np.hypot(u, v) - before)))
    if norm_error > 1e-9:
        raise ValueError("Vector rotation changed HRRR wind speed")
    report = {"product": "NOAA HRRR 3 km 10 m wind", "validTime": valid,
              "inputFile": filename,
              "timeEvidence": "Both GRIB messages' validityDate/validityTime",
              "modelRun": metadata["modelRun"], "sourceUnits": [metadata["units"], other["units"]],
              "gribMetadata": metadata, "geometry": projection.validation,
              "rotation": {"gridRelativeInput": bool(metadata["uvRelativeToGrid"]),
                           "method": "uE=uGrid*cos(theta)+vGrid*sin(theta); vN=-uGrid*sin(theta)+vGrid*cos(theta)",
                           "speedPreservationMaxErrorMetresPerSecond": norm_error}}
    return u, v, projection.coordinates, report


def ndfd_field():
    speed_path, direction_path = CACHE / "ndfd-speed.grib2", CACHE / "ndfd-direction.grib2"
    if not speed_path.exists() or not direction_path.exists():
        raise FileNotFoundError("No paired cached NDFD speed/direction GRIB files; WCS units require verification before use")
    requested = EXTENT["windTime"]
    common_times = available_grib_times(speed_path, "10si") & available_grib_times(direction_path, "10wdir")
    if not common_times:
        raise ValueError("NDFD files have no common speed/direction valid time")
    target = datetime.fromisoformat(requested.replace("Z", "+00:00"))
    valid = min(common_times, key=lambda value: (
        abs((datetime.fromisoformat(value.replace("Z", "+00:00")) - target).total_seconds()), value))
    offset = (datetime.fromisoformat(valid.replace("Z", "+00:00")) - target).total_seconds()
    speed, lon, lat, metadata = read_grib(speed_path, valid, "10si")
    direction, other_lon, other_lat, other = read_grib(direction_path, valid, "10wdir")
    compatible(metadata, other)
    if not np.array_equal(lon, other_lon) or not np.array_equal(lat, other_lat):
        raise ValueError("NDFD speed/direction positions differ")
    unit_factors = {"m s**-1": 1.0, "m/s": 1.0, "knots": 0.5144444444, "kt": 0.5144444444}
    if metadata["units"] not in unit_factors or other["units"] not in ["Degree true", "degree", "degrees", "deg"]:
        raise ValueError(f"Unrecognized NDFD units: {metadata['units']}, {other['units']}")
    speed = speed * unit_factors[metadata["units"]]
    speed[speed < 0] = np.nan
    direction[(direction < 0) | (direction > 360)] = np.nan
    # Meteorological bearing is where the wind comes FROM, clockwise from north.
    u, v = -speed * np.sin(np.deg2rad(direction)), -speed * np.cos(np.deg2rad(direction))
    projection = LambertGrid(metadata, lon, lat)
    if metadata["uvRelativeToGrid"]:
        u, v = projection.earth_vectors(u, v, lon)
    report = {"product": "NOAA NDFD 10 m wind forecast", "validTime": valid,
              "timeEvidence": "Both GRIB messages' validityDate/validityTime",
              "referenceTimeMeaning": "NDFD GRIB field reference time; not an individual numerical model run",
              "requestedValidTime": requested, "timeOffsetSeconds": offset,
              "availablePairedValidTimes": sorted(common_times),
              "notes": ([f"Requested {requested} is absent from the cached regional GRIB files; nearest paired valid time is {valid} ({offset / 3600:+g} hours)."]
                        if offset else []),
              "modelRun": metadata["modelRun"], "sourceUnits": [metadata["units"], other["units"]],
              "gribMetadata": metadata, "directionMetadata": other,
              "geometry": projection.validation,
              "rotation": {"gridRelativeInput": bool(metadata["uvRelativeToGrid"]),
                           "directionConvention": "Meteorological FROM direction converted to downwind vectors"}}
    return u, v, projection.coordinates, report


def colour(speed):
    scaled = np.clip(np.nan_to_num(speed, nan=0.0) / SCALE_MAX, 0, 1) * (len(PALETTE) - 1)
    low = np.floor(scaled).astype(int)
    high = np.minimum(low + 1, len(PALETTE) - 1)
    fraction = scaled - low
    return np.round(PALETTE[low] * (1 - fraction[..., None]) +
                    PALETTE[high] * fraction[..., None]).astype(np.uint8)


def font(size):
    for path in ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                 "/System/Library/Fonts/Supplemental/Arial.ttf"]:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


def draw_arrow(draw, x, y, u, v, speed):
    if not np.isfinite(speed):
        return
    if speed < 0.5:
        draw.ellipse((x - 2, y - 2, x + 2, y + 2), fill=(31, 58, 79, 200))
        return
    norm = math.hypot(u, v)
    dx, dy = u / norm, -v / norm
    length = 11 + 18 * min(speed / SCALE_MAX, 1)
    start, tip = (x - dx * length / 2, y - dy * length / 2), (x + dx * length / 2, y + dy * length / 2)
    head = 5
    wings = [(tip[0] - dx * head - dy * 3, tip[1] - dy * head + dx * 3),
             (tip[0] - dx * head + dy * 3, tip[1] - dy * head - dx * 3)]
    for fill, width in [((255, 255, 255, 220), 4), ((29, 53, 77, 225), 2)]:
        draw.line([start, tip], fill=fill, width=width)
        draw.line([wings[0], tip, wings[1]], fill=fill, width=width, joint="curve")


def render(source, field):
    u, v, coordinates, report = field
    valid_cells = np.isfinite(u) & np.isfinite(v)
    if not valid_cells.any():
        raise ValueError("Source has no finite paired wind cells")
    source_speeds = np.hypot(u[valid_cells], v[valid_cells]) * 3.6
    xx, yy, lon, lat = map_coordinates()
    col, row = coordinates(xx, yy, lon, lat)
    east, north = bilinear(u, col, row), bilinear(v, col, row)
    speed = np.hypot(east, north) * 3.6
    finite = np.isfinite(speed)
    if not finite.any():
        raise ValueError("No source data covers the requested map")
    basemap_path = ASSETS / "basemap.png"
    with Image.open(basemap_path) as base:
        if base.size != (WIDTH, HEIGHT):
            raise ValueError(f"Basemap dimensions {base.size} differ from {(WIDTH, HEIGHT)}")
        image = base.convert("RGBA")
    overlay = np.zeros((HEIGHT, WIDTH, 4), dtype=np.uint8)
    overlay[:, :, :3] = colour(speed)
    overlay[:, :, 3] = np.where(finite, 86, 0)
    image = Image.alpha_composite(image, Image.fromarray(overlay))
    annotations = Image.new("RGBA", image.size)
    draw = ImageDraw.Draw(annotations)
    arrows = 0
    for y in range(64, HEIGHT - 70, ARROW_SPACING):
        for x in range(28, WIDTH - 16, ARROW_SPACING):
            if finite[y, x]:
                draw_arrow(draw, x, y, float(east[y, x]), float(north[y, x]), float(speed[y, x]))
                arrows += 1
    dark = (24, 43, 62, 255)
    # The Web Mercator map is conformal: local east/north are horizontal/up.
    draw.rounded_rectangle((16, 14, 494, 49), radius=5, fill=(255, 255, 255, 238))
    valid_label = datetime.fromisoformat(report["validTime"].replace("Z", "+00:00")).strftime("%d %b %Y · %H:%M UTC")
    draw.text((28, 23), f"10 m wind · Valid {valid_label}", font=font(14), fill=dark)
    draw.rounded_rectangle((WIDTH - 52, 14, WIDTH - 15, 77), radius=5, fill=(255, 255, 255, 230))
    draw.text((WIDTH - 39, 22), "N", font=font(13), fill=dark)
    draw.line([(WIDTH - 33, 66), (WIDTH - 33, 43)], fill=dark, width=2)
    draw.polygon([(WIDTH - 33, 39), (WIDTH - 38, 48), (WIDTH - 28, 48)], fill=dark)

    center_x, center_y = mercator(EXTENT["longitude"], EXTENT["latitude"])
    px, py = (center_x - WEST) / (EAST - WEST) * WIDTH, (NORTH - center_y) / (NORTH - SOUTH) * HEIGHT
    draw.ellipse((px - 8, py - 8, px + 8, py + 8), fill=(255, 255, 255, 255))
    draw.ellipse((px - 5, py - 5, px + 5, py + 5), fill=(195, 66, 54, 255))
    draw.rounded_rectangle((px + 12, py - 15, px + 111, py + 15), radius=4, fill=(255, 255, 255, 245))
    draw.text((px + 20, py - 8), "Claremont", font=font(14), fill=dark)

    # Opaque legend swatches retain a common reference even over different terrain.
    legend_x, legend_y, legend_w = 18, HEIGHT - 91, 294
    draw.rounded_rectangle((legend_x, legend_y, legend_x + legend_w, HEIGHT - 17),
                           radius=6, fill=(255, 255, 255, 245))
    draw.text((legend_x + 12, legend_y + 8), "Wind speed · km/h", font=font(12), fill=dark)
    swatches = colour(np.linspace(0, SCALE_MAX, 264))
    for index, rgb in enumerate(swatches):
        draw.line([(legend_x + 12 + index, legend_y + 30),
                   (legend_x + 12 + index, legend_y + 41)], fill=tuple(rgb) + (255,))
    for tick in [0, 10, 20, 30, 40]:
        tx = legend_x + 12 + tick / SCALE_MAX * 264
        draw.text((tx, legend_y + 46), "40+" if tick == 40 else str(tick),
                  anchor="mt", font=font(11), fill=dark)
    draw.rounded_rectangle((WIDTH - 335, HEIGHT - 70, WIDTH - 16, HEIGHT - 17),
                           radius=5, fill=(255, 255, 255, 236))
    draw.text((WIDTH - 322, HEIGHT - 61), "Arrows point downwind", font=font(12), fill=dark)
    draw.text((WIDTH - 322, HEIGHT - 42), "Interpolated display · no added source detail", font=font(11), fill=dark)
    image = Image.alpha_composite(image, annotations).convert("RGB")
    filename = f"assets/{source}-wind.png"
    image.save(ROOT / filename, optimize=True)
    report.update(status="ok", filename=filename, gridShape=list(u.shape), units="km/h",
                  statisticsScope="min/maxSpeedKmh cover finite cached source cells; renderedMin/MaxSpeedKmh cover the displayed viewport",
                  minSpeedKmh=float(source_speeds.min()), maxSpeedKmh=float(source_speeds.max()),
                  finiteCellCount=int(valid_cells.sum()), totalCellCount=int(u.size),
                  renderedMinSpeedKmh=float(speed[finite].min()), renderedMaxSpeedKmh=float(speed[finite].max()),
                  finitePixelCount=int(finite.sum()), noDataPixelCount=int((~finite).sum()),
                  display={"width": WIDTH, "height": HEIGHT, "mercatorBounds": EXTENT["mercator"],
                           "colourScaleKmh": [0, SCALE_MAX], "shadeOpacity": 86 / 255,
                           "arrowSpacingPixels": ARROW_SPACING, "arrowCount": arrows,
                           "interpolation": "Bilinear true east/north vectors; no extrapolation; missing corners remain missing"})
    return report


def main():
    reports = {}
    for source, load in [("dwd", dwd_field), ("hrrr", hrrr_field), ("ndfd", ndfd_field)]:
        try:
            reports[source] = render(source, load())
        except Exception as error:
            reports[source] = {"status": "unavailable", "filename": None,
                               "error": f"{type(error).__name__}: {error}"}
        print(f"{source}: {reports[source]['status']} "
              f"{reports[source].get('filename') or reports[source].get('error')}")
    (CACHE / "wind-render-report.json").write_text(json.dumps(reports, indent=2, allow_nan=False) + "\n")
    return 0 if all(reports[source]["status"] == "ok" for source in ["dwd", "hrrr"]) else 1


if __name__ == "__main__":
    raise SystemExit(main())
