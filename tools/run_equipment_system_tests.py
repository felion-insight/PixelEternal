#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Phase 3 装备系统一键回归测试。"""

from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
NODE_TESTS = (
    "tools/test_phase3_equipment.js",
    "tools/test_equipment_generation.js",
    "tools/test_build_equipment.js",
    "tools/test_equipment_presets.js",
    "tools/test_equipment_lab_catalog.js",
    "tools/test_equipment_lab_controller.js",
    "tools/test_equipment_lab_triggers.js",
    "tools/test_weapon_refinement_mechanics.js",
    "tools/test_weapon_refinement_resonance.js",
    "tools/test_equipment_set_vfx.js",
    "tools/test_equipment_power_vfx.js",
    "tools/test_graduation_set_affinity.js",
    "tools/test_set_modifiers.js",
    "tools/test_set_descriptions.js",
)
CORE_SCRIPTS = (
    "js/config-helpers.js",
    "js/config-loader.js",
    "js/equipment-weapon-skills.js",
    "js/weapon-refinement-system.js",
    "js/weapon-refinement-resonance.js",
    "js/equipment-set-vfx.js",
    "js/equipment-power-vfx.js",
    "js/equipment-generator.js",
    "js/equipment-effect-system.js",
    "js/equipment-codex.js",
    "js/equipment-lab-scene.js",
    "js/equipment-lab-catalog.js",
    "js/equipment-lab-metrics.js",
    "js/equipment-lab-controller.js",
    "js/equipment-lab-ui.js",
    "js/class-build-system.js",
    "js/data-classes.js",
    "js/skill-system.js",
    "js/skill-entity-system.js",
    "js/skill-lab-ui.js",
    "js/automated-balance-tester.js",
    "js/game-entities.js",
    "js/game-main.js",
)
DEPLOYMENT_ROOT_ASSETS = ("index.html", "styles.css")
EQUIPMENT_CONFIGS = (
    "config/game-config.json",
    "config/base-types.json",
    "config/affix-pool.json",
    "config/legendary-powers.json",
    "config/set-config-v2.json",
    "config/class-build-equipment.json",
    "config/weapon-affinity-config.json",
)
PRESETS = (
    "naked",
    "standard10",
    "legendary",
    "set2",
    "set4",
    "build",
    "affinity_mismatch",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="运行 Phase 3 装备系统完整回归")
    parser.add_argument("--browser", action="store_true", help="追加 Selenium 实战测试")
    parser.add_argument("--duration", type=int, default=3000, help="浏览器中每职业时长（毫秒）")
    parser.add_argument("--classes", default="destroyer,archmage", help="浏览器测试职业，逗号分隔")
    parser.add_argument("--presets", default=",".join(PRESETS), help="浏览器装备预设，逗号分隔")
    parser.add_argument("--seed", type=int, default=7, help="确定性随机种子")
    parser.add_argument("--report", default="equipment_system_test_report.json", help="测试报告输出路径")
    return parser.parse_args()


def run(command: list[str], label: str) -> None:
    print(f"[RUN] {label}", flush=True)
    env = os.environ.copy()
    env["PYTHONUTF8"] = "1"
    completed = subprocess.run(command, cwd=ROOT, env=env, check=False)
    if completed.returncode != 0:
        raise RuntimeError(f"{label} 失败，退出码 {completed.returncode}")
    print(f"[OK]  {label}", flush=True)


def validate_json() -> dict[str, int]:
    counts: dict[str, int] = {}
    for relative in EQUIPMENT_CONFIGS:
        with (ROOT / relative).open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        counts[relative] = len(data) if hasattr(data, "__len__") else 1
    return counts


def validate_deployment_mirror() -> list[str]:
    mirrored = list(dict.fromkeys(
        (*DEPLOYMENT_ROOT_ASSETS, *CORE_SCRIPTS, *EQUIPMENT_CONFIGS)
    ))
    for relative in mirrored:
        source = ROOT / relative
        deployed = ROOT / "deployment" / relative
        if not deployed.exists() or source.read_bytes() != deployed.read_bytes():
            raise RuntimeError(f"deployment 镜像不一致: {relative}")
    return mirrored


