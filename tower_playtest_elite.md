# Pixel Eternal 恶魔塔玩家模拟测试报告

- 测试时间：2026-07-14 16:31:01
- 测试楼层：[1]
- 测试职业：['warrior']
- 测试方式：Selenium 驱动真实游戏循环的启发式玩家，不等同于真实用户统计

## 总结

- 场景数：1
- 发现问题：1
- 阻断问题：0
- 严重问题：1

## 问题列表

### 1. [严重] EXIT_NOT_REACHED
- 楼层/职业：1 / warrior
- 描述：房间已经清场，但玩家在测试时限内没有到达顶部传送门
- 证据：`{"durationMs": 22365, "lastSnapshot": {"actionKeyState": {"attack": true, "interact": false, "moveDown": false, "moveLeft": false, "moveRight": true, "moveUp": true}, "cleared": true, "encounter": null, "floor": 1, "interactable": null, "map": {"branches": [], "exit": {"x": 900, "y": 210}, "floor": 1, "hordeZone": {"radius": 150, "x": 612, "y": 612}, "obstacles": [{"height": 34.7649501727894, "kind": "wall", "variantFloor": 1, "width": 125.54009784618394, "x": 132.1194331170991, "y": 265.3879960598424}, {"height": 32.76278274022043, "kind": "wall", "variantFloor": 1, "width": 113.75966229243205, "x": 1441.47031577304, "y": 832.8061306900346}, {"height": 72.54346746020019, "kind": "column", "variantFloor": 1, "width": 60.107444467023015, "x": 1102.7876270916313, "y": 673.4235773873515}, {"height": 52.325532663706696, "kind": "column", "variantFloor": 1, "width": 52.325532663706696, "x": 6`

## 场景结果

- 楼层 1 / warrior：cleared_waiting_portal，22365 ms
