#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将 asset 下中文等非常规文件名的贴图迁移为英文路径，并更新 config 中的映射。
装备路径与 tools/art_generator.py 的 equipment_english_relpath 一致；
技能图标与 _skill_icon_filename（skill_{sha256[:8]}.png）一致。

用法（在项目根目录）:
  python tools/migrate_assets_to_english.py
  python tools/migrate_assets_to_english.py --dry-run
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from art_generator import (  # noqa: E402
    ART_FOLDER,
    MAPPINGS_CONFIG,
    _skill_icon_filename,
    collect_all_equipment_entries_from_config,
    collect_deep_equipment_entries_from_config,
    equipment_english_relpath,
)

CONFIG_DIR = ROOT / "config"
SKILL_CFG = CONFIG_DIR / "skill-icon-config.json"
POTION_CFG = CONFIG_DIR / "potion-icon-config.json"
DEPLOY_ASSET = ROOT / "deployment" / "asset"
DEPLOY_CFG = ROOT / "deployment" / "config"

POTION_ENGLISH = {
    "力量药水": "potion_power.png",
    "防御药水": "potion_defense.png",
    "敏捷药水": "potion_agility.png",
    "暴击药水": "potion_crit.png",
    "生命药水": "potion_health.png",
    "闪避药水": "potion_dodge.png",
    "全能药水": "potion_omni.png",
    "神圣药水": "potion_divine.png",
}


def _infer_slot(name: str) -> str:
    n = name or ""
    if any(x in n for x in ("弓", "弩")):
        return "weapon"
    if "靴" in n or "鞋" in n or "足具" in n:
        return "boots"
    if "腿" in n or "胫" in n or "裤" in n or "护腿" in n:
        return "legs"
    if "冠" in n or "盔" in n or "帽" in n:
        return "helmet"
    if any(x in n for x in ("剑", "刃", "刀", "斧", "锤", "枪", "锋")):
        return "weapon"
    if "甲" in n or "衫" in n or "袍" in n or "铠" in n:
        return "chest"
    if "腰带" in n or "束腰" in n or "皮带" in n:
        return "belt"
    if "指环" in n or "戒指" in n or "扳指" in n:
        return "ring"
    if "项链" in n or "吊坠" in n or ("坠" in n and "指" not in n):
        return "necklace"
    if "带" in n and "腰" in n:
        return "belt"
    return "weapon"


def _infer_weapon_type(name: str) -> str:
    n = name or ""
    if any(x in n for x in ("弓", "弩", "矢")):
        return "ranged"
    return "melee"


def _build_name_to_row() -> dict:
    by: dict = {}
    for r in collect_all_equipment_entries_from_config():
        by[r["name"]] = dict(r)
    for r in collect_deep_equipment_entries_from_config():
        by[r["name"]] = dict(r)
    return by


def _row_for_equipment(name: str, by_name: dict) -> dict:
    if name in by_name:
        return dict(by_name[name])
    return {
        "name": name,
        "slot": _infer_slot(name),
        "weaponType": _infer_weapon_type(name),
        "isDeep": False,
    }


def _resolve_src_asset(path_rel: str) -> Path | None:
    rel = (path_rel or "").strip().replace("\\", "/")
    if not rel:
        return None
    p = ART_FOLDER / rel
    if p.is_file():
        return p
    # 技能：根目录与 skill_icons 双份兼容
    base = Path(rel).name
    for cand in (ART_FOLDER / base, ART_FOLDER / "skill_icons" / base):
        if cand.is_file():
            return cand
    return None


def _ensure_parent(p: Path) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)


def _safe_move_or_copy(src: Path, dst: Path, dry: bool) -> None:
    if src.resolve() == dst.resolve():
        return
    if dry:
        print(f"  [dry-run] {src} -> {dst}")
        return
    _ensure_parent(dst)
    if dst.exists():
        if dst.stat().st_size == src.stat().st_size:
            try:
                src.unlink()
            except OSError:
                pass
            return
        raise SystemExit(f"目标已存在且大小不同: {dst}")
    shutil.move(str(src), str(dst))


