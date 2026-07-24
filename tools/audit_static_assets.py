#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Audit static art assets referenced by Pixel Eternal configs and preload code."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSET = ROOT / "asset"


def load_json(rel: str):
    path = ROOT / rel
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def iter_class_icons(class_cfg: dict):
    for section in ("baseClasses", "firstAdvancements", "secondAdvancements"):
        block = class_cfg.get(section) or {}
        for cid, data in block.items():
            icon = (data or {}).get("icon")
            if icon:
                yield icon.replace("\\", "/")


def collect_expected() -> dict[str, list[str]]:
    expected: dict[str, list[str]] = {
        "equipment_base": [],
        "equipment_slots": [],
        "equipment_types": [],
        "class_icons": [],
        "auto_battler": [],
        "potion_icons": [],
        "buff_icons": [],
        "mapped_assets": [],
    }

    base_types = load_json("config/base-types.json")
    for group in ("weapons", "offHand", "armor", "accessories"):
        for bid in (base_types.get(group) or {}).keys():
            expected["equipment_base"].append(f"asset/equipment/base/{bid}.png")

    for slot in ("weapon", "offHand", "helmet", "body", "hands", "legs", "feet", "amulet", "ring", "belt"):
        expected["equipment_slots"].append(f"asset/equipment/slots/{slot}.png")

    weapon_cfg = load_json("config/weapon-affinity-config.json")
    for wt in (weapon_cfg.get("weaponTypes") or {}).keys():
        expected["equipment_types"].append(f"asset/equipment/types/{wt}.png")

    class_cfg = load_json("config/class-config.json")
    for icon in iter_class_icons(class_cfg):
        expected["class_icons"].append(icon)

    ab_cfg = load_json("config/auto-battler-config.json")
    for cls in (ab_cfg.get("partyOrder") or ["warrior", "archer", "mage", "assassin"]):
        expected["auto_battler"].append(f"asset/auto_battler/heroes/{cls}.png")
    for node in ("battle", "elite", "rest", "event", "shop", "boss", "boss_final"):
        expected["auto_battler"].append(f"asset/auto_battler/nodes/{node}.png")
    for enemy in ab_cfg.get("enemyTemplates") or []:
        eid = enemy.get("id")
        if eid:
            expected["auto_battler"].append(f"asset/auto_battler/enemies/{eid}.png")
    for skill in ab_cfg.get("skillPool") or []:
        sid = skill.get("id")
        if sid:
            expected["auto_battler"].append(f"asset/auto_battler/skills/{sid}.png")
    for relic in ab_cfg.get("relics") or []:
        rid = relic.get("id")
        if rid:
            expected["auto_battler"].append(f"asset/auto_battler/relics/{rid}.png")
    for scene in ("battle", "shop", "event"):
        expected["auto_battler"].append(f"asset/auto_battler/scenes/{scene}.png")

    potion_cfg = load_json("config/potion-icon-config.json")
    for rel in (potion_cfg.get("POTION_ICON_MAP") or {}).values():
        if isinstance(rel, str) and rel.endswith(".png"):
            expected["potion_icons"].append(f"asset/{rel.replace(chr(92), '/')}")

    buff_cfg = load_json("config/buff-icon-config.json")
    for rel in (buff_cfg.get("BUFF_ICON_MAP") or {}).values():
        if isinstance(rel, str) and rel.endswith(".png"):
            expected["buff_icons"].append(f"asset/{rel.replace(chr(92), '/')}")

    mappings = load_json("config/mappings.json")
    for group, table in mappings.items():
        if not isinstance(table, dict):
            continue
        for rel in table.values():
            if isinstance(rel, str) and rel.endswith(".png"):
                expected["mapped_assets"].append(f"asset/{rel.replace(chr(92), '/')}")

    return expected


def resolve_path(rel: str) -> Path:
    if rel.startswith("asset/"):
        return ROOT / rel
    return ROOT / rel


def audit() -> dict:
    expected = collect_expected()
    missing: dict[str, list[str]] = {}
    present: dict[str, list[str]] = {}
    for category, paths in expected.items():
        missing[category] = []
        present[category] = []
        seen = set()
        for rel in paths:
            if rel in seen:
                continue
            seen.add(rel)
            p = resolve_path(rel)
            if p.is_file():
                present[category].append(rel)
            else:
                missing[category].append(rel)
    return {
        "root": str(ROOT),
        "expected": expected,
        "present": present,
        "missing": missing,
        "counts": {
            "expected": sum(len(v) for v in expected.values()),
            "present": sum(len(v) for v in present.values()),
            "missing": sum(len(v) for v in missing.values()),
        },
    }


def main():
    parser = argparse.ArgumentParser(description="Audit static PNG assets")
    parser.add_argument("--json", metavar="PATH", help="Write full report JSON")
    parser.add_argument("--missing-only", action="store_true")
    args = parser.parse_args()

    report = audit()
    if args.json:
        out = Path(args.json)
        if not out.is_absolute():
            out = ROOT / out
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Wrote {out}")

    if args.missing_only:
        for cat, paths in report["missing"].items():
            if not paths:
                continue
            print(f"\n[{cat}] missing {len(paths)}")
            for rel in paths[:20]:
                print(f"  - {rel}")
            if len(paths) > 20:
                print(f"  ... +{len(paths) - 20} more")
    else:
        c = report["counts"]
        print(f"Expected: {c['expected']} | Present: {c['present']} | Missing: {c['missing']}")
        for cat, paths in report["missing"].items():
            if paths:
                print(f"  {cat}: {len(paths)} missing")

    return 0 if report["counts"]["missing"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
