#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate procedural pixel-art placeholder PNGs for static assets.
Uses Pillow only — no API key required. Run before art_generator.py AI batches.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError as exc:
    raise SystemExit("Pillow required: pip install pillow") from exc

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT / "tools") not in sys.path:
    sys.path.insert(0, str(ROOT / "tools"))

from audit_static_assets import audit, resolve_path  # noqa: E402

ICON = 68
CLASS_ICON = 64
UNIT = 96
NODE = 48

PALETTE = {
    "warrior": "#d48458",
    "archer": "#6ec878",
    "mage": "#6ea8e8",
    "assassin": "#b878d0",
    "gold": "#e8c868",
    "gold_dark": "#9a7830",
    "ink": "#eef0f8",
    "shadow": "#101018",
    "panel": "#1a1e2a",
    "panel_hi": "#2a3040",
    "danger": "#e86060",
    "elite": "#b868ff",
    "boss": "#ff4050",
    "final": "#ff40cc",
    "outline": "#0a0a12",
}

RARITY_COLORS = {
    "common": "#b8b8c0",
    "uncommon": "#68c878",
    "rare": "#68a8e8",
    "legendary": "#e8c868",
}

POTION_COLORS = {
    "power": "#e87050",
    "defense": "#6890d8",
    "agility": "#68d890",
    "crit": "#e8a050",
    "health": "#e85058",
    "dodge": "#78d8d8",
    "omni": "#d888d8",
    "divine": "#f0e090",
}

SKILL_VISUAL = {
    "shield_slam": "shield",
    "charge": "charge",
    "war_cry": "wave",
    "iron_will": "shield",
    "cleave": "wave",
    "last_stand": "wave",
    "hammerfall": "charge",
    "bloodthirst": "dagger",
    "shield_wall": "shield",
    "whirlwind": "wave",
    "shield_bash": "shield",
    "battle_shout": "wave",
    "retaliation": "shield",
    "backstep_shot": "arrow",
    "poison_arrow": "poison",
    "hunters_mark": "mark",
    "arrow_storm": "rain",
    "power_shot": "arrow",
    "volley": "rain",
    "frost_bind": "frost",
    "mend_shot": "arrow",
    "explosive_arrow": "fire",
    "piercing_shot": "arrow",
    "snipe": "arrow",
    "barbed_arrow": "poison",
    "fireball": "fire",
    "frost_nova": "frost",
    "shadow_bolt": "shadow",
    "arcane_burst": "arcane",
    "chain_lightning": "arcane",
    "meteor": "fire",
    "arcane_shield": "arcane",
    "blizzard": "frost",
    "life_drain": "shadow",
    "flame_wave": "fire",
    "arcane_missiles": "arcane",
    "holy_nova": "arcane",
    "static_surge": "arcane",
    "shadow_pierce": "dagger",
    "fan_of_knives": "knives",
    "smoke_bomb": "smoke",
    "backstab": "dagger",
    "poison_blade": "poison",
    "hemorrhage": "poison",
    "execution": "dagger",
    "shadow_step": "shadow",
    "crippling_strike": "dagger",
    "death_mark": "mark",
    "garrote": "dagger",
    "blade_flurry": "knives",
    "rally": "wave",
}


def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def rgba(c: tuple[int, int, int] | str, a: int = 255) -> tuple[int, int, int, int]:
    if isinstance(c, str):
        c = hex_rgb(c)
    return c[0], c[1], c[2], a


def shade(c: tuple[int, int, int] | str, amount: float) -> tuple[int, int, int]:
    if isinstance(c, str):
        c = hex_rgb(c)
    r, g, b = c
    if amount >= 0:
        return (
            min(255, int(r + (255 - r) * amount)),
            min(255, int(g + (255 - g) * amount)),
            min(255, int(b + (255 - b) * amount)),
        )
    f = 1 + amount
    return max(0, int(r * f)), max(0, int(g * f)), max(0, int(b * f))


def tint(base: str, seed: str, spread: int = 18) -> tuple[int, int, int]:
    r, g, b = hex_rgb(base)
    h = int(hashlib.md5(seed.encode()).hexdigest()[:6], 16)
    dr = ((h >> 16) & 255) % spread - spread // 2
    dg = ((h >> 8) & 255) % spread - spread // 2
    db = (h & 255) % spread - spread // 2
    return max(0, min(255, r + dr)), max(0, min(255, g + dg)), max(0, min(255, b + db))


