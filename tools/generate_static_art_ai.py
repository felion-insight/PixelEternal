#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Batch-regenerate audited static PNG assets via tools/art_generator.py (Gemini / Imagen gateway).
Targets: equipment/base|slots|types, class icons, auto_battler, potion_icons, buff_icons.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT / "tools") not in sys.path:
    sys.path.insert(0, str(ROOT / "tools"))

from audit_static_assets import audit, resolve_path  # noqa: E402
import art_generator as ag  # noqa: E402

CATEGORIES = (
    "equipment_base",
    "equipment_slots",
    "equipment_types",
    "class_icons",
    "auto_battler",
    "potion_icons",
    "buff_icons",
    "main_skill_icons",
)

# 与 design/static-art-prompt-reference.md 一致；拼接到每条 prompt 末尾
SQUARE_COMPOSITION_BOOST = (
    ", square 1:1 canvas, subject centered at about 70 percent frame fill, "
    "limited color palette, readable at 44px UI size, pure black backdrop only, "
    "no UI plate, no circular badge frame, no white background"
)

SCENE_WIDESCREEN_BOOST = (
    ", 16:9 widescreen landscape composition, decorative props ONLY on outer edges and corners, "
    "center 65 percent empty dark stone floor, no characters no UI no text, subtle edge vignette"
)

SCENE_EDGE_HINTS = {
    "battle": (
        "stone pillars and torch sconces on left and right edges, cracked arena arches at top corners, "
        "broken weapon racks along bottom edge only"
    ),
    "shop": (
        "wooden shelves with potions and coin sacks along left and right edges, lantern hooks at top corners, "
        "merchant crates along bottom edge only"
    ),
    "event": (
        "glowing rune pillars at four corners, floating crystal shards along top and bottom edges, "
        "mystic banners on side edges only"
    ),
}

SCENE_CN = {
    "battle": "战斗竞技场",
    "shop": "流浪商人商店",
    "event": "神秘事件祭坛",
}

SCENE_BG_STYLE = (
    "Pixel art dark fantasy roguelike environment backdrop, retro 16-bit, limited color palette, "
    "crisp pixel clusters, wide empty room interior, atmospheric lighting, no characters, "
    "no monsters, no UI, no text"
)

SLOT_UI = {
    "weapon": "single sword silhouette, weapon equipment slot emblem",
    "offHand": "shield or off-hand buckler silhouette, offhand slot emblem",
    "helmet": "helmet silhouette, head slot emblem",
    "body": "chest armor silhouette, body slot emblem",
    "hands": "gauntlets silhouette, hands slot emblem",
    "legs": "leg greaves silhouette, legs slot emblem",
    "feet": "boots silhouette, feet slot emblem",
    "amulet": "amulet necklace silhouette, amulet slot emblem",
    "ring": "magic ring silhouette, ring slot emblem",
    "belt": "belt buckle silhouette, belt slot emblem",
}

WEAPON_TYPE_UI = {
    "sword": "longsword blade icon",
    "axe": "battle axe icon",
    "hammer": "war hammer icon",
    "spear": "spear icon",
    "bow": "recurve bow icon",
    "crossbow": "crossbow icon",
    "longbow": "longbow icon",
    "shortbow": "short bow icon",
    "staff": "arcane staff icon",
    "book": "spellbook icon",
    "orb": "crystal orb icon",
    "rune": "floating rune stone icon",
    "dagger": "dagger icon",
    "claw": "claw weapon icon",
    "shortblade": "short blade icon",
    "chainblade": "chain blade icon",
}

NODE_UI = {
    "battle": "crossed swords, combat encounter map node emblem",
    "elite": "purple elite skull crest map node emblem",
    "rest": "campfire rest map node emblem",
    "event": "mystery question event map node emblem",
    "shop": "merchant coin shop map node emblem",
    "boss": "menacing boss skull map node emblem",
    "boss_final": "final boss crown skull map node emblem",
}

POTION_STEM = {
    "power": "red strength potion bottle",
    "defense": "blue defense potion bottle",
    "agility": "green agility potion bottle",
    "crit": "orange critical strike potion bottle",
    "health": "crimson health potion bottle",
    "dodge": "cyan dodge potion bottle",
    "omni": "rainbow omni stat potion bottle",
    "divine": "golden divine potion bottle",
}

HERO_CN = {"warrior": "战士", "archer": "弓箭手", "mage": "法师", "assassin": "刺客"}

DETAIL_BOOST = SQUARE_COMPOSITION_BOOST  # 兼容旧名


def load_json(rel: str):
    with (ROOT / rel).open(encoding="utf-8") as f:
        return json.load(f)


