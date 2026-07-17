# Pixel Eternal 恶魔塔玩家模拟测试报告

- 测试时间：2026-07-14 15:09:58
- 测试楼层：[1, 2]
- 测试职业：['warrior', 'mage', 'assassin']
- 测试方式：Selenium 驱动真实游戏循环的启发式玩家，不等同于真实用户统计

## 总结

- 场景数：6
- 发现问题：7
- 阻断问题：0
- 严重问题：7

## 问题列表

### 1. [严重] PLAYER_STUCK
- 楼层/职业：1 / warrior
- 描述：玩家连续多个决策周期持续输入移动但位置没有变化，疑似碰撞或位移卡墙
- 证据：`{"elapsedMs": 8944, "player": {"acceleration": 0.5, "friction": 0.7, "hp": 810, "isCastingSkill": false, "isDashing": false, "level": 31, "maxHp": 810, "maxSpeed": 3.66, "vx": 0, "vy": 3.6599999574601654, "x": 686.317569431099, "y": 580.0618141007556}, "keys": ["KeyA", "KeyS"], "streak": 4}`

### 2. [严重] EXIT_NOT_REACHED
- 楼层/职业：1 / warrior
- 描述：房间已经清场，但玩家在测试时限内没有到达顶部传送门
- 证据：`{"durationMs": 35247, "lastSnapshot": {"actionKeyState": {"attack": false, "interact": false, "moveDown": true, "moveLeft": true, "moveRight": false, "moveUp": false}, "cleared": true, "encounter": {"hordeSpawned": true, "routeWaveCleared": true}, "floor": 1, "interactable": null, "map": {"branches": [], "exit": {"x": 900, "y": 210}, "floor": 1, "hordeZone": {"radius": 150, "x": 612, "y": 612}, "obstacles": [{"height": 34.7649501727894, "kind": "wall", "variantFloor": 1, "width": 125.54009784618394, "x": 132.1194331170991, "y": 265.3879960598424}, {"height": 32.76278274022043, "kind": "wall", "variantFloor": 1, "width": 113.75966229243205, "x": 1441.47031577304, "y": 832.8061306900346}, {"height": 72.54346746020019, "kind": "column", "variantFloor": 1, "width": 60.107444467023015, "x": 1102.7876270916313, "y": 673.4235773873515}, {"height": 52.325532663706696, "kind": "column", "variantF`

### 3. [严重] EXIT_NOT_REACHED
- 楼层/职业：2 / warrior
- 描述：房间已经清场，但玩家在测试时限内没有到达顶部传送门
- 证据：`{"durationMs": 35127, "lastSnapshot": {"actionKeyState": {"attack": false, "interact": false, "moveDown": false, "moveLeft": false, "moveRight": false, "moveUp": false}, "cleared": true, "encounter": {"hordeSpawned": true, "routeWaveCleared": true}, "floor": 1, "interactable": null, "map": {"branches": [], "exit": {"x": 900, "y": 210}, "floor": 1, "hordeZone": {"radius": 150, "x": 612, "y": 612}, "obstacles": [{"height": 34.7649501727894, "kind": "wall", "variantFloor": 1, "width": 125.54009784618394, "x": 132.1194331170991, "y": 265.3879960598424}, {"height": 32.76278274022043, "kind": "wall", "variantFloor": 1, "width": 113.75966229243205, "x": 1441.47031577304, "y": 832.8061306900346}, {"height": 72.54346746020019, "kind": "column", "variantFloor": 1, "width": 60.107444467023015, "x": 1102.7876270916313, "y": 673.4235773873515}, {"height": 52.325532663706696, "kind": "column", "varian`

### 4. [严重] EXIT_NOT_REACHED
- 楼层/职业：1 / mage
- 描述：房间已经清场，但玩家在测试时限内没有到达顶部传送门
- 证据：`{"durationMs": 35324, "lastSnapshot": {"actionKeyState": {"attack": false, "interact": false, "moveDown": false, "moveLeft": false, "moveRight": false, "moveUp": false}, "cleared": true, "encounter": {"hordeSpawned": true, "routeWaveCleared": true}, "floor": 1, "interactable": null, "map": {"branches": [], "exit": {"x": 900, "y": 210}, "floor": 1, "hordeZone": {"radius": 150, "x": 612, "y": 612}, "obstacles": [{"height": 34.7649501727894, "kind": "wall", "variantFloor": 1, "width": 125.54009784618394, "x": 132.1194331170991, "y": 265.3879960598424}, {"height": 32.76278274022043, "kind": "wall", "variantFloor": 1, "width": 113.75966229243205, "x": 1441.47031577304, "y": 832.8061306900346}, {"height": 72.54346746020019, "kind": "column", "variantFloor": 1, "width": 60.107444467023015, "x": 1102.7876270916313, "y": 673.4235773873515}, {"height": 52.325532663706696, "kind": "column", "varian`

