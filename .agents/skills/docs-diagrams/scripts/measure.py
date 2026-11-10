#!/usr/bin/env python3
"""Ink margins of a rendered diagram, in CSS px (the PNGs are 2x).

Usage: python3 measure.py light/<name>.png [dark/<name>.png ...]

Counts a pixel as ink when it differs from the background by more than a
threshold, which skips the grid; panel shadows still count at the bottom,
so expect the bottom margin to read a few px smaller than the top.
"""
import sys
from PIL import Image

THRESHOLD = 40

for path in sys.argv[1:]:
    im = Image.open(path).convert('RGB')
    w, h = im.size
    bg = im.getpixel((0, 0))
    px = im.load()
    def ink(x, y):
        p = px[x, y]
        return abs(p[0] - bg[0]) + abs(p[1] - bg[1]) + abs(p[2] - bg[2]) > THRESHOLD
    cols = [x for x in range(w) if any(ink(x, y) for y in range(0, h, 2))]
    rows = [y for y in range(h) if any(ink(x, y) for x in range(0, w, 2))]
    if not cols or not rows:
        print(f'{path}: no ink found'); continue
    left, right = cols[0] / 2, (w - 1 - cols[-1]) / 2
    top, bottom = rows[0] / 2, (h - 1 - rows[-1]) / 2
    print(f'{path}: left {left:g} right {right:g} top {top:g} bottom {bottom:g}  (canvas {w // 2}x{h // 2})')
