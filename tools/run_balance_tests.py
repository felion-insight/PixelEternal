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
from pathlib import Path

def print_banner():
    print("=" * 60)
    print("      Pixel Eternal - 全职业数值与机制平衡性自动化测试")
    print("=" * 60)

def main():
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
        return

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
            return

    # 配置 Chrome 选项
    chrome_options = Options()
    # chrome_options.add_argument("--headless") # 如果需要静默运行可以开启
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
        driver.execute_script("document.getElementById('start-screen').click();")
        time.sleep(1.5) # 等待淡出动画和游戏循环启动

        print("[信息] 正在进入技能实验场...", flush=True)
        sys.stdout.flush()
        driver.execute_script("if (window.game && typeof window.game.enterSkillLab === 'function') { window.game.enterSkillLab(); }")
        time.sleep(1.5)

        # 检查自动化测试脚本是否成功加载
        has_tester = driver.execute_script("return typeof window.AutomatedBalanceTester !== 'undefined';")
        if not has_tester:
            print("[错误] 未能在游戏内检测到 AutomatedBalanceTester 脚本，请确保 index.html 已正确引入该脚本。", flush=True)
            sys.stdout.flush()
            return

        print("[信息] 正在启动全职业自动化数值测试 (每个职业测试 5 秒，共 28 个职业，请稍候)...", flush=True)
        sys.stdout.flush()
        # 启动测试
        driver.execute_script("""
            window.AutomatedBalanceTester.startTest({
                duration: 5000,
                level: 60,
                infiniteResource: false
            });
        """)

        # 循环等待测试结束
        last_progress = -1
        while True:
            try:
                is_running = driver.execute_script("return window.AutomatedBalanceTester.isRunning;")
                if not is_running:
                    break
                
                # 获取当前测试进度
                current_idx = driver.execute_script("return window.AutomatedBalanceTester.currentClassIndex;")
                total_classes = driver.execute_script("return window.AutomatedBalanceTester.classesToTest.length;")
                
                if current_idx != last_progress and current_idx < total_classes:
                    class_name = driver.execute_script("return window.AutomatedBalanceTester.classesToTest[window.AutomatedBalanceTester.currentClassIndex].name;")
                    tier = driver.execute_script("return window.AutomatedBalanceTester.classesToTest[window.AutomatedBalanceTester.currentClassIndex].tier;")
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
        report_path = Path(__file__).parent.parent / "balance_test_report.md"
        with open(report_path, "w", encoding="utf-8") as f:
            f.write(markdown_report)
            
        print(f"[成功] 详细测试报告已保存至: {report_path.resolve()}", flush=True)
        print("\n" + "="*40 + " 简要 DPS 排行榜 " + "="*40, flush=True)
        
        # 打印简要排行榜
        results = driver.execute_script("return window.AutomatedBalanceTester.results;")
        for idx, r in enumerate(results):
            print(f" {idx+1:2d}. {r['classInfo']['name']:<10} ({r['classInfo']['tier']:<4}) | DPS: {int(r['dps']):,}", flush=True)
        print("="*97, flush=True)

    except Exception as e:
        print(f"[错误] 自动化测试运行中发生异常: {e}")
    finally:
        if driver:
            driver.quit()
            print("[信息] 浏览器已关闭。")
        if server_process:
            server_process.terminate()
            print("[信息] 自动启动的本地服务器已关闭。")

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
    main()