def seed_float(seed: str, idx: int = 0) -> float:
    h = hashlib.md5(f"{seed}:{idx}".encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


def new_canvas(size: int) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def px(draw: ImageDraw.ImageDraw, x: int, y: int, c, s: int = 1):
    draw.rectangle((x, y, x + s - 1, y + s - 1), fill=c)


def draw_icon_plate(draw: ImageDraw.ImageDraw, size: int, accent: tuple[int, int, int], seed: str = ""):
    """暗色圆角底 + 内描边 + 顶部高光，统一 UI 图标质感。"""
    pad = max(3, size // 12)
    bg = hex_rgb(PALETTE["panel"])
    bg_hi = hex_rgb(PALETTE["panel_hi"])
    ol = rgba(PALETTE["outline"], 200)
    gold = rgba(PALETTE["gold"], 160)

    draw.rounded_rectangle(
        (pad, pad, size - pad - 1, size - pad - 1),
        radius=max(5, size // 9),
        fill=rgba(bg),
        outline=ol,
        width=1,
    )
    draw.rounded_rectangle(
        (pad + 1, pad + 1, size - pad - 2, size // 2 + pad // 2),
        radius=max(4, size // 11),
        fill=(*shade(bg_hi, 0.12), 110),
    )
    draw.line((pad + 3, pad + 2, size - pad - 4, pad + 2), fill=gold, width=1)

    if seed and size >= 48:
        sx = pad + 3 + int(seed_float(seed, 0) * (size - pad * 2 - 8))
        sy = size - pad - 5
        draw.ellipse((sx - 2, sy - 2, sx + 2, sy + 2), fill=rgba(accent, 90))


def draw_soft_glow(draw: ImageDraw.ImageDraw, cx: int, cy: int, radius: int, color: tuple[int, int, int], alpha: int = 50):
    for r in range(radius, 0, -2):
        a = max(8, alpha * r // radius)
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(*color, a))


def draw_sword(draw: ImageDraw.ImageDraw, cx: int, cy: int, col: tuple[int, int, int], scale: int = 2):
    blade = shade(col, 0.25)
    blade_mid = col
    blade_dark = shade(col, -0.35)
    hilt = hex_rgb(PALETTE["gold"])
    ol = rgba(PALETTE["outline"])
    for i in range(7):
        y = cy - (3 + i) * scale
        px(draw, cx - scale, y - scale, ol, scale)
        px(draw, cx, y - scale * 2, ol, scale)
        px(draw, cx + scale, y - scale, ol, scale)
    for i in range(6):
        y = cy - (2 + i) * scale
        px(draw, cx - scale // 2, y, blade_dark if i > 3 else blade_mid, scale)
        px(draw, cx + scale // 2, y - scale, blade if i < 2 else blade_mid, scale)
    px(draw, cx - 2 * scale, cy + 3 * scale, ol, scale)
    px(draw, cx + scale, cy + 3 * scale, ol, scale)
    px(draw, cx - scale, cy + 4 * scale, rgba(hilt), scale)
    px(draw, cx, cy + 5 * scale, rgba(shade(hilt, -0.2)), scale)


def draw_bow(draw: ImageDraw.ImageDraw, cx: int, cy: int, col: tuple[int, int, int], scale: int = 2):
    ol = rgba(PALETTE["outline"])
    wood = shade(col, -0.2)
    hi = shade(col, 0.2)
    for i in range(-5, 6):
        px(draw, cx - 4 * scale, cy + i * scale, ol, scale)
        px(draw, cx - 3 * scale, cy + i * scale, wood, scale)
    for i in range(-4, 5):
        px(draw, cx + 3 * scale, cy + i * scale, hi, scale)
        px(draw, cx + 4 * scale, cy + i * scale, ol, scale)
    for i in range(-3, 4):
        px(draw, cx - 2 * scale + abs(i), cy + i * scale, rgba(PALETTE["ink"], 200), 1)
    draw.line((cx - 3 * scale, cy - 4 * scale, cx + 3 * scale, cy + 4 * scale), fill=rgba(PALETTE["ink"], 180), width=1)


def draw_staff(draw: ImageDraw.ImageDraw, cx: int, cy: int, col: tuple[int, int, int], scale: int = 2):
    ol = rgba(PALETTE["outline"])
    orb = hex_rgb(PALETTE["gold"])
    wood = shade(col, -0.25)
    for i in range(9):
        y = cy - 7 * scale + i * scale
        px(draw, cx, y, ol, scale)
        px(draw, cx - scale // 2, y, wood, scale)
    draw_soft_glow(draw, cx, cy - 9 * scale, 8, col, 70)
    for ox, oy in ((-1, -1), (0, -2), (1, -1), (-1, 0), (0, 0), (1, 0), (-1, 1), (0, 1), (1, 1)):
        px(draw, cx + ox * scale, cy - 9 * scale + oy * scale, shade(orb, oy * 0.15), scale)


def draw_dagger(draw: ImageDraw.ImageDraw, cx: int, cy: int, col: tuple[int, int, int], scale: int = 2):
    ol = rgba(PALETTE["outline"])
    for i in range(6):
        px(draw, cx + i * scale, cy - scale + i * scale, ol, scale)
        px(draw, cx + i * scale - scale // 2, cy + i * scale, shade(col, i * 0.05 - 0.1), scale)
    px(draw, cx - scale, cy + 4 * scale, rgba(hex_rgb(PALETTE["gold"])), scale)


def draw_axe(draw: ImageDraw.ImageDraw, cx: int, cy: int, col: tuple[int, int, int], scale: int = 2):
    ol = rgba(PALETTE["outline"])
    for i in range(8):
        px(draw, cx, cy - 6 * scale + i * scale, ol, scale)
        px(draw, cx - scale // 2, cy - 6 * scale + i * scale, shade(col, -0.3), scale)
    for dx in range(4):
        px(draw, cx + scale + dx * scale, cy - 4 * scale + dx, shade(col, 0.1), scale)
        px(draw, cx + scale + dx * scale, cy - 3 * scale + dx, shade(col, -0.2), scale)


def draw_armor(draw: ImageDraw.ImageDraw, cx: int, cy: int, col: tuple[int, int, int], scale: int = 2):
    ol = rgba(PALETTE["outline"])
    mid = col
    dark = shade(col, -0.3)
    for x in (-2, -1, 0, 1, 2):
        px(draw, cx + x * scale, cy - 2 * scale, ol, scale)
        px(draw, cx + x * scale, cy - scale, mid if abs(x) < 2 else dark, scale)
    for y in (0, 1, 2):
        px(draw, cx, cy + y * scale, mid if y == 0 else dark, scale)
        px(draw, cx - 2 * scale, cy + y * scale - scale, dark, scale)
        px(draw, cx + 2 * scale, cy + y * scale - scale, dark, scale)


def draw_helmet(draw: ImageDraw.ImageDraw, cx: int, cy: int, col: tuple[int, int, int], scale: int = 1):
    ol = rgba(PALETTE["outline"])
    draw.polygon(
        [(cx, cy - 12 * scale), (cx + 12 * scale, cy - 2 * scale), (cx + 10 * scale, cy + 4 * scale),
         (cx - 10 * scale, cy + 4 * scale), (cx - 12 * scale, cy - 2 * scale)],
        fill=rgba(col),
        outline=ol,
    )
    draw.line((cx - 8 * scale, cy + 1 * scale, cx + 8 * scale, cy + 1 * scale), fill=rgba(PALETTE["shadow"], 160), width=2)
    draw.arc((cx - 6 * scale, cy - 10 * scale, cx + 2 * scale, cy - 2 * scale), 200, 320, fill=rgba(shade(col, 0.35), 120), width=2)


def draw_ring(draw: ImageDraw.ImageDraw, cx: int, cy: int, col: tuple[int, int, int], scale: int = 2):
    ol = rgba(PALETTE["outline"])
    gold = hex_rgb(PALETTE["gold"])
    draw.ellipse((cx - 10 * scale, cy - 10 * scale, cx + 10 * scale, cy + 10 * scale), outline=rgba(gold), width=2)
    draw.ellipse((cx - 7 * scale, cy - 7 * scale, cx + 7 * scale, cy + 7 * scale), outline=ol, width=2)
    draw.ellipse((cx - 4 * scale, cy - 6 * scale, cx + 2 * scale, cy), fill=rgba(shade(col, 0.3)))


def draw_boots(draw: ImageDraw.ImageDraw, cx: int, cy: int, col: tuple[int, int, int], scale: int = 2):
    ol = rgba(PALETTE["outline"])
    draw.rounded_rectangle((cx - 8 * scale, cy - 4 * scale, cx + 2 * scale, cy + 6 * scale), radius=2, fill=rgba(shade(col, -0.2)), outline=ol)
    draw.rounded_rectangle((cx - 2 * scale, cy - 2 * scale, cx + 10 * scale, cy + 8 * scale), radius=2, fill=rgba(col), outline=ol)


def draw_gloves(draw: ImageDraw.ImageDraw, cx: int, cy: int, col: tuple[int, int, int], scale: int = 2):
    ol = rgba(PALETTE["outline"])
    draw.rounded_rectangle((cx - 8 * scale, cy - 6 * scale, cx + 8 * scale, cy + 8 * scale), radius=3, fill=rgba(col), outline=ol)
    for i in range(-2, 3):
        draw.line((cx + i * 3 * scale, cy - 4 * scale, cx + i * 3 * scale, cy + 2 * scale), fill=rgba(shade(col, -0.25)), width=1)


def draw_book(draw: ImageDraw.ImageDraw, cx: int, cy: int, col: tuple[int, int, int], scale: int = 2):
    ol = rgba(PALETTE["outline"])
    draw.rounded_rectangle((cx - 10 * scale, cy - 8 * scale, cx + 6 * scale, cy + 8 * scale), radius=2, fill=rgba(shade(col, -0.2)), outline=ol)
    draw.line((cx - 2 * scale, cy - 8 * scale, cx - 2 * scale, cy + 8 * scale), fill=rgba(hex_rgb(PALETTE["gold"])), width=2)
    draw.line((cx + 2 * scale, cy - 4 * scale, cx + 4 * scale, cy - 4 * scale), fill=rgba(PALETTE["ink"], 160), width=1)
    draw.line((cx + 2 * scale, cy, cx + 4 * scale, cy), fill=rgba(PALETTE["ink"], 160), width=1)


def draw_orb(draw: ImageDraw.ImageDraw, cx: int, cy: int, col: tuple[int, int, int], scale: int = 2):
    draw_soft_glow(draw, cx, cy, 12 * scale, col, 60)
    draw.ellipse((cx - 8 * scale, cy - 8 * scale, cx + 8 * scale, cy + 8 * scale), fill=rgba(col), outline=rgba(PALETTE["outline"]))
    draw.ellipse((cx - 4 * scale, cy - 6 * scale, cx, cy - 2 * scale), fill=rgba(shade(col, 0.45), 140))


def weapon_drawer(wt: str):
    if wt in ("bow", "crossbow", "longbow", "shortbow"):
        return draw_bow
    if wt in ("staff",):
        return draw_staff
    if wt in ("book", "rune"):
        return draw_book
    if wt in ("orb",):
        return draw_orb
    if wt in ("dagger", "claw", "shortblade", "chainblade"):
        return draw_dagger
    if wt in ("axe", "hammer"):
        return draw_axe
    return draw_sword


def weapon_class(wt: str) -> str:
    return {
        "sword": "warrior", "axe": "warrior", "hammer": "warrior", "spear": "warrior",
        "bow": "archer", "crossbow": "archer", "longbow": "archer", "shortbow": "archer",
        "staff": "mage", "book": "mage", "orb": "mage", "rune": "mage",
        "dagger": "assassin", "claw": "assassin", "shortblade": "assassin", "chainblade": "assassin",
    }.get(wt, "warrior")


def slot_drawer(slot: str):
    return {
        "weapon": lambda d, cx, cy, c, s: draw_sword(d, cx, cy, c, s),
        "helmet": draw_helmet,
        "body": draw_armor,
        "hands": draw_gloves,
        "legs": draw_boots,
        "feet": draw_boots,
        "ring": draw_ring,
        "amulet": draw_ring,
        "belt": lambda d, cx, cy, c, s: d.rounded_rectangle((cx - 10 * s, cy - 2 * s, cx + 10 * s, cy + 4 * s), radius=2, fill=rgba(c), outline=rgba(PALETTE["outline"])),
        "offHand": lambda d, cx, cy, c, s: d.rounded_rectangle((cx - 8 * s, cy - 10 * s, cx + 8 * s, cy + 10 * s), radius=3, fill=rgba(shade(c, -0.1)), outline=rgba(PALETTE["gold"])),
    }.get(slot, draw_armor)


def draw_skill_glyph(draw: ImageDraw.ImageDraw, cx: int, cy: int, col: tuple[int, int, int], kind: str, aoe: bool = False):
    ol = rgba(PALETTE["outline"])
    if kind == "fire":
        draw_soft_glow(draw, cx, cy, 14, (255, 120, 40), 80)
        draw.ellipse((cx - 8, cy - 8, cx + 8, cy + 8), fill=(255, 160, 60, 255), outline=ol)
        draw.ellipse((cx - 4, cy - 6, cx + 2, cy), fill=(255, 240, 180, 200))
    elif kind == "frost":
        for i in range(6):
            ang = i * math.pi / 3
            x2 = cx + int(math.cos(ang) * 12)
            y2 = cy + int(math.sin(ang) * 12)
            draw.line((cx, cy, x2, y2), fill=rgba(shade(col, 0.3)), width=2)
        draw.ellipse((cx - 3, cy - 3, cx + 3, cy + 3), fill=rgba(PALETTE["ink"]))
    elif kind == "arrow":
        draw.line((cx - 12, cy + 6, cx + 10, cy - 8), fill=rgba(shade(col, 0.2)), width=3)
        draw.polygon([(cx + 10, cy - 8), (cx + 4, cy - 6), (cx + 6, cy - 2)], fill=rgba(col))
        draw.line((cx - 8, cy + 2, cx - 4, cy - 2), fill=rgba(PALETTE["gold"]), width=1)
    elif kind == "poison":
        draw.ellipse((cx - 5, cy - 10, cx + 5, cy), fill=rgba((80, 200, 80)))
        draw.line((cx, cy, cx, cy + 10), fill=rgba(shade(col, -0.2)), width=2)
        draw.polygon([(cx, cy + 12), (cx - 4, cy + 6), (cx + 4, cy + 6)], fill=rgba(col))
    elif kind == "shadow":
        draw.ellipse((cx - 9, cy - 6, cx + 9, cy + 8), fill=rgba(shade(col, -0.35)))
        draw.ellipse((cx - 5, cy - 2, cx + 5, cy + 6), fill=rgba(col), outline=ol)
        draw.ellipse((cx - 8, cy - 4, cx - 2, cy + 2), fill=rgba((180, 120, 220), 120))
    elif kind == "dagger":
        draw_dagger(draw, cx - 2, cy + 2, col, 2)
    elif kind == "knives":
        for ox in (-6, 0, 6):
            draw_dagger(draw, cx + ox, cy + 2, shade(col, ox * 0.03), 1)
    elif kind == "shield":
        draw.polygon([(cx, cy - 12), (cx + 10, cy - 4), (cx + 8, cy + 10), (cx - 8, cy + 10), (cx - 10, cy - 4)],
                     fill=rgba(col), outline=rgba(hex_rgb(PALETTE["gold"])))
    elif kind == "charge":
        draw.polygon([(cx + 12, cy), (cx - 8, cy - 8), (cx - 8, cy + 8)], fill=rgba(col), outline=ol)
    elif kind == "smoke":
        for i, (ox, oy, r) in enumerate(((-6, 0, 6), (0, -4, 7), (6, 2, 5))):
            draw.ellipse((cx + ox - r, cy + oy - r, cx + ox + r, cy + oy + r), fill=rgba(shade(col, -0.1 * i), 170))
    elif kind == "mark":
        draw.ellipse((cx - 10, cy - 10, cx + 10, cy + 10), outline=rgba(col), width=2)
        draw.line((cx, cy - 6, cx, cy + 6), fill=rgba(col), width=2)
        draw.line((cx - 6, cy, cx + 6, cy), fill=rgba(col), width=2)
    elif kind == "arcane":
        draw_soft_glow(draw, cx, cy, 16, col, 90)
        for i in range(5):
            ang = i * 2 * math.pi / 5
            x2 = cx + int(math.cos(ang) * 10)
            y2 = cy + int(math.sin(ang) * 10)
            draw.line((cx, cy, x2, y2), fill=rgba(shade(col, 0.2)), width=2)
    elif kind in ("wave", "rain"):
        if aoe or kind == "rain":
            for ox in (-8, 0, 8):
                draw.line((cx + ox - 4, cy - 8, cx + ox + 4, cy + 8), fill=rgba(shade(col, ox * 0.02)), width=2)
        else:
            for i in range(3):
                y = cy - 6 + i * 6
                draw.arc((cx - 10, y - 4, cx + 10, y + 8), 200, 340, fill=rgba(col), width=2)
    else:
        draw_soft_glow(draw, cx, cy, 10, col, 50)
        draw.ellipse((cx - 6, cy - 6, cx + 6, cy + 6), fill=rgba(col), outline=ol)


def draw_class_icon(class_id: str, label: str, base_class: str) -> Image.Image:
    img, draw = new_canvas(CLASS_ICON)
    col = tint(PALETTE.get(base_class, PALETTE["warrior"]), class_id)
    draw_icon_plate(draw, CLASS_ICON, col, class_id)
    cx, cy = CLASS_ICON // 2, CLASS_ICON // 2 + 2
    if base_class == "warrior":
        draw_sword(draw, cx, cy, col, 2)
    elif base_class == "archer":
        draw_bow(draw, cx, cy, col, 2)
    elif base_class == "mage":
        draw_staff(draw, cx, cy, col, 2)
    else:
        draw_dagger(draw, cx, cy, col, 2)
    return img


def infer_base_class(class_id: str) -> str:
    archer = {"archer", "ranger", "marksman", "windrunner", "beastmaster", "deadeye"}
    mage = {"mage", "wizard", "sage", "warlock", "archmage", "oracle", "necromancer"}
    assassin = {"assassin", "shadowdancer", "trickster", "venomancer", "phantom", "nightblade", "illusionist", "plaguebringer"}
    warrior = {"warrior", "knight", "berserker", "guardian", "paladin", "destroyer", "temple_knight"}
    if class_id in archer:
        return "archer"
    if class_id in mage:
        return "mage"
    if class_id in assassin:
        return "assassin"
    if class_id in warrior:
        return "warrior"
    return "warrior"


def draw_equipment_base(base_id: str, meta: dict) -> Image.Image:
    img, draw = new_canvas(ICON)
    slot = meta.get("slot") or "weapon"
    wt = meta.get("weaponType") or ""
    style = meta.get("style") or "balanced"
    bc = weapon_class(wt)
    col = tint(PALETTE.get(bc, PALETTE["warrior"]), base_id + style)
    draw_icon_plate(draw, ICON, col, base_id)
    cx, cy = ICON // 2, ICON // 2 + 2
    if slot == "weapon":
        weapon_drawer(wt)(draw, cx, cy, col, 2)
    elif slot in ("helmet", "head"):
        draw_helmet(draw, cx, cy, col)
    elif slot in ("body", "chest"):
        draw_armor(draw, cx, cy, col, 2)
    elif slot in ("hands",):
        draw_gloves(draw, cx, cy, col, 2)
    elif slot in ("legs", "feet"):
        draw_boots(draw, cx, cy, col, 2)
    elif slot in ("ring", "amulet", "necklace"):
        draw_ring(draw, cx, cy, col, 2)
    elif slot == "offHand":
        slot_drawer("offHand")(draw, cx, cy, col, 2)
    elif slot == "belt":
        slot_drawer("belt")(draw, cx, cy, col, 2)
    else:
        draw_armor(draw, cx, cy, col, 2)
    return img


def draw_slot_icon(slot: str) -> Image.Image:
    img, draw = new_canvas(ICON)
    col = tint(PALETTE["gold"], slot, 10)
    draw_icon_plate(draw, ICON, col, slot)
    cx, cy = ICON // 2, ICON // 2 + 2
    slot_drawer(slot)(draw, cx, cy, col, 2)
    return img


def draw_weapon_type(wt: str) -> Image.Image:
    img, draw = new_canvas(ICON)
    bc = weapon_class(wt)
    col = tint(PALETTE.get(bc, PALETTE["warrior"]), wt)
    draw_icon_plate(draw, ICON, col, wt)
    cx, cy = ICON // 2, ICON // 2 + 2
    weapon_drawer(wt)(draw, cx, cy, col, 2)
    return img


def draw_chibi_hero(draw: ImageDraw.ImageDraw, cx: int, cy: int, body_col: tuple[int, int, int], accent: tuple[int, int, int], cls: str, scale: int = 2):
    ol = rgba(PALETTE["outline"])
    skin = (240, 200, 170)
    s = scale
    draw.ellipse((cx - 18 * s // 2, cy + 12 * s // 2, cx + 18 * s // 2, cy + 18 * s // 2), fill=rgba(PALETTE["shadow"], 70))
    draw.rounded_rectangle((cx - 14 * s // 2, cy - 2 * s // 2, cx + 14 * s // 2, cy + 16 * s // 2), radius=4, fill=rgba(body_col), outline=ol)
    draw.ellipse((cx - 11 * s // 2, cy - 20 * s // 2, cx + 11 * s // 2, cy - 2 * s // 2), fill=rgba(skin), outline=ol)
    draw.point((cx - 4 * s // 2, cy - 11 * s // 2), fill=ol)
    draw.point((cx + 4 * s // 2, cy - 11 * s // 2), fill=ol)
    hi = shade(body_col, 0.25)
    draw.line((cx - 8 * s // 2, cy + 2 * s // 2, cx - 8 * s // 2, cy + 12 * s // 2), fill=rgba(hi), width=2)
    if cls == "warrior":
        draw.rounded_rectangle((cx - 20 * s // 2, cy + 2 * s // 2, cx - 12 * s // 2, cy + 14 * s // 2), radius=2, fill=rgba(hex_rgb(PALETTE["gold"])), outline=ol)
        draw_sword(draw, cx + 14 * s // 2, cy - 2 * s // 2, accent, s)
    elif cls == "archer":
        draw_bow(draw, cx + 16 * s // 2, cy, accent, s)
    elif cls == "mage":
        draw_staff(draw, cx + 12 * s // 2, cy - 8 * s // 2, accent, s)
    else:
        draw_dagger(draw, cx + 14 * s // 2, cy, accent, s)


def draw_ab_hero(cls: str) -> Image.Image:
    img, draw = new_canvas(UNIT)
    col = tint(PALETTE.get(cls, PALETTE["warrior"]), cls)
    draw_chibi_hero(draw, UNIT // 2, UNIT // 2 + 4, col, col, cls, scale=3)
    return img


def draw_ab_node(node: str) -> Image.Image:
    img, draw = new_canvas(NODE)
    colors = {
        "battle": PALETTE["danger"],
        "elite": PALETTE["elite"],
        "rest": "#68c878",
        "event": PALETTE["gold"],
        "shop": "#88c8ff",
        "boss": PALETTE["boss"],
        "boss_final": PALETTE["final"],
    }
    col = hex_rgb(colors.get(node, PALETTE["gold"]))
    draw_icon_plate(draw, NODE, col, node)
    cx, cy = NODE // 2, NODE // 2
    if node == "battle":
        draw_sword(draw, cx, cy + 2, col, 1)
    elif node == "elite":
        draw.ellipse((cx - 6, cy - 6, cx + 6, cy + 6), outline=rgba(PALETTE["ink"]), width=2)
        draw.polygon([(cx, cy - 8), (cx + 6, cy + 6), (cx - 6, cy + 6)], fill=rgba(col))
    elif node == "rest":
        draw.line((cx, cy - 8, cx, cy + 8), fill=rgba(PALETTE["ink"]), width=3)
        draw.line((cx - 8, cy, cx + 8, cy), fill=rgba(PALETTE["ink"]), width=3)
    elif node == "event":
        draw.line((cx - 1, cy - 7, cx - 1, cy + 1), fill=rgba(PALETTE["ink"]), width=3)
        draw.arc((cx - 5, cy + 1, cx + 3, cy + 9), 180, 0, fill=rgba(PALETTE["ink"]), width=2)
    elif node == "shop":
        draw.rectangle((cx - 7, cy - 5, cx + 7, cy + 5), outline=rgba(PALETTE["ink"]), width=2)
        draw.line((cx - 7, cy - 1, cx + 7, cy - 1), fill=rgba(PALETTE["gold"]))
    elif node in ("boss", "boss_final"):
        draw.ellipse((cx - 7, cy - 5, cx + 7, cy + 5), fill=rgba(PALETTE["ink"]))
        draw.ellipse((cx - 3, cy - 2, cx - 1, cy), fill=rgba(PALETTE["boss"]))
        draw.ellipse((cx + 1, cy - 2, cx + 3, cy), fill=rgba(PALETTE["boss"]))
    return img


def draw_ab_enemy(enemy: dict) -> Image.Image:
    img, draw = new_canvas(UNIT)
    eid = enemy.get("id") or "enemy"
    color = enemy.get("color") or "#884444"
    col = hex_rgb(color)
    is_boss = "boss" in eid or eid == "ab_final"
    is_elite = "elite" in eid
    cx, cy = UNIT // 2, UNIT // 2 + 10
    w = 20 if is_boss else (16 if is_elite else 14)
    h = 26 if is_boss else (22 if is_elite else 20)
    ol = rgba(PALETTE["outline"])
    draw.ellipse((cx - 20, cy + 8, cx + 20, cy + 16), fill=rgba(PALETTE["shadow"], 60))
    body = shade(col, -0.1)
    draw.rounded_rectangle((cx - w, cy - h, cx + w, cy + 12), radius=6, fill=rgba(body), outline=ol)
    head_r = 12 if is_boss else 10
    draw.ellipse((cx - head_r, cy - h - 8, cx + head_r, cy - h + 12), fill=rgba(col), outline=ol)
    eye_y = cy - h - 2
    draw.ellipse((cx - 6, eye_y - 2, cx - 2, eye_y + 2), fill=(255, 240, 120, 255))
    draw.ellipse((cx + 2, eye_y - 2, cx + 6, eye_y + 2), fill=(255, 240, 120, 255))

    if is_boss:
        draw.polygon([(cx - 16, cy - h - 14), (cx - 8, cy - h - 4), (cx - 18, cy - h - 4)], fill=rgba(shade(col, 0.25)))
        draw.polygon([(cx + 16, cy - h - 14), (cx + 8, cy - h - 4), (cx + 18, cy - h - 4)], fill=rgba(shade(col, 0.25)))
        draw.line((cx - 10, cy - h + 8, cx + 10, cy - h + 12), fill=rgba(PALETTE["shadow"], 180), width=2)
    elif is_elite:
        draw.polygon([(cx, cy - h - 16), (cx + 10, cy - h - 4), (cx - 10, cy - h - 4)], fill=rgba(PALETTE["elite"]))
    elif "archer" in eid or "sniper" in eid or "harpy" in eid:
        draw_bow(draw, cx + w + 4, cy - 4, shade(col, 0.2), 1)
    elif "warlock" in eid or "cultist" in eid or "necromancer" in eid or "void" in eid or "eye" in eid:
        draw_staff(draw, cx + w + 2, cy - 6, shade(col, 0.15), 1)
    elif "bomber" in eid or "flame" in eid:
        draw.ellipse((cx + w - 2, cy - 4, cx + w + 10, cy + 6), fill=rgba((255, 120, 40)))
    elif "hound" in eid or "imp" in eid:
        draw.polygon([(cx + w + 8, cy), (cx + w + 2, cy - 6), (cx + w + 2, cy + 6)], fill=rgba(col))
    elif "spider" in eid or "maggot" in eid:
        for leg in (-1, 1):
            draw.line((cx + leg * w, cy + 4, cx + leg * (w + 8), cy + 10), fill=rgba(shade(col, -0.2)), width=2)
    elif "siege" in eid or "gargoyle" in eid or "guard" in eid or "templar" in eid or "knight" in eid:
        draw.rounded_rectangle((cx - w - 4, cy - 4, cx - w + 2, cy + 10), radius=2, fill=rgba(shade(col, 0.1)), outline=ol)
    elif "chain" in eid or "berserker" in eid or "brute" in eid:
        draw_axe(draw, cx + w + 2, cy - 2, shade(col, 0.1), 1)
    elif "shade" in eid or "wraith" in eid:
        draw_soft_glow(draw, cx, cy - 4, 16, col, 50)
    elif "blood" in eid:
        spawn_col = shade(col, 0.2)
        draw.ellipse((cx - 4, cy + 2, cx + 4, cy + 10), fill=rgba(spawn_col))
    elif "drums" in eid:
        draw.ellipse((cx - 8, cy + 2, cx + 8, cy + 12), outline=rgba(PALETTE["gold"]), width=2)
    return img


def draw_ab_skill(skill: dict) -> Image.Image:
    img, draw = new_canvas(ICON)
    tags = skill.get("classTags") or ["generic"]
    base = next((t for t in tags if t != "generic"), "warrior")
    col = tint(PALETTE.get(base, PALETTE["warrior"]), skill.get("id", ""))
    sid = skill.get("id") or ""
    draw_icon_plate(draw, ICON, col, sid)
    kind = SKILL_VISUAL.get(sid, "wave")
    draw_skill_glyph(draw, ICON // 2, ICON // 2, col, kind, bool(skill.get("aoe")))
    return img


def draw_ab_relic(relic: dict) -> Image.Image:
    img, draw = new_canvas(ICON)
    rid = relic.get("id") or "relic"
    rarity = relic.get("rarity") or "common"
    col = hex_rgb(RARITY_COLORS.get(rarity, PALETTE["gold"]))
    draw_icon_plate(draw, ICON, col, rid)
    cx, cy = ICON // 2, ICON // 2 + 1
    gold = hex_rgb(PALETTE["gold"])
    draw.polygon([(cx, cy - 13), (cx + 11, cy - 3), (cx + 7, cy + 12), (cx - 7, cy + 12), (cx - 11, cy - 3)],
                 fill=rgba(shade(col, -0.1)), outline=rgba(gold))
    draw.polygon([(cx, cy - 8), (cx + 5, cy - 2), (cx, cy + 6), (cx - 5, cy - 2)], fill=rgba(shade(col, 0.35)))
    draw.ellipse((cx - 3, cy - 5, cx + 3, cy + 1), fill=(255, 255, 255, 180))
    draw.line((cx - 11, cy - 3, cx + 11, cy - 3), fill=rgba(gold, 120), width=1)
    return img


def draw_ab_scene(scene: str) -> Image.Image:
    w, h = 1280, 720
    themes = {
        "battle": ("#141820", "#1a2430", "#884444"),
        "shop": ("#181410", "#2a2418", "#d4b45a"),
        "event": ("#14101c", "#241830", "#8866cc"),
    }
    base, floor, accent = themes.get(scene, themes["battle"])
    img = Image.new("RGBA", (w, h), rgba(base))
    draw = ImageDraw.Draw(img)
    cx0, cy0 = int(w * 0.17), int(h * 0.14)
    cx1, cy1 = int(w * 0.83), int(h * 0.86)
    draw.rectangle((cx0, cy0, cx1, cy1), fill=rgba(floor))
    ol = rgba(PALETTE["outline"])
    acc = rgba(accent)
    for x in (24, w - 48):
        draw.rectangle((x, 40, x + 24, h - 40), fill=rgba(shade(accent, -0.35)), outline=ol)
    for y in (28, h - 52):
        draw.rectangle((40, y, w - 40, y + 18), fill=rgba(shade(accent, -0.25)), outline=ol)
    if scene == "battle":
        for x in (60, w - 90):
            draw.polygon([(x + 12, 56), (x + 24, 120), (x, 120)], fill=acc, outline=ol)
            draw.ellipse((x + 8, 118, x + 16, 126), fill=rgba(PALETTE["gold"]))
    elif scene == "shop":
        for x in (48, w - 120):
            draw.rectangle((x, 80, x + 56, 160), outline=ol, width=2)
            draw.line((x, 110, x + 56, 110), fill=acc, width=2)
    else:
        for corner in ((48, 48), (w - 88, 48), (48, h - 88), (w - 88, h - 88)):
            draw.ellipse((corner[0], corner[1], corner[0] + 40, corner[1] + 40), outline=acc, width=2)
            draw.line((corner[0] + 20, corner[1] + 8, corner[0] + 20, corner[1] + 32), fill=acc, width=2)
    return img


def draw_potion_icon(rel_path: str) -> Image.Image:
    img, draw = new_canvas(ICON)
    stem = Path(rel_path).stem.replace("potion_", "")
    col = hex_rgb(POTION_COLORS.get(stem, PALETTE["gold"]))
    draw_icon_plate(draw, ICON, col, stem)
    cx, cy = ICON // 2, ICON // 2 + 3
    ol = rgba(PALETTE["outline"])
    glass = shade(col, 0.45)
    draw.rounded_rectangle((cx - 7, cy - 10, cx + 7, cy + 10), radius=3, fill=rgba(glass, 90), outline=ol)
    draw.rounded_rectangle((cx - 4, cy - 14, cx + 4, cy - 10), radius=2, fill=rgba(hex_rgb(PALETTE["gold"])), outline=ol)
    draw.rounded_rectangle((cx - 5, cy - 2, cx + 5, cy + 8), radius=2, fill=rgba(col))
    draw.ellipse((cx - 3, cy - 6, cx + 1, cy - 2), fill=(255, 255, 255, 160))
    return img


def draw_buff_icon(rel_path: str) -> Image.Image:
    img, draw = new_canvas(ICON)
    key = Path(rel_path).stem
    col = tint(PALETTE["gold"], key, 16)
    draw_icon_plate(draw, ICON, col, key)
    cx, cy = ICON // 2, ICON // 2
    draw.ellipse((cx - 12, cy - 12, cx + 12, cy + 12), fill=rgba(shade(col, -0.1)), outline=rgba(PALETTE["gold"]))
    draw.line((cx - 8, cy, cx + 8, cy), fill=rgba(PALETTE["ink"]), width=3)
    draw.line((cx, cy - 8, cx, cy + 8), fill=rgba(PALETTE["ink"]), width=3)
    return img


def load_base_type_map() -> dict[str, dict]:
    data = json.loads((ROOT / "config/base-types.json").read_text(encoding="utf-8"))
    out = {}
    for group in ("weapons", "offHand", "armor", "accessories"):
        for bid, meta in (data.get(group) or {}).items():
            out[bid] = meta or {}
    return out


def load_enemy_templates() -> dict[str, dict]:
    data = json.loads((ROOT / "config/auto-battler-config.json").read_text(encoding="utf-8"))
    return {e["id"]: e for e in (data.get("enemyTemplates") or []) if e.get("id")}


def load_ab_config() -> dict:
    return json.loads((ROOT / "config/auto-battler-config.json").read_text(encoding="utf-8"))


def load_skill_pool() -> dict[str, dict]:
    data = load_ab_config()
    return {s["id"]: s for s in (data.get("skillPool") or []) if s.get("id")}


def load_relic_defs() -> dict[str, dict]:
    data = load_ab_config()
    return {r["id"]: r for r in (data.get("relics") or []) if r.get("id")}


def save_png(img: Image.Image, path: Path, force: bool):
    if path.is_file() and not force:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format="PNG", optimize=True)
    return True


def iter_all_expected(report: dict, categories: tuple[str, ...] | None = None) -> list[str]:
    cats = categories or (
        "equipment_base", "equipment_slots", "equipment_types", "class_icons",
        "auto_battler", "potion_icons", "buff_icons",
    )
    seen = set()
    out = []
    for cat in cats:
        for rel in report.get("expected", {}).get(cat, []):
            if rel not in seen:
                seen.add(rel)
                out.append(rel)
    return out


def render_asset(rel: str, base_map, enemies, skills, relics) -> Image.Image | None:
    parts = Path(rel).parts
    stem = Path(rel).stem
    if "equipment/base" in rel:
        return draw_equipment_base(stem, base_map.get(stem, {}))
    if "equipment/slots" in rel:
        return draw_slot_icon(stem)
    if "equipment/types" in rel:
        return draw_weapon_type(stem)
    if "icons/classes" in rel.replace("\\", "/"):
        cid = stem
        return draw_class_icon(cid, cid, infer_base_class(cid))
    if "auto_battler/heroes" in rel:
        return draw_ab_hero(stem)
    if "auto_battler/nodes" in rel:
        return draw_ab_node(stem)
    if "auto_battler/enemies" in rel:
        return draw_ab_enemy(enemies.get(stem, {"id": stem}))
    if "auto_battler/skills" in rel:
        return draw_ab_skill(skills.get(stem, {"id": stem}))
    if "auto_battler/relics" in rel:
        return draw_ab_relic(relics.get(stem, {"id": stem}))
    if "auto_battler/scenes" in rel:
        return draw_ab_scene(stem)
    if "potion_icons" in rel:
        return draw_potion_icon(rel)
    cat = Path(rel).name
    if rel.replace("\\", "/").count("/") == 1 and rel.endswith(".png"):
        # asset/attack.png 等 buff 根目录图标
        return draw_buff_icon(rel)
    return None


def generate_all(force: bool = False, refresh: bool = False) -> dict[str, int]:
    stats = {"created": 0, "skipped": 0}
    report = audit()
    base_map = load_base_type_map()
    enemies = load_enemy_templates()
    skills = load_skill_pool()
    relics = load_relic_defs()

    targets = iter_all_expected(report) if refresh else []
    if not refresh:
        for cat in ("equipment_base", "equipment_slots", "equipment_types", "class_icons",
                    "auto_battler", "potion_icons", "buff_icons"):
            targets.extend(report["missing"].get(cat, []))

    def maybe(rel: str, img: Image.Image | None):
        if img is None:
            return
        path = resolve_path(rel)
        if save_png(img, path, force or refresh):
            stats["created"] += 1
        else:
            stats["skipped"] += 1

    for rel in targets:
        img = render_asset(rel, base_map, enemies, skills, relics)
        maybe(rel, img)

    return stats


def main():
    parser = argparse.ArgumentParser(description="Generate procedural placeholder PNG assets")
    parser.add_argument("--all", action="store_true", help="Generate all missing placeholders")
    parser.add_argument("--force", action="store_true", help="Overwrite existing files")
    parser.add_argument("--refresh", action="store_true", help="Regenerate every audited asset (implies --force)")
    args = parser.parse_args()
    if not args.all and not args.refresh:
        parser.print_help()
        return 1
    stats = generate_all(force=args.force, refresh=args.refresh)
    print(f"Created: {stats['created']} | Skipped (exists): {stats['skipped']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
