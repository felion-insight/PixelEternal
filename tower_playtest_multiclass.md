# Pixel Eternal 恶魔塔玩家模拟测试报告

- 测试时间：2026-07-14 14:54:36
- 测试楼层：[1, 2]
- 测试职业：['warrior', 'mage', 'assassin']
- 测试方式：Selenium 驱动真实游戏循环的启发式玩家，不等同于真实用户统计

## 总结

- 场景数：6
- 发现问题：1
- 阻断问题：0
- 严重问题：1

## 问题列表

### 1. [严重] PLAYER_STUCK
- 楼层/职业：2 / warrior
- 描述：玩家持续输入移动但位置没有变化，疑似碰撞或位移卡墙
- 证据：`{"elapsedMs": 7103, "player": {"acceleration": 0.5, "friction": 0.7, "hp": 723, "isCastingSkill": false, "isDashing": false, "level": 30, "maxHp": 788, "maxSpeed": 3.6479999999999997, "vx": 2.3728051786151925, "vy": -2.3728046957067153, "x": 1234.2370866881777, "y": 594.9680973962797}, "keys": ["KeyA", "KeyW"]}`

## 场景结果

- 楼层 1 / warrior：next_floor，10170 ms
- 楼层 2 / warrior：cleared_waiting_portal，20215 ms
- 楼层 1 / mage：next_floor，435 ms
- 楼层 2 / mage：cleared_waiting_portal，20320 ms
- 楼层 1 / assassin：next_floor，1197 ms
- 楼层 2 / assassin：cleared_waiting_portal，20379 ms
