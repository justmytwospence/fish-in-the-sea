"""Mountain classification of points, after Kapos et al. (2000), the UNEP-WCMC
definition of mountain environments:

  elevation >= 2500 m
  1500-2500 m and slope >= 2 degrees
  1000-1500 m and (slope >= 5 degrees or local elevation range > 300 m)
   300-1000 m and local elevation range > 300 m

where the local elevation range is max - min within a 7 km radius. Elevations
come from the AWS Terrain Tiles (Terrarium encoding; USGS 3DEP/NED in the
US) at zoom 8, about 460 m per pixel at 40 degrees N, cached in raw/tiles.
"""

import math
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

Z = 8
TILE = 256
URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
CACHE = Path(__file__).parent / "raw" / "tiles"
RADIUS_M = 7000
EARTH = 40075016.686  # equatorial circumference, m

_tiles: dict[tuple[int, int], np.ndarray] = {}


def _path(x: int, y: int) -> Path:
    return CACHE / f"{Z}-{x}-{y}.png"


def _fetch(xy: tuple[int, int]) -> None:
    p = _path(*xy)
    if not p.exists():
        urllib.request.urlretrieve(URL.format(z=Z, x=xy[0], y=xy[1]), p)


def _tile(x: int, y: int) -> np.ndarray:
    if (x, y) not in _tiles:
        a = np.asarray(Image.open(_path(x, y)).convert("RGB"), dtype=np.float32)
        _tiles[(x, y)] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    return _tiles[(x, y)]


def _pixel(lat: float, lon: float) -> tuple[float, float]:
    n = 2 ** Z * TILE
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def _px_m(lat: float) -> float:
    return EARTH * math.cos(math.radians(lat)) / (TILE * 2 ** Z)


def _window(lat: float, lon: float) -> tuple[np.ndarray, int, float]:
    """Elevation grid within RADIUS_M (plus a pixel) of the point, its center
    index and the pixel size in meters."""
    gx, gy = _pixel(lat, lon)
    size = _px_m(lat)
    r = math.ceil(RADIUS_M / size) + 1
    x0, y0 = int(gx) - r, int(gy) - r
    out = np.empty((2 * r + 1, 2 * r + 1), dtype=np.float32)
    for ty in range(y0 // TILE, (y0 + 2 * r) // TILE + 1):
        for tx in range(x0 // TILE, (x0 + 2 * r) // TILE + 1):
            t = _tile(tx, ty)
            ax0, ay0 = max(x0, tx * TILE), max(y0, ty * TILE)
            ax1, ay1 = min(x0 + 2 * r + 1, (tx + 1) * TILE), min(y0 + 2 * r + 1, (ty + 1) * TILE)
            out[ay0 - y0:ay1 - y0, ax0 - x0:ax1 - x0] = t[ay0 - ty * TILE:ay1 - ty * TILE, ax0 - tx * TILE:ax1 - tx * TILE]
    return out, r, size


def _tiles_for(lat: float, lon: float) -> set[tuple[int, int]]:
    gx, gy = _pixel(lat, lon)
    r = math.ceil(RADIUS_M / _px_m(lat)) + 1
    return {(tx, ty) for tx in range((int(gx) - r) // TILE, (int(gx) + r) // TILE + 1)
            for ty in range((int(gy) - r) // TILE, (int(gy) + r) // TILE + 1)}


def classify(points: list[tuple[float, float]]) -> list[dict]:
    """For each (lat, lon): elevation (m), slope (degrees), local elevation
    range (m) and whether it is mountainous."""
    CACHE.mkdir(parents=True, exist_ok=True)
    need = set().union(*(_tiles_for(la, lo) for la, lo in points))
    with ThreadPoolExecutor(16) as ex:
        list(ex.map(_fetch, need))
    out = []
    for la, lo in points:
        g, r, size = _window(la, lo)
        yy, xx = np.ogrid[-r:r + 1, -r:r + 1]
        disk = (xx * xx + yy * yy) * size * size <= RADIUS_M * RADIUS_M
        elev = float(g[r, r])
        relief = float(g[disk].max() - g[disk].min())
        dzdx = (g[r, r + 1] - g[r, r - 1]) / (2 * size)
        dzdy = (g[r + 1, r] - g[r - 1, r]) / (2 * size)
        slope = math.degrees(math.atan(math.hypot(dzdx, dzdy)))
        mountain = (
            elev >= 2500
            or (elev >= 1500 and slope >= 2)
            or (elev >= 1000 and (slope >= 5 or relief > 300))
            or (elev >= 300 and relief > 300)
        )
        out.append(dict(elev=round(elev), slope=round(slope, 1), relief=round(relief), mountain=mountain))
    return out


if __name__ == "__main__":
    test = {
        "Crested Butte": (38.868, -106.977), "Denver": (39.74, -104.99), "Asheville": (35.595, -82.551),
        "Yuma": (32.69, -114.62), "Boulder": (40.015, -105.27), "Salt Lake City": (40.76, -111.89),
        "Burlington VT": (44.476, -73.212), "Santa Rosa": (38.44, -122.71), "Cheyenne": (41.14, -104.82),
        "Bozeman": (45.68, -111.04), "Flagstaff": (35.198, -111.651), "Springfield MA": (42.10, -72.59),
        "Bend": (44.058, -121.315), "Lake Placid": (44.28, -73.98), "Boone NC": (36.216, -81.675),
    }
    for (name, pt), r in zip(test.items(), classify(list(test.values()))):
        print(f"{name:16} {r}")
