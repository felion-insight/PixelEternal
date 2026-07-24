#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Remove audited static placeholder PNGs before AI batch regeneration."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT / "tools") not in sys.path:
    sys.path.insert(0, str(ROOT / "tools"))

from audit_static_assets import audit, resolve_path  # noqa: E402

# 不删 mappings 指向的混淆文件名（多为正式资源）
CLEAR_CATEGORIES = (
    "equipment_base",
    "equipment_slots",
    "equipment_types",
    "class_icons",
    "auto_battler",
    "potion_icons",
    "buff_icons",
)


def iter_clear_targets(categories: tuple[str, ...] | None = None) -> list[str]:
    cats = categories or CLEAR_CATEGORIES
    report = audit()
    seen = set()
    out = []
    for cat in cats:
        for rel in report.get("expected", {}).get(cat, []):
            if rel not in seen:
                seen.add(rel)
                out.append(rel)
    return out


def clear_static_art(dry_run: bool = False, categories: tuple[str, ...] | None = None) -> dict[str, int]:
    stats = {"deleted": 0, "missing": 0, "failed": 0}
    for rel in iter_clear_targets(categories):
        path = resolve_path(rel)
        if not path.is_file():
            stats["missing"] += 1
            continue
        if dry_run:
            print(f"  would delete {rel}")
            stats["deleted"] += 1
            continue
        try:
            path.unlink()
            stats["deleted"] += 1
        except OSError as exc:
            print(f"  FAIL {rel}: {exc}")
            stats["failed"] += 1
    return stats


def main():
    parser = argparse.ArgumentParser(description="Clear audited static PNG placeholders")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--category",
        action="append",
        choices=CLEAR_CATEGORIES,
        help="Only clear selected categories (repeatable)",
    )
    args = parser.parse_args()
    cats = tuple(args.category) if args.category else None
    targets = iter_clear_targets(cats)
    print(f"Clear targets: {len(targets)} paths")
    stats = clear_static_art(dry_run=args.dry_run, categories=cats)
    print(
        f"Deleted: {stats['deleted']} | Already missing: {stats['missing']} | Failed: {stats['failed']}"
    )
    return 1 if stats["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
