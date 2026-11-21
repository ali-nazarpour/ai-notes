"""
The fixed list of color names used for category colors and the accent color.

The database stores only the NAME ("blue"), never a hex code. The frontend owns the real
shades (frontend/src/palette.ts), so it can use a lighter tone in dark mode. Keeping the
list fixed also means a client cannot store arbitrary text in these columns.
"""

from typing import Literal, get_args

ColorName = Literal[
    "red",
    "orange",
    "amber",
    "yellow",
    "lime",
    "green",
    "emerald",
    "teal",
    "cyan",
    "sky",
    "blue",
    "indigo",
    "violet",
    "purple",
    "fuchsia",
    "pink",
    "rose",
    "brown",
    "slate",
    "graphite",
]

COLOR_NAMES: tuple[str, ...] = get_args(ColorName)
