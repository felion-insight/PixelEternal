#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
One-shot entry: audit missing static assets, generate procedural placeholders,
print next steps for AI art batches (tools/art_generator.py).
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def run(cmd: list[str], allow_fail: bool = False) -> int:
    print("+", " ".join(cmd))
    rc = subprocess.call(cmd, cwd=str(ROOT))
    if rc != 0 and not allow_fail:
        raise subprocess.CalledProcessError(rc, cmd)
    return rc


def main():
    py = sys.executable
    report = ROOT / "artifacts/static-assets-report.json"
    report.parent.mkdir(parents=True, exist_ok=True)
    run([py, "tools/audit_static_assets.py", "--json", str(report)], allow_fail=True)
    run([py, "tools/audit_static_assets.py", "--missing-only"], allow_fail=True)
    run([py, "tools/generate_static_placeholders.py", "--all"])
    run([py, "tools/audit_static_assets.py"], allow_fail=True)

    if os.environ.get("PE_ART_API_KEY"):
        print("\n检测到 PE_ART_API_KEY，可用 AI 批量替换占位图：")
        print("  python tools/art_generator.py --batch-all-equipment-textures")
        print("  python tools/art_generator.py --batch-monster-textures")
        print("  python tools/art_generator.py --batch-projectile-textures")
    else:
        print("\n占位图已生成。若要 AI 精绘，在 .env 配置 PE_ART_API_KEY 后运行 tools/art_generator.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