def load_base_type_map() -> dict[str, dict]:
    data = load_json("config/base-types.json")
    out = {}
    for group in ("weapons", "offHand", "armor", "accessories"):
        for bid, meta in (data.get(group) or {}).items():
            out[bid] = meta or {}
    return out


def load_class_names() -> dict[str, str]:
    cfg = load_json("config/class-config.json")
    out = {}
    for section in ("baseClasses", "firstAdvancements", "secondAdvancements"):
        for cid, data in (cfg.get(section) or {}).items():
            if data and data.get("name"):
                out[cid] = data["name"]
    return out


def load_ab_data():
    cfg = load_json("config/auto-battler-config.json")
    skills = {s["id"]: s for s in (cfg.get("skillPool") or []) if s.get("id")}
    relics = {r["id"]: r for r in (cfg.get("relics") or []) if r.get("id")}
    enemies = {e["id"]: e for e in (cfg.get("enemyTemplates") or []) if e.get("id")}
    return skills, relics, enemies


def iter_main_skill_icon_paths() -> list[str]:
    cfg = load_json("config/skill-icon-config.json")
    out = []
    for _name, fname in (cfg.get("SKILL_ICON_MAP") or {}).items():
        if not fname:
            continue
        clean = str(fname).replace("\\", "/")
        if clean.startswith("asset/"):
            rel = clean
        elif clean.startswith("skill_icons/"):
            rel = f"asset/{clean}"
        else:
            rel = f"asset/skill_icons/{clean}"
        out.append(rel)
    return out


def iter_targets(report: dict, categories: list[str]) -> list[str]:
    seen = set()
    out = []
    for cat in categories:
        if cat == "main_skill_icons":
            paths = iter_main_skill_icon_paths()
        else:
            paths = report.get("expected", {}).get(cat, [])
        for rel in paths:
            if rel not in seen:
                seen.add(rel)
                out.append(rel)
    return out


def classify_rel(rel: str) -> str:
    r = rel.replace("\\", "/")
    if "equipment/base/" in r:
        return "equipment_base"
    if "equipment/slots/" in r:
        return "equipment_slots"
    if "equipment/types/" in r:
        return "equipment_types"
    if "icons/classes/" in r:
        return "class_icons"
    if "auto_battler/" in r:
        return "auto_battler"
    if "potion_icons/" in r:
        return "potion_icons"
    if r.startswith("asset/") and r.count("/") == 1:
        return "buff_icons"
    if "skill_icons/" in r:
        return "main_skill_icons"
    return "other"