def run_static_suite() -> dict[str, object]:
    config_counts = validate_json()
    for relative in CORE_SCRIPTS:
        run(["node", "--check", relative], f"语法检查 {relative}")
    for relative in NODE_TESTS:
        run(["node", relative], f"单元/集成测试 {relative}")
    run([sys.executable, "-m", "py_compile", "tools/run_balance_tests.py"], "平衡测试运行器语法")
    return {
        "configFiles": config_counts,
        "checkedScripts": list(CORE_SCRIPTS),
        "nodeTests": list(NODE_TESTS),
        "deploymentMirror": validate_deployment_mirror(),
    }


def run_browser_suite(args: argparse.Namespace) -> list[dict[str, object]]:
    try:
        import selenium  # noqa: F401
    except ImportError as exc:
        raise RuntimeError("浏览器测试需要 selenium：pip install selenium") from exc

    requested = [item.strip() for item in args.presets.split(",") if item.strip()]
    unknown = [item for item in requested if item not in PRESETS]
    if unknown:
        raise RuntimeError("未知装备预设: " + ", ".join(unknown))

    results: list[dict[str, object]] = []
    with tempfile.TemporaryDirectory(prefix="pixel-eternal-equipment-") as temp_dir:
        lab_output = Path(temp_dir) / "equipment_lab.json"
        run(
            [
                sys.executable,
                "tools/run_balance_tests.py",
                "--equipment-lab-smoke",
                "--json-output",
                str(lab_output),
                "--headless",
            ],
            "装备试验场自动展示烟测",
        )
        with lab_output.open("r", encoding="utf-8") as handle:
            lab_payload = json.load(handle)
        results.append({
            "preset": "equipment_lab_showcase",
            "catalogTotal": lab_payload["setup"]["total"],
            "resultCount": lab_payload["result"]["resultCount"],
            "restored": lab_payload["result"]["restored"],
        })
        for preset in requested:
            output = Path(temp_dir) / f"{preset}.json"
            run(
                [
                    sys.executable,
                    "tools/run_balance_tests.py",
                    "--scenario",
                    "burst_dps",
                    "--duration",
                    str(max(5000, args.duration)),
                    "--level",
                    "60",
                    "--classes",
                    args.classes,
                    "--equipment-preset",
                    preset,
                    "--seed",
                    str(args.seed),
                    "--json-output",
                    str(output),
                    "--markdown-output",
                    str(Path(temp_dir) / f"{preset}.md"),
                    "--headless",
                ],
                f"浏览器实战预设 {preset}",
            )
            with output.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
            rows = payload.get("results") or []
            if not rows:
                raise RuntimeError(f"{preset} 未产出职业测试结果")
            for row in rows:
                dps = row.get("dps")
                if not isinstance(dps, (int, float)) or not math.isfinite(dps) or dps <= 0:
                    raise RuntimeError(f"{preset} 产出非法 DPS: {dps}")
            results.append({
                "preset": preset,
                "classes": [row.get("classInfo", {}).get("id") for row in rows],
                "dps": [row.get("dps") for row in rows],
            })
    return results


def main() -> int:
    args = parse_args()
    report: dict[str, object] = {"ok": False}
    try:
        report["static"] = run_static_suite()
        report["browser"] = run_browser_suite(args) if args.browser else []
        report["ok"] = True
        print("[PASS] Phase 3 装备系统全部测试通过", flush=True)
        return_code = 0
    except Exception as exc:
        report["error"] = str(exc)
        print(f"[FAIL] {exc}", flush=True)
        return_code = 1

    report_path = Path(args.report)
    if not report_path.is_absolute():
        report_path = ROOT / report_path
    with report_path.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    print(f"[REPORT] {report_path}", flush=True)
    return return_code


if __name__ == "__main__":
    raise SystemExit(main())
