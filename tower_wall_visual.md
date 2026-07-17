# Pixel Eternal 恶魔塔玩家模拟测试报告

- 测试时间：2026-07-15 11:31:38
- 测试楼层：[1]
- 测试职业：['warrior']
- 测试方式：Selenium 驱动真实游戏循环的启发式玩家，不等同于真实用户统计

## 总结

- 场景数：1
- 发现问题：1
- 阻断问题：0
- 严重问题：1

## 问题列表

### 1. [严重] FLOOR_TIMEOUT
- 楼层/职业：1 / warrior
- 描述：在限定时间内没有完成当前楼层
- 证据：`{"durationMs": 11685, "lastSnapshot": {"actionKeyState": {"attack": true, "interact": false, "moveDown": false, "moveLeft": false, "moveRight": true, "moveUp": true}, "cleared": false, "encounter": {"branchCleared": [false, false], "branchPortalSpawned": [false, false], "hordeSpawned": true, "routeWaveCleared": true}, "floor": 1, "interactable": null, "map": {"battleZones": [{"height": 600, "id": "battle_zone_1", "index": 1, "label": "战斗区 1", "radius": 124, "width": 900, "x": 1709.9999999999998, "y": 1340}, {"height": 600, "id": "battle_zone_2", "index": 2, "label": "战斗区 2", "radius": 124, "width": 900, "x": 2040.0000000000002, "y": 1340}, {"height": 600, "id": "battle_zone_3", "index": 3, "label": "战斗区 3", "radius": 124, "width": 900, "x": 2040.0000000000002, "y": 1450}], "branchBattleZones": [{"branchIndex": 0, "height": 460, "id": "exit_branch_1_battle", "radius": 155, "width": 680, "`

## 场景结果

- 楼层 1 / warrior：timeout，11685 ms