def build_task(
    rel: str,
    base_map: dict,
    class_names: dict,
    skills: dict,
    relics: dict,
    enemies: dict,
) -> tuple[str, dict, int] | None:
    """Return (prompt, generate_image kwargs, post_process size)."""
    stem = Path(rel).stem
    r = rel.replace("\\", "/")
    kind = classify_rel(rel)

    if kind == "equipment_base":
        meta = base_map.get(stem, {})
        name = meta.get("name") or stem.replace("_", " ")
        slot = meta.get("slot") or "weapon"
        wt = meta.get("weaponType") or "sword"
        if slot == "weapon":
            subject = WEAPON_TYPE_UI.get(wt, f"{wt} fantasy weapon")
            prompt = (
                f"{ag.EQUIPMENT_WEAPON_TEXTURE_STYLE_TEMPLATE}, "
                f"{subject}, design inspired by {name}, isolated weapon only"
            )
            return prompt, {"for_equipment_weapon": True}, ag.EXPORT_ICON_SIZE
        slot_hint = SLOT_UI.get(slot, f"{slot} armor piece")
        prompt = (
            f"{ag.EQUIPMENT_NON_WEAPON_TEXTURE_STYLE_TEMPLATE}, "
            f"{slot_hint}, inspired by {name}, single piece only"
        )
        return prompt, {"for_equipment_non_weapon": True}, ag.EXPORT_ICON_SIZE

    if kind == "equipment_slots":
        hint = SLOT_UI.get(stem, f"{stem} equipment slot UI emblem")
        prompt = f"{ag.SKILL_ICON_CORE_TEMPLATE}, minimalist {hint}, simple slot glyph"
        return prompt, {"for_skill_icon": True}, ag.EXPORT_ICON_SIZE

    if kind == "equipment_types":
        hint = WEAPON_TYPE_UI.get(stem, f"{stem} weapon type icon")
        prompt = f"{ag.SKILL_ICON_CORE_TEMPLATE}, {hint}, weapon category filter icon"
        return prompt, {"for_skill_icon": True}, ag.EXPORT_ICON_SIZE

    if kind == "class_icons":
        cname = class_names.get(stem, stem)
        prompt = (
            f"{ag.SKILL_ICON_CORE_TEMPLATE}, class job emblem for {cname}, "
            f"iconic class symbol not full portrait, consistent series with other class icons"
        )
        return prompt, {"for_skill_icon": True}, 64

    if kind == "main_skill_icons":
        skill_map = load_json("config/skill-icon-config.json").get("SKILL_ICON_MAP") or {}
        cname = stem
        for cn, fn in skill_map.items():
            if Path(fn).stem == stem:
                cname = cn
                break
        prompt = (
            f"{ag.SKILL_ICON_CORE_TEMPLATE}, skill icon for Chinese ability {cname}, "
            f"single magical effect emblem, one clear visual metaphor"
        )
        return prompt, {"for_skill_icon": True}, ag.EXPORT_ICON_SIZE

    if kind == "auto_battler":
        if "/heroes/" in r:
            cn = HERO_CN.get(stem, stem)
            prompt = (
                f"{ag.MONSTER_TEXTURE_STYLE_TEMPLATE}, chibi battle hero sprite, {cn} class adventurer, "
                f"signature weapon visible, square 1:1 centered, pure black background"
            )
            return prompt, {"for_monster_texture": True}, 96
        if "/enemies/" in r:
            e = enemies.get(stem, {"name": stem, "id": stem})
            extra = ag.MONSTER_BOSS_EXTRA_STYLE if "boss" in stem else ""
            prompt = (
                f"{ag.MONSTER_TEXTURE_STYLE_TEMPLATE}, {extra}, enemy {e.get('name', stem)}, "
                f"roguelike mob sprite, square 1:1 centered"
            ).replace("  ", " ")
            return prompt, {"for_monster_texture": True}, 96
        if "/nodes/" in r:
            hint = NODE_UI.get(stem, f"{stem} roguelike map node icon")
            prompt = f"{ag.SKILL_ICON_CORE_TEMPLATE}, {hint}, simple map marker symbol"
            return prompt, {"for_skill_icon": True}, 48
        if "/skills/" in r:
            s = skills.get(stem, {"name": stem, "description": ""})
            aoe = "area effect" if s.get("aoe") else "single target"
            prompt = (
                f"{ag.SKILL_ICON_CORE_TEMPLATE}, auto battler skill {s.get('name', stem)}: "
                f"{s.get('description', '')}, {aoe}, ability emblem"
            )
            return prompt, {"for_skill_icon": True}, ag.EXPORT_ICON_SIZE
        if "/relics/" in r:
            d = relics.get(stem, {"name": stem, "description": "", "rarity": "common"})
            prompt = (
                f"{ag.SKILL_ICON_CORE_TEMPLATE}, relic trinket {d.get('name', stem)}, "
                f"{d.get('description', '')}, rarity {d.get('rarity', 'common')}, small talisman icon"
            )
            return prompt, {"for_skill_icon": True}, ag.EXPORT_ICON_SIZE
        if "/scenes/" in r:
            cn = SCENE_CN.get(stem, stem)
            edge = SCENE_EDGE_HINTS.get(stem, "stone arches on edges only")
            prompt = (
                f"{SCENE_BG_STYLE}, 16:9 widescreen room background for {cn}, {edge}, "
                f"center 65 percent empty plain dark stone floor with minimal texture, "
                f"no central props no throne in middle, decorative art only on outer edges"
            )
            return prompt, {}, (1280, 720)

    if kind == "potion_icons":
        key = stem.replace("potion_", "")
        hint = POTION_STEM.get(key, "fantasy potion bottle")
        prompt = f"{ag.SKILL_ICON_CORE_TEMPLATE}, {hint}, glass flask with glowing liquid, consumable icon"
        return prompt, {"for_skill_icon": True}, ag.EXPORT_ICON_SIZE

    if kind == "buff_icons":
        suffix = ag.BUFF_ICON_PROMPTS.get(stem, f"RPG buff effect symbol for {stem}")
        prompt = f"{ag.SKILL_ICON_CORE_TEMPLATE}, {suffix}"
        return prompt, {"for_skill_icon": True}, ag.EXPORT_ICON_SIZE

    return None


def process_scene_background_image(raw: bytes, width: int = 1280, height: int = 720) -> bytes:
    from io import BytesIO

    from PIL import Image

    img = Image.open(BytesIO(raw)).convert("RGB")
    img = img.resize((width, height), Image.Resampling.LANCZOS)
    out = BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