### 5. [严重] EXIT_NOT_REACHED
- 楼层/职业：2 / mage
- 描述：房间已经清场，但玩家在测试时限内没有到达顶部传送门
- 证据：`{"durationMs": 35501, "lastSnapshot": {"actionKeyState": {"attack": false, "interact": false, "moveDown": false, "moveLeft": false, "moveRight": false, "moveUp": false}, "cleared": true, "encounter": {"hordeSpawned": true, "routeWaveCleared": true}, "floor": 1, "interactable": null, "map": {"branches": [], "exit": {"x": 900, "y": 210}, "floor": 1, "hordeZone": {"radius": 150, "x": 612, "y": 612}, "obstacles": [{"height": 34.7649501727894, "kind": "wall", "variantFloor": 1, "width": 125.54009784618394, "x": 132.1194331170991, "y": 265.3879960598424}, {"height": 32.76278274022043, "kind": "wall", "variantFloor": 1, "width": 113.75966229243205, "x": 1441.47031577304, "y": 832.8061306900346}, {"height": 72.54346746020019, "kind": "column", "variantFloor": 1, "width": 60.107444467023015, "x": 1102.7876270916313, "y": 673.4235773873515}, {"height": 52.325532663706696, "kind": "column", "varian`

### 6. [严重] EXIT_NOT_REACHED
- 楼层/职业：1 / assassin
- 描述：房间已经清场，但玩家在测试时限内没有到达顶部传送门
- 证据：`{"durationMs": 35599, "lastSnapshot": {"actionKeyState": {"attack": false, "interact": false, "moveDown": false, "moveLeft": false, "moveRight": false, "moveUp": false}, "cleared": true, "encounter": {"hordeSpawned": true, "routeWaveCleared": true}, "floor": 1, "interactable": null, "map": {"branches": [], "exit": {"x": 900, "y": 210}, "floor": 1, "hordeZone": {"radius": 150, "x": 612, "y": 612}, "obstacles": [{"height": 34.7649501727894, "kind": "wall", "variantFloor": 1, "width": 125.54009784618394, "x": 132.1194331170991, "y": 265.3879960598424}, {"height": 32.76278274022043, "kind": "wall", "variantFloor": 1, "width": 113.75966229243205, "x": 1441.47031577304, "y": 832.8061306900346}, {"height": 72.54346746020019, "kind": "column", "variantFloor": 1, "width": 60.107444467023015, "x": 1102.7876270916313, "y": 673.4235773873515}, {"height": 52.325532663706696, "kind": "column", "varian`

### 7. [严重] EXIT_NOT_REACHED
- 楼层/职业：2 / assassin
- 描述：房间已经清场，但玩家在测试时限内没有到达顶部传送门
- 证据：`{"durationMs": 35719, "lastSnapshot": {"actionKeyState": {"attack": false, "interact": false, "moveDown": false, "moveLeft": false, "moveRight": false, "moveUp": false}, "cleared": true, "encounter": {"hordeSpawned": true, "routeWaveCleared": true}, "floor": 1, "interactable": null, "map": {"branches": [], "exit": {"x": 900, "y": 210}, "floor": 1, "hordeZone": {"radius": 150, "x": 612, "y": 612}, "obstacles": [{"height": 34.7649501727894, "kind": "wall", "variantFloor": 1, "width": 125.54009784618394, "x": 132.1194331170991, "y": 265.3879960598424}, {"height": 32.76278274022043, "kind": "wall", "variantFloor": 1, "width": 113.75966229243205, "x": 1441.47031577304, "y": 832.8061306900346}, {"height": 72.54346746020019, "kind": "column", "variantFloor": 1, "width": 60.107444467023015, "x": 1102.7876270916313, "y": 673.4235773873515}, {"height": 52.325532663706696, "kind": "column", "varian`

## 场景结果

- 楼层 1 / warrior：cleared_waiting_portal，35247 ms
- 楼层 2 / warrior：cleared_waiting_portal，35127 ms
- 楼层 1 / mage：cleared_waiting_portal，35324 ms
- 楼层 2 / mage：cleared_waiting_portal，35501 ms
- 楼层 1 / assassin：cleared_waiting_portal，35599 ms
- 楼层 2 / assassin：cleared_waiting_portal，35719 ms
