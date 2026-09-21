#!/usr/bin/env python3
"""Generate the pw-backtest app icons (pure stdlib, reproducible).

Writes RGBA PNGs (rounded `bg` tile + three candles in up/down colors) in the
sizes Tauri's Linux bundler expects. Re-run whenever the brand mark changes:

    python3 scripts/gen_icons.py
"""
from __future__ import annotations

import struct
import zlib
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parents[1] / "app" / "src-tauri" / "icons"

BG = (0x13, 0x17, 0x22)
UP = (0x08, 0x99, 0x81)
DOWN = (0xF2, 0x36, 0x45)
ACCENT = (0x29, 0x62, 0xFF)


def _chunk(kind: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + kind
        + data
        + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    )


def write_png(path: Path, size: int, pixels: bytearray) -> None:
    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw.append(0)  # filter: none
        raw += pixels[y * stride : (y + 1) * stride]
    payload = (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + _chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + _chunk(b"IEND", b"")
    )
    path.write_bytes(payload)


def make_icon(size: int) -> bytearray:
    px = bytearray(size * size * 4)
    r = size * 0.20  # corner radius

    def put(x: int, y: int, c: tuple[int, int, int]) -> None:
        i = (y * size + x) * 4
        px[i] = c[0]
        px[i + 1] = c[1]
        px[i + 2] = c[2]
        px[i + 3] = 255

    def rect(x0: float, y0: float, x1: float, y1: float, c: tuple[int, int, int]) -> None:
        for y in range(max(0, int(y0 * size / 32)), min(size, int(y1 * size / 32))):
            for x in range(max(0, int(x0 * size / 32)), min(size, int(x1 * size / 32))):
                put(x, y, c)

    # rounded background tile
    for y in range(size):
        for x in range(size):
            cx, cy = min(x, size - 1 - x), min(y, size - 1 - y)
            if cx < r and cy < r:
                dx, dy = r - cx, r - cy
                if dx * dx + dy * dy > r * r:
                    continue
            put(x, y, BG)

    # accent baseline
    rect(4.0, 28.0, 28.0, 29.0, ACCENT)
    # three candles (wick + body) on a 32-unit grid
    rect(7.5, 6.0, 8.5, 26.0, UP)
    rect(4.0, 12.0, 12.0, 22.0, UP)
    rect(15.5, 4.0, 16.5, 24.0, DOWN)
    rect(12.0, 8.0, 20.0, 18.0, DOWN)
    rect(23.5, 8.0, 24.5, 28.0, UP)
    rect(20.0, 16.0, 28.0, 26.0, UP)
    return px


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    targets = {
        "32x32.png": 32,
        "128x128.png": 128,
        "128x128@2x.png": 256,
        "icon.png": 512,
    }
    for name, size in targets.items():
        write_png(OUT_DIR / name, size, make_icon(size))
        print(f"  {OUT_DIR / name}  ({size}x{size})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