def save_asset(rel: str, png_bytes: bytes) -> Path:
    path = resolve_path(rel)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png_bytes)
    return path


def run_batch(
    force: bool = False,
    dry_run: bool = False,
    sleep_s: float = 2.0,
    categories: list[str] | None = None,
    limit: int = 0,
    path_match: str = "",
) -> int:
    cats = categories or list(CATEGORIES)
    report = audit()
    targets = iter_targets(report, cats)
    if path_match:
        needle = path_match.replace("\\", "/")
        targets = [rel for rel in targets if needle in rel.replace("\\", "/")]
    if limit > 0:
        targets = targets[:limit]

    base_map = load_base_type_map()
    class_names = load_class_names()
    skills, relics, enemies = load_ab_data()

    todo = []
    for rel in targets:
        path = resolve_path(rel)
        if path.is_file() and not force:
            continue
        task = build_task(rel, base_map, class_names, skills, relics, enemies)
        if task:
            todo.append((rel, task))

    print(f"静态贴图 AI 批量：共 {len(targets)} 项审计路径，待生成 {len(todo)}（force={force}）")
    if not todo:
        print("无需生成。")
        return 0

    ok = fail = 0
    for i, (rel, (prompt, gen_kw, size)) in enumerate(todo, 1):
        print(f"[{i}/{len(todo)}] {rel}")
        if dry_run:
            print(f"  [dry-run] {(prompt + DETAIL_BOOST)[:120]}… | size={size}")
            continue
        is_scene = "/scenes/" in rel.replace("\\", "/")
        if is_scene:
            prompt = prompt + SCENE_WIDESCREEN_BOOST
        else:
            prompt = prompt + SQUARE_COMPOSITION_BOOST
        last_err = None
        for attempt in range(1, 4):
            try:
                raw = ag.generate_image(prompt, "", **gen_kw)
                if is_scene:
                    sw, sh = size if isinstance(size, tuple) else (1280, 720)
                    png = process_scene_background_image(raw, sw, sh)
                else:
                    png = ag.process_transparent_icon_image(raw, size)
                dest = save_asset(rel, png)
                print(f"  OK -> {dest.relative_to(ROOT)}")
                ok += 1
                last_err = None
                break
            except Exception as exc:
                last_err = exc
                if attempt < 3:
                    wait = sleep_s * attempt
                    print(f"  retry {attempt}/3 in {wait:.0f}s: {exc}")
                    time.sleep(wait)
        if last_err is not None:
            print(f"  FAIL: {last_err}")
            fail += 1
        if sleep_s > 0 and i < len(todo):
            time.sleep(sleep_s)

    print(f"完成：成功 {ok}，失败 {fail}")
    return 1 if fail else 0


def main():
    parser = argparse.ArgumentParser(description="AI batch regenerate audited static PNG assets")
    parser.add_argument("--force", action="store_true", help="Overwrite existing PNGs")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--sleep", type=float, default=2.0, help="Delay between API calls (seconds)")
    parser.add_argument(
        "--category",
        action="append",
        choices=CATEGORIES,
        help="Only run selected categories (repeatable)",
    )
    parser.add_argument("--limit", type=int, default=0, help="Max assets to generate (0 = all)")
    parser.add_argument(
        "--match",
        default="",
        help="Only generate paths containing this substring (e.g. auto_battler/scenes)",
    )
    parser.add_argument(
        "--clear-first",
        action="store_true",
        help="Delete all audited static PNGs before generating (avoids stale file conflicts)",
    )
    args = parser.parse_args()
    if args.clear_first and not args.dry_run:
        from clear_static_art import clear_static_art, iter_clear_targets  # noqa: WPS433

        print("Clearing old static art…")
        clear_cats = tuple(args.category) if args.category else None
        if clear_cats is None or "main_skill_icons" in clear_cats:
            extra = iter_main_skill_icon_paths()
            for rel in extra:
                path = resolve_path(rel)
                if path.is_file():
                    try:
                        path.unlink()
                        print(f"  cleared {rel}")
                    except OSError as exc:
                        print(f"  FAIL clear {rel}: {exc}")
        cstats = clear_static_art(categories=clear_cats)
        print(
            f"Cleared: {cstats['deleted']} deleted, {cstats['missing']} already missing, "
            f"{cstats['failed']} failed"
        )
        if cstats["failed"]:
            return 1
    return run_batch(
        force=args.force,
        dry_run=args.dry_run,
        sleep_s=args.sleep,
        categories=args.category,
        limit=args.limit,
        path_match=args.match or "",
    )


if __name__ == "__main__":
    raise SystemExit(main())
