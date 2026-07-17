# Pixel Eternal 恶魔塔玩家模拟测试报告

- 测试时间：2026-07-15 10:15:21
- 测试楼层：[20]
- 测试职业：['warrior']
- 测试方式：Selenium 驱动真实游戏循环的启发式玩家，不等同于真实用户统计

## 总结

- 场景数：1
- 发现问题：1
- 阻断问题：0
- 严重问题：1

## 问题列表

### 1. [严重] FLOOR_TIMEOUT
- 楼层/职业：20 / warrior
- 描述：在限定时间内没有完成当前楼层
- 证据：`{"durationMs": 27833, "lastSnapshot": {"actionKeyState": {"attack": true, "interact": false, "moveDown": false, "moveLeft": true, "moveRight": false, "moveUp": false}, "cleared": false, "encounter": null, "floor": 20, "interactable": null, "map": {"battleZones": [{"height": 760, "id": "battle_zone_1", "index": 3, "label": "战斗区 1", "radius": 220, "width": 1160, "x": 1500, "y": 1000}], "branches": [], "exit": {"x": 1500, "y": 440}, "exitChoices": [{"x": 1500, "y": 440}, {"x": 2040.0000000000002, "y": 720}, {"x": 2040.0000000000002, "y": 1000}], "floor": 20, "hiddenSpaces": [], "hordeZone": {"height": 760, "id": "battle_zone_1", "index": 3, "label": "战斗区 1", "radius": 220, "width": 1160, "x": 1500, "y": 1000}, "mechanism": null, "obstacles": [], "route": [{"x": 1500, "y": 440}, {"x": 2040.0000000000002, "y": 720}, {"x": 2040.0000000000002, "y": 1000}, {"x": 1500, "y": 1000}, {"x": 960, "y":`

## 场景结果

- 楼层 20 / warrior：timeout，27833 ms
