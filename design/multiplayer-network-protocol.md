# 《Pixel Eternal》联机扩展 — 服务端→客户端数据包设计

**文档版本**：v2.1  
**生成日期**：2026年6月14日  
**前提**：基于全部 7 份 design 文档的系统设计  
**架构**：C/S 权威服务器模型（Server-Authoritative），服务器为单一可信源  
**v2.0 新增**：完整的二进制/JSON线格式定义、消息类型ID枚举、逐字段编码规格、序列化参考实现、带宽预算  
**v2.1 新增**：服务端间BLOB通信协议（Gateway/Game/DB/Lobby/Dungeon/Town 全链路二进制BLOB互发，含玩家存档BLOB结构、C++ Codec参考实现、DB Proxy极简设计）  

---

## 目录

1. [总览与设计原则](#1-总览与设计原则)
2. [连接与会话层](#2-连接与会话层)
3. [大厅与队伍管理](#3-大厅与队伍管理)
4. [玩家状态同步](#4-玩家状态同步)
5. [战斗系统](#5-战斗系统)
6. [技能系统](#6-技能系统)
7. [装备与背包](#7-装备与背包)
8. [强化·突破·觉醒](#8-强化突破觉醒)
9. [徽记系统](#9-徽记系统)
10. [副本与房间管理](#10-副本与房间管理)
11. [剧情叙事](#11-剧情叙事)
12. [天赋与转职](#12-天赋与转职)
13. [经济与交易](#13-经济与交易)
14. [NPC 交互](#14-npc-交互)
15. [社交与聊天](#15-社交与聊天)
16. [排行榜与统计](#16-排行榜与统计)
17. [全局广播与事件](#17-全局广播与事件)
18. [错误与校验](#18-错误与校验)
19. [包格式总览](#19-包格式总览)
20. [二进制协议线格式](#20-二进制协议线格式binary-wire-format)
21. [消息类型ID完整枚举](#21-消息类型-id-完整枚举)
22. [高频消息完整二进制编码规格](#22-高频消息完整二进制编码规格)
23. [低频消息JSON Schema定义](#23-低频消息-json-schema-定义)
24. [序列化/反序列化参考实现](#24-序列化反序列化参考实现)
25. [带宽预算估算](#25-带宽预算估算)
26. [服务端间BLOB通信协议](#26-服务端间blob通信协议)



## 1. 总览与设计原则

### 1.1 核心原则

| 原则 | 说明 |
|------|------|
| **服务器权威** | 所有关键逻辑（伤害计算、掉落判定、强化结果、转职）在服务端执行，客户端只做表现和预测 |
| **增量同步** | 优先发送变化的数据，非全量快照 |
| **重要性分级** | 关键状态走 TCP/可靠UDP，非关键（移动插值）走轻量UDP |
| **向后兼容** | 所有包带 version 字段，支持协议演进 |
| **防作弊** | 服务器校验所有客户端声称的行为（伤害、位置、消耗） |

### 1.2 连接模型

```
单服架构（初期）：
  玩家 → Gateway 网关（WebSocket/TCP长连接）
       → Game Server（逻辑）
       → DB Proxy（持久化）

扩展架构（后期分服）：
  玩家 → Gateway → Lobby Server（大厅）
                  → Dungeon Server（副本实例，每副本独立进程）
                  → Town Server（主城，共享大世界）
```

### 1.3 包基本结构

```json
{
  "t": "MSG_TYPE",        // 消息类型（见下文各分类）
  "s": 1234567890,        // 服务器时间戳（毫秒）
  "v": 1,                 // 协议版本
  "d": { ... }            // 载荷（按类型变化）
}
```

> **注意**：下文仅列举 `t`（消息类型）和 `d`（载荷字段），省略 `s`/`v` 公共字段。



## 2. 连接与会话层

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_AUTH_RESULT` | 客户端登录请求后 | `{success, playerId, sessionToken, reason?}` |
| `S2C_KICK` | 被管理员踢出 / 多端登录挤下线 | `{reason, byAdmin}` |
| `S2C_HEARTBEAT` | 定期（15-30s） | `{serverTime}` |
| `S2C_RECONNECT_OK` | 断线重连成功，恢复上下文 | `{seqNo, snapshot:{...全量状态快照...}}` |
| `S2C_RECONNECT_FAIL` | 重连失败（会话过期） | `{reason}` |
| `S2C_VERSION_CHECK` | 登录时版本校验 | `{requiredVersion, downloadUrl?}` |

### 2.1 断线重连场景

玩家在副本中断线 → 服务端保留该副本实例 N 秒 → 客户端重连后发送 `S2C_RECONNECT_OK` 包含：
- 当前所在副本/层/房间
- 自身 HP/MP/技能冷却/Buff 状态
- 房间内所有实体的位置/HP 快照
- 掉落的未拾取物品列表



## 3. 大厅与队伍管理

### 3.1 队伍生命周期

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_PARTY_INFO` | 进入/更新队伍信息 | `{partyId, leaderId, members:[{playerId, name, level, class, ready}], maxSize, isPrivate, dungeonId?}` |
| `S2C_PARTY_MEMBER_JOIN` | 成员加入 | `{playerId, name, level, class}` |
| `S2C_PARTY_MEMBER_LEAVE` | 成员离开/被踢 | `{playerId, reason}` |
| `S2C_PARTY_LEADER_CHANGE` | 队长转移 | `{newLeaderId}` |
| `S2C_PARTY_DISBAND` | 队伍解散 | `{}` |
| `S2C_PARTY_INVITE_RECEIVED` | 收到组队邀请 | `{fromPlayerId, fromName, fromLevel, fromClass, partyId, dungeonName?}` |
| `S2C_PARTY_READY_STATE` | 成员准备状态变化 | `{playerId, ready:bool}` |
| `S2C_PARTY_MATCHMAKE_RESULT` | 自动匹配结果 | `{success, partyInfo?, waitTime?, reason?}` |

### 3.2 10人团队（Raid）

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_RAID_INFO` | 进入团队信息 | `{raidId, parties:[{partyId, leaderId, members:[...]}], maxParties, raidType}` |
| `S2C_RAID_PARTY_ADD` | 小队加入团队 | `{partyInfo}` |
| `S2C_RAID_PARTY_REMOVE` | 小队离开团队 | `{partyId, reason}` |
| `S2C_RAID_READY_COUNT` | 准备人数更新 | `{readyCount, totalCount}` |



## 4. 玩家状态同步

### 4.1 完整状态（首次进入 / 重连）

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_PLAYER_FULL_STATE` | 进入副本/主城/重连 | `{playerId, name, level, exp, class:{base, first?, second?}, stats:{hp, maxHp, mp, maxMp, atk, def, matk, mdef, spd, crit, dodge, ...}, resource:{type, current, max}, position:{x, y}, direction, animationState, equippedSkills:[{slot, skillId, cooldownRemain}], buffs:[{id, stacks, remainMs}], equipment:{mainHand, offHand, head, body, hands, legs, feet, amulet, ring, belt}, talents:{branch1, branch2, branch3, remainingPoints}, sigils:[{slot, sigilId, quality}], enhancements:[{slot, level}]}` |

### 4.2 增量同步（高频）

| 消息类型 | 频率 | 载荷字段 |
|----------|------|----------|
| `S2C_PLAYER_MOVE` | ~20Hz | `{playerId, x, y, vx, vy, direction, animationState, timestamp}` |
| `S2C_PLAYER_STATS_DELTA` | 变化时 | `{playerId, stats:{hp?, mp?, resource?, exp?, level?, combatPower?}}` |
| `S2C_PLAYER_BUFF_UPDATE` | 增减时 | `{playerId, buffsAdd:[{id, stacks, remainMs, sourcePlayerId?}], buffsRemove:[id]}` |
| `S2C_PLAYER_ANIMATION` | 动作触发 | `{playerId, animState, param?}` |
| `S2C_PLAYER_TELEPORT` | 传送/位移 | `{playerId, x, y, transitionEffect?}` |
| `S2C_PLAYER_DEATH` | 玩家死亡 | `{playerId, killerId?, deathType}` |
| `S2C_PLAYER_REVIVE` | 玩家复活 | `{playerId, reviveType:"respawn"/"skill"/"item", hpRestore, mpRestore, position}` |



## 5. 战斗系统

### 5.1 攻击与伤害

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_DAMAGE` | 每次攻击/技能命中 | `{attackerId, targetId, targetType:"player"/"monster"/"boss", damage, isCrit, damageType:"physical"/"fire"/"ice"/"lightning"/"shadow"/"holy"/"poison"/"true", isDot, hitPosition:{x, y}, effectId?}` |
| `S2C_HEAL` | 治疗生效 | `{sourceId, targetId, healAmount, isCrit, sourceSkillId}` |
| `S2C_SHIELD_UPDATE` | 护盾增减 | `{targetId, shieldCurrent, shieldMax, sourceId?, sourceSkillId?}` |
| `S2C_DODGE` | 闪避成功 | `{targetId, attackerId, attackerSkillId?}` |
| `S2C_BLOCK` | 格挡成功 | `{targetId, attackerId, blockedDamage, originalDamage, reflectDamage?}` |
| `S2C_TAUNT` | 嘲讽生效 | `{sourceId, targetId, durationMs}` |
| `S2C_IMMUNE` | 免疫/无敌触发 | `{targetId, immuneType:"control"/"damage"/"death"}` |

### 5.2 状态控制

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_CROWD_CONTROL` | 眩晕/冰冻/定身/恐惧/混乱/致盲 | `{targetId, ccType, durationMs, sourceId?, sourceSkillId?}` |
| `S2C_CC_END` | CC 解除/净化 | `{targetId, ccType, endReason:"expire"/"purify"/"immune"}` |
| `S2C_DOT_TICK` | DOT 每跳（可选合并到 DAMAGE） | `{targetId, dotId, tickDamage, sourceSkillId}` |

### 5.3 状态变化通知

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_INVISIBILITY` | 隐身/破隐 | `{playerId, invisible:bool, breakReason?}` |
| `S2C_INVINCIBLE` | 无敌/无敌结束 | `{targetId, invincible:bool, sourceSkillId?}` |
| `S2C_RESOURCE_CHANGE` | 职业资源变化（怒气/集中/法力/能量） | `{playerId, resourceType, oldValue, newValue, maxValue, changeReason}` |



## 6. 技能系统

### 6.1 技能执行

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_SKILL_CAST_START` | 技能开始释放（客户端做前摇动画） | `{casterId, skillId, skillSlot, castTimeMs, targetPosition?, targetId?, direction?}` |
| `S2C_SKILL_CAST_INTERRUPT` | 技能被打断 | `{casterId, skillId, interruptSourceId?, interruptType:"stun"/"knockback"/"silence"}` |
| `S2C_SKILL_CAST_FINISH` | 技能成功释放（服务端确认） | `{casterId, skillId, skillSlot, actualMpCost, actualCooldownMs}` |
| `S2C_SKILL_HIT` | 技能命中（可含多个目标） | `{casterId, skillId, hits:[{targetId, damage, isCrit, effectApplied:[{type, value}]}]}` |
| `S2C_SKILL_AOE_ZONE` | AOE 区域创建（地板技预警） | `{casterId, skillId, zoneId, centerX, centerY, radius, warnDurationMs, persistDurationMs, damagePerTick?, effectType?}` |
| `S2C_SKILL_AOE_REMOVE` | AOE 区域移除 | `{zoneId}` |
| `S2C_WEAPON_SKILL_UPDATE` | 武器技能变更 | `{playerId, skillId, skillName, cooldown, description, icon}` |

### 6.2 团队技能效果

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_TEAM_BUFF_APPLY` | 团队增益生效 | `{casterId, buffId, buffType, value, durationMs, affectedPlayerIds}` |
| `S2C_TEAM_SHIELD_APPLY` | 神殿骑士神盾等全队护盾 | `{casterId, shieldAmount, durationMs, affectedPlayerIds}` |
| `S2C_TEAM_HEAL` | 治疗术 / 治愈光环等全队治疗 | `{casterId, healAmount, isTick, affectedPlayerIds}` |
| `S2C_RESURRECTION` | 圣骑士复活 | `{casterId, targetId, hpRestorePercent}` |
| `S2C_FINAL_GUARDIAN` | 最终守护（神殿骑士被动） | `{guardianId, effectType:"death_shield"/"invincibility", durationMs}` |
| `S2C_TIME_MANIPULATION` | 时间缓滞/预知（先知） | `{casterId, effectType:"slow_enemy"/"speed_cooldown"/"fate_shield", affectedIds, durationMs}` |

### 6.3 召唤物管理

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_SUMMON_SPAWN` | 召唤物生成 | `{summonId, ownerId, summonType:"wolf"/"bear"/"skeleton"/"clone"/"elemental"/"totem", hp, maxHp, atk, position:{x,y}, durationMs?}` |
| `S2C_SUMMON_DESPAWN` | 召唤物消失 | `{summonId, reason:"expire"/"killed"/"exploded"}` |
| `S2C_SUMMON_MOVE` | 召唤物移动 | `{summonId, x, y, targetId?}` |
| `S2C_BEAST_FUSION` | 兽王·野兽融合 | `{playerId, buffs:[{id, value, durationMs}], fusionEndEffect?}` |

### 6.4 分身与幻象

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_CLONE_SPAWN` | 分身生成（影舞者/幻术师/幻影） | `{cloneId, ownerId, cloneType, hpPercent, atkPercent, position, durationMs, count}` |
| `S2C_CLONE_EXPLODE` | 分身爆炸 | `{cloneId, damage, aoeRadius}` |
| `S2C_CLONE_DAMAGE` | 分身受到伤害 | `{cloneId, damage, remainingHpPercent}` |



## 7. 装备与背包

### 7.1 掉落

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_DROP_ITEM` | 怪物/宝箱掉落物品 | `{dropId, itemType:"equipment"/"material"/"currency"/"consumable", position:{x,y}, rarity, name, iconId, canPickup:bool, expireTimeMs?, gearScore?, slot?}` |
| `S2C_DROP_BEAM` | 稀有度光柱特效（6级） | `{dropId, rarity, position}` |
| `S2C_PICKUP_RESULT` | 拾取结果 | `{dropId, playerId, success, itemDetails?, reason?}` |
| `S2C_LOOT_ALLOCATION` | 团队分配掉落 | `{dropId, winnerId, allocationType:"free"/"need"/"greed"/"leader", rollResult?}` |
| `S2C_LOOT_ROLL_START` | 开始掷点分配 | `{dropId, itemName, rarity, rollTimeoutMs}` |
| `S2C_LOOT_ROLL_RESULT` | 掷点结果 | `{dropId, rolls:[{playerId, rollValue}], winnerId}` |

### 7.2 背包变更

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_BAG_UPDATE` | 背包增减 | `{itemsAdd:[{bagSlot, itemId, itemType, ...完整字段...}], itemsRemove:[bagSlot], itemsUpdate:[{bagSlot, changedFields:{...}}], goldDelta?, goldNewTotal}` |
| `S2C_BAG_FULL_STATE` | 首次打开背包 / 重连 | `{gold, bagSlots:20, items:[{slot, item:{完整字段}}], tabs:[{tabName, itemCount}]}` |

### 7.3 装备穿戴/卸下

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_EQUIP_CHANGE` | 换装完成 | `{playerId, slot, equipItem?, unEquipItem?, newStatsDelta:{...}, newCombatPower, newGearScore}` |
| `S2C_EQUIP_LOADOUT_SYNC` | 全身装备同步 | `{playerId, equipment:{mainHand:{...}, offHand:{...}, head:{...}, body:{...}, hands:{...}, legs:{...}, feet:{...}, amulet:{...}, ring:{...}, belt:{...}}, setBonuses:[{setId, activeCount}]}` |

### 7.4 装备属性变化（词缀/威能）

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_AFFIX_REROLL` | 洗练词缀 | `{equipSlot, oldAffix, newAffix:{name, tier, stat, value}, cost}` |
| `S2C_AFFIX_TIER_UP` | 升级词缀 Tier | `{equipSlot, affixSlot:"prefix"/"suffix", newTier, newValue, cost}` |
| `S2C_POWER_EXTRACT` | 威能提取 | `{sourceEquipSlot, extractedPowerId, powerName, codexSlot}` |
| `S2C_POWER_IMPRINT` | 威能刻印 | `{targetEquipSlot, powerId, powerName, newRarity, cost}` |
| `S2C_POWER_OVERWRITE` | 威能覆盖 | `{equipSlot, oldPowerId, newPowerId, cost}` |



## 8. 强化·突破·觉醒

### 8.1 强化

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_ENHANCE_RESULT` | 强化操作结果 | `{slot, oldLevel, newLevel, success, failPenalty?, protectShieldConsumed?, enhanceEnergyGained?, statsGained:{...}}` |
| `S2C_ENHANCE_BREAK` | 强化破损（+16+失败无保护符） | `{slot, brokenLevel, needRepair}` |

### 8.2 突破

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_BREAKTHROUGH_RESULT` | 装备突破完成 | `{slot, breakthroughTier, newSigilSlotUnlocked, bonusStats}` |
| `S2C_SIGIL_SLOT_UNLOCK` | 徽记孔位解锁 | `{equipSlot, newSlotIndex, slotColor}` |

### 8.3 觉醒

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_AWAKENING_RESULT` | 觉醒操作结果 | `{slot, success, awakeningEffect:{id, name, description, triggerChance, cooldown}, cost}` |
| `S2C_AWAKENING_REROLL` | 觉醒重置石洗练 | `{slot, oldEffect, newEffect}` |
| `S2C_AWAKENING_TRIGGER` | 觉醒效果触发（战斗内） | `{playerId, equipSlot, effectId, effectDescription}` |

### 8.4 强化转移

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_TRANSFER_RESULT` | 强化/徽记转移完成 | `{fromSlot, toSlot, enhanceTransferred, sigilsTransferred:[{sigilId, moved}]}` |



## 9. 徽记系统

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_SIGIL_EQUIP` | 徽记镶嵌 | `{equipSlot, sigilSlotIndex, sigil:{id, type:"atk"/"def"/"special", quality, statValue, goldenEffect?}}` |
| `S2C_SIGIL_UNEQUIP` | 徽记卸下 | `{equipSlot, sigilSlotIndex}` |
| `S2C_SIGIL_UPGRADE` | 徽记升级（白→绿→蓝→紫→金） | `{sigilId, newQuality, newStatValue, goldenEffect?, cost}` |
| `S2C_SIGIL_SYNTHESIS` | 碎片合成徽记 | `{resultSigil:{id, type, quality, statValue}, consumedFragments}` |



## 10. 副本与房间管理

### 10.1 恶魔塔

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_DT_ENTER_FLOOR` | 进入某层 | `{floor, act, environmentDesc, storyTriggered:bool, rooms:[{roomId, type:"combat"/"treasure"/"rest"/"alchemy"/"boss", position}]}` |
| `S2C_DT_ROOM_ENTER` | 进入某个房间 | `{roomId, type, enemies:[{monsterId, monsterType, level, hp, maxHp, x, y}], treasureType?, npcId?}` |
| `S2C_DT_ROOM_CLEAR` | 房间清空 | `{roomId, drops:[{...}], expGained, goldGained, bonusDrop?}` |
| `S2C_DT_FLOOR_CLEAR` | 整层通关 | `{floor, firstClear:bool, rewards:{gold, exp, storyItem?, unlockSystem?}, nextFloorAvailable:bool}` |
| `S2C_DT_BOSS_WARNING` | Boss 层等级门槛警告 | `{floor, recommendedLevel, playerLevel, warningText}` |
| `S2C_DT_NEXT_FLOOR_PORTAL` | 下一层入口出现 | `{floor, portalPosition}` |

### 10.2 日常/周常副本

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_DUNGEON_ENTER` | 进入副本 | `{dungeonId, dungeonType, dailyRemains, weeklyRemains, objectives, timeLimit?, enemies:[...]}` |
| `S2C_DUNGEON_OBJECTIVE_UPDATE` | 目标更新 | `{objectiveId, progress, maxProgress, completed}` |
| `S2C_DUNGEON_COMPLETE` | 副本完成 | `{dungeonId, rating:"S"/"A"/"B"/"C", rewards:{gold, exp, materials:[...], equipment:[...]}, bonusRewards?}` |
| `S2C_DUNGEON_FAIL` | 副本失败/超时 | `{dungeonId, reason, partialRewards?}` |
| `S2C_DUNGEON_WAVE_START` | 下一波怪物（守护者试炼等） | `{waveNumber, totalWaves, enemies:[...], preparationTimeMs}` |

### 10.3 深渊副本

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_ABYSS_ENERGY` | 深渊能量积累 | `{current, max, triggered:bool}` |
| `S2C_ABYSS_GATE_OPEN` | 深渊之门开启（额外Boss） | `{bossInfo:{id, name, level, hp}, bonusDropRate}` |
| `S2C_ABYSS_GATE_CLOSE` | 深渊之门关闭 | `{bossDefeated:bool}` |

### 10.4 裂隙副本

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_RIFT_APPEAR` | 主城出现裂隙 | `{riftId, position, modifiers:[{name, effect, rewardBonus}], durationSec}` |
| `S2C_RIFT_DISAPPEAR` | 裂隙消失 | `{riftId, reason:"expire"/"entered"/"cleared"}` |
| `S2C_RIFT_ENTER` | 进入裂隙 | `{riftId, dungeonLayout, modifiers, consumedRiftStone:bool}` |

### 10.5 Boss Rush / 终焉之塔 / 试炼塔

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_BOSSRUSH_WAVE` | 下一Boss | `{bossIndex, totalBosses, bossInfo, hpRestore:bool}` |
| `S2C_BOSSRUSH_COMPLETE` | Boss Rush 完成 | `{time, rewards, rankUpdate?}` |
| `S2C_TOWER_FLOOR` | 进入下一层（终焉之塔/试炼塔） | `{floor, modifier, enemies, hpRestoreRate}` |
| `S2C_TRIAL_TOWER_RESET` | 试炼塔每周重置 | `{lastWeekFloor, newFloor, rewards:[...]}` |

### 10.6 团队 Raid（预留）

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_RAID_START` | Raid 开始 | `{raidId, phases:[{name, bossName, mechanics:[...]}], timeLimit}` |
| `S2C_RAID_PHASE_CHANGE` | 阶段切换 | `{phaseIndex, bossHpThreshold, newMechanics, cutsceneId?}` |
| `S2C_RAID_BOSS_ABILITY` | Boss 释放团队机制 | `{bossId, abilityId, abilityName, targets:[playerId?], warningArea?, castTime}` |
| `S2C_RAID_COMPLETE` | Raid 通关 | `{rewards:[{playerId, items:[...]}], completionTime, firstClear:bool}` |
| `S2C_RAID_WIPE` | 团灭 | `{bossName, bossHpRemain%, attemptCount}` |

### 10.7 主城

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_TOWN_ENTER` | 进入主城 | `{players:[{id, name, level, class, position:{x,y}}], npcs:[{id, name, position}], buildings:[{id, name, position}]}` |
| `S2C_TOWN_PLAYER_JOIN` | 其他玩家进入主城 | `{playerId, name, level, class, position}` |
| `S2C_TOWN_PLAYER_LEAVE` | 其他玩家离开主城 | `{playerId}` |



## 11. 剧情叙事

### 11.1 剧情节点触发

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_STORY_NODE_TRIGGER` | 首次进入剧情层 | `{nodeId, nodeType:"normal"/"important"/"critical", floor, content:{dialogues:[{speakerId, speakerName, text, portrait, emotion}], environmentDesc?, collectibleDropped?}}` |
| `S2C_STORY_CG_PLAY` | 播放 CG/闪回 | `{cgId, cgType:"flashback"/"bossIntro"/"ending", images:[url], durationMs, skippable}` |
| `S2C_STORY_CHOICE` | 剧情选择（结局A/B） | `{choiceId, options:[{id, text}], timeoutMs?}` |
| `S2C_STORY_CHOICE_RESULT` | 选择结果 | `{chosenOption, consequenceDescription, reward?}` |

### 11.2 Boss 剧情演出

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_BOSS_INTRO` | Boss 出场演出 | `{bossId, bossName, introDialogues:[...], cameraEffect?, durationMs}` |
| `S2C_BOSS_MEMORY_FLASHBACK` | Boss 死后记忆闪回 | `{bossId, flashbackImages:[url], narrationText, rewardItem?}` |
| `S2C_BOSS_PHASE_DIALOGUE` | Boss 战斗中台词 | `{bossId, dialogueText, phase}` |
| `S2C_BOSS_DEFEAT_SCENE` | Boss 击败演出 | `{bossId, animationType, fragmentRelease:bool, extraCg?}` |

### 11.3 编年史石碑

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_CHRONICLE_UPDATE` | 解锁新节点 | `{nodeId, nodeType, chapter, title, unlocked, timestamp}` |
| `S2C_CHRONICLE_FULL` | 打开石碑面板 | `{chapters:[{chapterName, acts:[{actName, nodes:[{id, title, unlocked, hasCollectible}]}]}], collectiblesCount, totalCollectibles}` |
| `S2C_COLLECTIBLE_ACQUIRE` | 获得遗物/笔记 | `{itemId, name, description, loreText, category}` |

### 11.4 间歇期引导

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_INTERLUDE_GUIDE` | Boss 后艾琳引导 | `{interludeId, npcId:"irene", dialogues:[...], recommendedAction, unlockHint}` |



## 12. 天赋与转职

### 12.1 天赋

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_TALENT_UNLOCK` | 天赋系统解锁（Lv40） | `{remainingPoints, branches:[{id, name, nodes:[{tier, unlocked, allocated}]}]}` |
| `S2C_TALENT_ALLOCATE` | 分配天赋点结果 | `{branchId, nodeTier, allocated, newEffects, remainingPoints}` |
| `S2C_TALENT_RESET` | 重置天赋 | `{cost, allPointsRefunded}` |
| `S2C_ULTIMATE_TALENT_ACTIVATE` | 终极天赋点亮 | `{branchId, talentName, talentEffect}` |

### 12.2 转职

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_CLASS_ADVANCE_AVAILABLE` | 达到转职等级 | `{level, advanceTier:"first"/"second", options:[{classId, className, role, skillPreview:[...]}]}` |
| `S2C_CLASS_ADVANCE_COMPLETE` | 转职成功 | `{oldClass, newClass, newSkills:[...], statRecalc:{...}, freeResetsGranted, giftRewards}` |
| `S2C_TRIAL_BOSS_AVAILABLE` | 转职试炼可挑战 | `{classId, bossId, bossName, difficulty, freeTrial:bool}` |
| `S2C_TRIAL_BOSS_DEFEAT` | 试炼Boss击败 | `{classId, advanceAvailable:bool}` |



## 13. 经济与交易

### 13.1 货币

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_CURRENCY_UPDATE` | 货币变化 | `{currencies:{gold:delta?newTotal?, diamond:delta?, skillStone:delta?, rerollStone:delta?, mythicShard:delta?, classStone:delta?, riftStone:delta?}}` |

### 13.2 商店

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_SHOP_ITEMS` | 打开商店 | `{shopId, items:[{id, name, price:{currency, amount}, stock, dailyLimit}], refreshCost, nextRefreshTime?, dailyResets}` |
| `S2C_SHOP_BUY_RESULT` | 购买结果 | `{itemId, success, newStock, newCurrency}` |
| `S2C_SHOP_REFRESH` | 商店刷新 | `{newItems, cost, remainingRefreshes}` |

### 13.3 拍卖/交易（预留远期）

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_TRADE_OFFER` | 收到交易请求 | `{fromPlayerId, fromName, items:[...], goldAmount}` |
| `S2C_TRADE_COMPLETE` | 交易完成 | `{partnerId, givenItems, receivedItems, goldDelta}` |
| `S2C_AUCTION_LIST` | 拍卖行列表 | `{listings:[{id, item, seller, buyoutPrice, currentBid, endTime}]}` |



## 14. NPC 交互

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_NPC_DIALOG_OPEN` | 与 NPC 对话开始 | `{npcId, npcName, portrait, dialogues:[{text, options:[{id, text, condition?}]}], questAvailable:bool, questInProgress:bool}` |
| `S2C_NPC_DIALOG_OPTION` | 对话选项反馈 | `{optionId, response, functionOpened?:"advance"/"shop"/"enhance"/"sigil"/"awakening"/"chronicle"}` |
| `S2C_NPC_DIALOG_CLOSE` | 对话结束 | `{npcId, relationshipChanged?, newDialogueUnlocked?}` |
| `S2C_NPC_STATE_CHANGE` | NPC 状态变化（头顶感叹号等） | `{npcId, state:"idle"/"quest"/"angry"/"special", iconVisible}` |
| `S2C_QUEST_ACCEPT` | 接到支线任务 | `{questId, questName, objectives:[{desc, progress, max}], rewards}` |
| `S2C_QUEST_PROGRESS` | 任务进度更新 | `{questId, objectiveIndex, progress, max}` |
| `S2C_QUEST_COMPLETE` | 任务完成 | `{questId, rewards, nextQuestId?}` |



## 15. 社交与聊天

### 15.1 聊天

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_CHAT_MESSAGE` | 收到聊天消息 | `{channel:"world"/"party"/"raid"/"whisper"/"system", fromId, fromName, fromLevel, fromClass, message, timestamp, isGm:bool}` |
| `S2C_CHAT_SYSTEM` | 系统公告 | `{message, messageType:"login"/"achievement"/"server", targetIds?}` |

### 15.2 好友

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_FRIEND_LIST` | 好友列表 | `{friends:[{id, name, level, class, online, lastOnline, dungeonId?}]}` |
| `S2C_FRIEND_REQUEST` | 收到好友请求 | `{fromId, fromName, fromLevel, message?}` |
| `S2C_FRIEND_ONLINE` | 好友上线/下线 | `{friendId, online, currentActivity?}` |
| `S2C_FRIEND_DELETE` | 被删好友 | `{friendId}` |

### 15.3 表情/动作

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_EMOTE` | 玩家表情/动作 | `{playerId, emoteId, targetId?}` |



## 16. 排行榜与统计

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_RANK_LIST` | 排行榜数据 | `{rankType:"bossRush"/"trialTower"/"pvp(预留)"/"wealth"/"level", entries:[{rank, playerId, name, level, class, score, extra}]}` |
| `S2C_RANK_MY_POSITION` | 自身的排名 | `{rankType, rank, score, nextRankScore}` |
| `S2C_RANK_UPDATE` | 排名变化 | `{rankType, oldRank, newRank}` |
| `S2C_ACHIEVEMENT_UNLOCK` | 成就解锁 | `{achievementId, name, description, points}` |



## 17. 全局广播与事件

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_WORLD_EVENT` | 世界事件（双倍掉落等） | `{eventId, eventName, description, startTime, endTime, modifiers}` |
| `S2C_SERVER_ANNOUNCE` | 全服公告（首杀/强化+20/神话掉落） | `{announceId, message, relatedPlayerId?, relatedItem?}` |
| `S2C_SERVER_MAINTENANCE` | 维护通知 | `{startTime, estimatedDurationMin, reason}` |
| `S2C_DAILY_RESET` | 每日重置 | `{resetType:"daily"/"weekly", refreshedLimits:[{type, oldValue, newValue}], newEvents?}` |



## 18. 错误与校验

| 消息类型 | 触发时机 | 载荷字段 |
|----------|----------|----------|
| `S2C_ERROR` | 通用操作失败 | `{errorCode, errorMessage, context?}` |
| `S2C_CHEAT_DETECT` | 作弊检测 | `{reason, actionTaken:"kick"/"ban"/"warn", duration?}` |
| `S2C_OPERATION_COOLDOWN` | 操作冷却中 | `{operationType, remainMs}` |
| `S2C_INSUFFICIENT_RESOURCE` | 资源不足 | `{resourceType, required, current}` |
| `S2C_UNLOCK_REQUIRED` | 等级/进度未解锁 | `{unlockCondition, requiredValue, currentValue}` |

### 18.1 错误码建议

| 码 | 含义 |
|----|------|
| 1001 | 背包已满 |
| 1002 | 金币不足 |
| 1003 | 等级不足 |
| 1004 | 该操作冷却中 |
| 1005 | 目标不在范围 |
| 1006 | 技能未学习 |
| 1007 | 职业不匹配 |
| 1008 | 强化材料不足 |
| 1009 | 副本次数已用完 |
| 1010 | 装备已绑定不可交易 |
| 1011 | 目标不存在 / 已死亡 |
| 1012 | 队伍人数已满 |
| 1013 | 已在队伍中 |
| 1014 | 房间不存在 |
| 1015 | 非法操作（校验失败） |
| 1016 | 服务器负载过高 |

---

## 19. 包格式总览

### 19.1 频率分级与传输策略

| 频率 | 范围 | 建议传输 | 典型消息 |
|------|------|----------|----------|
| **极高** (>10Hz) | 移动同步 | 轻量UDP / WebSocket binary | `S2C_PLAYER_MOVE`, `S2C_MONSTER_MOVE` |
| **高** (1-10Hz) | 战斗伤害 | WebSocket binary | `S2C_DAMAGE`, `S2C_SKILL_HIT`, `S2C_HEAL` |
| **中** (按需) | 技能/Buff/掉落 | WebSocket text (JSON) | `S2C_SKILL_CAST`, `S2C_DROP_ITEM`, `S2C_BUFF_UPDATE` |
| **低** (按需) | UI/面板/强化结果 | WebSocket text (JSON) | `S2C_ENHANCE_RESULT`, `S2C_BAG_UPDATE` |
| **极低** (事件) | 全局广播 | WebSocket text (JSON) | `S2C_SERVER_ANNOUNCE`, `S2C_WORLD_EVENT` |

### 19.2 按系统统计消息量

| 系统 | 消息类型数 |
|------|-----------|
| 连接与会话 | 6 |
| 大厅与队伍 | 12 |
| 玩家状态同步 | 11 |
| 战斗系统 | 11 |
| 技能系统（含召唤/分身） | 21 |
| 装备与背包 | 15 |
| 强化·突破·觉醒 | 12 |
| 徽记系统 | 4 |
| 副本与房间（含 Raid） | 23 |
| 剧情叙事 | 13 |
| 天赋与转职 | 8 |
| 经济与交易 | 7 |
| NPC 交互 | 7 |
| 社交聊天 | 8 |
| 排行榜 | 5 |
| 全局广播 | 5 |
| 错误校验 | 6 |
| **合计** | **~174** |

### 19.3 关键设计决策备注

1. **权威校验位置** — 伤害计算 / 掉落判定 / 强化结果 / 转职结果全部在服务端完成，客户端请求 + 服务端确认
2. **移动优化** — 采用客户端预测 + 服务端校验 + 回滚机制；只在偏离超过阈值时强制纠正 `S2C_PLAYER_TELEPORT`
3. **AOI (Area of Interest)** — 主城和副本中，只向玩家发送视野范围内的实体变化（通常为屏幕范围 + 200px 缓冲区）
4. **副本实例化** — 每个小队创建一个独立副本进程/房间，副本内消息只发给该副本玩家
5. **Boss 战同步** — Boss 阶段切换、机制预警均为服务端权威下发，客户端只做 UI 表现
6. **扩展预留** — PvP 竞技场、拍卖行、公会系统的消息类型预留了命名空间，未展开



## 20. 二进制协议线格式（Binary Wire Format）

### 20.1 设计哲学

高频消息（移动/战斗）走 WebSocket **Binary Frame**，低频消息（UI面板/强化结果）走 WebSocket **Text Frame (JSON)**。同一个 WebSocket 连接内两条信道复用，客户端根据 `binary` vs `text` 帧类型分发到不同解码器。

### 20.2 Binary Frame 通用头（8字节）

所有二进制消息共享统一的 8 字节帧头：

```
偏移  字节数  类型      字段              说明
────────────────────────────────────────────────────
0     2      uint16    msgType           消息类型ID（LE）
2     2      uint16    bodyLen           载荷体长度（字节，不含此头）
4     2      uint16    seqId             包序列号（会话内递增，到达 65535 回绕）
6     1      uint8     flags             标志位
7     1      uint8     version           协议版本号（初始 = 1）
```

**flags 位域定义**（bit 7 = MSB）：

```
bit 7: compressed    置1表示 body 经 zlib Deflate 压缩
bit 6: reliable      置1表示需要客户端 ACK 回执
bit 5: encrypted     置1表示 body 经 AES-GCM 加密（远期）
bit 4: ack_response  置1表示此包是对客户端 ACK 请求的响应
bit 3-0: reserved    保留，发送方填0
```

**bodyLen 限制**：单包最大载荷 65535 字节。超过此大小（如全量状态快照）必须分片，由应用层处理。

### 20.3 基本数据类型编码

| 类型 | 字节数 | 编码 | 值域 |
|------|--------|------|------|
| `uint8` | 1 | 无符号整数 LE | 0~255 |
| `int8` | 1 | 有符号整数 LE (补码) | −128~127 |
| `uint16` | 2 | 无符号整数 LE | 0~65535 |
| `int16` | 2 | 有符号整数 LE (补码) | −32768~32767 |
| `uint32` | 4 | 无符号整数 LE | 0~4294967295 |
| `int32` | 4 | 有符号整数 LE (补码) | −2147483648~2147483647 |
| `float32` | 4 | IEEE 754 单精度 LE | ±3.4E38 |
| `bool` | 1 | `uint8`, 0=false, 1=true | 0/1 |
| `vuint` | 1-3 | LEB128 变长无符号整数 | 0~2097151 |
| `vint` | 1-3 | LEB128 变长有符号整数 | −1048576~1048575 |

### 20.4 复合类型编码

**字符串（String）**：
```
[2字节] uint16 byteLen    // UTF-8 字节数（不含此长度前缀）
[n字节] UTF-8 bytes       // 字节内容
```
空字符串：`byteLen = 0`，后无字节。

**定长数组（重复元素）**：
```
[1字节] uint8 count       // 元素个数（0~255）
[count × elementSize]     // 元素依次紧密排列
```

**变长数组（超过 255 项）**：
```
[2字节] uint16 count      // 元素个数（0~65535）
[count × elementSize]     // 元素依次紧密排列
```

注意：二进制协议中**严禁使用终止符**判断字符串/数组结束，一律使用长度前缀。

**可选字段（Optional）**：对可能为 null/不存在的字段：
```
[1字节] uint8 present     // 0=不存在(跳过后续字段), 1=存在
[如果 present=1] 实际数据
```

### 20.5 坐标编码

世界坐标范围为 `-32768 ~ 32767`（int16，精度 1px），内部以 1/256 像素为子精度：

```
[2字节] int16 coord       // 世界坐标值
```

对于需要固定精度（如位置同步）的场景，坐标字段直接从 int16 读出。对于需要子像素精度的场景（如弹道），使用 float32。

### 20.6 浮点值量化压缩（FXP）

部分浮点值（如百分比、倍率）在二进制协议中通过定点数传输以节省空间：

| 原始范围 | 量化方式 | 传输类型 | 解码 |
|----------|----------|----------|------|
| 0.0~100.0 (百分比) | ×10 → uint16 | `uint16` | `/10.0` |
| 0.0~1.0 (概率) | ×10000 → uint16 | `uint16` | `/10000.0` |
| 0.0~655.35 (大值) | ×100 → uint16 | `uint16` | `/100.0` |

### 20.7 枚举编码约定

| 枚举项数 | 传输类型 |
|----------|----------|
| ≤256 项 | `uint8` |
| ≤65536 项 | `uint16` |

本协议所有枚举目前均可容纳在 `uint8` 内（全部 < 256 项）。

### 20.8 端序与对齐

- **全协议使用 Little-Endian（LE）**，与 x86/ARM 主流平台一致，零转换开销。
- **无对齐填充**（packed）：所有字段紧密排列，不插入 padding 字节。
- 网络传输时按字节流发送，接收端逐字段读取。

### 20.9 帧边界识别

WebSocket 层自动切割帧边界。应用层无需处理 TCP 粘包。

二进制帧判别逻辑：
1. 接收 WebSocket binary 帧
2. 如果 `bodyLen > 0 && flags & 0x80 (compressed)`：先 zlib inflate
3. 根据 `msgType` 查表分发到对应消息处理器
4. 如果 `flags & 0x40 (reliable)`：发送 C2S_ACK 回执

---

## 21. 消息类型 ID 完整枚举

按系统分配 uint16 ID 空间，留有扩展余量。

### 21.1 ID 分配总表

| ID 范围 | 系统 | 数量 | 频率 |
|---------|------|------|------|
| `0x0001-0x000F` | 连接/会话 | 6 | 极低 |
| `0x0010-0x001F` | 大厅/队伍/Raid | 12 | 低 |
| `0x0020-0x002F` | 玩家状态同步 | 11 | **极高** |
| `0x0030-0x003F` | 战斗系统 | 11 | **高** |
| `0x0040-0x004F` | 技能系统 | 7 | **高** |
| `0x0050-0x005F` | 召唤物/分身 | 8 | 中 |
| `0x0060-0x006F` | 装备/背包/掉落 | 15 | 中 |
| `0x0070-0x007F` | 强化/突破/觉醒 | 8 | 低 |
| `0x0080-0x008F` | 徽记系统 | 4 | 低 |
| `0x0090-0x009F` | 副本-恶魔塔 | 6 | 中 |
| `0x00A0-0x00AF` | 副本-日常/周常 | 5 | 中 |
| `0x00B0-0x00BF` | 副本-深渊/裂隙 | 6 | 中 |
| `0x00C0-0x00CF` | BossRush/Raid/塔 | 9 | 中 |
| `0x00D0-0x00DF` | 剧情叙事 | 13 | 低 |
| `0x00E0-0x00EF` | 天赋/转职 | 8 | 低 |
| `0x00F0-0x00FF` | 经济/商店/交易 | 7 | 低 |
| `0x0100-0x010F` | NPC/任务 | 7 | 低 |
| `0x0110-0x011F` | 社交/聊天/好友 | 8 | 极低 |
| `0x0120-0x012F` | 排行榜/成就 | 5 | 极低 |
| `0x0130-0x013F` | 全局广播/事件 | 5 | 极低 |
| `0x0140-0x014F` | 错误/校验 | 6 | 极低 |
| `0x0150-0x015F` | 主城 AOI | 3 | 高 |
| `0x0160-0x016F` | *预留 PvP* | — | — |
| `0x0170-0x017F` | *预留 公会* | — | — |
| `0x0180-0x01FF` | *预留 扩展* | — | — |
| `0xFF00-0xFFFF` | 内部/调试 | — | — |

### 21.2 全部消息类型 ID 明细

```
╔══════════════════════════════════════════════════════════╗
║ §2 连接/会话 (0x0001-0x000F)                              ║
╠════════╦═════════════════════════════════════════════════╣
║ 0x0001 ║ S2C_AUTH_RESULT           JSON                  ║
║ 0x0002 ║ S2C_KICK                  JSON                  ║
║ 0x0003 ║ S2C_HEARTBEAT             BINARY (8+0=8B)      ║
║ 0x0004 ║ S2C_RECONNECT_OK          JSON (含快照)         ║
║ 0x0005 ║ S2C_RECONNECT_FAIL        JSON                  ║
║ 0x0006 ║ S2C_VERSION_CHECK         JSON                  ║
╠════════╬═════════════════════════════════════════════════╣
║ §3 大厅/队伍 (0x0010-0x001F)                             ║
╠════════╬═════════════════════════════════════════════════╣
║ 0x0010 ║ S2C_PARTY_INFO             JSON                 ║
║ 0x0011 ║ S2C_PARTY_MEMBER_JOIN      JSON                 ║
║ 0x0012 ║ S2C_PARTY_MEMBER_LEAVE     JSON                 ║
║ 0x0013 ║ S2C_PARTY_LEADER_CHANGE    JSON                 ║
║ 0x0014 ║ S2C_PARTY_DISBAND          JSON                 ║
║ 0x0015 ║ S2C_PARTY_INVITE_RECEIVED  JSON                 ║
║ 0x0016 ║ S2C_PARTY_READY_STATE      JSON                 ║
║ 0x0017 ║ S2C_PARTY_MATCHMAKE_RESULT JSON                 ║
║ 0x0018 ║ S2C_RAID_INFO              JSON                 ║
║ 0x0019 ║ S2C_RAID_PARTY_ADD         JSON                 ║
║ 0x001A ║ S2C_RAID_PARTY_REMOVE      JSON                 ║
║ 0x001B ║ S2C_RAID_READY_COUNT       JSON                 ║
╠════════╬═════════════════════════════════════════════════╣
║ §4 玩家状态同步 (0x0020-0x002F)                          ║
╠════════╬═════════════════════════════════════════════════╣
║ 0x0020 ║ S2C_PLAYER_MOVE            BINARY (12B)    ★   ║
║ 0x0021 ║ S2C_PLAYER_STATS_DELTA     BINARY (10-18B) ★   ║
║ 0x0022 ║ S2C_PLAYER_BUFF_UPDATE     BINARY (变长)   ★   ║
║ 0x0023 ║ S2C_PLAYER_ANIMATION       BINARY (5B)     ★   ║
║ 0x0024 ║ S2C_PLAYER_TELEPORT        BINARY (7B)     ★   ║
║ 0x0025 ║ S2C_PLAYER_DEATH           BINARY (5B)     ★   ║
║ 0x0026 ║ S2C_PLAYER_REVIVE          BINARY (10B)    ★   ║
║ 0x0027 ║ S2C_PLAYER_FULL_STATE      JSON                 ║
║ 0x0028 ║ S2C_TEAM_BUFF_APPLY        BINARY (变长)        ║
║ 0x0029 ║ S2C_TEAM_SHIELD_APPLY      BINARY (变长)        ║
║ 0x002A ║ S2C_TEAM_HEAL              BINARY (变长)        ║
╠════════╬═════════════════════════════════════════════════╣
║ §5 战斗系统 (0x0030-0x003F)                             ║
╠════════╬═════════════════════════════════════════════════╣
║ 0x0030 ║ S2C_DAMAGE                 BINARY (13B)    ★   ║
║ 0x0031 ║ S2C_HEAL                   BINARY (9B)     ★   ║
║ 0x0032 ║ S2C_SHIELD_UPDATE          BINARY (8B)     ★   ║
║ 0x0033 ║ S2C_DODGE                  BINARY (5B)     ★   ║
║ 0x0034 ║ S2C_BLOCK                  BINARY (10B)    ★   ║
║ 0x0035 ║ S2C_TAUNT                  BINARY (7B)     ★   ║
║ 0x0036 ║ S2C_IMMUNE                 BINARY (3B)     ★   ║
║ 0x0037 ║ S2C_CROWD_CONTROL          BINARY (7B)     ★   ║
║ 0x0038 ║ S2C_CC_END                 BINARY (3B)     ★   ║
║ 0x0039 ║ S2C_DOT_TICK               BINARY (7B)     ★   ║
║ 0x003A ║ S2C_INVISIBILITY           BINARY (3B)     ★   ║
║ 0x003B ║ S2C_INVINCIBLE             BINARY (3B)     ★   ║
║ 0x003C ║ S2C_RESOURCE_CHANGE        BINARY (9B)         ║
╠════════╬═════════════════════════════════════════════════╣
║ §6 技能系统 (0x0040-0x004F)                             ║
╠════════╬═════════════════════════════════════════════════╣
║ 0x0040 ║ S2C_SKILL_CAST_START       BINARY (14B)        ║
║ 0x0041 ║ S2C_SKILL_CAST_INTERRUPT   BINARY (4B)         ║
║ 0x0042 ║ S2C_SKILL_CAST_FINISH      BINARY (8B)         ║
║ 0x0043 ║ S2C_SKILL_HIT              BINARY (变长)   ★   ║
║ 0x0044 ║ S2C_SKILL_AOE_ZONE         BINARY (18B)        ║
║ 0x0045 ║ S2C_SKILL_AOE_REMOVE       BINARY (1B)         ║
║ 0x0046 ║ S2C_WEAPON_SKILL_UPDATE    JSON                 ║
╠════════╬═════════════════════════════════════════════════╣
║ §6.3-6.4 召唤物/分身 (0x0050-0x005F)                    ║
╠════════╬═════════════════════════════════════════════════╣
║ 0x0050 ║ S2C_SUMMON_SPAWN           BINARY (26B)        ║
║ 0x0051 ║ S2C_SUMMON_DESPAWN         BINARY (2B)         ║
║ 0x0052 ║ S2C_SUMMON_MOVE            BINARY (8B)         ║
║ 0x0053 ║ S2C_BEAST_FUSION           BINARY (变长)        ║
║ 0x0054 ║ S2C_CLONE_SPAWN            BINARY (18B)        ║
║ 0x0055 ║ S2C_CLONE_EXPLODE          BINARY (7B)         ║
║ 0x0056 ║ S2C_CLONE_DAMAGE           BINARY (6B)         ║
║ 0x0057 ║ S2C_RESURRECTION           BINARY (5B)         ║
║ 0x0058 ║ S2C_TIME_MANIPULATION      BINARY (变长)        ║
╠════════╬═════════════════════════════════════════════════╣
║ §7 装备/背包/掉落 (0x0060-0x006F)                       ║
╠════════╬═════════════════════════════════════════════════╣
║ 0x0060 ║ S2C_DROP_ITEM              BINARY (20B)        ║
║ 0x0061 ║ S2C_DROP_BEAM              BINARY (4B)         ║
║ 0x0062 ║ S2C_PICKUP_RESULT          BINARY (4B)         ║
║ 0x0063 ║ S2C_LOOT_ALLOCATION        JSON                 ║
║ 0x0064 ║ S2C_LOOT_ROLL_START        JSON                 ║
║ 0x0065 ║ S2C_LOOT_ROLL_RESULT       JSON                 ║
║ 0x0066 ║ S2C_BAG_UPDATE             JSON                 ║
║ 0x0067 ║ S2C_BAG_FULL_STATE         JSON                 ║
║ 0x0068 ║ S2C_EQUIP_CHANGE           JSON                 ║
║ 0x0069 ║ S2C_EQUIP_LOADOUT_SYNC     JSON                 ║
║ 0x006A ║ S2C_AFFIX_REROLL           JSON                 ║
║ 0x006B ║ S2C_AFFIX_TIER_UP          JSON                 ║
║ 0x006C ║ S2C_POWER_EXTRACT          JSON                 ║
║ 0x006D ║ S2C_POWER_IMPRINT          JSON                 ║
║ 0x006E ║ S2C_POWER_OVERWRITE        JSON                 ║
╠════════╬═════════════════════════════════════════════════╣
║ §8-9 强化/突破/觉醒/徽记 (0x0070-0x007F)                ║
╠════════╬═════════════════════════════════════════════════╣
║ 0x0070 ║ S2C_ENHANCE_RESULT         JSON                 ║
║ 0x0071 ║ S2C_ENHANCE_BREAK          JSON                 ║
║ 0x0072 ║ S2C_BREAKTHROUGH_RESULT    JSON                 ║
║ 0x0073 ║ S2C_SIGIL_SLOT_UNLOCK      JSON                 ║
║ 0x0074 ║ S2C_AWAKENING_RESULT       JSON                 ║
║ 0x0075 ║ S2C_AWAKENING_REROLL       JSON                 ║
║ 0x0076 ║ S2C_AWAKENING_TRIGGER      BINARY (4B)         ║
║ 0x0077 ║ S2C_TRANSFER_RESULT        JSON                 ║
║ 0x0078 ║ S2C_SIGIL_EQUIP            JSON                 ║
║ 0x0079 ║ S2C_SIGIL_UNEQUIP          JSON                 ║
║ 0x007A ║ S2C_SIGIL_UPGRADE          JSON                 ║
║ 0x007B ║ S2C_SIGIL_SYNTHESIS        JSON                 ║
╠════════╬═════════════════════════════════════════════════╣
║ §10 副本 (0x0090-0x00CF)                                ║
╠════════╬═════════════════════════════════════════════════╣
║ 0x0090 ║ S2C_DT_ENTER_FLOOR         JSON                 ║
║ 0x0091 ║ S2C_DT_ROOM_ENTER          JSON                 ║
║ 0x0092 ║ S2C_DT_ROOM_CLEAR          JSON                 ║
║ 0x0093 ║ S2C_DT_FLOOR_CLEAR         JSON                 ║
║ 0x0094 ║ S2C_DT_BOSS_WARNING        JSON                 ║
║ 0x0095 ║ S2C_DT_NEXT_FLOOR_PORTAL   JSON                 ║
║ 0x00A0 ║ S2C_DUNGEON_ENTER          JSON                 ║
║ 0x00A1 ║ S2C_DUNGEON_OBJECTIVE_UPDATE JSON               ║
║ 0x00A2 ║ S2C_DUNGEON_COMPLETE       JSON                 ║
║ 0x00A3 ║ S2C_DUNGEON_FAIL           JSON                 ║
║ 0x00A4 ║ S2C_DUNGEON_WAVE_START     JSON                 ║
║ 0x00B0 ║ S2C_ABYSS_ENERGY           BINARY (3B)         ║
║ 0x00B1 ║ S2C_ABYSS_GATE_OPEN        JSON                 ║
║ 0x00B2 ║ S2C_ABYSS_GATE_CLOSE       JSON                 ║
║ 0x00B3 ║ S2C_RIFT_APPEAR            JSON                 ║
║ 0x00B4 ║ S2C_RIFT_DISAPPEAR         JSON                 ║
║ 0x00B5 ║ S2C_RIFT_ENTER             JSON                 ║
║ 0x00C0 ║ S2C_BOSSRUSH_WAVE          JSON                 ║
║ 0x00C1 ║ S2C_BOSSRUSH_COMPLETE      JSON                 ║
║ 0x00C2 ║ S2C_TOWER_FLOOR            JSON                 ║
║ 0x00C3 ║ S2C_TRIAL_TOWER_RESET      JSON                 ║
║ 0x00C4 ║ S2C_RAID_START             JSON                 ║
║ 0x00C5 ║ S2C_RAID_PHASE_CHANGE      JSON                 ║
║ 0x00C6 ║ S2C_RAID_BOSS_ABILITY      JSON                 ║
║ 0x00C7 ║ S2C_RAID_COMPLETE          JSON                 ║
║ 0x00C8 ║ S2C_RAID_WIPE              JSON                 ║
╠════════╬═════════════════════════════════════════════════╣
║ §11 剧情叙事 (0x00D0-0x00DF)                             ║
╠════════╬═════════════════════════════════════════════════╣
║ 0x00D0 ║ S2C_STORY_NODE_TRIGGER     JSON                 ║
║ 0x00D1 ║ S2C_STORY_CG_PLAY          JSON                 ║
║ 0x00D2 ║ S2C_STORY_CHOICE           JSON                 ║
║ 0x00D3 ║ S2C_STORY_CHOICE_RESULT    JSON                 ║
║ 0x00D4 ║ S2C_BOSS_INTRO             JSON                 ║
║ 0x00D5 ║ S2C_BOSS_MEMORY_FLASHBACK  JSON                 ║
║ 0x00D6 ║ S2C_BOSS_PHASE_DIALOGUE    JSON                 ║
║ 0x00D7 ║ S2C_BOSS_DEFEAT_SCENE      JSON                 ║
║ 0x00D8 ║ S2C_CHRONICLE_UPDATE       JSON                 ║
║ 0x00D9 ║ S2C_CHRONICLE_FULL         JSON                 ║
║ 0x00DA ║ S2C_COLLECTIBLE_ACQUIRE    JSON                 ║
║ 0x00DB ║ S2C_FINAL_GUARDIAN         BINARY (4B)         ║
║ 0x00DC ║ S2C_INTERLUDE_GUIDE        JSON                 ║
╠════════╬═════════════════════════════════════════════════╣
║ §12-14 天赋/经济/NPC (0x00E0-0x010F)                    ║
╠════════╬═════════════════════════════════════════════════╣
║ 0x00E0 ║ S2C_TALENT_UNLOCK          JSON                 ║
║ 0x00E1 ║ S2C_TALENT_ALLOCATE        JSON                 ║
║ 0x00E2 ║ S2C_TALENT_RESET           JSON                 ║
║ 0x00E3 ║ S2C_ULTIMATE_TALENT_ACTIVATE JSON               ║
║ 0x00E4 ║ S2C_CLASS_ADVANCE_AVAILABLE JSON                ║
║ 0x00E5 ║ S2C_CLASS_ADVANCE_COMPLETE JSON                 ║
║ 0x00E6 ║ S2C_TRIAL_BOSS_AVAILABLE   JSON                 ║
║ 0x00E7 ║ S2C_TRIAL_BOSS_DEFEAT      JSON                 ║
║ 0x00F0 ║ S2C_CURRENCY_UPDATE        JSON                 ║
║ 0x00F1 ║ S2C_SHOP_ITEMS             JSON                 ║
║ 0x00F2 ║ S2C_SHOP_BUY_RESULT        JSON                 ║
║ 0x00F3 ║ S2C_SHOP_REFRESH           JSON                 ║
║ 0x00F4 ║ S2C_TRADE_OFFER            JSON                 ║
║ 0x00F5 ║ S2C_TRADE_COMPLETE         JSON                 ║
║ 0x00F6 ║ S2C_AUCTION_LIST           JSON                 ║
║ 0x0100 ║ S2C_NPC_DIALOG_OPEN        JSON                 ║
║ 0x0101 ║ S2C_NPC_DIALOG_OPTION      JSON                 ║
║ 0x0102 ║ S2C_NPC_DIALOG_CLOSE       JSON                 ║
║ 0x0103 ║ S2C_NPC_STATE_CHANGE       JSON                 ║
║ 0x0104 ║ S2C_QUEST_ACCEPT           JSON                 ║
║ 0x0105 ║ S2C_QUEST_PROGRESS         JSON                 ║
║ 0x0106 ║ S2C_QUEST_COMPLETE         JSON                 ║
╠════════╬═════════════════════════════════════════════════╣
║ §15-17 社交/排行榜/广播 (0x0110-0x013F)                 ║
╠════════╬═════════════════════════════════════════════════╣
║ 0x0110 ║ S2C_CHAT_MESSAGE           JSON                 ║
║ 0x0111 ║ S2C_CHAT_SYSTEM            JSON                 ║
║ 0x0112 ║ S2C_FRIEND_LIST            JSON                 ║
║ 0x0113 ║ S2C_FRIEND_REQUEST         JSON                 ║
║ 0x0114 ║ S2C_FRIEND_ONLINE          JSON                 ║
║ 0x0115 ║ S2C_FRIEND_DELETE          JSON                 ║
║ 0x0116 ║ S2C_EMOTE                  BINARY (4B)         ║
║ 0x0120 ║ S2C_RANK_LIST              JSON                 ║
║ 0x0121 ║ S2C_RANK_MY_POSITION       JSON                 ║
║ 0x0122 ║ S2C_RANK_UPDATE            JSON                 ║
║ 0x0123 ║ S2C_ACHIEVEMENT_UNLOCK     JSON                 ║
║ 0x0130 ║ S2C_WORLD_EVENT            JSON                 ║
║ 0x0131 ║ S2C_SERVER_ANNOUNCE        JSON                 ║
║ 0x0132 ║ S2C_SERVER_MAINTENANCE     JSON                 ║
║ 0x0133 ║ S2C_DAILY_RESET            JSON                 ║
╠════════╬═════════════════════════════════════════════════╣
║ §18 错误/校验 (0x0140-0x014F)                           ║
╠════════╬═════════════════════════════════════════════════╣
║ 0x0140 ║ S2C_ERROR                  JSON                 ║
║ 0x0141 ║ S2C_CHEAT_DETECT           JSON                 ║
║ 0x0142 ║ S2C_OPERATION_COOLDOWN     JSON                 ║
║ 0x0143 ║ S2C_INSUFFICIENT_RESOURCE  JSON                 ║
║ 0x0144 ║ S2C_UNLOCK_REQUIRED        JSON                 ║
║ 0x0145 ║ S2C_ACK                    BINARY (2B)         ║
╠════════╬═════════════════════════════════════════════════╣
║ §10.7 主城 AOI (0x0150-0x015F)                          ║
╠════════╬═════════════════════════════════════════════════╣
║ 0x0150 ║ S2C_TOWN_ENTER             JSON                 ║
║ 0x0151 ║ S2C_TOWN_PLAYER_JOIN       BINARY (11B)    ★   ║
║ 0x0152 ║ S2C_TOWN_PLAYER_LEAVE      BINARY (2B)     ★   ║
╚════════╩═════════════════════════════════════════════════╝

标记 ★ = 高频消息，走 Binary 帧，下文给出逐字段编码规格。
标记 JSON = 低频消息，走 WebSocket Text (JSON) 帧。
```

---

## 22. 高频消息完整二进制编码规格

以下对全部 Binary 编码消息给出逐字段字节级规格。Header（8字节）在各表中省略，仅列出 body 部分。

### 22.1 位标志枚举定义（共享）

```
damageType 枚举 (uint8):
  0x00 = physical    物理
  0x01 = fire        火焰
  0x02 = ice         冰冻
  0x03 = lightning   闪电
  0x04 = shadow      暗影
  0x05 = holy        神圣
  0x06 = poison      毒素
  0x07 = true        真实伤害

targetType 枚举 (uint8):
  0x00 = player      玩家
  0x01 = monster     普通怪物
  0x02 = boss        Boss
  0x03 = summon      召唤物
  0x04 = clone       分身
  0x05 = structure   建筑/图腾

direction 枚举 (uint8):
  0-7 = 0°/45°/90°/135°/180°/225°/270°/315° (每45°步进，0=右)

animState 枚举 (uint8):
  0x00 = idle        待机
  0x01 = walk        行走
  0x02 = run         跑步
  0x03 = attack      攻击
  0x04 = cast        施法
  0x05 = hurt        受伤
  0x06 = dead        死亡
  0x07 = victory     胜利
  0x08 = emote       表情动作

resourceType 枚举 (uint8):
  0x00 = rage        怒气 (Warrior, 0-100)
  0x01 = focus       集中 (Archer, 0-100)
  0x02 = mana        法力 (Mage, 0-200)
  0x03 = energy      能量 (Assassin, 0-120)

ccType 枚举 (uint8):
  0x00 = stun        眩晕
  0x01 = freeze      冰冻
  0x02 = root        定身
  0x03 = fear        恐惧
  0x04 = confusion   混乱
  0x05 = blind       致盲
  0x06 = silence     沉默

ccEndReason 枚举 (uint8):
  0x00 = expire      自然到期
  0x01 = purify      被净化
  0x02 = immune      免疫触发

summonType 枚举 (uint8):
  0x00 = wolf        狼
  0x01 = bear        熊
  0x02 = skeleton    骷髅
  0x03 = clone       分身
  0x04 = elemental   元素
  0x05 = totem       图腾

cloneType 枚举 (uint8):
  0x00 = shadow_dancer 影舞者分身
  0x01 = illusionist   幻术师分身
  0x02 = phantom       幻影分身

rarity 枚举 (uint8):
  0x00 = normal      普通 (白)
  0x01 = magic       魔法 (蓝)
  0x02 = rare        稀有 (黄)
  0x03 = epic        史诗 (紫)
  0x04 = legendary   传说 (金)
  0x05 = mythic      神话 (红)

itemType 枚举 (uint8):
  0x00 = equipment   装备
  0x01 = material    材料
  0x02 = currency    货币
  0x03 = consumable  消耗品

reviveType 枚举 (uint8):
  0x00 = respawn     回到复活点
  0x01 = skill       技能复活
  0x02 = item        道具复活

immuneType 枚举 (uint8):
  0x00 = control     免疫控制
  0x01 = damage      免疫伤害
  0x02 = death       免疫死亡

invisBreakReason 枚举 (uint8):
  0x00 = attack      发起攻击
  0x01 = damaged     受到伤害
  0x02 = skill       主动破隐
  0x03 = expire      时间到期

interruptType 枚举 (uint8):
  0x00 = stun        眩晕打断
  0x01 = knockback   击退打断
  0x02 = silence     沉默打断

deathType 枚举 (uint8):
  0x00 = normal      正常死亡
  0x01 = fall        坠落
  0x02 = trap        陷阱
  0x03 = boss_mechanic Boss机制
```

---

### 22.2 S2C_PLAYER_MOVE (0x0020) — 玩家移动同步

**频率**：~20Hz（每 50ms） | **Body 大小**：12 字节（固定）

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    playerId          玩家ID（1-65535, 0 保留）
2     2     int16     posX              世界坐标 X（像素，-32768~32767）
4     2     int16     posY              世界坐标 Y（像素，-32768~32767）
6     1     int8      velX              速度分量 X（px/tick，-128~127）
7     1     int8      velY              速度分量 Y（px/tick，-128~127）
8     1     uint8     direction         朝向（见枚举 0-7）
9     1     uint8     animState         动画状态（见枚举）
10    2     uint16    timestamp         时间戳（会话内 ms delta，0-65535 回绕）
```

**总计**：12 字节 body + 8 字节 header = **20 字节/帧/玩家**

**设计说明**：
- 速度分量用于客户端插值预测，服务端每 tick 校验位置偏差
- timestamp 用于客户端计算网络延迟和帧间插值 α 值
- 坐标用 int16 而非 uint16，支持负坐标（副本中可能出现）

---

### 22.3 S2C_DAMAGE (0x0030) — 伤害

**频率**：视战斗密度 1-10Hz | **Body 大小**：13 字节（固定）

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    attackerId        攻击者 ID
2     2     uint16    targetId          目标 ID
4     1     uint8     targetType        目标类型（见枚举）
5     2     uint16    damage            伤害值（0-65535）
7     1     uint8     flags             位标志（见下）
8     2     int16     hitX              命中位置 X（-32768~32767，0x8000=不使用）
10    2     int16     hitY              命中位置 Y（同上）
12    1     uint8     effectId          打击特效ID（0=默认）
```

**flags 位域**：
```
bit 0:    isCrit           暴击 (0/1)
bit 1-3:  damageType       伤害类型（见枚举，3位=0-7）
bit 4:    isDot            DOT跳伤害 (0/1)
bit 5-7:  reserved         保留
```

**总计**：13 字节 body + 8 字节 header = **21 字节/条**

---

### 22.4 S2C_HEAL (0x0031) — 治疗

**Body 大小**：9 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    sourceId          治疗来源 ID
2     2     uint16    targetId          治疗目标 ID
4     2     uint16    healAmount        治疗量（FXP: ×10, /10.0 得原始值）
6     1     uint8     flags             bit0=isCrit, bit1-7=reserved
7     2     uint16    sourceSkillId     null=0xFFFF 表示非技能治疗（药水等）
```

---

### 22.5 S2C_SHIELD_UPDATE (0x0032) — 护盾更新

**Body 大小**：8 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    targetId          护盾持有者 ID
2     2     uint16    shieldCurrent     当前护盾值（0=护盾消失）
4     2     uint16    shieldMax         最大护盾值
6     2     uint16    sourceSkillId     null=0xFFFF
```

---

### 22.6 S2C_DODGE (0x0033) — 闪避

**Body 大小**：5 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    targetId          闪避者 ID
2     2     uint16    attackerId        攻击者 ID
4     1     uint8     attackerSkillId   null=0x00 表示普攻
```

---

### 22.7 S2C_BLOCK (0x0034) — 格挡

**Body 大小**：10 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    targetId          格挡者 ID
2     2     uint16    attackerId        攻击者 ID
4     2     uint16    blockedDamage     被格挡的伤害量
6     2     uint16    originalDamage    原始伤害量
8     2     uint16    reflectDamage     反伤量（0=无反伤）
```

---

### 22.8 S2C_TAUNT (0x0035) — 嘲讽

**Body 大小**：7 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    sourceId          嘲讽来源 ID
2     2     uint16    targetId          被嘲讽者 ID
4     2     uint16    durationMs        持续时间（0=嘲讽结束）
6     1     uint8     priority          嘲讽优先级（0-255，高优先覆盖低）
```

---

### 22.9 S2C_IMMUNE (0x0036) — 免疫触发

**Body 大小**：3 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    targetId          免疫者 ID
2     1     uint8     immuneType        免疫类型（见枚举）
```

---

### 22.10 S2C_CROWD_CONTROL (0x0037) / S2C_CC_END (0x0038)

**S2C_CROWD_CONTROL** — Body 7 字节：

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    targetId          被控制者 ID
2     1     uint8     ccType            控制类型（见枚举）
3     2     uint16    durationMs        持续时间（ms）
5     2     uint16    sourceSkillId     来源技能ID（null=0xFFFF）
```

**S2C_CC_END** — Body 3 字节：

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    targetId
2     1     uint8     endReason         结束原因（见枚举）
```

---

### 22.11 S2C_DOT_TICK (0x0039) — DOT 每跳

**Body 大小**：7 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    targetId          目标 ID
2     2     uint16    tickDamage        本跳伤害
4     1     uint8     dotStack          剩余跳数
5     2     uint16    sourceSkillId     来源技能 ID
```

---

### 22.12 S2C_INVISIBILITY (0x003A) / S2C_INVINCIBLE (0x003B)

**S2C_INVISIBILITY** — Body 3 字节：

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    playerId
2     1     uint8     flags             bit0=invisible(1=隐身,0=现身),
                                        bit1-2=breakReason(仅现身时有效,见枚举),
                                        bit3-7=reserved
```

**S2C_INVINCIBLE** — Body 3 字节：

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    targetId
2     1     uint8     flags             bit0=invincible(1=无敌,0=结束),
                                        bit1-7=reserved
```

---

### 22.13 S2C_RESOURCE_CHANGE (0x003C) — 职业资源变化

**Body 大小**：9 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    playerId
2     1     uint8     resourceType      资源类型（见枚举）
3     1     uint8     oldValue          旧值
4     1     uint8     newValue          新值
5     1     uint8     maxValue          最大值
6     2     uint16    changeReason      0=自然回复, >0=技能ID
8     1     uint8     deltaSign         0=减少, 1=增加
```

---

### 22.14 S2C_PLAYER_STATS_DELTA (0x0021) — 玩家属性增量

**Body 大小**：10-18 字节（变长，带掩码）

使用位掩码标记哪些字段存在，避免传输未变化字段：

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    playerId
2     2     uint16    fieldMask         位掩码（见下）
4     n     varies    各变化字段        按掩码顺序排列
```

**fieldMask 位定义**（bit 0 = LSB）：

| Bit | 字段 | 类型 | 大小 |
|-----|------|------|------|
| 0 | hp | uint16 | 2 |
| 1 | maxHp | uint16 | 2 |
| 2 | mp | uint16 | 2 |
| 3 | maxMp | uint16 | 2 |
| 4 | resource | uint8 | 1 |
| 5 | exp | uint32 | 4 |
| 6 | level | uint8 | 1 |
| 7 | combatPower | uint16 | 2 |

掩码示例：`fieldMask = 0x0001` → 仅 hp 变化，body 4 字节（playerId + mask + hp=2B），总计 10 字节。

---

### 22.15 S2C_PLAYER_BUFF_UPDATE (0x0022) — Buff 变化

**Body 大小**：变长

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    playerId
2     1     uint8     addCount          新增 Buff 数（0-255）
3     1     uint8     removeCount       移除 Buff 数（0-255）
4     n     Buff[]    addBuffs          addCount 个 Buff 结构
4+n   m     uint16[]  removeBuffIds     removeCount 个 uint16 buffId
```

**Buff 子结构** (6 字节)：
```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    buffId
2     1     int8      stacks            层数（-128~127，负=减益）
3     2     uint16    remainMs          剩余时间（ms, 0=永久, 65535=未知）
5     1     uint8     sourcePlayerId    null=0x00表示无来源玩家
```

---

### 22.16 S2C_PLAYER_ANIMATION (0x0023) — 动画同步

**Body 大小**：5 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    playerId
2     1     uint8     animState         动画状态（见枚举）
3     1     uint8     skillSlot         关联技能槽位（0-13, 0xFF=无关联）
4     1     uint8     param             附加参数（如表情ID等，0xFF=无）
```

---

### 22.17 S2C_PLAYER_TELEPORT (0x0024) — 传送

**Body 大小**：7 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    playerId
2     2     int16     posX
4     2     int16     posY
6     1     uint8     transitionEffect  过渡特效（0=瞬移, 1=传送门, 2=闪烁, 3=渐隐）
```

---

### 22.18 S2C_PLAYER_DEATH (0x0025) — 玩家死亡

**Body 大小**：5 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    playerId
2     2     uint16    killerId          击杀者 ID（0xFFFF=环境/陷阱）
4     1     uint8     deathType         死亡类型（见枚举）
```

---

### 22.19 S2C_PLAYER_REVIVE (0x0026) — 玩家复活

**Body 大小**：10 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    playerId
2     1     uint8     reviveType        复活类型（见枚举）
3     2     uint16    hpRestore         回复 HP 量
5     2     uint16    mpRestore         回复 MP 量
7     2     int16     posX              复活位置 X
9     2     int16     posY              复活位置 Y
```

---

### 22.20 S2C_SKILL_CAST_START (0x0040) — 技能释放开始

**Body 大小**：14 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    casterId          施法者 ID
2     1     uint8     skillSlot         技能槽位（0-13）
3     2     uint16    skillId           技能 ID
5     2     uint16    castTimeMs        前摇时间（ms）
7     2     int16     targetX           目标位置 X（0x8000=指向实体）
9     2     int16     targetY           目标位置 Y（同上）
11    2     uint16    targetId          目标实体 ID（0xFFFF=无目标,指向位置）
13    1     uint8     direction         施法朝向
```

---

### 22.21 S2C_SKILL_CAST_INTERRUPT (0x0041) — 技能被打断

**Body 大小**：4 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    casterId
2     1     uint8     skillSlot         被断技能槽位
3     1     uint8     interruptType     打断类型（见枚举）
```

---

### 22.22 S2C_SKILL_CAST_FINISH (0x0042) — 技能释放完成（服务端确认）

**Body 大小**：8 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    casterId
2     1     uint8     skillSlot
3     2     uint16    skillId
5     1     uint8     actualMpCost      实际消耗 MP（百分比 FXP: ×10, /10.0）
6     2     uint16    actualCooldownMs  实际冷却时间（ms，因为装备/天赋/Buff可能减少）
```

---

### 22.23 S2C_SKILL_HIT (0x0043) — 技能命中

**Body 大小**：变长（含变长 hit 数组）

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    casterId
2     2     uint16    skillId
4     1     uint8     hitCount          命中目标数（0-255）
5     n     Hit[]     hits              hitCount 个 Hit 子结构
```

**Hit 子结构**（变长，每个 hit 7-15 字节）：

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    targetId
2     2     uint16    damage            伤害值
4     1     uint8     flags             bit0=isCrit,
                                        bit1-3=damageType,
                                        bit4-7=effectCount (0-15)
5     0-10  Effect[]  effects           effectCount 个效果
```

**Effect 子结构**（2 字节）：
```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     1     uint8     effectType        效果类型
                                        0x00=灼烧, 0x01=中毒, 0x02=减速,
                                        0x03=破甲, 0x04=易伤, 0x05=击退,
                                        0x06=吸血, 0x07=冰冻, 0x08=感电,
                                        0x09=标记, 0x0A=诅咒
1     1     uint8     effectValue       效果数值（FXP: ×2, /2.0）
```

**示例**：1 个 caster 对 3 个目标命中，每个目标 2 个效果 → body = 4+1+3×(4+1+4) = 4+1+27 = 32 字节

---

### 22.24 S2C_SKILL_AOE_ZONE (0x0044) — AOE 区域

**Body 大小**：18 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    casterId
2     2     uint16    skillId
4     2     uint16    zoneId            区域唯一 ID（服务端分配，全副本唯一）
6     2     int16     centerX
8     2     int16     centerY
10    2     uint16    radius            半径（px）
12    2     uint16    warnDurationMs    预警时间（0=无预警，即时生效）
14    2     uint16    persistDurationMs 持续时间
16    1     uint8     effectType        0x00=伤害, 0x01=治疗, 0x02=控制, 0x03=增益
17    1     uint8     damagePerTick     FXP: ×10, /10.0 (0=无伤害)
```

---

### 22.25 S2C_SKILL_AOE_REMOVE (0x0045) — 移除 AOE 区域

**Body 大小**：1 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     1     uint8     zoneId            区域 ID（服务端以单字节编号，每副本最多 256 个活跃 AOE）
```

---

### 22.26 S2C_SUMMON_SPAWN (0x0050) — 召唤物生成

**Body 大小**：26 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    summonId          召唤物唯一 ID
2     2     uint16    ownerId           主人 ID
4     1     uint8     summonType        召唤物类型（见枚举）
5     2     uint16    hp
7     2     uint16    maxHp
9     2     uint16    atk               攻击力
11    2     uint16    def               防御力
13    2     int16     posX
15    2     int16     posY
17    2     uint16    durationMs        持续时间（0=永续直到死亡）
19    1     uint8     count             同类型召唤数量（如狼群）
20    4     float32   scale             缩放因子（1.0=标准）
24    1     uint8     flags             bit0=可被嘲讽, bit1=可被AOE命中, bit2-7=reserved
25    1     uint8     aiType            0=跟随, 1=攻击最近, 2=攻击主人目标, 3=原地驻守
```

---

### 22.27 S2C_SUMMON_DESPAWN (0x0051) — 召唤物消失

**Body 大小**：2 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    summonId
```

消失原因从 header flags 中推断（服务端统一处理）。

---

### 22.28 S2C_SUMMON_MOVE (0x0052) — 召唤物移动

**Body 大小**：8 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    summonId
2     2     int16     posX
4     2     int16     posY
6     2     uint16    targetId          追踪目标（0xFFFF=纯移动）
```

---

### 22.29 S2C_CLONE_SPAWN (0x0054) — 分身生成

**Body 大小**：18 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    cloneId
2     2     uint16    ownerId
4     1     uint8     cloneType         分身类型（见枚举）
5     1     uint8     hpPercent         HP 百分比（0-100）
6     1     uint8     atkPercent        攻击力百分比（0-100）
7     2     int16     posX
9     2     int16     posY
11    2     uint16    durationMs
13    1     uint8     count             分身数
14    1     uint8     flags             bit0=可操作, bit1=继承装备外观, bit2-7=reserved
15    2     uint16    linkedSkillId     关联来源技能
17    1     uint8     behavior          0=镜像本体动作, 1=自主AI攻击, 2=驻守, 3=自爆
```

---

### 22.30 S2C_CLONE_EXPLODE (0x0055) — 分身爆炸

**Body 大小**：7 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    cloneId
2     2     uint16    damage            爆炸伤害
4     2     uint16    aoeRadius         AOE 半径（px）
6     1     uint8     hitCount          命中敌人数
```

---

### 22.31 S2C_CLONE_DAMAGE (0x0056) — 分身受伤

**Body 大小**：6 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    cloneId
2     2     uint16    damage
4     1     uint8     remainingHpPercent 剩余 HP%
5     1     uint8     flags              bit0=被击杀(1), bit1-7=reserved
```

---

### 22.32 S2C_DROP_ITEM (0x0060) — 掉落物品

**Body 大小**：20 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    dropId            掉落唯一 ID（本副本内）
2     1     uint8     itemType          物品类型（见枚举）
3     2     uint16    itemConfigId      物品配置 ID（查表得名称/图标等）
5     1     uint8     rarity            稀有度（见枚举）
6     2     int16     posX
8     2     int16     posY
10    2     uint16    expireTimeMs      消失倒计时（ms，0=手动拾取前不消失）
12    2     uint16    gearScore         装备评分（仅 equipment 时有效，否则=0）
14    1     uint8     equipSlot         装备槽位（仅 equipment 时有效，否则=0xFF）
15    1     uint8     flags             bit0=teamShared(团队共享), bit1=bound(拾取绑定),
                                        bit2=needRoll(需掷点), bit3-7=reserved
16    1     uint8     quantity          数量（堆叠物/materials/currency, 1-255）
17    1     uint8     suffixTier        词缀Tier（0=无, 1-5=T1-T5, 仅equipment）
18    1     uint8     prefixTier        前缀Tier（同上）
19    1     uint8     legendaryPowerId  传说威能ID（0=无, 仅 legendary/mythic 时有效）
```

---

### 22.33 S2C_DROP_BEAM (0x0061) — 稀有度光柱特效

**Body 大小**：4 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    dropId
2     1     uint8     rarity            →客户端按稀有度播放对应颜色光柱
3     1     uint8     reserved
```

客户端的 6 级光柱映射：

| rarity | 颜色 | 特效描述 |
|--------|------|----------|
| 0 (normal) | 无光柱 | — |
| 1 (magic) | 蓝 | 细光柱 |
| 2 (rare) | 黄 | 金光柱 |
| 3 (epic) | 紫 | 旋转紫光柱 |
| 4 (legendary) | 金 | 粗金光柱+地面波纹 |
| 5 (mythic) | 红 | 巨大红光柱+全屏闪烁+全服广播 |

---

### 22.34 S2C_PICKUP_RESULT (0x0062) — 拾取结果

**Body 大小**：4 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    dropId
2     1     uint8     playerId          拾取者 ID（0x00=拾取失败）
3     1     uint8     reason            0=成功, 1=背包满, 2=距离过远, 3=已被拾取, 4=无权限
```

---

### 22.35 S2C_TEAM_BUFF_APPLY / S2C_TEAM_SHIELD_APPLY / S2C_TEAM_HEAL (0x0028-0x002A)

**共用结构**：所有团队效果使用相同的变长格式。

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    casterId
2     2     uint16    sourceSkillId
4     2     uint16    value             效果值（治疗量/护盾量/Buff值）
6     1     uint8     affectedCount     受影响玩家数
7     n     uint16[]  affectedPlayerIds affectedCount × 2 字节
7+n   2     uint16    durationMs        持续时间
```

---

### 22.36 S2C_RESURRECTION (0x0057) — 复活

**Body 大小**：5 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    casterId
2     2     uint16    targetId
4     1     uint8     hpRestorePercent  回复HP百分比（0-100）
```

---

### 22.37 S2C_FINAL_GUARDIAN (0x00DB) — 最终守护触发

**Body 大小**：4 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    guardianId        触发者 ID
2     1     uint8     effectType        0=death_shield(防死), 1=invincibility(无敌)
3     1     uint8     durationMs        FXP: ×50, /50.0 (0-12750ms)
```

---

### 22.38 S2C_TIME_MANIPULATION (0x0058) — 时间操控

**Body 大小**：变长

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    casterId
2     1     uint8     effectType        0=slow_enemy, 1=speed_cooldown, 2=fate_shield
3     1     uint8     affectedCount     影响目标数
4     n     uint16[]  affectedIds       affectedCount × 2 字节
4+n   2     uint16    durationMs        持续时间
```

---

### 22.39 S2C_TOWN_PLAYER_JOIN (0x0151) — 主城玩家进入视野

**频率**：视主城人数 | **Body 大小**：11 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    playerId
2     1     uint8     nameLen           名称长度
3     n     utf8      name              nameLen 字节 UTF-8（最多 16 字符 ~ 48 字节）
3+n   1     uint8     level
4+n   2     uint16    classId           职业 ID
6+n   2     int16     posX
8+n   2     int16     posY
```

典型大小（名称 8 字节 UTF-8）：11 + 8 = **19 字节**

---

### 22.40 S2C_TOWN_PLAYER_LEAVE (0x0152) — 主城玩家离开视野

**Body 大小**：2 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    playerId
```

---

### 22.41 S2C_HEARTBEAT (0x0003) — 心跳

**Body 大小**：0 字节（仅 header，serverTime 从 header 的 seqId + 会话起始时间计算）

---

### 22.42 S2C_AWAKENING_TRIGGER (0x0076) — 觉醒效果触发（战斗内）

**Body 大小**：4 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    playerId
2     1     uint8     equipSlot         装备槽位（0-9）
3     1     uint8     effectId          效果 ID（客户端查表显示文本+特效）
```

---

### 22.43 S2C_EMOTE (0x0116) — 表情/动作

**Body 大小**：4 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    playerId
2     1     uint8     emoteId           表情 ID（0-255）
3     1     uint8     targetId          目标玩家 ID 低位（0=无目标）
```

---

### 22.44 S2C_ABYSS_ENERGY (0x00B0) — 深渊能量

**Body 大小**：3 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     1     uint8     current           当前能量（0-100）
1     1     uint8     max               最大能量（100）
2     1     uint8     flags             bit0=triggered(已触发深渊之门), bit1-7=reserved
```

---

### 22.45 S2C_ACK (0x0145) — ACK 回执

**Body 大小**：2 字节

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    ackSeqId          确认收到的最大连续 seqId
```

---

## 23. 低频消息 JSON Schema 定义

低频消息（UI/面板/强化结果/对话等）使用 WebSocket Text Frame，payload 为标准 JSON。

### 23.1 JSON Envelope（通用信封）

所有 JSON 消息共享此前套：

```json
{
  "t": "S2C_XXX",
  "s": 1718334720000,
  "v": 1,
  "d": { /* 各消息自定义 */ }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `t` | string | 消息类型名（与 §21 的 msgType 对应，客户端按名称分发） |
| `s` | uint64 | 服务器 Unix 时间戳（毫秒） |
| `v` | uint16 | 协议版本号 |
| `d` | object/array | 载荷数据 |

### 23.2 S2C_AUTH_RESULT

```json
{
  "t": "S2C_AUTH_RESULT",
  "s": 1718334720000,
  "v": 1,
  "d": {
    "success": true,
    "playerId": 10001,
    "sessionToken": "a1b2c3d4e5f6...",
    "playerData": {
      "name": "勇者王",
      "level": 1,
      "class": {"base": 0, "first": null, "second": null},
      "stats": {"hp": 200, "maxHp": 200, "mp": 50, "maxMp": 50, "atk": 10, "def": 8, "spd": 5, "crit": 5},
      "exp": 0,
      "gold": 0,
      "position": {"x": 0, "y": 0, "scene": "town"},
      "equippedSkills": [{"slot": 0, "skillId": 1001, "cooldownRemain": 0}],
      "equipment": {"mainHand": null, "offHand": null, "head": null, "body": null, "hands": null, "legs": null, "feet": null, "amulet": null, "ring": null, "belt": null},
      "inventory": []
    },
    "reason": null
  }
}
```

### 23.3 S2C_PLAYER_FULL_STATE

```json
{
  "t": "S2C_PLAYER_FULL_STATE",
  "s": 1718334720000,
  "v": 1,
  "d": {
    "playerId": 10001,
    "name": "勇者王",
    "level": 25,
    "exp": 12345,
    "class": {"base": 0, "first": 0, "second": null},
    "stats": {
      "hp": 850, "maxHp": 1200,
      "mp": 120, "maxMp": 200,
      "atk": 85, "def": 72,
      "matk": 30, "mdef": 45,
      "spd": 12, "crit": 8, "dodge": 5
    },
    "resource": {"type": "rage", "current": 45, "max": 100},
    "position": {"x": 1200, "y": 800},
    "direction": 2,
    "animationState": "idle",
    "equippedSkills": [
      {"slot": 0, "skillId": 1001, "cooldownRemain": 0},
      {"slot": 1, "skillId": 1002, "cooldownRemain": 3000}
    ],
    "buffs": [
      {"id": 2001, "stacks": 3, "remainMs": 15000, "sourcePlayerId": null}
    ],
    "equipment": {
      "mainHand": {"itemId": 5001, "configId": 30010, "rarity": "epic", "level": 20, "enhanceLevel": 8, "affixPrefix": {"name": "锐利", "tier": 3, "stat": "atk", "value": 25}, "affixSuffix": null, "legendaryPowerId": 0},
      "offHand": null,
      "head": {"itemId": 5002, "configId": 31001, "rarity": "rare", "level": 18, "enhanceLevel": 5, "affixPrefix": null, "affixSuffix": null, "legendaryPowerId": 0}
    },
    "talents": {
      "branch1": [1, 0, 1, 0, 0, 0],
      "branch2": [0, 0, 0, 0, 0, 0],
      "branch3": [0, 0, 0, 0, 0, 0],
      "remainingPoints": 10
    },
    "sigils": [
      {"slot": 0, "sigilId": 6001, "type": "atk", "quality": "blue"},
      {"slot": 1, "sigilId": null, "type": null, "quality": null}
    ],
    "enhancements": [
      {"slot": "mainHand", "level": 8},
      {"slot": "head", "level": 5}
    ],
    "combatPower": 1850
  }
}
```

### 23.4 S2C_ENHANCE_RESULT

```json
{
  "t": "S2C_ENHANCE_RESULT",
  "s": 1718334720000,
  "v": 1,
  "d": {
    "slot": "mainHand",
    "oldLevel": 10,
    "newLevel": 11,
    "success": true,
    "failPenalty": null,
    "protectShieldConsumed": false,
    "enhanceEnergyGained": 5,
    "statsGained": {"atk": 12, "matk": 0},
    "materialsConsumed": [
      {"materialId": 7001, "name": "强化石", "quantity": 5},
      {"materialId": 7005, "name": "守护符文", "quantity": 1}
    ]
  }
}
```

### 23.5 S2C_BAG_UPDATE

```json
{
  "t": "S2C_BAG_UPDATE",
  "s": 1718334720000,
  "v": 1,
  "d": {
    "itemsAdd": [
      {"bagSlot": 12, "itemId": 5001, "itemType": "equipment", "configId": 30010, "rarity": "epic", "level": 20, "quantity": 1}
    ],
    "itemsRemove": [5],
    "itemsUpdate": [
      {"bagSlot": 3, "changedFields": {"quantity": 15}}
    ],
    "goldDelta": -500,
    "goldNewTotal": 3200
  }
}
```

### 23.6 S2C_STORY_NODE_TRIGGER

```json
{
  "t": "S2C_STORY_NODE_TRIGGER",
  "s": 1718334720000,
  "v": 1,
  "d": {
    "nodeId": "ACT2_NODE_CRITICAL_02",
    "nodeType": "critical",
    "floor": 18,
    "content": {
      "dialogues": [
        {
          "speakerId": "vera",
          "speakerName": "薇拉",
          "text": "你终于来了……我一直在这火焰中等待。",
          "portrait": "vera_sorrow",
          "emotion": "sorrow"
        },
        {
          "speakerId": "player",
          "speakerName": null,
          "text": "这火焰……是你点燃的吗？",
          "portrait": null,
          "emotion": "neutral"
        }
      ],
      "environmentDesc": "燃烧的殿堂，火焰如泪般从天花板滴落。",
      "collectibleDropped": null
    }
  }
}
```

### 23.7 S2C_CHRONICLE_FULL

```json
{
  "t": "S2C_CHRONICLE_FULL",
  "s": 1718334720000,
  "v": 1,
  "d": {
    "chapters": [
      {
        "chapterName": "序章",
        "acts": [
          {
            "actName": "觉醒",
            "nodes": [
              {"id": "PROLOGUE_01", "title": "苏醒", "unlocked": true, "hasCollectible": false},
              {"id": "PROLOGUE_02", "title": "第一道光", "unlocked": true, "hasCollectible": true}
            ]
          }
        ]
      },
      {
        "chapterName": "第一章",
        "acts": [
          {
            "actName": "灰烬与火焰",
            "nodes": [
              {"id": "ACT1_01", "title": "燃烧的村庄", "unlocked": true, "hasCollectible": false},
              {"id": "ACT1_CRITICAL_01", "title": "薇拉的挽歌", "unlocked": false, "hasCollectible": true}
            ]
          }
        ]
      }
    ],
    "collectiblesCount": 3,
    "totalCollectibles": 25
  }
}
```

### 23.8 JSON 消息大小参考

| 消息类型 | 典型 JSON 大小 | 压缩后 |
|----------|---------------|--------|
| `S2C_AUTH_RESULT` | ~1.5 KB | ~0.4 KB |
| `S2C_PLAYER_FULL_STATE` | ~3-8 KB | ~1-2 KB |
| `S2C_ENHANCE_RESULT` | ~0.3 KB | ~0.1 KB |
| `S2C_BAG_UPDATE` | ~0.5 KB | ~0.15 KB |
| `S2C_STORY_NODE_TRIGGER` | ~1-3 KB | ~0.3-0.8 KB |
| `S2C_CHRONICLE_FULL` | ~2-5 KB | ~0.5-1.5 KB |

---

## 24. 序列化/反序列化参考实现

### 24.1 JavaScript/TypeScript — Binary Codec

```typescript
// ====== 二进制解码器 ======

class BinaryReader {
  private buf: DataView;
  private off: number = 0;

  constructor(buffer: ArrayBuffer) { this.buf = new DataView(buffer); }

  uint8(): number    { const v = this.buf.getUint8(this.off);   this.off += 1; return v; }
  int8(): number     { const v = this.buf.getInt8(this.off);    this.off += 1; return v; }
  uint16(): number   { const v = this.buf.getUint16(this.off, true); this.off += 2; return v; }
  int16(): number    { const v = this.buf.getInt16(this.off, true);  this.off += 2; return v; }
  uint32(): number   { const v = this.buf.getUint32(this.off, true); this.off += 4; return v; }
  int32(): number    { const v = this.buf.getInt32(this.off, true);  this.off += 4; return v; }
  float32(): number  { const v = this.buf.getFloat32(this.off, true); this.off += 4; return v; }
  bool(): boolean    { return this.uint8() !== 0; }

  string(): string {
    const len = this.uint16();
    if (len === 0) return '';
    const bytes = new Uint8Array(this.buf.buffer, this.buf.byteOffset + this.off, len);
    this.off += len;
    return new TextDecoder('utf-8').decode(bytes);
  }

  string8(): string { // name strings (max 255 bytes)
    const len = this.uint8();
    if (len === 0) return '';
    const bytes = new Uint8Array(this.buf.buffer, this.buf.byteOffset + this.off, len);
    this.off += len;
    return new TextDecoder('utf-8').decode(bytes);
  }

  remaining(): number { return this.buf.byteLength - this.off; }
}

class BinaryWriter {
  private chunks: ArrayBuffer[] = [];
  private currentSize: number = 0;

  uint8(v: number)   { this.append(new Uint8Array([v]).buffer); }
  int8(v: number)    { this.append(new Int8Array([v]).buffer); }
  uint16(v: number)  { const b = new ArrayBuffer(2); new DataView(b).setUint16(0, v, true); this.append(b); }
  int16(v: number)   { const b = new ArrayBuffer(2); new DataView(b).setInt16(0, v, true); this.append(b); }
  uint32(v: number)  { const b = new ArrayBuffer(4); new DataView(b).setUint32(0, v, true); this.append(b); }
  int32(v: number)   { const b = new ArrayBuffer(4); new DataView(b).setInt32(0, v, true); this.append(b); }
  float32(v: number) { const b = new ArrayBuffer(4); new DataView(b).setFloat32(0, v, true); this.append(b); }
  bool(v: boolean)   { this.uint8(v ? 1 : 0); }

  string(s: string) {
    const encoded = new TextEncoder().encode(s);
    this.uint16(encoded.length);
    this.append(encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength));
  }

  string8(s: string) {
    const encoded = new TextEncoder().encode(s);
    if (encoded.length > 255) throw new Error('String too long for uint8 prefix');
    this.uint8(encoded.length);
    this.append(encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength));
  }

  private append(buf: ArrayBuffer) {
    this.chunks.push(buf);
    this.currentSize += buf.byteLength;
  }

  toBuffer(): ArrayBuffer {
    const result = new Uint8Array(this.currentSize);
    let off = 0;
    for (const chunk of this.chunks) {
      result.set(new Uint8Array(chunk), off);
      off += chunk.byteLength;
    }
    return result.buffer;
  }
}
```

### 24.2 Binary Frame Header 读写

```typescript
interface FrameHeader {
  msgType: number;     // uint16 LE
  bodyLen: number;     // uint16 LE
  seqId: number;       // uint16 LE
  flags: number;       // uint8
  version: number;     // uint8
}

function decodeHeader(buf: ArrayBuffer): FrameHeader {
  const dv = new DataView(buf);
  return {
    msgType: dv.getUint16(0, true),
    bodyLen: dv.getUint16(2, true),
    seqId:   dv.getUint16(4, true),
    flags:   dv.getUint8(6),
    version: dv.getUint8(7),
  };
}

function encodeHeader(h: FrameHeader): ArrayBuffer {
  const buf = new ArrayBuffer(8);
  const dv = new DataView(buf);
  dv.setUint16(0, h.msgType, true);
  dv.setUint16(2, h.bodyLen, true);
  dv.setUint16(4, h.seqId, true);
  dv.setUint8(6, h.flags);
  dv.setUint8(7, h.version);
  return buf;
}
```

### 24.3 WebSocket 帧分发器

```typescript
class MessageDispatcher {
  private binaryHandlers: Map<number, (reader: BinaryReader) => void> = new Map();
  private jsonHandlers: Map<string, (data: any) => void> = new Map();
  private seqId: number = 0;
  private pendingAcks: Set<number> = new Set();

  // 注册二进制消息处理器
  onBinary(msgType: number, handler: (reader: BinaryReader) => void) {
    this.binaryHandlers.set(msgType, handler);
  }

  // 注册 JSON 消息处理器
  onJson(msgType: string, handler: (data: any) => void) {
    this.jsonHandlers.set(msgType, handler);
  }

  // WebSocket onmessage 入口
  handleMessage(event: MessageEvent) {
    if (event.data instanceof ArrayBuffer) {
      this.handleBinary(event.data);
    } else if (typeof event.data === 'string') {
      this.handleJson(event.data);
    }
  }

  private handleBinary(buf: ArrayBuffer) {
    const header = decodeHeader(buf);

    // 处理 ACK 请求
    if (header.flags & 0x40) { // reliable flag
      this.sendAck(header.seqId);
    }

    const body = buf.slice(8);
    const reader = new BinaryReader(body);

    const handler = this.binaryHandlers.get(header.msgType);
    if (handler) {
      handler(reader);
    } else {
      console.warn(`Unknown binary msgType: 0x${header.msgType.toString(16)}`);
    }
  }

  private handleJson(text: string) {
    try {
      const msg = JSON.parse(text);
      // 移除通用信封字段，直接传 d
      const type = msg.t;
      const handler = this.jsonHandlers.get(type);
      if (handler) {
        handler(msg.d);
      } else {
        console.warn(`Unknown JSON msgType: ${type}`);
      }
    } catch (e) {
      console.error('JSON parse error:', e);
    }
  }

  private sendAck(seqId: number) {
    const w = new BinaryWriter();
    w.uint16(seqId);
    const body = w.toBuffer();
    const header = encodeHeader({
      msgType: 0x0145,  // S2C_ACK
      bodyLen: body.byteLength,
      seqId: this.seqId++,
      flags: 0,
      version: 1,
    });
    const full = new Uint8Array(8 + body.byteLength);
    full.set(new Uint8Array(header), 0);
    full.set(new Uint8Array(body), 8);
    ws.send(full.buffer);
  }
}
```

### 24.4 示例：注册高频消息解析器

```typescript
const dispatcher = new MessageDispatcher();

// ====== 移动同步 ======
dispatcher.onBinary(0x0020, (r) => {
  const move = {
    playerId:  r.uint16(),
    posX:      r.int16(),
    posY:      r.int16(),
    velX:      r.int8(),
    velY:      r.int8(),
    direction: r.uint8(),
    animState: r.uint8(),
    timestamp: r.uint16(),
  };
  entityManager.updatePosition(move);
});

// ====== 伤害 ======
dispatcher.onBinary(0x0030, (r) => {
  const dmg = {
    attackerId: r.uint16(),
    targetId:   r.uint16(),
    targetType: r.uint8(),
    damage:     r.uint16(),
    flags:      r.uint8(),
    hitX:       r.int16(),
    hitY:       r.int16(),
    effectId:   r.uint8(),
  };
  const isCrit = !!(dmg.flags & 0x01);
  const damageType = (dmg.flags >> 1) & 0x07;
  const isDot = !!(dmg.flags & 0x10);
  combatRenderer.showDamage(dmg.targetId, dmg.damage, isCrit, damageType, isDot, dmg.hitX, dmg.hitY, dmg.effectId);
});

// ====== 技能命中 ======
dispatcher.onBinary(0x0043, (r) => {
  const casterId = r.uint16();
  const skillId  = r.uint16();
  const hitCount = r.uint8();
  const hits = [];
  for (let i = 0; i < hitCount; i++) {
    const targetId = r.uint16();
    const damage   = r.uint16();
    const flags    = r.uint8();
    const isCrit   = !!(flags & 0x01);
    const dmgType  = (flags >> 1) & 0x07;
    const effectCount = (flags >> 4) & 0x0F;
    const effects = [];
    for (let j = 0; j < effectCount; j++) {
      effects.push({ type: r.uint8(), value: r.uint8() / 2.0 });
    }
    hits.push({ targetId, damage, isCrit, damageType: dmgType, effects });
  }
  skillRenderer.showHits(casterId, skillId, hits);
});

// ====== JSON 消息（低频） ======
dispatcher.onJson('S2C_ENHANCE_RESULT', (d) => {
  uiEnhancePanel.showResult(
    d.slot, d.oldLevel, d.newLevel, d.success,
    d.statsGained, d.materialsConsumed
  );
});

dispatcher.onJson('S2C_STORY_NODE_TRIGGER', (d) => {
  dialogueSystem.start(d.nodeId, d.content.dialogues, d.content.environmentDesc);
});
```

### 24.5 JSON 压缩策略

对大于 2KB 的 JSON 消息，建议在应用层压缩后通过 binary 帧发送：

```
Binary Frame (flags.compressed = 1):
  Header (8B) → zlib-Deflate(JSON) → 客户端先 inflate 再 JSON.parse
```

压缩开关策略：
- `S2C_PLAYER_FULL_STATE`：始终压缩
- `S2C_BAG_FULL_STATE`：> 5KB 时压缩
- `S2C_CHRONICLE_FULL`：始终压缩
- `S2C_AUCTION_LIST`：> 2KB 时压缩

---

## 25. 带宽预算估算

### 25.1 单个玩家每小时带宽分解

| 消息类别 | 频率 | 单包大小 | 每秒流量 |
|----------|------|----------|----------|
| **玩家移动** (0x0020) | 20 Hz | 20 B | 400 B/s |
| **战斗伤害** (0x0030) | 5 Hz avg | 21 B | 105 B/s |
| **战斗其他** (0x0031-0x003C) | 3 Hz avg | ~10 B | 30 B/s |
| **技能相关** (0x0040-0x0045) | 2 Hz avg | ~20 B | 40 B/s |
| **掉落/拾取** (0x0060-0x0062) | 0.1 Hz | ~22 B | 2 B/s |
| **召唤物/分身** (0x005x) | 0.5 Hz | ~15 B | 8 B/s |
| **JSON 低频** (UI/面板/对话) | 0.05 Hz | ~800 B | 40 B/s |
| **心跳** (0x0003) | 0.05 Hz | 8 B | 0.4 B/s |
| **WebSocket 开销** | — | ~6 B/frame | ~120 B/s |
| **合计 (单人在副本)** | | | **~745 B/s ≈ 2.7 MB/h** |

### 25.2 服务端出口带宽（副本场景）

| 场景 | 玩家数 | 每帧广播系数 | 总下行 |
|------|--------|-------------|--------|
| 单人副本 | 1 | 1× | 0.75 KB/s |
| 4人小队副本 | 4 | ~3.5×（AOI 内队友+部分怪） | ~2.6 KB/s |
| 10人 Raid | 10 | ~8×（含 Boss 高频机制） | ~6 KB/s |
| 主城（50可见玩家） | 50 | ~15×（AOI 裁剪后活跃实体） | ~11 KB/s |

### 25.3 客户端月流量估算

假设玩家平均每天在线 3 小时：

| 活动分布 | 占比 | 小时流量 | 日流量 |
|----------|------|----------|--------|
| 副本战斗 | 50% | 2.7 MB/h × 1.5h | 4.05 MB |
| 组队副本 | 25% | 9.4 MB/h × 0.75h | 7.05 MB |
| 主城挂机 | 15% | 39.6 MB/h × 0.45h | 17.8 MB |
| UI/菜单/剧情（几乎无流量） | 10% | ~0.5 MB/h × 0.3h | 0.15 MB |
| **日流量合计** | | | **~29 MB/天** |
| **月流量估算** | | | **~870 MB/月** |

> 结论：在正常游玩模式下，客户端月流量约 **800 MB-1 GB**，移动网络友好。极端情况（主城高峰时段 200+ 人可见）可能需要进一步 AOI 裁剪优化，可降至 500-600 MB/月。

### 25.4 协议优化建议

1. **AOI 裁剪**：主城只同步屏幕 + 300px 缓冲区内的实体，远处玩家仅同步位置不发送装备/动画细节
2. **帧合并**：同一 tick 内的多个小包合为一个 WebSocket 帧（减少帧头开销）
3. **增量优先**：`S2C_PLAYER_STATS_DELTA` 用掩码机制仅发送变化的字段（平均 3-5 字段 → 12-16 字节 vs 全量 100+ 字节）
4. **LOD 分级**：距离玩家较远的实体降低同步频率（近：20Hz, 中：10Hz, 远：5Hz）
5. **DOT 合并**：同一来源的 DOT 合并到 `S2C_DAMAGE` 的 `isDot` 标志位，不单独发包
6. **移动插值**：客户端对收到的移动包做插值渲染，降低对丢包的敏感度

---

## 附录A：协议版本升级流程

```
1. 新版本协议开发 → version=N+1
2. 新旧协议并存过渡期（通常 2 周）
   - 客户端登录时发送自身支持的最大协议版本
   - 服务端 `S2C_VERSION_CHECK` 告知所需最低版本
3. 强制升级日期（所有用户必须更新到新客户端）
   - 服务端拒绝 version < minimum 的连接
4. 旧版本代码移除
```

## 附录B：错误码完整列表

| 码 | 含义 | 典型触发场景 |
|----|------|-------------|
| 1001 | 背包已满 | 拾取失败、任务奖励无法放入 |
| 1002 | 金币不足 | 强化、购买、洗练 |
| 1003 | 等级不足 | 装备穿戴、副本进入、转职 |
| 1004 | 该操作冷却中 | 技能释放、商店刷新 |
| 1005 | 目标不在范围 | 拾取距离过远、攻击距离不足 |
| 1006 | 技能未学习 | 使用未解锁的技能 |
| 1007 | 职业不匹配 | 穿戴非本职业装备 |
| 1008 | 强化材料不足 | 强化操作 |
| 1009 | 副本次数已用完 | 每日/周常副本 |
| 1010 | 装备已绑定不可交易 | 交易/拍卖 |
| 1011 | 目标不存在/已死亡 | 攻击/治疗已消失的实体 |
| 1012 | 队伍人数已满 | 邀请加入队伍 |
| 1013 | 已在队伍中 | 加入队伍请求 |
| 1014 | 房间不存在 | 进入已关闭的副本房间 |
| 1015 | 非法操作（校验失败） | 反作弊检测 |
| 1016 | 服务器负载过高 | 排队或稍后重试 |
| 1017 | 强化保护符不足 | 无保护符时进行 +16+ 强化 |
| 1018 | 徽记孔未解锁 | 在未突破装备上镶嵌徽记 |
| 1019 | 觉醒材料不足 | 觉醒操作 |
| 1020 | 天赋点不足 | 天赋分配 |
| 1021 | 已转职（不可重复） | 再次转职（需重置石） |
| 1022 | 剧情节点未解锁 | 跳层进入未解锁区域 |
| 1023 | 深渊能量不足 | 未积累足够能量触发深渊之门 |
| 1024 | 交易请求过期 | 对方已取消或超时 |

---

## 26. 服务端间BLOB通信协议

### 26.1 设计理由

客户端-服务端之间因 WebSocket text 帧天然适合 JSON，保留了 JSON + Binary 双信道。但**服务端之间**（Gateway/Game Server/DB Proxy/Lobby/Dungeon/Town Server）通信不应使用 JSON：

| 维度 | JSON (服务端间) | BLOB (服务端间) |
|------|----------------|-----------------|
| 单次序列化 | 60-500 μs | 1-10 μs |
| 玩家全量状态 | ~8 KB JSON | ~800 B binary |
| GC 压力 | 高（大量临时字符串对象） | 极低（复用 ByteBuffer） |
| DB Proxy 存储 | JSON→解析→结构化→写入 | BLOB→直接写入 |
| 吞吐瓶颈 | 序列化 CPU | 网络带宽 |

**核心理念**：服务端内部所有数据交换走纯二进制 BLOB，DB Proxy 将玩家存档以 opaque BLOB 形式直接写入/读出，不做任何解析。

### 26.2 服务端拓扑

```
                        ┌─────────────┐
                   ┌───→│  DB Proxy    │ ← 唯一致久化入口
                   │    └──────┬──────┘
                   │    TCP BLOB (LoadPlayer/SavePlayer)
                   │           │
  ┌──────────┐  TCP  ┌───────▼──────┐  TCP    ┌────────────────┐
  │  Gateway ├──────→│  Game Server  ├────────→│  Lobby Server   │
  │  (玩家入口) │BLOB  │  (逻辑权威)    │ BLOB    │  (大厅/匹配)     │
  └──────────┘       └───────────────┘         └──────┬─────────┘
                                                TCP BLOB │
                                        ┌───────────────┼───────────────┐
                                        │               │               │
                                   ┌────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
                                   │ Dungeon  │  │ Dungeon   │  │  Town     │
                                   │ Instance │  │ Instance  │  │  Server   │
                                   │  #1      │  │  #2 ...   │  │ (主城AOI)  │
                                   └──────────┘  └───────────┘  └───────────┘
```

- **Gateway**：唯一对外入口，管理 WebSocket 连接，将客户端消息打包为 BLOB 转发给 Game Server
- **Game Server**：战斗/掉落/经济等所有逻辑权威，通过 BLOB 读写 DB Proxy
- **DB Proxy**：只存/取 opaque BLOB，不解析游戏数据，不参与逻辑
- **Lobby Server**：大厅/队伍/匹配，将玩家会话路由到 Dungeon/Town
- **Dungeon Instance**：每个副本独立进程，启动时从 Lobby 接收 BLOB 玩家快照，结束时间 Lobby 回传结果
- **Town Server**：共享主城，低精度 AOI 广播

### 26.3 服务端间 BLOB 帧头（12 字节）

比客户端帧头多 4 字节（路由 + 大数据支持）：

```
偏移  字节  类型      字段              说明
─────────────────────────────────────────────────────────
0     2     uint16    magic             魔数 0xB1E7（标识服务端间 BLOB）
2     2     uint16    msgType           服务端间消息类型（见 §26.5）
4     4     uint32    bodyLen           载荷长度（字节，不含头，max 16MB）
8     4     uint32    reqId             请求-响应关联ID（0=通知/无需响应）
```

**总计**：12 字节头 + 可变 body

### 26.4 服务端间数据类型

沿用 §20.3-20.6 的所有基本类型（LE 端序，无对齐填充），额外增加：

| 类型 | 字节数 | 编码 | 用途 |
|------|--------|------|------|
| `uint64` | 8 | LE 无符号整数 | 玩家唯一 ID（跨服不重复） |
| `int64` | 8 | LE 有符号整数 | 时间戳绝对值（毫秒） |
| `blobN` | 2+4+N | `uint16 typeId + uint32 byteLen + N bytes` | 嵌入其他 BLOB（如玩家存档嵌入副本状态） |

**BLOB 嵌入格式**（`blobN`）：
```
[2B] uint16 subType      子BLOB类型ID
[4B] uint32 subLen       子BLOB字节数
[NB] bytes               子BLOB数据（不做解析，原样传递）
```
此格式允许服务端在不解析玩家存档的情况下，将整段玩家 BLOB 嵌入到副本创建等请求中透传。

### 26.5 服务端间消息类型 ID

| ID | 方向 | 消息名 | 说明 |
|----|------|--------|------|
| **GW → Game** | | | |
| `0x0001` | GW→Game | `IS_AUTH` | 认证请求（含 token BLOB） |
| `0x0002` | Game→GW | `IS_AUTH_RESULT` | 认证结果 + 玩家基础信息 |
| `0x0003` | GW→Game | `IS_HEARTBEAT` | 心跳（body 为空） |
| `0x0004` | Game→GW | `IS_KICK` | 踢人/断线通知 |
| `0x0005` | GW→Game | `IS_CLIENT_RAW` | 透传客户端二进制帧（8B头+BODY） |
| `0x0006` | Game→GW | `IS_SEND_CLIENT` | 要求GW向客户端发送的二进制帧 |
| **Game ↔ DB** | | | |
| `0x0010` | Game→DB | `IS_DB_LOAD_PLAYER` | 加载玩家存档 |
| `0x0011` | DB→Game | `IS_DB_LOAD_RESULT` | 返回玩家存档 BLOB |
| `0x0012` | Game→DB | `IS_DB_SAVE_PLAYER` | 保存玩家存档 BLOB |
| `0x0013` | DB→Game | `IS_DB_SAVE_RESULT` | 保存确认（success/conflict） |
| `0x0014` | Game→DB | `IS_DB_QUERY_RANK` | 排行榜查询 |
| `0x0015` | DB→Game | `IS_DB_QUERY_RESULT` | 排行榜结果 BLOB |
| `0x0016` | Game→DB | `IS_DB_UPDATE_RANK` | 更新排行榜 |
| `0x0017` | Game→DB | `IS_DB_LOCK_ITEM` | 交易/拍卖 物品锁定 |
| **Game ↔ Lobby** | | | |
| `0x0020` | Game→Lobby | `IS_SESSION_CREATE` | 创建玩家会话（登录成功后） |
| `0x0021` | Lobby→Game | `IS_SESSION_DESTROY` | 玩家下线通知 |
| `0x0022` | Game→Lobby | `IS_PLAYER_STATE_UPDATE` | 玩家关键状态变化（等级/转职） |
| **Lobby ↔ Dungeon** | | | |
| `0x0030` | Lobby→Dungeon | `IS_DUNGEON_CREATE` | 创建副本实例 + 队伍玩家 BLOB |
| `0x0031` | Dungeon→Lobby | `IS_DUNGEON_CREATED` | 实例就绪确认 + 实例地址 |
| `0x0032` | Lobby→Dungeon | `IS_DUNGEON_START` | 开始副本 |
| `0x0033` | Dungeon→Lobby | `IS_DUNGEON_REPORT` | 副本进度/状态定时上报 |
| `0x0034` | Dungeon→Lobby | `IS_DUNGEON_COMPLETE` | 副本结束 + 全队结果 BLOB |
| `0x0035` | Lobby→Dungeon | `IS_DUNGEON_DESTROY` | 销毁实例 |
| `0x0036` | Lobby→Dungeon | `IS_PLAYER_JOIN` | 玩家中途加入（含玩家 BLOB） |
| `0x0037` | Dungeon→Lobby | `IS_PLAYER_LEAVE` | 玩家中途离开/掉线 |
| `0x0038` | Dungeon→Lobby | `IS_DROP_GLOBAL` | 全局掉落/首杀通知（经Lobby广播） |
| **Lobby ↔ Town** | | | |
| `0x0040` | Lobby→Town | `IS_TOWN_ENTER` | 玩家进入主城 + 玩家公开信息 BLOB |
| `0x0041` | Town→Lobby | `IS_TOWN_LEAVE` | 玩家离开主城 |
| `0x0042` | Town→Lobby | `IS_TOWN_MOVE_BATCH` | 主城 AOI 批量移动（定时批量 ） |
| **Cross-Server（合服/跨服）** | | | |
| `0x0050` | Any→Any | `IS_GLOBAL_EVENT` | 全局事件广播 |
| `0x0051` | Any→Any | `IS_GLOBAL_ANNOUNCE` | 全服公告 |

### 26.6 玩家存档 BLOB 结构（DB Proxy 存储单元）

这是整个系统中**最大的单块 BLOB**（约 500-2000 字节），DB Proxy 以 `key=playerId, value=opaque blob` 形式直接写入 KV 存储（RocksDB/Redis），不做任何解析。

```
偏移  字节  类型        字段
────────────────────────────────────────────
0     4     uint32      version            存档格式版本（初始=1）
4     2     uint16      nameLen            名称长度
6     n     utf8        name               UTF-8 名称
6+n   1     uint8       level              等级（1-60）
7+n   4     uint32      exp                经验值
11+n  4     uint32      gold               金币
15+n  1     uint8       baseClass          基础职业（0-3）
16+n  1     uint8       firstAdvance       一转职业（0xFF=未转）
17+n  1     uint8       secondAdvance      二转职业（0xFF=未转）
18+n  10    StatBlk[]   baseStats          10个基础属性（每个4B uint32）
58+n  2     uint16      talentPoints       剩余天赋点
60+n  18    uint8[]     talents            3分支×6层（每层1B分配数）
78+n  1     uint8       equipCount         已装备数量
79+n  m     EquipBlk[]  equipment          装备数组
79+n+m 1    uint8       bagCount           背包物品数
80+n+m p    ItemBlk[]   bag                背包物品
80+n+m+p 1   uint8       storageCount       仓库物品数
81+n+m+p q  ItemBlk[]   storage            仓库物品
81+n+m+p+q 1 uint8       materialCount      材料种类数
82+n+m+p+q r MatBlk[]   materials          材料数组
82+n+m+p+q+r 1 uint8     sigilCount         装备徽记槽数
83+n+m+p+q+r s SigilBlk[] sigils            徽记数组
83+n+m+p+q+r+s 2 uint16   storyProgress     剧情进度位掩码
85+n+m+p+q+r+s 1 uint8    chronicleUnlockCount 编年史解锁数
86+n+m+p+q+r+s t uint16[] chronicleUnlocks  解锁节点ID数组
86+n+m+p+q+r+s+2t 2 uint16 dungeonLimits    副本次数位掩码
                                  ← 总计约 500-2000 字节
```

**子结构定义**：

`StatBlk` (4 字节)：
```
[4B] uint32 value    属性值
```
10 个属性顺序：`hp, maxHp, mp, maxMp, atk, def, matk, mdef, spd, crit`

`EquipBlk` (变长，~20-50 字节)：
```
[1B] uint8  slot         装备槽位（0-9）
[2B] uint16 configId     装备配置ID
[1B] uint8  rarity       稀有度（0-5）
[1B] uint8  level        装备等级
[1B] uint8  enhanceLevel 强化等级（0-20）
[4B] uint32 seed         词缀/随机种子（服务端用此种子重新计算属性）
[1B] uint8  prefixTier   前缀词缀 Tier（0=无）
[1B] uint8  suffixTier   后缀词缀 Tier（0=无）
[2B] uint16 legPowerId   传说威能ID（0=无）
[1B] uint8  awakeningId  觉醒效果ID（0=无）
[1B] uint8  sigilSlotCount 已解锁徽记孔数
[nB] uint16[] sigilIds   各孔徽记ID（n=2×sigilSlotCount）
```

`ItemBlk` (9 字节)：
```
[2B] uint16 configId     物品配置ID
[1B] uint8  itemType     物品类型（equipment/material/consumable）
[1B] uint8  rarity       稀有度
[1B] uint8  quantity     数量
[4B] uint32 seed         词缀种子（仅equipment有效）
```

`MatBlk` (5 字节)：
```
[2B] uint16 materialId   材料ID
[2B] uint16 quantity     数量（允许>255的堆叠）
[1B] uint8  reserved
```

### 26.7 玩家存档 BLOB 的流经路径

```
[玩家登录]
  客户端 →(WS JSON)→ Gateway →(IS_AUTH)→ GameServer
                                         │ IS_DB_LOAD_PLAYER
                                   DB Proxy ← │
                                   DB Proxy → │ IS_DB_LOAD_RESULT (含完整玩家BLOB)
  Gateway ←(IS_AUTH_RESULT)← GameServer ←─────┘ (解析BLOB,构建游戏对象)
  客户端 ←(WS JSON)←

[副本流程]
  GameServer →(IS_SESSION_CREATE)→ Lobby (含部分玩家状态BLOB)
  Lobby →(IS_DUNGEON_CREATE)→ Dungeon (含全队玩家BLOB,透传不解析)
  Dungeon 解析各玩家BLOB → 运行副本
  Dungeon →(IS_DUNGEON_COMPLETE)→ Lobby (含全队结果BLOB)
  Lobby → GameServer → GameServer 解析 → 保存 → IS_DB_SAVE_PLAYER → DB Proxy

[主城]
  Lobby →(IS_TOWN_ENTER)→ Town (含公开信息BLOB: 名称/等级/职业/外观)
  Town 定时 →(IS_TOWN_MOVE_BATCH)→ Lobby (批量位置)
  Town →(IS_TOWN_LEAVE)→ Lobby (玩家退出主城)
```

### 26.8 服务端 BLOB Codec 参考实现（C++）

```cpp
// ====== BLOB写器 (服务端用C++零拷贝) ======

class BlobWriter {
    std::vector<uint8_t> buf;
    size_t off = 0;
public:
    BlobWriter(size_t reserve = 256) { buf.reserve(reserve); }

    void u8(uint8_t v)   { buf.push_back(v); }
    void u16(uint16_t v) { buf.push_back(v & 0xFF); buf.push_back(v >> 8); }
    void u32(uint32_t v) { buf.push_back(v); buf.push_back(v>>8);
                           buf.push_back(v>>16); buf.push_back(v>>24); }
    void u64(uint64_t v) { u32(v & 0xFFFFFFFF); u32(v >> 32); }
    void i16(int16_t v)  { u16(static_cast<uint16_t>(v)); }
    void i32(int32_t v)  { u32(static_cast<uint32_t>(v)); }
    void f32(float v)    { uint32_t bits; memcpy(&bits, &v, 4); u32(bits); }
    void str(const std::string& s) { u16(s.size()); buf.insert(buf.end(), s.begin(), s.end()); }
    void str8(const std::string& s) { u8(s.size()); buf.insert(buf.end(), s.begin(), s.end()); }

    // 嵌入子BLOB (透传)
    void blob(uint16_t subType, const std::vector<uint8_t>& sub) {
        u16(subType); u32(sub.size());
        buf.insert(buf.end(), sub.begin(), sub.end());
    }

    const std::vector<uint8_t>& data() const { return buf; }
};

// ====== BLOB读器 ======

class BlobReader {
    const uint8_t* data;
    size_t len, off = 0;
public:
    BlobReader(const std::vector<uint8_t>& blob) : data(blob.data()), len(blob.size()) {}

    uint8_t  u8()  { return data[off++]; }
    uint16_t u16() { uint16_t v = data[off] | (data[off+1] << 8); off += 2; return v; }
    uint32_t u32() { uint32_t v = data[off] | (data[off+1]<<8) | (data[off+2]<<16) | (data[off+3]<<24); off += 4; return v; }
    uint64_t u64() { uint64_t lo = u32(), hi = u32(); return lo | (hi << 32); }
    int16_t  i16() { return static_cast<int16_t>(u16()); }
    int32_t  i32() { return static_cast<int32_t>(u32()); }
    float    f32() { uint32_t bits = u32(); float v; memcpy(&v, &bits, 4); return v; }
    std::string str() { auto l = u16(); std::string s(data+off, data+off+l); off += l; return s; }
    std::string str8() { auto l = u8(); std::string s(data+off, data+off+l); off += l; return s; }

    // 读取嵌入子BLOB
    std::pair<uint16_t, std::vector<uint8_t>> blob() {
        uint16_t st = u16(); uint32_t sl = u32();
        std::vector<uint8_t> sub(data + off, data + off + sl);
        off += sl;
        return {st, sub};
    }

    bool eof() const { return off >= len; }
};

// ====== DB Proxy: 保存玩家存档 (直接写BLOB,不解析) ======
void db_save_player(uint64_t playerId, const std::vector<uint8_t>& playerBlob) {
    // playerBlob 是 Game Server 序列化的 opaque BLOB
    // DB Proxy 只存不解析
    rocksdb::Status s = db->Put(rocksdb::WriteOptions(),
        "player:" + std::to_string(playerId),
        rocksdb::Slice(reinterpret_cast<const char*>(playerBlob.data()), playerBlob.size()));
}

// ====== DB Proxy: 加载玩家存档 ======
std::optional<std::vector<uint8_t>> db_load_player(uint64_t playerId) {
    std::string value;
    rocksdb::Status s = db->Get(rocksdb::ReadOptions(),
        "player:" + std::to_string(playerId), &value);
    if (!s.ok()) return std::nullopt;
    return std::vector<uint8_t>(value.begin(), value.end());
}
```

### 26.9 服务端通信帧构造（C++）

```cpp
// ====== 构造服务端间 BLOB 帧 ======

std::vector<uint8_t> makeServerFrame(uint16_t msgType, uint32_t reqId,
                                      const std::vector<uint8_t>& body) {
    BlobWriter w(12 + body.size());
    w.u16(0xB1E7);        // magic
    w.u16(msgType);       // 消息类型
    w.u32(body.size());   // body长度
    w.u32(reqId);         // 请求ID
    // 直接拼接body（零拷贝: body已在buf尾部）
    std::vector<uint8_t> frame = std::move(w.data());
    frame.insert(frame.end(), body.begin(), body.end());
    return frame;
}

// ====== 解析服务端间 BLOB 帧 ======

struct ServerFrame {
    uint16_t msgType;
    uint32_t bodyLen;
    uint32_t reqId;
    const uint8_t* body;
};

std::optional<ServerFrame> parseServerFrame(const std::vector<uint8_t>& frame) {
    if (frame.size() < 12) return std::nullopt;
    BlobReader r(frame);
    uint16_t magic = r.u16();
    if (magic != 0xB1E7) return std::nullopt;  // 非法帧
    ServerFrame f;
    f.msgType = r.u16();
    f.bodyLen = r.u32();
    f.reqId   = r.u32();
    f.body    = frame.data() + 12;
    if (12 + f.bodyLen != frame.size()) return std::nullopt;  // 长度不匹配
    return f;
}
```

### 26.10 DB Proxy 极简实现

```
DB Proxy 不包含任何游戏逻辑。它只做三件事：

1. 接收 Blob, 写入 KSV
2. 接收 key, 读取 Blob, 返回
3. 原子锁/解锁（交易用）

内部结构:
  ┌──────────────┐
  │ TCP Listener  │ ← 监听 Game Server 的 TCP 连接
  │ (端口 9701)   │
  └──────┬───────┘
         │ parseServerFrame()
  ┌──────▼───────┐
  │ Msg Router    │ ← 根据 msgType 分派: Load/Save/Lock
  └──────┬───────┘
         │
  ┌──────▼───────┐
  │ RocksDB PUT/GET│ ← 直接二进制存取
  └──────────────┘
```

### 26.11 数据流全景示意

```
客户端                              服务端集群
──────                             ──────────

WS Binary            GW                Game              DB
    │                 │                 │                 │
    │──PLAYER_MOVE───→│                 │                 │
    │                 │─IS_CLIENT_RAW──→│                 │
    │                 │                 │─IS_DB_LOAD─────→│ (登录时)
    │                 │                 │←IS_DB_RESULT────│ (BLOB)
    │                 │                 │                 │
    │   (战斗进行中...)                  │                 │
    │                 │                 │                 │
    │←─PLAYER_MOVE────│←IS_SEND_CLIENT─│                 │
    │←─DAMAGE─────────│←IS_SEND_CLIENT─│                 │
    │                 │                 │                 │
    │                 │     Lobby       │   Dungeon       │
    │                 │       │         │     │           │
    │                 │       │←IS_SESS─│     │           │
    │                 │       │─IS_DUNGEON_CREATE─→│      │
    │                 │       │   (含玩家BLOB透传)    │      │
    │   (副本结束)      │       │                      │      │
    │                 │       │←IS_DUNGEON_COMPLETE──│      │
    │                 │─结果→│   (全队结果BLOB)       │      │
    │                 │                 │                 │
    │                 │                 │─IS_DB_SAVE─────→│ (BLOB直写)
    │                 │                 │←IS_DB_RESULT────│
```

### 26.12 性能指标

| 指标 | JSON方案 | BLOB方案 | 提升 |
|------|---------|---------|------|
| 玩家存档大小 | ~8KB | ~800B | **10×** |
| 存档序列化耗时 | ~300 μs | ~15 μs | **20×** |
| DB Proxy 每玩家内存 | ~12KB (解析后) | ~800B (opaque) | **15×** |
| 副本创建消息大小 | ~40KB (5人×8KB) | ~4KB (5人×800B) | **10×** |
| Dungeon→Lobby 报告频率 | 1/30s (JSON大) | 1/5s (BLOB小) | **6×** |

---

**文档结束**
