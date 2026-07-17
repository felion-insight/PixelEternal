#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pixel Eternal 恶魔塔启发式玩家模拟测试器。

该工具使用 Selenium 驱动真实浏览器中的游戏循环，不直接修改游戏规则。
它模拟一个会沿路线前进、接近怪物、攻击、到达波次区域并寻找传送门的普通玩家，
然后根据完整时间线输出可定位的问题报告。
"""

from __future__ import annotations

import argparse
import json
import math
import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


ROOT = Path(__file__).resolve().parent.parent


def parse_floor_range(value: str) -> List[int]:
    result: List[int] = []
    for part in value.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            start, end = (int(x) for x in part.split("-", 1))
            result.extend(range(min(start, end), max(start, end) + 1))
        else:
            result.append(int(part))
    return sorted(set(max(1, floor) for floor in result))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="恶魔塔真实浏览器玩家模拟测试")
    parser.add_argument("--floors", default="1-3", help="测试楼层，例如 1-3 或 1,10,40")
    parser.add_argument("--classes", default="warrior", help="职业 ID，逗号分隔")
    parser.add_argument("--repeats", type=int, default=1, help="每个职业/楼层重复次数")
    parser.add_argument("--timeout", type=float, default=90.0, help="单个楼层最长测试秒数")
    parser.add_argument("--level", type=int, default=30, help="模拟玩家等级")
    parser.add_argument("--room-type", choices=("battle", "elite", "boss", "gap_shop"), default="battle",
                        help="测试房间类型，默认 battle")
    parser.add_argument("--headless", action="store_true", help="无头运行 Chrome")
    parser.add_argument("--server-port", type=int, default=8000, help="本地游戏服务器端口")
    parser.add_argument("--json-output", default="tower_playtest_report.json")
    parser.add_argument("--markdown-output", default="tower_playtest_report.md")
    parser.add_argument("--screenshots", default="", help="问题截图目录，留空则不保存")
    return parser.parse_args()


def point_distance(a: Dict[str, Any], b: Dict[str, Any]) -> float:
    return math.hypot(float(a.get("x", 0)) - float(b.get("x", 0)),
                      float(a.get("y", 0)) - float(b.get("y", 0)))


def distance_to_segment(point: Dict[str, Any], start: Dict[str, Any], end: Dict[str, Any]) -> float:
    px, py = float(point["x"]), float(point["y"])
    ax, ay = float(start["x"]), float(start["y"])
    bx, by = float(end["x"]), float(end["y"])
    dx, dy = bx - ax, by - ay
    length_sq = dx * dx + dy * dy
    if length_sq <= 0.0001:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length_sq))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def distance_to_route(point: Dict[str, Any], route: Sequence[Dict[str, Any]]) -> float:
    if not route:
        return float("inf")
    if len(route) == 1:
        return point_distance(point, route[0])
    return min(distance_to_segment(point, route[i], route[i + 1])
               for i in range(len(route) - 1))


def execute_key(driver: Any, code: str, pressed: bool) -> None:
    driver.execute_script(
        """
        window.dispatchEvent(new KeyboardEvent(arguments[1] ? 'keydown' : 'keyup', {
            code: arguments[0],
            key: arguments[0],
            bubbles: true,
            cancelable: true
        }));
        """,
        code,
        pressed,
    )


def set_action(driver: Any, action: str, pressed: bool) -> None:
    driver.execute_script(
        """
        if (window.game && window.KeybindSystem
            && typeof window.KeybindSystem.setActionPressed === 'function') {
            window.KeybindSystem.setActionPressed(window.game, arguments[0], !!arguments[1]);
        }
        """,
        action,
        pressed,
    )


def set_legacy_key(driver: Any, key: str, pressed: bool) -> None:
    driver.execute_script(
        """
        if (window.game && window.game.keys) {
            window.game.keys[arguments[0]] = !!arguments[1];
        }
        """,
        key,
        pressed,
    )


def release_all(driver: Any) -> None:
    for code in ("KeyW", "KeyA", "KeyS", "KeyD", "KeyJ", "KeyE", "Digit1", "Digit2"):
        execute_key(driver, code, False)
    for action in ("moveUp", "moveDown", "moveLeft", "moveRight", "attack", "interact"):
        set_action(driver, action, False)
    for key in ("w", "a", "s", "d", "j", "e"):
        set_legacy_key(driver, key, False)


def set_class(driver: Any, class_id: str, level: int) -> None:
    driver.execute_script(
        """
        const p = window.game && window.game.player;
        if (!p) return false;
        const classMap = {
            warrior: {baseClass: 'warrior'},
            archer: {baseClass: 'archer'},
            mage: {baseClass: 'mage'},
            assassin: {baseClass: 'assassin'},
            knight: {baseClass: 'warrior', firstAdvancement: 'knight'},
            ranger: {baseClass: 'archer', firstAdvancement: 'ranger'},
            wizard: {baseClass: 'mage', firstAdvancement: 'wizard'},
            shadowdancer: {baseClass: 'assassin', firstAdvancement: 'shadowdancer'}
        };
        const data = classMap[arguments[0]] || {baseClass: arguments[0]};
        if (typeof window.applySkillLabPlayerConfig === 'function') {
            window.applySkillLabPlayerConfig(p, data, arguments[1]);
        } else {
            p.classData = typeof window.normalizeClassData === 'function'
                ? window.normalizeClassData(data) : data;
            p.level = arguments[1];
            if (typeof p.updateStats === 'function') p.updateStats();
        }
        p.hp = p.maxHp;
        return true;
        """,
        class_id,
        level,
    )


def get_snapshot(driver: Any) -> Optional[Dict[str, Any]]:
    return driver.execute_script(
        """
        if (!window.game || typeof window.game.getTowerPlaytestSnapshot !== 'function') {
            return null;
        }
        return window.game.getTowerPlaytestSnapshot();
        """
    )


def enter_tower(driver: Any, floor: int, class_id: str, level: int, room_type: str) -> None:
    release_all(driver)
    driver.execute_script(
        """
        const g = window.game;
        if (g && g.currentScene !== 'town' && typeof g.returnToTown === 'function') {
            g.returnToTown();
        }
        if (g) {
            g.floor = arguments[0];
            g.lastDeathFloor = arguments[0];
            g.hasClearedFloor = false;
        }
        """,
        floor,
    )
    set_class(driver, class_id, level)
    driver.execute_script(
        """
        if (window.game && typeof window.game.enterTower === 'function') {
            window.game.enterTower();
        }
        """
    )
    if room_type != "battle":
        driver.execute_script(
            """
            if (window.game && typeof window.game.generateNewRoom === 'function') {
                window.game.generateNewRoom(arguments[0]);
            }
            """,
            room_type,
        )
    time.sleep(0.6)


def choose_target(snapshot: Dict[str, Any], route_progress: Optional[int] = None) -> Tuple[Optional[Dict[str, Any]], str]:
    player = snapshot.get("player") or {}
    encounter = snapshot.get("encounter") or {}
    monsters = [m for m in snapshot.get("monsters", [])
                if float(m.get("hp", 0)) > 0]
    if monsters:
        nearest = min(monsters, key=lambda monster: point_distance(player, monster))
        if point_distance(player, nearest) < 420:
            return nearest, "fight"

    interactable = snapshot.get("interactable")
    if interactable:
        return interactable, "interact"

    if encounter and not encounter.get("hordeSpawned"):
        zone = (snapshot.get("map") or {}).get("hordeZone")
        if zone and encounter.get("routeWaveCleared"):
            return zone, "horde_zone"

    portals = [p for p in snapshot.get("portals", []) if p.get("type") == "next"]
    if snapshot.get("cleared") and portals:
        portal = min(portals, key=lambda candidate: point_distance(player, candidate))
        # 清场后仍需沿主路线走到顶部，不能从开阔区直线穿过路线闸门。
        if point_distance(player, portal) < 135:
            return portal, "portal"

    route = (snapshot.get("map") or {}).get("route") or []
    if route:
        if route_progress is not None:
            index = max(0, min(len(route) - 1, route_progress))
            return route[index], "route"
        # 后备策略：路线按顶部到下部存储，玩家从底部向顶部推进。
        candidates = [point for point in route if float(point["y"]) < float(player["y"]) - 35]
        return (max(candidates, key=lambda point: point["y"]) if candidates else route[0]), "route"
    return None, "idle"


def move_towards(driver: Any, player: Dict[str, Any], target: Dict[str, Any]) -> List[str]:
    dx = float(target.get("x", 0)) - float(player.get("x", 0))
    dy = float(target.get("y", 0)) - float(player.get("y", 0))
    pressed: List[str] = []
    if abs(dx) > 22:
        pressed.append("KeyD" if dx > 0 else "KeyA")
    if abs(dy) > 22:
        pressed.append("KeyS" if dy > 0 else "KeyW")
    action_by_code = {
        "KeyW": "moveUp",
        "KeyA": "moveLeft",
        "KeyS": "moveDown",
        "KeyD": "moveRight",
    }
    for code, action in action_by_code.items():
        set_action(driver, action, code in pressed)
    for code, key in (("KeyW", "w"), ("KeyA", "a"), ("KeyS", "s"), ("KeyD", "d")):
        set_legacy_key(driver, key, code in pressed)
    return pressed


def play_episode(driver: Any, floor: int, class_id: str, args: argparse.Namespace) -> Dict[str, Any]:
    enter_tower(driver, floor, class_id, args.level, args.room_type)
    started = time.time()
    snapshots: List[Dict[str, Any]] = []
    actions: List[Dict[str, Any]] = []
    result = "timeout"
    screenshot_path = None
    route_progress: Optional[int] = None
    selected_branch = 0
    branch_progress = 1
    branch_active = False

    while time.time() - started < args.timeout:
        snapshot = get_snapshot(driver)
        if not snapshot:
            result = "telemetry_unavailable"
            break
        snapshot["elapsedMs"] = int((time.time() - started) * 1000)
        snapshots.append(snapshot)
        if snapshot.get("scene") != "tower":
            result = "left_tower"
            break
        player = snapshot.get("player") or {}
        if float(player.get("hp", 1)) <= 0:
            result = "player_dead"
            break

        set_action(driver, "attack", False)
        set_action(driver, "interact", False)
        set_legacy_key(driver, "j", False)
        set_legacy_key(driver, "e", False)
        route = (snapshot.get("map") or {}).get("route") or []
        if route_progress is None and route:
            route_progress = max(0, len(route) - 2)
        encounter = snapshot.get("encounter") or {}
        horde_zone = (snapshot.get("map") or {}).get("hordeZone")
        if encounter.get("hordeSpawned") and route:
            horde_index = min(
                range(len(route)),
                key=lambda index: point_distance(route[index], horde_zone)
            ) if horde_zone else len(route) // 2
            route_progress = min(route_progress if route_progress is not None else horde_index,
                                 horde_index)
        if route_progress is not None and route:
            route_point = route[route_progress]
            if point_distance(player, route_point) < 55 and route_progress > 0:
                route_progress -= 1
        target, mode = choose_target(snapshot, route_progress)
        exit_branches = (snapshot.get("map") or {}).get("exitBranches") or []
        if exit_branches:
            selected_branch %= len(exit_branches)
            branch_path = exit_branches[selected_branch]
            anchor_index = min(
                range(len(route)),
                key=lambda index: point_distance(route[index], branch_path[0])
            ) if route else 0
            if route_progress is not None and route_progress <= anchor_index:
                branch_active = True
            if branch_active:
                branch_portal = next((
                    portal for portal in snapshot.get("portals", [])
                    if portal.get("type") == "next"
                    and portal.get("towerBranchIndex") == selected_branch
                ), None)
                branch_monsters = [
                    monster for monster in snapshot.get("monsters", [])
                    if float(monster.get("hp", 0)) > 0
                    and monster.get("towerExitBranchIndex") == selected_branch
                ]
                if branch_monsters:
                    nearest_branch_monster = min(
                        branch_monsters,
                        key=lambda monster: point_distance(player, monster)
                    )
                    if point_distance(player, nearest_branch_monster) < 420:
                        target, mode = nearest_branch_monster, "fight"
                    else:
                        branch_progress = max(1, min(branch_progress, len(branch_path) - 1))
                        if point_distance(player, branch_path[branch_progress]) < 60:
                            branch_progress = min(len(branch_path) - 1, branch_progress + 1)
                        target, mode = branch_path[branch_progress], "branch_route"
                elif branch_portal:
                    target, mode = branch_portal, "portal"
                else:
                    branch_progress = max(1, min(branch_progress, len(branch_path) - 1))
                    if point_distance(player, branch_path[branch_progress]) < 60:
                        branch_progress = min(len(branch_path) - 1, branch_progress + 1)
                    target, mode = branch_path[branch_progress], "branch_route"
        pressed = []
        if target:
            pressed = move_towards(driver, player, target)
            if mode == "fight":
                nearest = min(
                    [m for m in snapshot.get("monsters", []) if float(m.get("hp", 0)) > 0],
                    key=lambda monster: point_distance(player, monster),
                    default=None,
                )
                if nearest and point_distance(player, nearest) < 420:
                    set_action(driver, "attack", True)
                    set_legacy_key(driver, "j", True)
                    pressed.append("KeyJ")
            if mode == "portal" and point_distance(player, target) < 110:
                set_action(driver, "interact", True)
                set_legacy_key(driver, "e", True)
                pressed.append("KeyE")
            if mode == "interact" and point_distance(player, target) < 110:
                set_action(driver, "interact", True)
                set_legacy_key(driver, "e", True)
                pressed.append("KeyE")
        else:
            release_all(driver)
        actions.append({
            "elapsedMs": snapshot["elapsedMs"],
            "mode": mode,
            "target": target,
            "keys": pressed,
        })
        time.sleep(0.18)

        latest = get_snapshot(driver)
        if latest and latest.get("floor", floor) > floor:
            result = "next_floor"
            snapshots.append(latest)
            break

    release_all(driver)
    final = snapshots[-1] if snapshots else {}
    if result == "timeout" and final.get("cleared"):
        result = "cleared_waiting_portal"
    if args.screenshots and result not in ("next_floor", "cleared_waiting_portal"):
        Path(args.screenshots).mkdir(parents=True, exist_ok=True)
        screenshot_path = str(Path(args.screenshots) / f"{class_id}_floor_{floor}_{int(started)}.png")
        driver.save_screenshot(screenshot_path)
    return {
        "floor": floor,
        "classId": class_id,
        "result": result,
        "durationMs": int((time.time() - started) * 1000),
        "snapshots": snapshots,
        "actions": actions,
        "screenshot": screenshot_path,
    }


def add_issue(issues: List[Dict[str, Any]], severity: str, code: str,
              message: str, episode: Dict[str, Any], evidence: Dict[str, Any]) -> None:
    issues.append({
        "severity": severity,
        "code": code,
        "message": message,
        "floor": episode["floor"],
        "classId": episode["classId"],
        "evidence": evidence,
    })


def analyze_episode(episode: Dict[str, Any]) -> List[Dict[str, Any]]:
    issues: List[Dict[str, Any]] = []
    samples = episode.get("snapshots", [])
    if not samples:
        add_issue(issues, "阻断", "NO_SNAPSHOTS", "没有采集到恶魔塔状态快照", episode, {})
        return issues
    first = samples[0]
    player = first.get("player") or {}
    map_data = first.get("map") or {}
    start = map_data.get("start")
    exit_point = map_data.get("exit")
    if start and point_distance(player, start) > 90:
        add_issue(issues, "严重", "BAD_SPAWN", "玩家没有出生在地图入口附近", episode,
                  {"player": player, "start": start})
    for sample in samples:
        if any(portal.get("type") == "exit" for portal in sample.get("portals", [])):
            add_issue(issues, "阻断", "TOWER_EXIT_AT_RUNTIME",
                      "恶魔塔房间出现返回主城传送门，可能与出生点抢占交互键",
                      episode, {"elapsedMs": sample.get("elapsedMs"), "portals": sample.get("portals")})
            break

    route = map_data.get("route") or []
    route_width = float(map_data.get("routeWidth") or 96)
    branches = map_data.get("branches") or []
    exit_branches = map_data.get("exitBranches") or []
    all_routes = [route] + [branch for branch in branches if branch]
    exit_choices = map_data.get("exitChoices") or []
    if first.get("roomType") == "battle" and len(exit_choices) < 2:
        add_issue(issues, "体验", "MULTI_EXIT_MISSING",
                  "普通房间没有提供多个可选择的下一层出口",
                  episode, {"exitChoices": exit_choices})
    if first.get("roomType") == "battle":
        simple_exit_branches = [
            branch for branch in exit_branches
            if len(branch) < 6
            or sum(point_distance(branch[index], branch[index + 1])
                   for index in range(len(branch) - 1)) < 700
        ]
        if simple_exit_branches:
            add_issue(issues, "体验", "EXIT_BRANCH_TOO_SIMPLE",
                      "出口岔路过短或转折过少，没有形成有效的路线选择",
                      episode, {"branches": simple_exit_branches})
    for sample in samples:
        for portal in sample.get("portals", []):
            if portal.get("type") != "next":
                continue
            portal_distance = min(
                (distance_to_route(portal, candidate) for candidate in all_routes if candidate),
                default=float("inf")
            )
            if portal_distance > route_width * 2.8 + 80:
                add_issue(issues, "严重", "PORTAL_OFF_ROUTE",
                          "下一层传送门没有落在主路或分岔路附近，可能无法到达",
                          episode, {"portal": portal, "distance": portal_distance})
                break
    off_route = []
    for sample in samples:
        point = sample.get("player")
        if point and distance_to_route(point, route) > route_width * 2.4 + 70:
            off_route.append({"elapsedMs": sample.get("elapsedMs"), "player": point})
    if len(off_route) > max(3, len(samples) // 4):
        add_issue(issues, "体验", "ROUTE_UNCLEAR",
                  "玩家模拟器长时间偏离主路线，路线引导或障碍边界可能不清晰",
                  episode, {"offRouteSamples": off_route[:8], "count": len(off_route)})

    horde_zone = map_data.get("hordeZone")
    initial_encounter = first.get("encounter") or {}
    if horde_zone and first.get("roomType") == "battle":
        if not initial_encounter.get("hordeSpawned"):
            add_issue(issues, "严重", "HORDE_NOT_PRESPAWNED",
                      "进入战斗房间时主波次尚未生成，不符合预生成刷怪规则",
                      episode, {"initialEncounter": initial_encounter})
        else:
            horde_monsters = [
                monster for monster in first.get("monsters", [])
                if point_distance(monster, horde_zone) <= float(horde_zone.get("radius", 150)) + 80
            ]
            if not horde_monsters:
                add_issue(issues, "严重", "HORDE_ZONE_EMPTY",
                          "主波次标记为已生成，但开阔区域没有对应怪物",
                          episode, {"hordeZone": horde_zone, "monsters": first.get("monsters", [])})

    branch_zones = map_data.get("branchBattleZones") or []
    if first.get("roomType") == "battle":
        for zone in branch_zones:
            branch_index = zone.get("branchIndex")
            branch_monsters = [
                monster for monster in first.get("monsters", [])
                if monster.get("towerExitBranchIndex") == branch_index
            ]
            if not branch_monsters:
                add_issue(issues, "严重", "BRANCH_BATTLE_EMPTY",
                          "出口岔路没有预生成独立战斗敌人",
                          episode, {"zone": zone})
        for sample in samples:
            branch_cleared = (sample.get("encounter") or {}).get("branchCleared") or []
            for portal in sample.get("portals", []):
                branch_index = portal.get("towerBranchIndex")
                if branch_index is not None and (
                    branch_index >= len(branch_cleared) or not branch_cleared[branch_index]
                ):
                    add_issue(issues, "阻断", "BRANCH_PORTAL_EARLY",
                              "岔路战斗尚未清空就提前生成了对应传送门",
                              episode, {"portal": portal, "branchCleared": branch_cleared})
                    break

    stuck_streak = 0
    for previous, current in zip(samples, samples[1:]):
        p0, p1 = previous.get("player") or {}, current.get("player") or {}
        if not p0 or not p1:
            continue
        moved = point_distance(p0, p1)
        keys = next((a.get("keys", []) for a in episode.get("actions", [])
                     if a.get("elapsedMs") == previous.get("elapsedMs")), [])
        if keys and any(key in keys for key in ("KeyW", "KeyA", "KeyS", "KeyD")) and moved < 1.0:
            if not p1.get("isDashing") and not p1.get("isCastingSkill"):
                stuck_streak += 1
            else:
                stuck_streak = 0
        else:
            stuck_streak = 0
        if stuck_streak >= 4:
            add_issue(issues, "严重", "PLAYER_STUCK",
                      "玩家连续多个决策周期持续输入移动但位置没有变化，疑似碰撞或位移卡墙",
                      episode, {"elapsedMs": current.get("elapsedMs"), "player": p1, "keys": keys,
                                "streak": stuck_streak})
            break

    if episode.get("result") == "timeout":
        add_issue(issues, "严重", "FLOOR_TIMEOUT",
                  "在限定时间内没有完成当前楼层", episode,
                  {"durationMs": episode.get("durationMs"), "lastSnapshot": samples[-1]})
    if episode.get("result") == "cleared_waiting_portal":
        add_issue(issues, "严重", "EXIT_NOT_REACHED",
                  "房间已经清场，但玩家在测试时限内没有到达顶部传送门",
                  episode, {"durationMs": episode.get("durationMs"),
                            "lastSnapshot": samples[-1]})
    if episode.get("result") == "left_tower":
        add_issue(issues, "阻断", "UNEXPECTED_EXIT",
                  "玩家模拟过程中离开恶魔塔", episode, {"lastSnapshot": samples[-1]})
    return issues


def make_markdown(report: Dict[str, Any]) -> str:
    lines = [
        "# Pixel Eternal 恶魔塔玩家模拟测试报告",
        "",
        f"- 测试时间：{time.strftime('%Y-%m-%d %H:%M:%S')}",
        f"- 测试楼层：{report['config']['floors']}",
        f"- 测试职业：{report['config']['classes']}",
        "- 测试方式：Selenium 驱动真实游戏循环的启发式玩家，不等同于真实用户统计",
        "",
        "## 总结",
        "",
        f"- 场景数：{len(report['episodes'])}",
        f"- 发现问题：{len(report['issues'])}",
        f"- 阻断问题：{sum(1 for i in report['issues'] if i['severity'] == '阻断')}",
        f"- 严重问题：{sum(1 for i in report['issues'] if i['severity'] == '严重')}",
        "",
        "## 问题列表",
        "",
    ]
    if not report["issues"]:
        lines.append("本轮没有发现符合规则的问题。建议扩大楼层、职业和重复次数后继续测试。")
    else:
        for index, issue in enumerate(report["issues"], 1):
            lines.extend([
                f"### {index}. [{issue['severity']}] {issue['code']}",
                f"- 楼层/职业：{issue['floor']} / {issue['classId']}",
                f"- 描述：{issue['message']}",
                f"- 证据：`{json.dumps(issue['evidence'], ensure_ascii=False)[:900]}`",
                "",
            ])
    lines.extend(["## 场景结果", ""])
    for episode in report["episodes"]:
        lines.append(
            f"- 楼层 {episode['floor']} / {episode['classId']}："
            f"{episode['result']}，{episode['durationMs']} ms"
        )
    return "\n".join(lines) + "\n"


def create_driver(headless: bool) -> Any:
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
    except ImportError as exc:
        raise RuntimeError("未安装 Selenium，请执行 pip install selenium") from exc
    options = Options()
    options.add_argument("--mute-audio")
    options.add_argument("--window-size=1280,800")
    if headless:
        options.add_argument("--headless=new")
    return webdriver.Chrome(options=options)


def is_server_running(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.4)
        try:
            sock.connect(("127.0.0.1", port))
            return True
        except OSError:
            return False


def main() -> int:
    args = parse_args()
    floors = parse_floor_range(args.floors)
    classes = [item.strip() for item in args.classes.split(",") if item.strip()]
    server_process = None
    driver = None
    try:
        if not is_server_running(args.server_port):
            env = os.environ.copy()
            env["PORT"] = str(args.server_port)
            server_process = subprocess.Popen(
                [sys.executable, "start-server.py"],
                cwd=str(ROOT),
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            time.sleep(2.5)
        driver = create_driver(args.headless)
        from selenium.webdriver.common.by import By

        driver.get(f"http://127.0.0.1:{args.server_port}/index.html")
        load_deadline = time.time() + 45
        while time.time() < load_deadline:
            ready = driver.execute_script(
                """
                const loading = document.getElementById('loading-screen');
                const start = document.getElementById('start-screen');
                return document.readyState === 'complete'
                    && start
                    && getComputedStyle(start).display !== 'none'
                    && (!loading || getComputedStyle(loading).display === 'none'
                        || getComputedStyle(loading).visibility === 'hidden');
                """
            )
            if ready:
                break
            time.sleep(0.25)
        else:
            raise RuntimeError("游戏资源或启动界面没有准备完成")
        driver.find_element(By.ID, "start-screen").click()
        loop_deadline = time.time() + 12
        while time.time() < loop_deadline:
            if driver.execute_script("return !!(window.game && window.game._gameLoopStarted);"):
                break
            time.sleep(0.25)
        else:
            raise RuntimeError("游戏循环没有启动，无法进行真实玩家模拟")
        driver.execute_script(
            """
            ['class-select-modal', 'first-time-guide-modal', 'player-name-modal']
                .forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.classList.remove('show');
                });
            if (window.game) window.game.paused = false;
            """
        )
        time.sleep(0.5)

        episodes: List[Dict[str, Any]] = []
        for class_id in classes:
            for floor in floors:
                for _ in range(max(1, args.repeats)):
                    print(f"[测试] floor={floor}, class={class_id}", flush=True)
                    episode = play_episode(driver, floor, class_id, args)
                    episodes.append(episode)

        report: Dict[str, Any] = {
            "config": {
                "floors": floors,
                "classes": classes,
                "repeats": args.repeats,
                "timeoutSeconds": args.timeout,
                "level": args.level,
                "roomType": args.room_type,
            },
            "episodes": episodes,
            "issues": [],
        }
        for episode in episodes:
            report["issues"].extend(analyze_episode(episode))
        json_path = Path(args.json_output)
        if not json_path.is_absolute():
            json_path = ROOT / json_path
        md_path = Path(args.markdown_output)
        if not md_path.is_absolute():
            md_path = ROOT / md_path
        json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        md_path.write_text(make_markdown(report), encoding="utf-8")
        print(f"[完成] JSON: {json_path}", flush=True)
        print(f"[完成] Markdown: {md_path}", flush=True)
        return 0 if not any(i["severity"] == "阻断" for i in report["issues"]) else 2
    except Exception as exc:
        print(f"[错误] 恶魔塔测试失败：{exc}", file=sys.stderr)
        return 1
    finally:
        if driver:
            release_all(driver)
            driver.quit()
        if server_process:
            server_process.terminate()


if __name__ == "__main__":
    raise SystemExit(main())
