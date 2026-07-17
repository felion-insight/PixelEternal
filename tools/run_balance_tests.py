#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pixel Eternal - Automated Class Balance Test Runner
自动化全职业数值与机制平衡性测试运行脚本
"""

import os
import sys
import time
import subprocess
import argparse
import json
from pathlib import Path

EQUIPMENT_PRESETS = (
    "preserve",
    "naked",
    "standard10",
    "legendary",
    "set2",
    "set4",
    "build",
    "affinity_mismatch",
)


def print_banner():
    print("=" * 60)
    print("      Pixel Eternal - 全职业数值与机制平衡性自动化测试")
    print("=" * 60)

def parse_args():
    parser = argparse.ArgumentParser(description="Pixel Eternal 多维战斗平衡测试运行器")
    parser.add_argument("--scenario", default="burst_dps", help="测试场景，例如 burst_dps、sustained_dps、multi_target、survivability")
    parser.add_argument("--duration", type=int, default=5000, help="每个职业测试时长（毫秒）")
    parser.add_argument("--level", type=int, default=60, help="测试等级")
    parser.add_argument("--infinite-resource", action="store_true", help="启用无限资源")
    parser.add_argument("--json-output", default="", help="可选：原始 JSON 结果输出路径")
    parser.add_argument("--markdown-output", default="balance_test_report.md", help="Markdown 报告输出路径")
    parser.add_argument("--classes", default="", help="可选：仅测试指定职业ID，逗号分隔")
    parser.add_argument(
        "--equipment-preset",
        default="preserve",
        choices=EQUIPMENT_PRESETS,
        help="确定性装备场景；默认 preserve 保持旧 CLI 行为",
    )
    parser.add_argument("--seed", type=int, default=1, help="装备生成与测试随机种子")
    parser.add_argument("--headless", action="store_true", help="使用无界面 Chrome 运行")
    parser.add_argument("--equipment-lab-smoke", action="store_true", help="仅运行装备试验场自动展示烟测")
    parser.add_argument("--equipment-lab-effect", default="", help="装备试验场烟测仅运行指定 effectId")
    return parser.parse_args()


def main():
    args = parse_args()
    print_banner()
    
    # 提示用户可以使用浏览器内的一键测试
    print("\n[提示] 游戏内已集成一键测试功能！")
    print("您也可以直接运行 start-server.py 启动游戏，进入“技能实验场” (快捷键 L)，")
    print("然后点击工具栏上的“数值平衡测试”按钮，即可直观地在浏览器中观看自动输出并查看报告。\n")

    # 检查是否安装了 selenium
    try:
        from selenium import webdriver
        from selenium.webdriver.common.by import By
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
    except ImportError:
        print("[提示] 本地未安装 selenium 库。如果需要使用命令行自动运行测试，请执行以下命令安装：")
        print("  pip install selenium")
        print("\n现在将为您生成一份基于静态配置的数值预测与设计评估报告...")
        generate_static_report_fallback()
        return 0

    # 询问用户是否启动本地测试
    print("检测到本地已安装 selenium，准备启动自动化浏览器测试...", flush=True)
    
    # 检查本地服务器是否启动 (尝试连接 127.0.0.1:8000)
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(1)
    server_running = False
    try:
        s.connect(("127.0.0.1", 8000))
        server_running = True
        s.close()
    except Exception:
        pass

    server_process = None
    if not server_running:
        print("[信息] 检测到本地开发服务器未运行，正在为您自动启动 start-server.py...", flush=True)
        try:
            # 启动本地服务器，重定向输出避免干扰
            # 使用环境变量防止 start-server.py 自动打开浏览器
            env = os.environ.copy()
            env["PORT"] = "8000"
            server_process = subprocess.Popen(
                [sys.executable, "start-server.py"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                cwd=str(Path(__file__).parent.parent),
                env=env
            )
            time.sleep(3) # 等待服务器启动
            print("[成功] 本地开发服务器已启动。", flush=True)
        except Exception as e:
            print(f"[警告] 自动启动服务器失败: {e}。请手动运行 python start-server.py 后再试。", flush=True)
            return 1

    # 配置 Chrome 选项
    chrome_options = Options()
    if args.headless:
        chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--mute-audio")
    chrome_options.add_argument("--window-size=1280,800")

    driver = None
    try:
        print("[信息] 正在启动 Chrome 浏览器...", flush=True)
        sys.stdout.flush()
        driver = webdriver.Chrome(options=chrome_options)
        
        print("[信息] 正在加载游戏页面...", flush=True)
        sys.stdout.flush()
        driver.get("http://127.0.0.1:8000/index.html")
        
        # 1. 等待加载界面消失 (资源加载完成)
        print("[信息] 正在等待游戏资源加载完成...", flush=True)
        sys.stdout.flush()
        WebDriverWait(driver, 45).until(
            EC.invisibility_of_element_located((By.ID, "loading-screen"))
        )
        print("[成功] 游戏资源加载完成。", flush=True)
        sys.stdout.flush()

        # 2. 等待启动界面出现并点击它以启动游戏循环
        print("[信息] 正在启动游戏循环...", flush=True)
        sys.stdout.flush()
        WebDriverWait(driver, 15).until(
            EC.visibility_of_element_located((By.ID, "start-screen"))
        )
        start_screen = driver.find_element(By.ID, "start-screen")
        driver.execute_script("arguments[0].click();", start_screen)
        WebDriverWait(driver, 10).until(
            lambda d: d.execute_script(
                "return !!(window.game && window.game._gameLoopStarted === true);"
            )
        )

        if args.equipment_lab_smoke:
            print("[信息] 正在运行装备试验场自动展示烟测...", flush=True)
            smoke_setup = driver.execute_script("""
                const g = window.game;
                const requestedEffect = arguments[0] || '';
                const requestedEffects = requestedEffect.split(',').map(value => value.trim()).filter(Boolean);
                if (window.applySkillLabPlayerConfig) window.applySkillLabPlayerConfig(g.player, 'warrior');
                document.getElementById('class-select-modal')?.classList.remove('show');
                document.getElementById('dev-panel')?.classList.add('show');
                g.devMode = true;
                g.syncGamePausedState();
                if (!g.paused) throw new Error('烟测未能建立开发面板暂停前置状态');
                const before = {
                    classData: JSON.stringify(g.player.classData),
                    equipment: JSON.stringify(Object.fromEntries(Object.entries(g.player.equipment || {}).map(
                        ([slot, item]) => [slot, item ? g.serializeEquipment(item) : null]
                    )))
                };
                g.__equipmentLabSmokeBefore = before;
                document.querySelector('button[onclick="game.enterEquipmentLab()"]').click();
                g.equipmentLabUI.close();
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', code: 'KeyO', bubbles: true }));
                const equipmentShortcutAccessible = g.equipmentLabUI.isOpen();
                g.toggleInventory();
                const equipmentPanelZ = Number(getComputedStyle(document.getElementById('equipment-lab-modal')).zIndex);
                const inventoryPanel = document.getElementById('inventory-modal');
                const inventoryAccessible = inventoryPanel.classList.contains('show')
                    && Number(getComputedStyle(inventoryPanel).zIndex) > equipmentPanelZ;
                g.toggleInventory();
                g.toggleDevMode();
                const devPanelAccessible = document.getElementById('dev-panel').classList.contains('show');
                g.toggleDevMode();
                const catalog = window.EquipmentLabCatalog.buildCatalog();
                const categories = ['power', 'set', 'build', 'weapon', 'resonance', 'affix'];
                const fullQueue = catalog.filter(entry =>
                    entry.category === 'power'
                    || (entry.category === 'set' && entry.pieceCount === 4)
                    || (entry.category === 'weapon' && entry.refineLevel > 0)
                    || entry.category === 'resonance'
                );
                const queue = requestedEffect
                    ? fullQueue.filter(entry => requestedEffect === 'resonance' || requestedEffect === 'power'
                        ? entry.category === requestedEffect
                        : requestedEffects.includes(entry.effectId))
                    : fullQueue;
                const counts = Object.fromEntries(categories.map(category => [
                    category, catalog.filter(entry => entry.category === category).length
                ]));
                const controller = g.equipmentLabController;
                const originalUpdate = controller.update.bind(controller);
                controller.__smokeUpdateCalls = 0;
                controller.update = () => {
                    controller.__smokeUpdateCalls += 1;
                    return originalUpdate();
                };
                const started = controller.start(queue, { durationMs: 2000, loop: false });
                const showcaseCard = document.getElementById('equipment-lab-showcase-card');
                return {
                    started,
                    scene: g.currentScene,
                    counts,
                    queueLength: queue.length,
                    total: catalog.length,
                    modalOpen: document.getElementById('equipment-lab-modal').classList.contains('show'),
                    unpausedAfterEntry: !g.paused,
                    panelAccess: equipmentShortcutAccessible && inventoryAccessible && devPanelAccessible,
                    showcaseVisible: showcaseCard.classList.contains('show'),
                    showcaseHasContent: document.getElementById('equipment-lab-showcase-name').textContent.length > 0
                        && document.getElementById('equipment-lab-showcase-description').textContent.length > 0
                };
            """, args.equipment_lab_effect)
            if (not smoke_setup.get("started")
                    or smoke_setup.get("scene") != "equipment_lab"
                    or not smoke_setup.get("unpausedAfterEntry")
                    or not smoke_setup.get("panelAccess")
                    or not smoke_setup.get("showcaseVisible")
                    or not smoke_setup.get("showcaseHasContent")):
                raise RuntimeError("装备试验场无法启动: " + json.dumps(smoke_setup, ensure_ascii=False))
            deadline = time.time() + (120 if args.equipment_lab_effect else 290)
            while time.time() < deadline:
                state = driver.execute_script("""
                    const c = window.game.equipmentLabController;
                    return { running: c.isRunning, results: c.results.length };
                """)
                if not state["running"]:
                    break
                time.sleep(0.25)
            smoke_result = driver.execute_script("""
                const g = window.game;
                const c = g.equipmentLabController;
                const resultCount = c.results.length;
                const allPositive = c.results.every(row =>
                    row.triggerCount > 0
                    && row.effectTriggerCount > 0
                    && row.triggered === true
                    && row.totalDamage >= 0
                    && (row.category !== 'power' || (
                        row.effectTriggerCount >= 2
                        && !row.events.some(event =>
                            event.type === 'skill_cast' || event.type === 'weapon_skill'
                        )
                    ))
                );
                const failedEffects = c.results
                    .filter(row => !row.triggered)
                    .map(row => row.effectId);
                const diagnostics = {
                    updateCalls: c.__smokeUpdateCalls || 0,
                    running: c.isRunning,
                    elapsedMs: c.elapsedMs,
                    paused: g.paused,
                    blockingModal: g.isBlockingModalOpen()
                };
                g.exitEquipmentLab();
                const after = {
                    classData: JSON.stringify(g.player.classData),
                    equipment: JSON.stringify(Object.fromEntries(Object.entries(g.player.equipment || {}).map(
                        ([slot, item]) => [slot, item ? g.serializeEquipment(item) : null]
                    )))
                };
                return {
                    resultCount,
                    allPositive,
                    failedEffects,
                    diagnostics,
                    restored: after.classData === g.__equipmentLabSmokeBefore.classData
                        && after.equipment === g.__equipmentLabSmokeBefore.equipment,
                    scene: g.currentScene
                };
            """)
            if (smoke_result.get("resultCount", 0) < smoke_setup.get("queueLength", 0)
                    or not smoke_result.get("allPositive")
                    or not smoke_result.get("restored")):
                raise RuntimeError("装备试验场烟测失败: " + json.dumps(smoke_result, ensure_ascii=False))
            if args.json_output:
                output = Path(args.json_output)
                if not output.is_absolute():
                    output = Path(__file__).parent.parent / output
                output.parent.mkdir(parents=True, exist_ok=True)
                with open(output, "w", encoding="utf-8") as handle:
                    json.dump({"setup": smoke_setup, "result": smoke_result}, handle, ensure_ascii=False, indent=2)
            print("[成功] 装备试验场目录、自动轮换、战斗展示与状态恢复烟测通过。", flush=True)
            return 0

        print("[信息] 正在进入技能实验场...", flush=True)
        sys.stdout.flush()
        driver.execute_script("if (window.game && typeof window.game.enterSkillLab === 'function') { window.game.enterSkillLab(); }")
        time.sleep(1.5)

        # 检查自动化测试脚本是否成功加载
        has_tester = driver.execute_script("return typeof window.AutomatedBalanceTester !== 'undefined';")
        if not has_tester:
            print("[错误] 未能在游戏内检测到 AutomatedBalanceTester 脚本，请确保 index.html 已正确引入该脚本。", flush=True)
            sys.stdout.flush()
            return 1

        equipment_smoke = driver.execute_script("""
            const g = window.game;
            const item = window.generateProceduralEquipment({
                level: 60,
                monsterLevel: 60,
                monsterTier: 'boss',
                quality: 'legendary',
                playerClass: 'warrior',
                classId: 'destroyer',
                buildEquipmentId: 'blood_howl'
            });
            if (!item) return { ok: false, reason: '无法生成定向流派装备' };
            item.refineLevel = 2;
            item.applyEnhancement();
            const serialized = g.serializeEquipment(item);
            const restored = g.deserializeEquipment(serialized);
            const save = g.buildSaveDataObject();
            const configErrors = typeof window.validatePhase3EquipmentConfig === 'function'
                ? window.validatePhase3EquipmentConfig()
                : ['配置校验函数缺失'];
            return {
                ok: save.version === '3.0'
                    && restored.buildEquipmentId === item.buildEquipmentId
                    && restored.refineLevel === item.refineLevel
                    && restored.baseTypeId === item.baseTypeId
                    && JSON.stringify(restored.legendaryPowers) === JSON.stringify(item.legendaryPowers)
                    && configErrors.length === 0,
                reason: configErrors.join('; '),
                saveVersion: save.version
            };
        """)
        if not equipment_smoke.get("ok"):
            raise RuntimeError(
                "装备生成/存档往返烟测失败: "
                + (equipment_smoke.get("reason") or json.dumps(equipment_smoke, ensure_ascii=False))
            )
        print("[成功] 装备生成、配置校验与 Phase 3 存档往返烟测通过。", flush=True)

        print(
            f"[信息] 正在启动自动化数值测试 "
            f"(装备预设: {args.equipment_preset}, 种子: {args.seed})...",
            flush=True,
        )
        sys.stdout.flush()
        # 启动测试
        class_ids = [item.strip() for item in args.classes.split(",") if item.strip()]
        classes_json = json.dumps(class_ids, ensure_ascii=False)
        driver.execute_script("""
            const requested = %s;
            const selected = requested.length
                ? window.AutomatedBalanceTester.classesToTest.filter(c => requested.includes(c.id))
                : undefined;
            window.AutomatedBalanceTester.startTest({
                duration: %d,
                level: %d,
                infiniteResource: %s,
                scenario: %s,
                equipmentPreset: %s,
                seed: %d,
                classes: selected
            });
        """ % (
            classes_json,
            args.duration,
            args.level,
            "true" if args.infinite_resource else "false",
            json.dumps(args.scenario, ensure_ascii=False),
            json.dumps(args.equipment_preset, ensure_ascii=False),
            args.seed,
        ))

        # 循环等待测试结束
        last_progress = -1
        while True:
            try:
                is_running = driver.execute_script("return window.AutomatedBalanceTester.isRunning;")
                if not is_running:
                    break
                
                # 获取当前测试进度
                progress = driver.execute_script("""
                    const t = window.AutomatedBalanceTester;
                    return {
                        index: Number.isFinite(t.currentClassIndex) ? t.currentClassIndex : -1,
                        total: Array.isArray(t.classesToTest) ? t.classesToTest.length : 0
                    };
                """)
                current_idx = progress["index"]
                total_classes = progress["total"]
                
                if current_idx != last_progress and current_idx < total_classes:
                    current_class = driver.execute_script("""
                        const t = window.AutomatedBalanceTester;
                        const c = t.classesToTest[t.currentClassIndex];
                        return c ? {name: c.name || c.id, tier: c.tier || ''} : null;
                    """)
                    if not current_class:
                        time.sleep(0.25)
                        continue
                    class_name = current_class["name"]
                    tier = current_class["tier"]
                    # 避免控制台打印非 ASCII 字符时在某些 Windows GBK 环境下崩溃
                    try:
                        print(f" -> 正在测试 [{current_idx + 1}/{total_classes}]: {class_name} ({tier})...")
                        sys.stdout.flush()
                    except UnicodeEncodeError:
                        print(f" -> Testing [{current_idx + 1}/{total_classes}]: {current_idx}...")
                        sys.stdout.flush()
                    last_progress = current_idx
            except Exception as e:
                print(f"[警告] 轮询状态时发生异常: {e}")
                sys.stdout.flush()
                
            time.sleep(1)

        print("[成功] 自动化测试完成！正在导出测试报告...", flush=True)
        
        # 获取生成的 Markdown 报告
        markdown_report = driver.execute_script("return window.AutomatedBalanceTester.generateMarkdownReport();")
        
        # 保存到本地 file
        report_path = Path(args.markdown_output)
        if not report_path.is_absolute():
            report_path = Path(__file__).parent.parent / report_path
        report_path.parent.mkdir(parents=True, exist_ok=True)
        with open(report_path, "w", encoding="utf-8") as f:
            f.write(markdown_report)
            
        print(f"[成功] 详细测试报告已保存至: {report_path.resolve()}", flush=True)
        print("\n" + "="*40 + " 简要 DPS 排行榜 " + "="*40, flush=True)
        
        # 打印简要排行榜
        results = driver.execute_script("return window.AutomatedBalanceTester.results;")
        if args.json_output:
            json_path = Path(args.json_output)
            if not json_path.is_absolute():
                json_path = Path(__file__).parent.parent / json_path
            json_path.parent.mkdir(parents=True, exist_ok=True)
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump({
                    "scenario": args.scenario,
                    "durationMs": args.duration,
                    "level": args.level,
                    "infiniteResource": args.infinite_resource,
                    "equipmentPreset": args.equipment_preset,
                    "seed": args.seed,
                    "results": results
                }, f, ensure_ascii=False, indent=2)
            print(f"[成功] 原始 JSON 数据已保存至: {json_path.resolve()}", flush=True)
        for idx, r in enumerate(results):
            print(f" {idx+1:2d}. {r['classInfo']['name']:<10} ({r['classInfo']['tier']:<4}) | DPS: {int(r['dps']):,}", flush=True)
        print("="*97, flush=True)

    except Exception as e:
        print(f"[错误] 自动化测试运行中发生异常: {e}")
        return 1
    finally:
        if driver:
            driver.quit()
            print("[信息] 浏览器已关闭。")
        if server_process:
            server_process.terminate()
            print("[信息] 自动启动的本地服务器已关闭。")
    return 0

def generate_static_report_fallback():
    """
    当本地未安装 selenium 时，基于 class-config.json 和 skill-config.json 进行静态数值模拟与平衡性诊断。
    """
    print("[信息] 正在读取游戏配置文件进行静态平衡性评估...")
    
    import json
    try:
        class_config_path = Path(__file__).parent.parent / "config" / "class-config.json"
        skill_config_path = Path(__file__).parent.parent / "config" / "skill-config.json"
        
        with open(class_config_path, "r", encoding="utf-8") as f:
            class_config = json.load(f)
        with open(skill_config_path, "r", encoding="utf-8") as f:
            skill_config = json.load(f)
            
        print("[成功] 配置文件读取成功。正在生成静态评估报告...")
        
        # 静态计算每个职业的理论输出倍率
        # 收集所有技能
        skills_by_class = {}
        for skill in skill_config.get("skills", {}).values():
            if not isinstance(skill, dict):
                continue
            class_id = skill.get("classId")
            if class_id:
                if class_id not in skills_by_class:
                    skills_by_class[class_id] = []
                skills_by_class[class_id].append(skill)
                
        # 评估各职业
        report_lines = [
            "# Pixel Eternal 职业数值与设计平衡性静态评估报告\n",
            f"* **评估日期**: {time.strftime('%Y-%m-%d %H:%M:%S')}",
            "* **评估模式**: 静态配置与理论倍率分析 (未安装 Selenium 降级模式)\n",
            "## 一、 职业理论输出倍率与机制评估\n",
            "根据 `skill-config.json` 中的技能伤害倍率、冷却时间以及资源消耗，对各职业进行理论 DPS 评估：\n"
        ]
        
        # 简单模拟几个典型职业
        report_lines.append("| 职业名称 | 阶级 | 核心输出技能 | 单次最高倍率 | 冷却时间 (秒) | 机制与平衡性诊断 |")
        report_lines.append("| :--- | :---: | :--- | :---: | :---: | :--- |")
        
        # 遍历 baseClasses, firstAdvancements, secondAdvancements
        bases = class_config.get("baseClasses", {})
        firsts = class_config.get("firstAdvancements", {})
        seconds = class_config.get("secondAdvancements", {})
        
        all_classes = []
        for cid, c in bases.items():
            all_classes.append((cid, c, "基础"))
        for cid, c in firsts.items():
            all_classes.append((cid, c, "一转"))
        for cid, c in seconds.items():
            all_classes.append((cid, c, "二转"))
            
        for cid, c, tier in all_classes:
            name = c.get("name", cid)
            # 寻找该职业的技能
            c_skills = skills_by_class.get(cid, [])
            if not c_skills and tier == "二转":
                # 尝试找一转和基础技能
                first_id = c.get("firstAdvancement")
                if first_id:
                    c_skills.extend(skills_by_class.get(first_id, []))
                    first_conf = firsts.get(first_id, {})
                    if isinstance(first_conf, dict):
                        base_id = first_conf.get("baseClass")
                        if base_id:
                            c_skills.extend(skills_by_class.get(base_id, []))
            
            if c_skills:
                # 找出伤害倍率最高的技能
                active_skills = [s for s in c_skills if isinstance(s, dict) and s.get("slotType") != "basic" and s.get("damageMultiplier") is not None]
                if active_skills:
                    best_skill = max(active_skills, key=lambda s: s.get("damageMultiplier", 0))
                    skill_name = best_skill.get("name", "未知")
                    mult = best_skill.get("damageMultiplier", 0)
                    cd = best_skill.get("cooldownMs", 0) / 1000.0
                    
                    # 诊断信息
                    diag = "数值合理，输出循环流畅。"
                    if mult > 5.0 and cd < 3.0:
                        diag = "⚠️ **理论爆发极高**：核心技能倍率过高且冷却极短，可能存在数值超标风险。"
                    elif mult < 1.5:
                        diag = "📉 **输出较为疲软**：核心主动技能倍率偏低，可能需要依赖高频普攻。"
                    elif best_skill.get("resourceCost", 0) > 40:
                        diag = "🔄 **资源消耗极高**：核心技能消耗较大，在常规资源模式下可能存在循环卡手瓶颈。"
                        
                    report_lines.append(f"| **{name}** | {tier} | {skill_name} | {mult:.1f}x | {cd:.1f}s | {diag} |")
                else:
                    report_lines.append(f"| **{name}** | {tier} | 无主动输出技能 | - | - | ⚠️ 缺乏主动输出技能，可能完全依赖普攻。 |")
            else:
                report_lines.append(f"| **{name}** | {tier} | 未配置技能 | - | - | 🚨 严重配置缺失：未找到任何技能定义。 |")
                
        report_lines.append("\n## 二、 机制与数值平衡性优化建议\n")
        report_lines.append("1. **一键自动测试推荐**：强烈建议您执行 `pip install selenium`，然后重新运行此脚本。脚本将自动打开 Chrome 浏览器，控制角色在技能试验场中打出真实的 DPS 数据，并抓取协同反应、持续伤害等动态数据，生成更精准的诊断。")
        report_lines.append("2. **资源循环调优**：在常规资源模式下，部分高消耗职业（如法师系、刺客系）需要关注其资源回复被动，避免出现空蓝只能打普攻的尴尬局面。")
        report_lines.append("3. **协同反应联动**：异常职业（Anomaly）如毒术士、瘟疫使者，其静态面板倍率虽低，但通过高频叠加 status_effects（中毒、流血等）并触发协同反应（如混沌、剧毒之火），其实际战斗 DPS 会成倍增长，这需要通过动态浏览器测试进行捕捉。")

        report_path = Path(__file__).parent.parent / "balance_test_report.md"
        with open(report_path, "w", encoding="utf-8") as f:
            f.write("\n".join(report_lines))
            
        print(f"\n[成功] 静态平衡性评估报告已生成至: {report_path.resolve()}")
        print("您可以使用任何 Markdown 阅读器查看该报告。")
        
    except Exception as e:
        print(f"[错误] 生成静态报告时发生异常: {e}")

if __name__ == "__main__":
    sys.exit(main() or 0)