def _alchemy_relpath(material_name: str) -> str:
    from art_generator import _asset_digest8

    d = _asset_digest8((material_name or "").strip())
    return f"alchemy_materials/mat_{d}.png"


def _potion_relpath(potion_name: str) -> str:
    base = POTION_ENGLISH.get((potion_name or "").strip())
    if not base:
        from art_generator import _asset_digest8

        base = f"potion_{_asset_digest8(potion_name)}.png"
    return f"potion_icons/{base}"


def migrate_mappings_and_files(dry: bool) -> None:
    by_name = _build_name_to_row()
    with open(MAPPINGS_CONFIG, "r", encoding="utf-8") as f:
        data = json.load(f)

    # --- equipment ---
    eq = data.get("equipment") or {}
    new_eq = {}
    for name, old_rel in eq.items():
        old_rel = str(old_rel).replace("\\", "/").strip()
        row = _row_for_equipment(name, by_name)
        new_rel = equipment_english_relpath(row).replace("\\", "/")
        new_eq[name] = new_rel
        src = ART_FOLDER / old_rel
        if not src.is_file():
            print(f"WARN 装备源文件缺失，跳过移动: {name} -> {old_rel}")
            continue
        dst = ART_FOLDER / new_rel
        try:
            _safe_move_or_copy(src, dst, dry)
        except Exception as e:
            print(f"ERR 装备 {name}: {e}")
            raise
    data["equipment"] = new_eq

    # --- alchemy_material ---
    am = data.get("alchemy_material") or {}
    new_am = {}
    for name, old_rel in am.items():
        old_rel = str(old_rel).replace("\\", "/").strip()
        new_rel = _alchemy_relpath(name)
        new_am[name] = new_rel
        src = ART_FOLDER / old_rel
        if not src.is_file():
            alt = ART_FOLDER / "alchemy_materials" / Path(old_rel).name
            src = alt if alt.is_file() else src
        if not src.is_file():
            print(f"WARN 炼金材料源缺失: {name} {old_rel}")
            continue
        dst = ART_FOLDER / new_rel
        _safe_move_or_copy(src, dst, dry)
    data["alchemy_material"] = new_am

    # --- skill_icons (mappings section) ---
    sk = data.get("skill_icons") or {}
    new_sk = {}
    for name, old_rel in sk.items():
        fname = _skill_icon_filename(name)
        new_rel = f"skill_icons/{fname}"
        new_sk[name] = new_rel
        src = _resolve_src_asset(str(old_rel).replace("\\", "/"))
        if not src or not src.is_file():
            print(f"WARN 技能图标源缺失: {name} {old_rel}")
            continue
        dst = ART_FOLDER / new_rel
        _safe_move_or_copy(src, dst, dry)
        base = Path(str(old_rel).replace("\\", "/")).name
        for orphan in (ART_FOLDER / base, ART_FOLDER / "skill_icons" / base):
            if orphan.is_file() and orphan.resolve() != dst.resolve():
                if not dry:
                    try:
                        orphan.unlink()
                    except OSError:
                        pass
    data["skill_icons"] = new_sk

    if not dry:
        with open(MAPPINGS_CONFIG, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"已写入 {MAPPINGS_CONFIG}")


def update_skill_icon_config(dry: bool) -> None:
    with open(SKILL_CFG, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    sm = cfg.get("SKILL_ICON_MAP") or {}
    for name in list(sm.keys()):
        sm[name] = _skill_icon_filename(name)
    cfg["SKILL_ICON_MAP"] = sm
    if not dry:
        with open(SKILL_CFG, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
        print(f"已写入 {SKILL_CFG}")


def update_potion_icon_config(dry: bool) -> None:
    if not POTION_CFG.exists():
        return
    with open(POTION_CFG, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    pm = cfg.get("POTION_ICON_MAP") or {}
    pot_dir = ART_FOLDER / "potion_icons"
    moves = []
    for name, old_rel in pm.items():
        new_rel = _potion_relpath(name)
        raw = str(old_rel).replace("\\", "/").strip()
        old_path = ART_FOLDER / raw
        if not old_path.is_file() and pot_dir.is_dir():
            leg = pot_dir / Path(raw).name
            if leg.is_file():
                old_path = leg
        new_path = ART_FOLDER / new_rel
        pm[name] = new_rel.replace("\\", "/")
        if old_path.is_file():
            moves.append((old_path, new_path))
    cfg["POTION_ICON_MAP"] = pm
    for src, dst in moves:
        _safe_move_or_copy(src, dst, dry)
    if not dry:
        with open(POTION_CFG, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
        print(f"已写入 {POTION_CFG}")


def cleanup_unreferenced_non_ascii_images(dry: bool) -> None:
    """删除 asset 下未被 mappings / 图标配置引用的非 ASCII 文件名图片（应在药水迁移完成后执行）。"""

    def collect_strings(obj, out: set) -> None:
        if isinstance(obj, dict):
            for v in obj.values():
                collect_strings(v, out)
        elif isinstance(obj, list):
            for v in obj:
                collect_strings(v, out)
        elif isinstance(obj, str) and obj.strip():
            out.add(obj.replace("\\", "/"))

    ref: set = set()
    if MAPPINGS_CONFIG.exists():
        with open(MAPPINGS_CONFIG, "r", encoding="utf-8") as f:
            collect_strings(json.load(f), ref)
    for fn in ("skill-icon-config.json", "potion-icon-config.json", "buff-icon-config.json"):
        p = CONFIG_DIR / fn
        if p.exists():
            with open(p, "r", encoding="utf-8") as f:
                collect_strings(json.load(f), ref)
    ref_paths: set = set()
    for s in ref:
        if "/" in s or s.endswith((".png", ".gif", ".jpg", ".webp", ".mp3")):
            ref_paths.add(s)
            ref_paths.add(s.split("/")[-1])
    removed = 0
    for p in ART_FOLDER.rglob("*"):
        if not p.is_file():
            continue
        if p.suffix.lower() not in (".png", ".gif", ".jpg", ".webp"):
            continue
        rel = p.relative_to(ART_FOLDER).as_posix()
        if not any(ord(c) > 127 for c in p.name):
            continue
        if rel in ref_paths or p.name in ref_paths:
            continue
        if dry:
            removed += 1
            continue
        p.unlink()
        removed += 1
    print(f"清理非 ASCII 未引用贴图: {'将删除' if dry else '已删除'} {removed} 个")


def mirror_deployment(dry: bool) -> None:
    """用开发 asset 与关键 config 覆盖 deployment（与根目录资源一致）。"""
    if not DEPLOY_ASSET.parent.is_dir():
        print("无 deployment/，跳过镜像。")
        return
    if dry:
        print("[dry-run] 将同步 deployment/asset 与 deployment/config 下映射文件")
        return
    if DEPLOY_ASSET.exists():
        shutil.rmtree(DEPLOY_ASSET)
    shutil.copytree(ART_FOLDER, DEPLOY_ASSET)
    DEPLOY_CFG.mkdir(parents=True, exist_ok=True)
    for fn in ("mappings.json", "skill-icon-config.json", "potion-icon-config.json"):
        src = CONFIG_DIR / fn
        if src.is_file():
            shutil.copy2(src, DEPLOY_CFG / fn)
    print(f"已同步 {DEPLOY_ASSET} 与 {DEPLOY_CFG} 下 mappings / skill / potion 配置")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-deploy-mirror", action="store_true", help="不覆盖 deployment/asset")
    args = ap.parse_args()
    print("ART_FOLDER:", ART_FOLDER)
    migrate_mappings_and_files(args.dry_run)
    update_skill_icon_config(args.dry_run)
    update_potion_icon_config(args.dry_run)
    cleanup_unreferenced_non_ascii_images(args.dry_run)
    if not args.no_deploy_mirror:
        mirror_deployment(args.dry_run)
    print("完成。")


if __name__ == "__main__":
    main()
