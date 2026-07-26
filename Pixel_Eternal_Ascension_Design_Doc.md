# 《Pixel Eternal》全面重构设计文档
## Pixel Eternal: Ascension — 系统重构与爽感升级蓝图

**文档版本**: v1.0  
**日期**: 2026-07-26  
**状态**: 运行时已落地（Phase 1–4 核心系统可玩；`config/ascension-config.json` 全关可回滚）  
**落地说明**: 配置与 JS 模块已接线；Juice 音频为 stub（映射 `playGameSound`）；部分 polish（真实音效资源、NPC 动态对话）仍可选扩展  
**实现开关**: `config/ascension-config.json`（全关可回滚至重构前行为）
**目标**: 在不推翻现有技术栈（HTML5 Canvas + 原生JS）的前提下，通过模块化系统升级，将《Pixel Eternal》从"自动战斗验证器"转变为"高参与度、高反馈、高重玩价值"的现代Roguelike体验。

---

## 目录

1. [设计哲学与核心原则](#1-设计哲学与核心原则)
2. [系统架构总览](#2-系统架构总览)
3. [指挥官模式（Commander Mode）](#3-指挥官模式)
4. [战斗节奏重构：瞬间结算与Boss战](#4-战斗节奏重构)
5. [构筑深度：遗物协同矩阵（Synergy Matrix）](#5-遗物协同矩阵)
6. [地图重构：区域生态（Zone Ecology）](#6-区域生态)
7. [风险回报：诅咒与腐化（Curse & Corruption）](#7-诅咒与腐化)
8. [自选挑战：恶魔契约（Demon Pact）](#8-恶魔契约)
9. [策略透明：战前情报（Pre-Combat Intel）](#9-战前情报)
10. [叙事进度：死亡叙事与Meta解锁](#10-死亡叙事)
11. [事件网络：事件链（Event Chains）](#11-事件链)
12. [感官反馈：Juice与Game Feel规范](#12-juice规范)
13. [详细数值设计表](#13-数值设计表)
14. [数据结构与配置Schema](#14-数据结构)
15. [实现路线图与优先级](#15-实现路线图)
16. [与现有系统的兼容方案](#16-兼容方案)

---

## 1. 设计哲学与核心原则

### 1.1 核心问题诊断

当前系统存在三个层面的断裂：

| 层面 | 问题 | 玩家感受 |
|------|------|----------|
| **操作层** | 布阵后90秒纯观看 | "我在看动画，不是在玩游戏" |
| **反馈层** | 击杀无确认、协同不可见 | "我变强了，但我感觉不到" |
| **策略层** | 敌人AI黑箱、信息不透明 | "失败是因为运气，不是策略" |

### 1.2 重构三大支柱

**Pillar I: 参与度（Engagement）**
- 玩家在战斗中必须有"关键时刻的决策权"
- 不是全程微操，而是"决定性干预"

**Pillar II: 反馈密度（Feedback Density）**
- 每次击杀必须有5层确认（动画/音效/VFX/屏幕/数字）
- 构筑协同必须"可见、可感知、可炫耀"

**Pillar III: 策略透明度（Strategic Transparency）**
- 战前显示敌人意图（Into the Breach标准）
- 失败后可复盘，成功可复现

### 1.3 设计约束

- **技术栈不变**：HTML5 Canvas + 原生JS，不引入新引擎
- **局外清零保留**：每次开局Lv.1的核心设计不动摇
- **四人编队保留**：不改为单角色或更多角色
- **渐进式实现**：每个系统可独立开关，通过配置控制

---

## 2. 系统架构总览

### 2.1 新增模块一览

```
js/
├── commander-mode.js          # 指挥官模式核心
├── commander-abilities.js     # 指挥官技能/指令
├── combat-pacing.js           # 瞬间结算与节奏控制
├── boss-phase-system.js       # Boss阶段机制
├── synergy-matrix.js          # 遗物协同矩阵
├── synergy-vfx.js             # 协同激活特效
├── zone-ecology.js            # 区域生态与动态难度
├── curse-system.js            # 诅咒与腐化
├── demon-pact.js              # 恶魔契约
├── pre-combat-intel.js        # 战前情报
├── death-narrative.js         # 死亡叙事
├── event-chain-system.js      # 事件链
├── juice-core.js              # Juice核心（震屏/卡帧/数字）
├── juice-vfx.js               # 视觉特效库
└── run-analytics.js           # 单局数据分析

config/
├── commander-config.json      # 指挥官配置
├── synergy-matrix-config.json # 协同矩阵配置
├── curse-config.json          # 诅咒配置
├── demon-pact-config.json     # 契约配置
├── zone-ecology-config.json   # 区域生态配置
├── event-chains-config.json   # 事件链配置
└── juice-config.json          # Juice参数配置
```

### 2.2 系统交互图

```
[开局]
  |
  ├─→ 恶魔契约选择（可选）
  |
  ├─→ 区域生态应用（环境特质）
  |
  ├─→ 动态地图生成（区域化）
  |
  └─→ 进入节点
        |
        ├─[战斗/精英/Boss]→ 战前情报 → 布阵+指挥官准备 → 战斗（Juice全效）
        |                    |
        |                    ├─ 普通战：瞬间结算 或 加速战斗
        |                    └─ Boss战：阶段机制 + 指挥官深度参与
        |
        ├─[休息]→ 等级分配 / 复活 / 技能升星 / 诅咒净化
        |
        ├─[商店]→ 购买 / 诅咒移除
        |
        ├─[事件]→ 事件链推进 → 可能触发连锁事件
        |
        └─[诅咒遭遇]→ 强制获得诅咒遗物（高风险节点）
              |
              └─→ 下一区域 / 结算
                    |
                    └─→ 死亡叙事 / Meta解锁 / 数据分析
```

---

## 3. 指挥官模式（Commander Mode）

### 3.1 定位

**指挥官模式**是本重构的**核心交互升级**。它不改变"角色自动战斗"的底层逻辑，而是在战斗之上叠加一层**战术干预系统**，让玩家在关键时刻"出手"。

类比：
- 不是Vampire Survivors的全程走位
- 不是Hades的全程动作
- 而是**Into the Breach的"信息透明+关键决策"** + **FF12的Gambit系统**的反向操作

### 3.2 核心机制

#### 3.2.1 指挥官幽灵（Commander Ghost）

| 属性 | 说明 |
|------|------|
| **可见性** | 半透明像素幽灵，悬浮在战场上方，不可被攻击 |
| **移动** | 鼠标/触摸拖拽移动，无碰撞体积 |
| **作用** | 停留在友方单位上方时可激活该单位的"指挥官技能" |

#### 3.2.2 战术能量（Tactical Energy, TE）

```javascript
// 数据结构
{
  "maxEnergy": 100,
  "currentEnergy": 0,
  "regenPerSecond": 5,        // 自动恢复
  "regenPerKill": 8,          // 击杀恢复
  "regenPerDamageTaken": 0.5, // 己方受伤恢复（按伤害量）
  "startEnergy": 20,          // 开局能量
  "overflowCap": 120          // 溢出上限（通过遗物可提升）
}
```

**能量恢复规则**：
- 自然恢复：5点/秒（战斗中进行）
- 击杀恢复：友方击杀敌人+8TE，敌方击杀友方+15TE（紧急补偿）
- 受伤恢复：友方每受到1点伤害+0.5TE（向下取整）
- 遗物加成：特定遗物可改变恢复曲线

#### 3.2.3 指挥官指令（Commander Abilities）

指令分三类：**即时指令**（消耗TE瞬间释放）、**持续指令**（持续消耗TE）、**终极指令**（高消耗，改变战局）。

**基础指令（开局即拥有）**：

| 指令 | 消耗TE | 冷却 | 类型 | 效果 | 定位 |
|------|--------|------|------|------|------|
| **集火标记** | 25 | 8秒 | 即时 | 标记一个敌人，全队优先攻击该目标，对其伤害+30%，持续6秒 | 单点突破 |
| **紧急后撤** | 35 | 12秒 | 即时 | 指定一名友方单位瞬间向后位移2格，并获得1.5秒无敌 | 保命 |
| **护盾爆发** | 40 | 15秒 | 即时 | 全队获得最大生命值15%的护盾，持续5秒 | 团队防御 |
| **时停** | 60 | 25秒 | 即时 | 时间冻结2.5秒（敌人完全静止，友方正常行动） | 爆发窗口 |
| **战吼鼓舞** | 30 | 10秒 | 即时 | 全队攻击力+25%，攻速+15%，持续5秒 | 团队增益 |
| **战术撤退** | 50 | 20秒 | 即时 | 强制结束当前战斗，视为"放弃本场"，保留生命但无奖励 | 止损 |

**进阶指令（通过遗物/事件解锁）**：

| 指令 | 解锁条件 | 消耗TE | 效果 | 定位 |
|------|----------|--------|------|------|
| **灵魂链接** | 遗物"灵魂契约" | 45 | 将两名友方单位链接，共享受到伤害的50%，持续8秒 | 分摊伤害 |
| **虚空放逐** | 遗物"虚空之钥" | 70 | 将一名非Boss敌人放逐10秒（直接移除战场） | 控场 |
| **时间回溯** | 遗物"时之沙漏" | 80 | 将一名友方单位状态回溯至5秒前（位置/生命/技能CD） | 纠错 |
| **血祭狂暴** | 诅咒遗物"血契" | 0 | 消耗当前生命的20%，全队暴击率+50%，持续5秒 | 高风险爆发 |
| **召唤援军** | 事件链"失落军团"完成 | 55 | 召唤2名幻影士兵（属性=当前平均50%），持续15秒 | 人数优势 |

#### 3.2.4 指令释放方式

```
PC端：
  1. 鼠标移动指挥官幽灵至目标单位/敌人上方
  2. 显示该位置可用的指令环（Radial Menu）
  3. 点击指令或按数字键1-6释放
  4. 部分指令需要二次确认（拖拽选择目标）

移动端（未来）：
  1. 触摸拖拽指挥官幽灵
  2. 停留0.3秒弹出指令环
  3. 滑动选择释放
```

#### 3.2.5 指挥官与遗物的交互

遗物可以：
- 新增指令槽位（默认3个，最多5个）
- 降低特定指令的TE消耗
- 改变指令效果（如"集火标记"附加眩晕）
- 改变TE恢复规则

### 3.3 实现方案

#### 3.3.1 代码架构

```javascript
// js/commander-mode.js
class CommanderMode {
  constructor(battleController) {
    this.battle = battleController;
    this.energy = 0;
    this.maxEnergy = 100;
    this.abilities = ['focus_fire', 'tactical_retreat', 'shield_burst']; // 已解锁
    this.cooldowns = {}; // abilityId -> remainingMs
    this.ghostPosition = { x: 0, y: 0 };
    this.selectedAbility = null;
  }

  update(dtMs) {
    this.regenEnergy(dtMs);
    this.updateCooldowns(dtMs);
    this.checkAutoTriggers();
  }

  regenEnergy(dtMs) {
    const baseRegen = this.getRegenRate();
    this.energy = Math.min(this.maxEnergy, this.energy + baseRegen * dtMs / 1000);
  }

  onAllyKill(enemy) {
    this.energy = Math.min(this.maxEnergy + this.getOverflowCap(), 
                           this.energy + this.getKillRegen());
    this.triggerJuice('energy_gain_kill', enemy.position);
  }

  onAllyDamageTaken(hero, amount) {
    this.energy = Math.min(this.maxEnergy + this.getOverflowCap(),
                           this.energy + amount * this.getDamageRegenRate());
  }

  canUseAbility(abilityId) {
    return this.energy >= this.getAbilityCost(abilityId) 
        && (!this.cooldowns[abilityId] || this.cooldowns[abilityId] <= 0);
  }

  useAbility(abilityId, target) {
    if (!this.canUseAbility(abilityId)) return false;
    const cost = this.getAbilityCost(abilityId);
    this.energy -= cost;
    this.cooldowns[abilityId] = this.getAbilityCooldown(abilityId);
    this.executeAbility(abilityId, target);
    this.triggerJuice('ability_cast', abilityId);
    return true;
  }

  executeAbility(abilityId, target) {
    const def = COMMANDER_ABILITIES[abilityId];
    switch(def.effectType) {
      case 'focus_fire':
        this.applyFocusFire(target, def.durationMs, def.damageBonus);
        break;
      case 'tactical_retreat':
        this.forceRetreat(target, def.distance, def.invulnDuration);
        break;
      case 'shield_burst':
        this.applyTeamShield(def.shieldPct);
        break;
      case 'time_stop':
        this.battle.applyTimeStop(def.durationMs);
        break;
    }
  }
}
```

#### 3.3.2 与现有战斗系统的集成

```javascript
// 在 auto-battle-simulator.js 的 tickBattle 中插入
function tickBattle(battle, dtMs) {
  // 现有逻辑...

  // 指挥官模式更新
  if (battle.commanderMode && battle.commanderMode.enabled) {
    battle.commanderMode.update(dtMs);

    // 时停处理：如果时停激活，dtMs对敌人方为0
    if (battle.timeStopRemaining > 0) {
      battle.timeStopRemaining -= dtMs;
      updateAllies(battle, dtMs);
      updateEnemyAnimationsOnly(battle, dtMs);
    } else {
      updateAllies(battle, dtMs);
      updateEnemies(battle, dtMs);
    }
  }

  // 现有逻辑...
}
```

#### 3.3.3 UI设计

**HUD布局**：

```
┌─────────────────────────────────────────┐
│  金币: 120  等级点: 3  队伍: 4/4 [████] │  <- 现有顶栏
├─────────────────────────────────────────┤
│                                         │
│         [战场区域]                       │
│                                         │
│    👻  <- 指挥官幽灵（半透明）             │
│                                         │
├─────────────────────────────────────────┤
│  [战术能量条] ████████████░░░░  75/100  │
│  [指令栏]  [集火][后撤][护盾][时停]     │
│  冷却遮罩: [░░░][██░][░░░][███]         │
└─────────────────────────────────────────┘
```

**能量条设计**：
- 底色：深灰 (#2a2a2a)
- 填充：渐变蓝->紫 (#4488ff -> #aa44ff)
- 溢出部分：金色描边闪烁
- 获得能量时：右侧弹出"+12"绿色数字，能量条闪烁白光

**指令释放特效**：
- 点击指令：指令图标放大120%->弹回，播放"咔哒"音效
- 释放成功：从指挥官幽灵位置射出光束至目标，目标头顶显示指令图标
- 释放失败（能量不足）：能量条抖动+红色闪烁，播放低沉"嗡"声

### 3.4 平衡考量

- **指挥官模式不是必须**：玩家可以选择不使用指令，纯靠构筑通关（但难度更高）
- **指令不能替代构筑**：指令是"补救/放大"，不是"主要输出"
- **Boss战必须**：Boss战设计为"必须使用时停/集火"才能过，确保玩家学会系统

---

## 4. 战斗节奏重构

### 4.1 双轨制战斗系统

将战斗分为两个层级：**瞬间结算（Skirmish）** 和 **深度战斗（Engagement）**。

#### 4.1.1 瞬间结算

**触发条件**：
- 普通战斗（非精英/非Boss）
- 且玩家战力评估 > 敌人战力评估 x 1.5（碾压判定）

**流程**：
```
布阵 -> 点击"开始" -> 3秒动画 -> 结果弹出
```

**3秒动画内容**：
- 0.0s：双方角色从各自阵地冲出
- 0.5s：中央碰撞，粒子爆开
- 1.0s：伤害数字批量弹出（模拟战斗过程）
- 2.0s：敌方倒地，友方胜利姿势
- 2.5s：战利品弹出
- 3.0s：进入奖励界面

**结果计算**：
```javascript
function resolveSkirmish(heroes, enemies, relics) {
  const allyPower = calculatePower(heroes, relics);
  const enemyPower = calculatePower(enemies);
  const ratio = allyPower / enemyPower;

  // 基础胜率
  let winChance = 0.5 + (ratio - 1) * 0.3;
  winChance = clamp(winChance, 0.05, 0.95);

  const won = rng() < winChance;

  // 生命损失计算
  let hpLossPct;
  if (won) {
    hpLossPct = 0.3 / ratio + rng() * 0.1;
  } else {
    hpLossPct = 0.6 + rng() * 0.3;
  }

  return { won, hpLossPct, casualties: [] };
}
```

**玩家选项**：
- "观看完整战斗"：切换到正常自动战斗（用于测试构筑）
- "始终瞬间结算"：设置中开启，对满足条件的战斗自动跳过

#### 4.1.2 深度战斗（完整战斗）

**触发条件**：
- 精英战、Boss战
- 或玩家战力 <= 敌人战力 x 1.5
- 或玩家主动选择"观看完整战斗"

**改进**：
- 战斗时长上限从90秒->60秒（更紧凑）
- 加入指挥官模式（必须）
- 加入Juice全效（见第12章）

### 4.2 Boss阶段机制

每个Boss战设计为**3阶段**，阶段转换触发独特机制。

#### 4.2.1 通用阶段框架

```javascript
const BOSS_PHASE_TEMPLATE = {
  "bossId": "ab_boss_warden",
  "phases": [
    {
      "phase": 1,
      "hpThreshold": 1.0,
      "name": "狱门守卫",
      "behavior": "defensive",
      "skills": ["shield_slam", "taunt"],
      "summons": [],
      "environment": null,
      "commanderHint": "集火标记可穿透其防御姿态"
    },
    {
      "phase": 2,
      "hpThreshold": 0.6,
      "name": "狱门崩裂",
      "behavior": "aggressive",
      "skills": ["charge", "whirlwind", "shield_slam"],
      "summons": [
        { "templateId": "ab_guard", "count": 2, "delayMs": 5000 }
      ],
      "environment": "ground_cracks",
      "commanderHint": "使用后撤将前排角色移出裂缝区域",
      "transitionVfx": "shield_shatter",
      "transitionJuice": { "screenShake": 8, "slowMotion": 500 }
    },
    {
      "phase": 3,
      "hpThreshold": 0.25,
      "name": "绝望狂怒",
      "behavior": "berserk",
      "skills": ["execute", "whirlwind", "blood_rage"],
      "summons": [],
      "environment": "blood_rain",
      "commanderHint": "时停+护盾爆发撑过最后25%",
      "transitionVfx": "blood_burst",
      "transitionJuice": { "screenShake": 12, "chromaticAberration": 1000 }
    }
  ]
};
```

#### 4.2.2 四大Boss详细设计

**Boss 1: 狱门守将（Warden）- 教学Boss**

| 阶段 | HP | 机制 | 指挥官教学 |
|------|-----|------|-----------|
| P1 | 100%-60% | 高防御，周期性开盾（减伤80%） | 教"集火标记"：标记后无视护盾 |
| P2 | 60%-25% | 召唤2名魔盾卫，地面裂缝 | 教"后撤"：把角色移出裂缝 |
| P3 | 25%-0% | 攻击翻倍，攻速+50%，但不再防御 | 教"战吼"：对攻阶段拼输出 |

**Boss 2: 炼狱暴君（Tyrant）- AOE检测**

| 阶段 | 机制 | 构筑检测 |
|------|------|----------|
| P1 | 随机点名1人，5秒后对该位置释放大型AOE | 检测是否有"后撤"或位移技能 |
| P2 | 全场分为安全区/危险区，每8秒切换 | 检测队伍分散能力 |
| P3 | 吸收所有小兵，每吸收1个恢复10%HP | 检测清场速度 |

**Boss 3: 深渊先驱（Harbinger）- 协同检测**

| 阶段 | 机制 | 构筑检测 |
|------|------|----------|
| P1 | 召唤2名治疗兵，持续恢复Boss生命 | 检测刺客切后能力 |
| P2 | Boss与召唤物链接，共享伤害 | 检测AOE/连锁能力 |
| P3 | 反转所有治疗为伤害 | 检测自疗控制能力 |

**Boss 4: 终末魔王（Final）- 综合考验**

| 阶段 | 机制 |
|------|------|
| P1 | 复制玩家队伍（镜像战） |
| P2 | 禁用指挥官模式5秒，纯靠构筑 |
| P3 | 时间加速（全局2倍速），测试反应 |
| P4 | 濒死时召唤前3个Boss的幻影（同时存在） |

### 4.3 实现方案

```javascript
// js/boss-phase-system.js
class BossPhaseSystem {
  constructor(battle, bossDef) {
    this.battle = battle;
    this.phases = bossDef.phases;
    this.currentPhase = 0;
    this.bossUnit = this.findBossUnit();
  }

  update(dtMs) {
    if (!this.bossUnit || !this.bossUnit.alive) return;

    const hpPct = this.bossUnit.hp / this.bossUnit.maxHp;
    const nextPhase = this.phases[this.currentPhase + 1];

    if (nextPhase && hpPct <= nextPhase.hpThreshold) {
      this.transitionToPhase(this.currentPhase + 1);
    }

    this.applyEnvironmentEffects(dtMs);
  }

  transitionToPhase(phaseIndex) {
    const phase = this.phases[phaseIndex];
    this.currentPhase = phaseIndex;

    this.battle.juiceSystem.trigger('boss_phase_transition', {
      screenShake: phase.transitionJuice?.screenShake || 5,
      slowMotion: phase.transitionJuice?.slowMotion || 300,
      vfx: phase.transitionVfx
    });

    if (phase.summons) {
      phase.summons.forEach(s => {
        setTimeout(() => this.battle.summonEnemies(s.templateId, s.count), s.delayMs);
      });
    }

    if (phase.commanderHint && this.battle.commanderMode) {
      this.battle.ui.showCommanderHint(phase.commanderHint);
    }

    this.battle.ui.showBossDialogue(phase.name);
  }
}
```

---

## 5. 遗物协同矩阵（Synergy Matrix）

### 5.1 定位

将遗物从"独立数值加成"转变为"组合触发质变"。参考 **Risk of Rain 2** 的道具协同 + **Noita** 的法杖编辑哲学。

### 5.2 协同类型

#### 5.2.1 二元协同（Two-Item Synergy）

两个特定遗物组合触发新效果。

| 遗物A | 遗物B | 协同名称 | 效果 |
|-------|-------|----------|------|
| 灼热之触（攻击附带燃烧） | 寒冰核心（攻击附带冰冻） | **蒸汽爆炸** | 当同一敌人同时有燃烧和冰冻时，立即触发爆炸，造成300%攻击力的AOE伤害 |
| 吸血獠牙（攻击吸血10%） | 鲜血契约（生命越低攻击越高） | **血怒狂潮** | 生命低于30%时，吸血提升至30%，且攻击附带流血 |
| 闪电链（攻击弹射2次） | 奥术增幅（技能伤害+20%） | **奥术风暴** | 闪电链弹射次数+3，且每次弹射触发小范围爆炸 |
| 守护天使（死亡时复活一次） | 时间沙漏（技能CD-20%） | **时之轮回** | 复活时不恢复生命，而是回溯到10秒前的状态（位置+生命+技能CD） |
| 贪婪钱袋（金币+25%） | 命运硬币（金币+20%） | **黄金律** | 金币获取+50%，且每拥有100金币，全队攻击+1% |
| 锐利（暴击+8%） | 震慑烙印（战士技能眩晕） | **暴击震荡** | 暴击时100%眩晕目标0.5秒（对Boss减半） |

#### 5.2.2 三元协同（Three-Item Synergy）

更强大的组合，通常需要特定主题。

| 组合 | 协同名称 | 效果 |
|------|----------|------|
| 灼热之触 + 寒冰核心 + 闪电链 | **元素大灾变** | 所有元素伤害（火/冰/雷）互相触发：火->冰=蒸汽爆炸，冰->雷=超导减防，雷->火=等离子燃烧 |
| 吸血獠牙 + 鲜血契约 + 血誓印 | **血神降临** | 生命不再自然恢复；所有造成伤害的50%转化为护盾；护盾上限=最大生命x2 |
| 贪婪钱袋 + 命运硬币 + 黄金律 | **迈达斯之手** | 敌人死亡时有20%几率变成金雕像（立即击杀+额外金币）；Boss战开始时获得500金币 |
| 裂阵纹章 + 守誓纹章 + 震慑烙印 | **战争之王** | 战士所有技能变为"双重释放"（放一次=放两次，第二次50%伤害） |

#### 5.2.3 职业协同（Class Synergy）

基于队伍构成的协同。

| 条件 | 协同名称 | 效果 |
|------|----------|------|
| 队伍中有2名战士 | **钢铁阵线** | 战士相邻时，互相分担30%伤害 |
| 队伍中有2名法师 | **奥术共鸣** | 法师技能有25%几率触发另一名法师的技能（免费） |
| 队伍中有刺客+弓箭手 | **猎杀组合** | 刺客标记的敌人，弓箭手对其伤害+50% |
| 4名不同职业 | **均衡之力** | 全队全属性+10%，且指挥官能量恢复+50% |

### 5.3 协同触发与显示

**触发流程**：
```
获得遗物 -> 检查所有已拥有遗物 -> 匹配协同表 -> 激活协同 -> 播放特效 -> UI高亮
```

**UI显示**：
```
[遗物栏]
┌─────────────────────────────────────┐
│  [灼热之触] [寒冰核心] [闪电链]      │
│     ⚡ 元素大灾变 已激活！ ⚡         │
│     火<->冰=蒸汽 冰<->雷=超导 雷<->火=等离子 │
└─────────────────────────────────────┘
```

**特效**：
- 激活时：屏幕边缘闪烁对应颜色（火=红，冰=蓝，雷=紫）
- 战斗中触发协同效果时：角色头顶弹出协同图标

### 5.4 实现方案

```javascript
// js/synergy-matrix.js
const SYNERGY_MATRIX = {
  'steam_explosion': {
    name: '蒸汽爆炸',
    description: '火+冰同时存在时触发300%AOE爆炸',
    required: ['scorching_touch', 'frost_core'],
    effect: {
      type: 'elemental_reaction',
      reaction: 'melt',
      damageMult: 3.0,
      aoeRadius: 80
    },
    vfx: 'steam_burst',
    uiColor: '#88ccff'
  },

  'elemental_cataclysm': {
    name: '元素大灾变',
    description: '三种元素互相触发连锁反应',
    required: ['scorching_touch', 'frost_core', 'lightning_chain'],
    effect: {
      type: 'elemental_chain',
      reactions: {
        'fire_ice': { name: '蒸汽爆炸', damageMult: 3.0 },
        'ice_lightning': { name: '超导', defenseReduce: 0.5 },
        'lightning_fire': { name: '等离子', dotDamage: 0.2 }
      }
    },
    vfx: 'elemental_storm',
    uiColor: '#ff44aa'
  }
};

class SynergyMatrix {
  constructor(runState) {
    this.run = runState;
    this.activeSynergies = new Set();
  }

  onRelicAcquired(relicId) {
    const owned = new Set(this.run.relics);
    owned.add(relicId);

    for (const [synergyId, def] of Object.entries(SYNERGY_MATRIX)) {
      if (this.activeSynergies.has(synergyId)) continue;

      const hasAll = def.required.every(r => owned.has(r));
      if (hasAll) {
        this.activateSynergy(synergyId);
      }
    }
  }

  activateSynergy(synergyId) {
    this.activeSynergies.add(synergyId);
    const def = SYNERGY_MATRIX[synergyId];

    this.run.juiceSystem.trigger('synergy_activate', {
      name: def.name,
      color: def.uiColor,
      vfx: def.vfx
    });

    this.run.combatEffects.push(def.effect);
  }
}
```

---

## 6. 区域生态（Zone Ecology）

### 6.1 定位

将线性53层重构为**4个主题区域**，每个区域有独特的环境特质、敌人倾向和特殊规则。

### 6.2 区域设计

#### 区域1：灰烬荒原（Ashen Wastes）- 入门层

| 属性 | 内容 |
|------|------|
| **层数** | 10层（含Boss） |
| **主题** | 被恶魔焚烧的废墟 |
| **环境特质** | **灰烬弥漫**：每3场战斗后，全队视野-20%（不影响实际战斗，仅视觉） |
| **敌人倾向** | 魔卒、魔弓、小恶魔为主 |
| **特殊节点** | **余烬祭坛**：可花费金币提前看到下3层的节点类型 |
| **Boss** | 狱门守将 |
| **教学重点** | 基础布阵、指挥官指令入门 |

#### 区域2：熔岩裂谷（Magma Rift）- 炼狱层

| 属性 | 内容 |
|------|------|
| **层数** | 10层 |
| **主题** | 岩浆与硫磺 |
| **环境特质** | **地热喷发**：每场战斗开始时，随机1格地面变为岩浆（站在上面每秒-5%生命） |
| **敌人倾向** | 自爆魔、焰魔、狂战士 |
| **特殊节点** | **熔岩锻造**：可销毁一件装备，全队攻击+5%（永久叠加） |
| **Boss** | 炼狱暴君 |
| **教学重点** | 位置控制、环境利用 |

#### 区域3：虚空深渊（Void Abyss）- 深渊层

| 属性 | 内容 |
|------|------|
| **层数** | 10层 |
| **主题** | 扭曲的虚空空间 |
| **环境特质** | **空间扭曲**：每5秒，所有角色随机交换位置（敌我双方） |
| **敌人倾向** | 影魔、幽魂、虚空织法 |
| **特殊节点** | **虚空裂隙**：进入后随机获得1个遗物或1个诅咒 |
| **Boss** | 深渊先驱 |
| **教学重点** | 适应性构筑、诅咒管理 |

#### 区域4：终末王座（Throne of End）- 终末层

| 属性 | 内容 |
|------|------|
| **层数** | 5层（高压收束） |
| **主题** | 恶魔王的王座厅 |
| **环境特质** | **绝望领域**：无法使用休息处复活；指挥官能量恢复-50% |
| **敌人倾向** | 所有精英敌人混合 |
| **特殊节点** | **魔王试炼**：连续3场战斗，无间隔，奖励递增 |
| **Boss** | 终末魔王（4阶段） |
| **教学重点** | 资源管理、终极考验 |

### 6.3 区域连接与选择

```
[灰烬荒原] --> [熔岩裂谷] --> [虚空深渊] --> [终末王座]
     |               |               |
     └─ 分支1: 暗影小径（更多事件）
     └─ 分支2: 黄金大道（更多商店）
     └─ 分支3: 血战之路（更多战斗，更好奖励）
```

**分支选择**：每通过一个区域，下一个区域有3条路径可选，影响该区域的：
- 节点类型分布（战斗/商店/事件比例）
- 环境特质强度
- 奖励丰度

### 6.4 实现方案

```javascript
// js/zone-ecology.js
const ZONES = {
  'ashen_wastes': {
    name: '灰烬荒原',
    layers: 10,
    trait: {
      id: 'ash_shroud',
      name: '灰烬弥漫',
      description: '每3场战斗后视野-20%',
      applyEveryNBattles: 3,
      effect: { visionReduce: 0.2 }
    },
    enemyPool: ['ab_grunt', 'ab_archer', 'ab_imp', 'ab_skirmisher'],
    specialNode: 'ember_shrine',
    branchPaths: ['shadow_path', 'golden_road', 'blood_road']
  }
  // ... 其他区域
};

class ZoneEcology {
  constructor(runState) {
    this.run = runState;
    this.currentZone = null;
    this.battleCountInZone = 0;
  }

  enterZone(zoneId) {
    this.currentZone = ZONES[zoneId];
    this.battleCountInZone = 0;
    this.applyZoneTrait();
  }

  onBattleStart() {
    this.battleCountInZone++;
    const trait = this.currentZone.trait;

    if (this.battleCountInZone % trait.applyEveryNBattles === 0) {
      this.applyTraitEffect(trait.effect);
    }

    this.applyEnvironmentHazards();
  }

  applyEnvironmentHazards() {
    if (this.currentZone.id === 'magma_rift') {
      const randomCell = this.getRandomCell();
      randomCell.hazard = {
        type: 'lava',
        damagePerSecond: 0.05
      };
    }
  }
}
```

---

## 7. 诅咒与腐化（Curse & Corruption）

### 7.1 定位

引入**高风险高回报**的决策层。参考 **Binding of Isaac** 的诅咒 + **Hades** 的混沌祝福。

### 7.2 诅咒遗物（Cursed Relics）

诅咒遗物是**自带强力正面效果 + 全局负面效果**的特殊遗物。

| 诅咒遗物 | 正面效果 | 负面效果 | 风险等级 |
|----------|----------|----------|----------|
| **血渴之刃** | 全队攻击+30% | 每场战斗后随机1人-10%最大生命（永久，不可恢复） | ★★★ |
| **时间窃贼** | 战斗金币+50% | 战斗时限从60秒->45秒 | ★★ |
| **贪婪之握** | 商店价格-30% | 战斗经验-40% | ★★ |
| **狂战面具** | 暴击伤害+60% | 受到暴击伤害+40% | ★★★ |
| **虚空之种** | 每场战斗开始随机获得1个临时遗物 | 每场战斗开始随机失去1个已有遗物（临时） | ★★★★ |
| **殉道者之链** | 阵亡角色复活时保留50%属性 | 阵亡角色不能再复活 | ★★★★★ |
| **恶魔契约书** | 指挥官能量恢复+100% | 禁用2个指令槽位 | ★★★ |
| **腐化圣杯** | 全队生命恢复效果+50% | 所有敌人也获得同等恢复效果 | ★★★ |

### 7.3 腐化层（Corruption Layer）

独立于遗物的**全局腐化值**。

**获取方式**：
- 进入"虚空裂隙"节点：+20腐化
- 选择某些事件选项：+10~30腐化
- 携带诅咒遗物：每场战斗+5腐化

**腐化效果阈值**：

| 腐化值 | 效果 |
|--------|------|
| 20 | 敌人攻击+10% |
| 40 | 商店价格+20% |
| 60 | 休息处回血效果-30% |
| 80 | 每场战斗随机1名敌人变为精英 |
| 100 | **腐化爆发**：立即触发一场"腐化Boss战"，胜利后清除50%腐化 |

**净化方式**：
- 休息处"净化仪式"：花费50金币，-20腐化
- 特定事件"圣泉"：-30腐化
- 遗物"净化之焰"：每场战斗-5腐化

### 7.4 实现方案

```javascript
// js/curse-system.js
const CURSED_RELICS = {
  'bloodthirst_blade': {
    name: '血渴之刃',
    positive: { teamAttackMult: 1.3 },
    negative: {
      type: 'permanent_hp_loss',
      value: 0.1,
      trigger: 'after_battle'
    },
    riskLevel: 3
  },
  'time_thief': {
    name: '时间窃贼',
    positive: { goldMult: 1.5 },
    negative: {
      type: 'combat_time_limit',
      value: 45
    },
    riskLevel: 2
  }
};

class CurseSystem {
  constructor(runState) {
    this.run = runState;
    this.corruption = 0;
    this.cursedRelics = [];
  }

  addCursedRelic(relicId) {
    const def = CURSED_RELICS[relicId];
    this.cursedRelics.push(relicId);
    this.applyEffects(def.positive);
    this.run.juiceSystem.trigger('curse_acquire', { riskLevel: def.riskLevel });
  }

  addCorruption(amount) {
    this.corruption += amount;
    this.checkCorruptionThresholds();
  }

  checkCorruptionThresholds() {
    const thresholds = [
      { at: 20, effect: { enemyAttackMult: 1.1 } },
      { at: 40, effect: { shopPriceMult: 1.2 } },
      { at: 60, effect: { restHealMult: 0.7 } },
      { at: 80, effect: { randomElite: true } },
      { at: 100, effect: { corruptionBoss: true } }
    ];

    for (const t of thresholds) {
      if (this.corruption >= t.at && !this.triggeredThresholds?.has(t.at)) {
        this.triggeredThresholds = this.triggeredThresholds || new Set();
        this.triggeredThresholds.add(t.at);
        this.applyEffects(t.effect);

        if (t.effect.corruptionBoss) {
          this.triggerCorruptionBoss();
        }
      }
    }
  }

  purify(amount, cost) {
    if (this.run.gold < cost) return false;
    this.run.gold -= cost;
    this.corruption = Math.max(0, this.corruption - amount);
    return true;
  }
}
```

---

## 8. 恶魔契约（Demon Pact）

### 8.1 定位

参考 **Hades的热量系统（Heat）**，让玩家**自选挑战**，通过增加难度来换取更好奖励和解锁内容。

### 8.2 契约系统

**解锁条件**：首次通关后解锁。

**契约选择界面**（开局前）：

```
┌─────────────────────────────────────────┐
│         恶魔契约 - 选择你的试炼          │
├─────────────────────────────────────────┤
│                                         │
│  [敌人强化]          [玩家削弱]          │
│  ├─ 攻击+20%    ★    ├─ 生命-20%    ★  │
│  ├─ 防御+20%    ★    ├─ 金币-20%    ★  │
│  ├─ 速度+15%    ★★   ├─ 经验-20%    ★  │
│  ├─ 精英+1      ★★   ├─ 指令CD+30%  ★★ │
│  ├─ Boss生命+30% ★★  ├─ 禁用时停    ★★★│
│  └─ 敌人+1技能  ★★★  └─ 禁用复活    ★★★│
│                                         │
│  [环境恶化]          [特殊规则]          │
│  ├─ 无休息处    ★★   ├─ 限时模式    ★★ │
│  ├─ 无商店      ★★   ├─ 单角色模式  ★★★│
│  └─ 环境伤害+50% ★★  └─ 镜像敌人    ★★★│
│                                         │
│  当前契约等级: 7★                       │
│  奖励倍率: 1.7x                         │
│  解锁进度: 3/12                         │
└─────────────────────────────────────────┘
```

### 8.3 契约详情

#### 敌人强化类

| 契约 | 星级 | 效果 | 奖励加成 |
|------|------|------|----------|
| **hardened_flesh** | ★ | 敌人生命+20% | +10% |
| **sharpened_claws** | ★ | 敌人攻击+20% | +10% |
| **swift_shadows** | ★★ | 敌人速度+15% | +15% |
| **elite_swarm** | ★★ | 每场战斗额外1名精英 | +15% |
| **boss_juggernaut** | ★★ | Boss生命+30% | +15% |
| **demonic_arsenal** | ★★★ | 敌人额外获得1个随机技能 | +20% |

#### 玩家削弱类

| 契约 | 星级 | 效果 | 奖励加成 |
|------|------|------|----------|
| **frail_body** | ★ | 全队最大生命-20% | +10% |
| **empty_purse** | ★ | 金币获取-20% | +10% |
| **slow_mind** | ★★ | 指挥官指令冷却+30% | +15% |
| **time_ban** | ★★★ | 禁用时停指令 | +20% |
| **death_permanent** | ★★★ | 休息处无法复活 | +20% |
| **lone_wolf** | ★★★★ | 只能上阵1名角色（其他3人禁用） | +30% |

#### 环境恶化类

| 契约 | 星级 | 效果 | 奖励加成 |
|------|------|------|----------|
| **no_rest** | ★★ | 所有休息处变为战斗 | +15% |
| **no_shop** | ★★ | 所有商店变为事件 | +15% |
| **hostile_terrain** | ★★ | 环境伤害+50% | +15% |

#### 特殊规则类

| 契约 | 星级 | 效果 | 奖励加成 |
|------|------|------|----------|
| **time_attack** | ★★ | 单局总时限30分钟，超时即死 | +15% |
| **mirror_match** | ★★★ | 所有敌人是玩家队伍的镜像 | +20% |
| **ironman** | ★★★★ | 无法主动放弃，失败即删档 | +35% |

### 8.4 奖励与解锁

**基础奖励倍率**：
```
总倍率 = 1.0 + Σ(契约加成)
```

**契约等级与解锁**：

| 累计星级 | 解锁内容 |
|----------|----------|
| 5★ | 新遗物"契约者之证"进入池 |
| 10★ | 新事件"恶魔的赌局" |
| 15★ | 新角色皮肤"契约烙印" |
| 20★ | 隐藏Boss"契约守护者" |
| 25★ | 真结局路线 |
| 30★ | "永恒契约"模式（无限爬塔） |

### 8.5 实现方案

```javascript
// js/demon-pact.js
const DEMON_PACTS = {
  'hardened_flesh': {
    name: '硬化血肉',
    stars: 1,
    category: 'enemy_buff',
    effect: { enemyHpMult: 1.2 },
    rewardBonus: 0.1
  },
  'time_ban': {
    name: '时间禁令',
    stars: 3,
    category: 'player_debuff',
    effect: { banAbility: 'time_stop' },
    rewardBonus: 0.2
  }
};

class DemonPact {
  constructor() {
    this.activePacts = new Set();
    this.unlockedPacts = new Set(['hardened_flesh', 'sharpened_claws', 'frail_body']);
    this.totalStars = 0;
  }

  togglePact(pactId) {
    if (!this.unlockedPacts.has(pactId)) return false;

    if (this.activePacts.has(pactId)) {
      this.activePacts.delete(pactId);
    } else {
      this.activePacts.add(pactId);
    }

    this.recalculateTotalStars();
    return true;
  }

  recalculateTotalStars() {
    this.totalStars = 0;
    for (const pactId of this.activePacts) {
      this.totalStars += DEMON_PACTS[pactId].stars;
    }
  }

  getRewardMultiplier() {
    let mult = 1.0;
    for (const pactId of this.activePacts) {
      mult += DEMON_PACTS[pactId].rewardBonus;
    }
    return mult;
  }

  applyEffects(battle) {
    for (const pactId of this.activePacts) {
      const def = DEMON_PACTS[pactId];
      battle.applyModifier(def.effect);
    }
  }

  checkUnlocks(metaProgress) {
    if (metaProgress.runsCompleted >= 5) {
      this.unlockedPacts.add('elite_swarm');
    }
    if (metaProgress.highestPactStars >= 10) {
      this.unlockedPacts.add('time_ban');
    }
  }
}
```

---

## 9. 战前情报（Pre-Combat Intel）

### 9.1 定位

参考 **Into the Breach** 的"信息完全透明"设计，让玩家在布阵前看到敌人的**完整意图**。

### 9.2 情报显示内容

**布阵界面新增情报面板**：

```
┌─────────────────────────────────────────┐
│           战前情报                        │
├─────────────────────────────────────────┤
│  敌方编队:                               │
│  [魔卒]x2  [魔弓]x1  [魔蛮]x1            │
│                                         │
│  敌人意图（下回合）:                      │
│  ├─ 魔卒A -> 攻击 [战士]（预估伤害: 45）   │
│  ├─ 魔卒B -> 攻击 [战士]（预估伤害: 45）   │
│  ├─ 魔弓  -> 攻击 [法师]（预估伤害: 62）   │
│  └─ 魔蛮  -> 技能[重击] -> [前排]（眩晕）   │
│                                         │
│  敌方协同: [无]                          │
│                                         │
│  推荐策略:                               │
│  ⚠️ 魔弓瞄准后排法师，建议刺客切入或战士嘲讽│
│  ⚠️ 魔蛮即将释放眩晕，建议分散站位         │
│                                         │
│  预估胜率: 72%                           │
└─────────────────────────────────────────┘
```

### 9.3 情报准确度

| 情报类型 | 准确度 | 说明 |
|----------|--------|------|
| 敌人编队 | 100% |  always准确 |
| 敌人意图 | 90% |  有10%几率敌人改变目标 |
| 预估伤害 | ±15% |  基于当前属性计算，实际有浮动 |
| 预估胜率 | ±10% |  基于战力模拟 |

**遗物影响**：
- "战术目镜"：意图准确度提升至100%
- "预知卷轴"：显示敌人下两回合意图

### 9.4 实现方案

```javascript
// js/pre-combat-intel.js
class PreCombatIntel {
  constructor(battle) {
    this.battle = battle;
  }

  generateIntel() {
    const enemies = this.battle.enemies;
    const allies = this.battle.allies;

    return {
      enemyComposition: this.analyzeComposition(enemies),
      enemyIntents: this.predictIntents(enemies, allies),
      enemySynergy: this.detectEnemySynergy(enemies),
      recommendations: this.generateRecommendations(enemies, allies),
      estimatedWinRate: this.calculateWinRate(enemies, allies)
    };
  }

  predictIntents(enemies, allies) {
    return enemies.map(enemy => {
      const target = this.selectTarget(enemy, allies);
      const action = this.selectAction(enemy);
      const estimatedDamage = this.calculateDamage(enemy, target, action);

      return {
        enemyId: enemy.id,
        enemyName: enemy.name,
        targetId: target.id,
        targetName: target.displayName,
        action: action.type,
        skillId: action.skillId,
        estimatedDamage: estimatedDamage,
        specialEffect: action.specialEffect
      };
    });
  }

  calculateWinRate(enemies, allies) {
    const allyPower = this.calculateTeamPower(allies);
    const enemyPower = this.calculateTeamPower(enemies);
    const ratio = allyPower / enemyPower;

    const winRate = 1 / (1 + Math.exp(-2 * (ratio - 1)));
    return Math.round(winRate * 100);
  }

  generateRecommendations(enemies, allies) {
    const recs = [];

    const backlineThreats = enemies.filter(e => e.range > 100 && e.target === 'backline');
    if (backlineThreats.length > 0) {
      recs.push('后排受到威胁，建议刺客切入或调整站位');
    }

    const controllers = enemies.filter(e => e.skills.some(s => s.effect === 'stun'));
    if (controllers.length > 0) {
      recs.push('敌方有控制技能，建议分散站位');
    }

    const healers = enemies.filter(e => e.skills.some(s => s.effect === 'heal'));
    if (healers.length > 0) {
      recs.push('优先击杀治疗单位');
    }

    return recs;
  }
}
```

---

## 10. 死亡叙事与Meta解锁

### 10.1 定位

参考 **Hades** 的死亡对话系统，让每次失败都有叙事意义，并推动Meta进度。

### 10.2 死亡档案（Death Chronicle）

每次Run结束后，记录详细数据：

```javascript
const RUN_ANALYTICS = {
  runId: 'uuid',
  seed: 12345,
  result: 'defeat',

  layersCleared: 23,
  totalTimeMs: 1800000,

  battlesFought: 15,
  battlesWon: 14,
  totalDamageDealt: 45000,
  totalDamageTaken: 32000,
  highestDamageInOneHit: 2800,
  longestBattleMs: 45000,

  relicsAcquired: ['greedy_purse', 'scorching_touch', 'frost_core'],
  synergiesActivated: ['steam_explosion'],
  skillsEquipped: ['fireball', 'shield_slam', 'backstep_shot'],

  causeOfDeath: {
    layer: 23,
    nodeType: 'elite',
    enemyId: 'ab_elite_archon',
    finalBlow: 'arcane_burst',
    lastHeroStanding: 'mage'
  },

  abilitiesUsed: {
    'focus_fire': 12,
    'time_stop': 3,
    'shield_burst': 8
  },

  pathChoices: ['battle', 'battle', 'elite', 'rest', 'shop'],
  eventsEncountered: ['wounded_hunter', 'mysterious_altar']
};
```

### 10.3 死亡原因追踪与解锁

| 死亡原因 | 累计次数 | 解锁内容 |
|----------|----------|----------|
| 被自爆魔炸死 | 5次 | 遗物"防爆护符"（受到爆炸伤害-50%）进入池 |
| 超时失败 | 3次 | 遗物"时之沙漏"（战斗时限+15秒）进入池 |
| 被Boss第三阶段杀死 | 5次 | 该Boss的"弱点提示"永久显示 |
| 全队阵亡 | 10次 | NPC"守墓人"出现，提供死亡分析 |
| 通关 | 1次 | 解锁恶魔契约系统 |
| 通关（契约5★） | 1次 | 解锁"困难模式"区域 |

### 10.4 NPC对话系统

**主城NPC根据死亡数据改变对话**：

```
NPC: 铁匠格雷

首次死亡：
  "第一次下深渊？活着回来就是胜利。下次带把更好的武器。"

被自爆魔炸死5次后：
  "我听说你被那些自爆魔折腾得不轻。给你这个设计图——防爆护符，
   下次它们炸你的时候，你可以笑着看它们自爆。"

通关后：
  "你做到了？真的做到了？哈！我就知道我没看错人。
   来，喝一杯，然后告诉我——你准备好面对真正的地狱了吗？"
```

### 10.5 实现方案

```javascript
// js/death-narrative.js
class DeathNarrative {
  constructor(metaProgress) {
    this.meta = metaProgress;
    this.deathCounters = metaProgress.deathCounters || {};
    this.unlockedContent = metaProgress.unlockedContent || new Set();
  }

  recordRun(analytics) {
    if (analytics.result === 'defeat') {
      const cause = analytics.causeOfDeath;
      const key = `${cause.enemyId}_${cause.finalBlow}`;
      this.deathCounters[key] = (this.deathCounters[key] || 0) + 1;
      this.checkUnlocks(key, this.deathCounters[key]);
    }

    if (analytics.result === 'victory') {
      this.unlockedContent.add('demon_pact');
      if (analytics.pactStars >= 5) {
        this.unlockedContent.add('hard_mode');
      }
    }
  }

  checkUnlocks(deathKey, count) {
    const UNLOCK_TABLE = {
      'ab_bomber_suicide': { at: 5, unlock: 'relic_anti_bomb' },
      'timeout': { at: 3, unlock: 'relic_time_extension' },
      'ab_boss_harbinger_arcane_burst': { at: 5, unlock: 'boss_weakness_hint' }
    };

    const rule = UNLOCK_TABLE[deathKey];
    if (rule && count >= rule.at && !this.unlockedContent.has(rule.unlock)) {
      this.unlockedContent.add(rule.unlock);
      this.triggerUnlockNotification(rule.unlock);
    }
  }

  getNPCDialogue(npcId, context) {
    const npc = NPC_DIALOGUES[npcId];

    for (const entry of npc.dialogues) {
      if (entry.condition(this.unlockedContent, this.deathCounters)) {
        return entry.text;
      }
    }

    return npc.defaultDialogue;
  }
}
```

---

## 11. 事件链（Event Chains）

### 11.1 定位

将孤立事件连接成**叙事网络**，让每次Run有独特的"故事线"。

### 11.2 事件链结构

```
事件链: "恶魔猎手的复仇"

节点1: 灰烬荒原 - "受伤的恶魔猎手"
  选项A: 救助他（花费20金币）-> 获得临时增益 + 标记链节点1A
  选项B: 掠夺他的装备 -> 获得装备 + 标记链节点1B
  选项C: 离开 -> 无效果

节点2（需要1A）: 熔岩裂谷 - "恶魔猎手的回报"
  选项A: 接受他的训练 -> 全队攻击+10%（永久）
  选项B: 拒绝 -> 获得遗物"猎手徽章"

节点3（需要1A+2A）: 虚空深渊 - "猎手的终局"
  触发: 强制战斗——恶魔猎手作为友方NPC参战
  结果: 胜利后获得独特遗物"猎手之魂"

节点2（需要1B）: 熔岩裂谷 - "恶魔猎手的诅咒"
  触发: 随机遭遇——被诅咒的猎手攻击你
  结果: 胜利后获得诅咒遗物"背叛者的血"
```

### 11.3 事件链示例

**链1: 恶魔猎手的复仇**
| 节点 | 区域 | 触发条件 | 内容 |
|------|------|----------|------|
| 1A | 灰烬荒原 | 随机 | 救助受伤的恶魔猎手 |
| 2A | 熔岩裂谷 | 完成1A | 猎手训练你 |
| 3 | 虚空深渊 | 完成2A | 与猎手并肩作战 |

**链2: 失落军团**
| 节点 | 区域 | 触发条件 | 内容 |
|------|------|----------|------|
| 1 | 灰烬荒原 | 随机 | 发现古代军营废墟 |
| 2 | 熔岩裂谷 | 完成1 | 唤醒军团幽灵 |
| 3 | 终末王座 | 完成2 | 军团助战最终Boss |

**链3: 商人的复仇**
| 节点 | 区域 | 触发条件 | 内容 |
|------|------|----------|------|
| 1 | 任意商店 | 偷窃/抢劫 | 获得赃物 |
| 2 | 下一区域 | 完成1 | 商人雇佣刺客追杀你 |
| 3 | 再下一区域 | 完成2 | 与商人首领决战 |

### 11.4 实现方案

```javascript
// js/event-chain-system.js
const EVENT_CHAINS = {
  'demon_hunter_revenge': {
    name: '恶魔猎手的复仇',
    nodes: [
      {
        id: 'dh_1',
        zone: 'ashen_wastes',
        trigger: 'random',
        eventId: 'wounded_hunter',
        choices: [
          { id: 'help', next: 'dh_2a', effect: { gold: -20, tempBuff: 'hunter_blessing' } },
          { id: 'loot', next: 'dh_2b', effect: { gearLoot: 'hunter_gear' } },
          { id: 'leave', next: null, effect: {} }
        ]
      },
      {
        id: 'dh_2a',
        zone: 'magma_rift',
        trigger: 'chain_progress',
        eventId: 'hunter_training',
        choices: [
          { id: 'train', next: 'dh_3', effect: { permanentBuff: { teamAttack: 0.1 } } },
          { id: 'refuse', next: null, effect: { relic: 'hunter_badge' } }
        ]
      },
      {
        id: 'dh_3',
        zone: 'void_abyss',
        trigger: 'chain_progress',
        eventId: 'hunter_final_battle',
        type: 'forced_combat',
        allyNpc: 'demon_hunter_ally',
        reward: { relic: 'hunter_soul' }
      }
    ]
  }
};

class EventChainSystem {
  constructor(runState) {
    this.run = runState;
    this.activeChains = new Map();
    this.completedChains = new Set();
  }

  onEvent(eventId, choiceId) {
    for (const [chainId, chain] of Object.entries(EVENT_CHAINS)) {
      const currentNode = this.getCurrentNode(chainId);
      if (currentNode && currentNode.eventId === eventId) {
        const choice = currentNode.choices.find(c => c.id === choiceId);
        if (choice && choice.next) {
          this.activeChains.set(chainId, choice.next);
        } else {
          this.completeChain(chainId);
        }
        return true;
      }
    }
    return false;
  }

  getAvailableEvents(zone) {
    const available = [];

    for (const [chainId, nodeId] of this.activeChains) {
      const chain = EVENT_CHAINS[chainId];
      const node = chain.nodes.find(n => n.id === nodeId);
      if (node && node.zone === zone) {
        available.push({ ...node, chainId, isChain: true });
      }
    }

    const randomEvents = this.getRandomEventsForZone(zone);
    available.push(...randomEvents);

    return available;
  }

  completeChain(chainId) {
    this.activeChains.delete(chainId);
    this.completedChains.add(chainId);
    this.run.metaProgress.completedChains = this.run.metaProgress.completedChains || new Set();
    this.run.metaProgress.completedChains.add(chainId);
  }
}
```


---

## 12. Juice与Game Feel规范

### 12.1 定位

Juice不是"锦上添花"，而是**肉鸽游戏的核心爽感来源**。本规范定义每一层反馈的具体参数。

### 12.2 打击确认五层栈

#### Layer 1: 动画（Animation）

| 事件 | 动画效果 | 持续时间 | 缓动函数 |
|------|----------|----------|----------|
| **受击** | Sprite闪烁白->红，向后位移3-5像素 | 150ms | ease-out |
| **暴击受击** | Sprite放大110%->弹回，红色边框 | 200ms | elastic-out |
| **死亡** | Sprite放大120%->白色闪爆->溶解/飞散 | 400ms | ease-in |
| **击杀（玩家）** | 敌人Sprite冻结1帧->向后飞出->粒子爆开 | 500ms | ease-out |
| **技能释放** | 角色Sprite放大105%->技能特效从角色中心发出 | 300ms | ease-out |

#### Layer 2: 音效（Audio）

| 事件 | 音效类型 | 音高变化 | 音量 |
|------|----------|----------|------|
| **普攻命中** | 短促"啪"/"咔" | 基础音高 | 0.6 |
| **暴击命中** | "砰"+金属回响 | +8半音 | 0.8 |
| **技能命中** | 元素对应音效（火=爆裂，冰=碎裂） | 基础音高 | 0.7 |
| **击杀** | "噗"+回声 | -5半音 | 0.9 |
| **连杀x2** | 短促号角 | +4半音 | 0.7 |
| **连杀x3+** | 更长号角+鼓点 | +7半音 | 0.8 |
| **Boss阶段转换** | 低沉轰鸣 | 基础音高 | 1.0 |
| **协同激活** | 和弦上升 | 基础音高 | 0.9 |

#### Layer 3: 视觉特效（VFX）

| 事件 | VFX | 粒子数 | 颜色 | 持续时间 |
|------|-----|--------|------|----------|
| **命中** | 受击点迸发4-6个粒子 | 6 | 白->红 | 300ms |
| **暴击** | 受击点迸发12-16个粒子+星形 | 16 | 黄->橙 | 500ms |
| **击杀** | 死亡位置爆开20-30个粒子 | 30 | 对应职业色 | 800ms |
| **技能（火）** | 火焰轨迹+命中爆炸 | 20 | 橙红 | 600ms |
| **技能（冰）** | 冰晶轨迹+命中霜爆 | 15 | 蓝白 | 600ms |
| **技能（雷）** | 闪电链+命中电弧 | 25 | 紫白 | 400ms |
| **协同触发** | 屏幕边缘光波+角色光环 | 50 | 协同色 | 1000ms |

#### Layer 4: 屏幕效果（Screen Effects）

| 事件 | 效果 | 强度 | 持续时间 |
|------|------|------|----------|
| **暴击** | 微震屏 | 2-3像素位移 | 3帧（150ms） |
| **击杀** | 微震屏+轻微缩放 | 3像素+2%缩放 | 5帧（250ms） |
| **Boss阶段转换** | 强震屏+色散 | 8像素+色散 | 10帧（500ms） |
| **协同激活** | 边缘发光+轻微缩放 | 5%缩放 | 15帧（750ms） |
| **受到伤害（玩家）** | 红色边框闪烁 | 边框宽度4px | 10帧（500ms） |
| **低血量（<30%）** | 持续红色暗角 | 暗角强度30% | 持续 |

**震屏实现**：
```javascript
function triggerScreenShake(intensity, durationMs) {
  const startTime = Date.now();
  const originalOffset = { x: canvas.offsetX, y: canvas.offsetY };

  function shake() {
    const elapsed = Date.now() - startTime;
    if (elapsed >= durationMs) {
      canvas.offsetX = originalOffset.x;
      canvas.offsetY = originalOffset.y;
      return;
    }

    const decay = 1 - (elapsed / durationMs);
    const dx = (Math.random() - 0.5) * intensity * decay * 2;
    const dy = (Math.random() - 0.5) * intensity * decay * 2;

    canvas.offsetX = originalOffset.x + dx;
    canvas.offsetY = originalOffset.y + dy;

    requestAnimationFrame(shake);
  }

  shake();
}
```

#### Layer 5: 数字反馈（Damage Numbers）

| 类型 | 颜色 | 大小 | 动画 | 特殊效果 |
|------|------|------|------|----------|
| **普通伤害** | 白 | 16px | 向上漂移+淡出 | 无 |
| **暴击伤害** | 黄->橙 | 24px | 向上漂移+放大->缩小+淡出 | 描边2px黑 |
| **技能伤害** | 元素色 | 20px | 向上漂移+旋转+淡出 | 无 |
| **击杀伤害** | 红 | 28px | 向上快速漂移+放大+淡出 | 描边2px黑+阴影 |
| **治疗** | 绿 | 18px | 向上漂移+淡出 | "+"前缀 |
| **金币获得** | 金 | 16px | 向HUD金币位置飞入 | 抛物线轨迹 |
| **经验获得** | 蓝 | 14px | 向HUD经验条飞入 | 抛物线轨迹 |

**数字弹出实现**：
```javascript
class DamageNumber {
  constructor(x, y, value, type) {
    this.x = x;
    this.y = y;
    this.value = value;
    this.type = type; // 'normal', 'crit', 'skill', 'heal', 'gold'
    this.life = 1.0;
    this.vy = -60; // 向上速度 px/s
    this.vx = (Math.random() - 0.5) * 30;
  }

  update(dtMs) {
    this.x += this.vx * dtMs / 1000;
    this.y += this.vy * dtMs / 1000;
    this.life -= dtMs / 1000; // 1秒寿命
    this.vy *= 0.98; // 阻力
  }

  draw(ctx) {
    const alpha = Math.max(0, this.life);
    const scale = this.type === 'crit' ? 1 + (1 - this.life) * 0.5 : 1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y);
    ctx.scale(scale, scale);

    const style = DAMAGE_STYLES[this.type];
    ctx.fillStyle = style.color;
    ctx.font = `bold ${style.size}px monospace`;
    ctx.textAlign = 'center';

    if (style.outline) {
      ctx.strokeStyle = style.outline;
      ctx.lineWidth = 2;
      ctx.strokeText(this.value, 0, 0);
    }

    ctx.fillText(this.value, 0, 0);
    ctx.restore();
  }
}
```

### 12.3 击杀反馈链（Kill Combo）

```
敌人死亡时：
  1. 时间冻结3帧（卡帧）
     - 实现：暂停所有更新3帧（50ms x 3 = 150ms），只渲染

  2. 敌人Sprite放大110%->白色闪爆->粒子向四周爆开
     - 粒子方向：从死亡中心向四周360度均匀分布
     - 粒子速度：100-200 px/s
     - 粒子颜色：敌人职业色 -> 白色 -> 淡出

  3. 连杀计数（如果3秒内连续击杀）
     - x2: 小号角音效 + "双杀"文字弹出
     - x3: 更长号角 + "三杀" + 屏幕微震
     - x4+: 鼓点+号角 + "xN" + 屏幕震屏 + 伤害数字放大

  4. 掉落物向玩家HUD位置"飞入"
     - 金币/装备/遗物从死亡位置抛物线飞向对应HUD位置
     - 飞行时间：800ms
     - 到达时：HUD对应位置闪烁
```

**卡帧实现**：
```javascript
function triggerHitStop(frames) {
  battle.hitStopFrames = frames;
}

// 在tickBattle中
if (battle.hitStopFrames > 0) {
  battle.hitStopFrames--;
  // 只渲染，不更新逻辑
  renderBattle(battle);
  return;
}
```

### 12.4 构筑爽感的高潮时刻

**当特定协同激活时**：
- 屏幕边缘出现对应颜色的光效（火=红，冰=蓝，雷=紫）
- 角色释放技能时有独特台词/像素表情（战士怒吼、法师咏唱）
- 终极技能释放时：镜头拉近->角色特写->技能动画->震屏->慢动作收尾

**参考Hades的"恩赐组合"提示**：
```
当玩家凑齐一套协同：
  1. 屏幕中央弹出"XX协同已激活！"
  2. 协同图标放大->旋转->缩小至HUD角落
  3. 播放对应音效（和弦上升）
  4. 角色获得临时光环（持续5秒）
```

### 12.5 加速与跳过

```
必须加入：
  - 战斗速度 x1 / x2 / x3（首次通关前锁定x1，通关后解锁）
  - "碾压模式"：当玩家战力远超敌人时，显示"碾压"按钮，瞬间胜利
  - 连续战斗的"自动下一场"（针对 farming 心态）
```

**实现**：
```javascript
const SPEED_MULTIPLIERS = [1, 2, 3];
let currentSpeedIndex = 0;

function setBattleSpeed(index) {
  currentSpeedIndex = index;
  battle.timeScale = SPEED_MULTIPLIERS[index];
}

// 在tickBattle中
const effectiveDt = dtMs * battle.timeScale;
```

---

## 13. 详细数值设计表

### 13.1 指挥官指令数值

| 指令 | 基础消耗 | 冷却(秒) | 效果数值 | 升级后效果 |
|------|----------|----------|----------|------------|
| 集火标记 | 25TE | 8 | 伤害+30%，6秒 | 伤害+45%，8秒 |
| 紧急后撤 | 35TE | 12 | 位移2格，无敌1.5秒 | 位移3格，无敌2秒 |
| 护盾爆发 | 40TE | 15 | 护盾15%生命，5秒 | 护盾25%生命，7秒 |
| 时停 | 60TE | 25 | 冻结2.5秒 | 冻结3.5秒 |
| 战吼鼓舞 | 30TE | 10 | 攻击+25%，攻速+15%，5秒 | 攻击+35%，攻速+25%，7秒 |
| 战术撤退 | 50TE | 20 | 放弃本场，保留生命 | 放弃本场，保留生命+50%金币 |

### 13.2 遗物协同数值

| 协同 | 触发条件 | 效果数值 | 冷却 |
|------|----------|----------|------|
| 蒸汽爆炸 | 火+冰同时存在 | 300%AOE，半径80px | 每敌人3秒内置CD |
| 血怒狂潮 | 生命<30% | 吸血30%+流血 | 持续触发 |
| 奥术风暴 | 闪电链+奥术增幅 | 弹射+3，爆炸50%AOE | 每次弹射 |
| 时之轮回 | 复活触发 | 回溯10秒状态 | 每场战斗1次 |
| 黄金律 | 每100金币 | 攻击+1% | 持续叠加 |
| 暴击震荡 | 暴击触发 | 眩晕0.5秒 | 每敌人1秒内置CD |

### 13.3 诅咒遗物数值

| 诅咒遗物 | 正面 | 负面 | 风险等级 |
|----------|------|------|----------|
| 血渴之刃 | 攻击x1.3 | 每场-10%最大生命 | 3 |
| 时间窃贼 | 金币x1.5 | 时限45秒 | 2 |
| 贪婪之握 | 商店-30% | 经验-40% | 2 |
| 狂战面具 | 暴击伤害+60% | 受暴击+40% | 3 |
| 虚空之种 | 每场随机遗物 | 每场随机失去遗物 | 4 |
| 殉道者之链 | 复活保留50% | 不可再复活 | 5 |

### 13.4 腐化阈值数值

| 腐化值 | 效果 | 数值 |
|--------|------|------|
| 20 | 敌人攻击 | x1.1 |
| 40 | 商店价格 | x1.2 |
| 60 | 休息回血 | x0.7 |
| 80 | 随机精英 | 每场1个 |
| 100 | 腐化Boss | 触发特殊战斗 |

### 13.5 恶魔契约数值

| 契约 | 星级 | 效果 | 奖励加成 |
|------|------|------|----------|
| 硬化血肉 | 1 | 敌人生命x1.2 | +10% |
| 锋利爪牙 | 1 | 敌人攻击x1.2 | +10% |
| 迅捷暗影 | 2 | 敌人速度x1.15 | +15% |
| 精英 swarm | 2 | 额外精英 | +15% |
| Boss巨人 | 2 | Boss生命x1.3 | +15% |
| 恶魔军火库 | 3 | 敌人额外技能 | +20% |
| 脆弱身体 | 1 | 生命x0.8 | +10% |
| 空钱包 | 1 | 金币x0.8 | +10% |
| 迟缓思维 | 2 | 指令CDx1.3 | +15% |
| 时间禁令 | 3 | 禁用时停 | +20% |
| 永久死亡 | 3 | 禁用复活 | +20% |
| 孤狼 | 4 | 单角色 | +30% |

---

## 14. 数据结构与配置Schema

### 14.1 指挥官配置 Schema

```json
{
  "commander": {
    "energy": {
      "max": 100,
      "regenPerSecond": 5,
      "regenPerKill": 8,
      "regenPerDamageTaken": 0.5,
      "startEnergy": 20,
      "overflowCap": 120
    },
    "abilities": {
      "focus_fire": {
        "name": "集火标记",
        "cost": 25,
        "cooldownMs": 8000,
        "effectType": "focus_fire",
        "params": {
          "damageBonus": 0.3,
          "durationMs": 6000
        },
        "unlockCondition": "default"
      }
    }
  }
}
```

### 14.2 协同矩阵配置 Schema

```json
{
  "synergies": {
    "steam_explosion": {
      "name": "蒸汽爆炸",
      "requiredRelics": ["scorching_touch", "frost_core"],
      "effect": {
        "type": "elemental_reaction",
        "trigger": "fire_and_ice_on_same_target",
        "damageMult": 3.0,
        "aoeRadius": 80
      },
      "vfx": "steam_burst",
      "uiColor": "#88ccff"
    }
  }
}
```

### 14.3 区域生态配置 Schema

```json
{
  "zones": {
    "ashen_wastes": {
      "name": "灰烬荒原",
      "layers": 10,
      "trait": {
        "id": "ash_shroud",
        "applyEveryNBattles": 3,
        "effects": [{ "type": "vision_reduce", "value": 0.2 }]
      },
      "enemyPool": ["ab_grunt", "ab_archer", "ab_imp"],
      "specialNodes": ["ember_shrine"],
      "branchPaths": ["shadow_path", "golden_road", "blood_road"]
    }
  }
}
```

### 14.4 诅咒配置 Schema

```json
{
  "cursedRelics": {
    "bloodthirst_blade": {
      "name": "血渴之刃",
      "positiveEffects": [{ "type": "team_attack_mult", "value": 1.3 }],
      "negativeEffects": [
        { "type": "permanent_hp_loss", "value": 0.1, "trigger": "after_battle" }
      ],
      "riskLevel": 3
    }
  },
  "corruption": {
    "thresholds": [
      { "at": 20, "effects": [{ "type": "enemy_attack_mult", "value": 1.1 }] },
      { "at": 100, "effects": [{ "type": "trigger_corruption_boss" }] }
    ]
  }
}
```

### 14.5 事件链配置 Schema

```json
{
  "eventChains": {
    "demon_hunter_revenge": {
      "name": "恶魔猎手的复仇",
      "nodes": [
        {
          "id": "dh_1",
          "zone": "ashen_wastes",
          "trigger": "random",
          "eventId": "wounded_hunter",
          "choices": [
            { "id": "help", "nextNode": "dh_2a", "effects": [{ "type": "gold", "value": -20 }] },
            { "id": "loot", "nextNode": "dh_2b", "effects": [{ "type": "gear_loot", "pool": "hunter" }] },
            { "id": "leave", "nextNode": null }
          ]
        }
      ]
    }
  }
}
```

---

## 15. 实现路线图与优先级

### 15.1 Phase 1: 爽感层（2-3周）

**目标**：最低成本，最高感知收益

| 任务 | 工作量 | 依赖 |
|------|--------|------|
| 击杀粒子系统 | 2天 | 无 |
| 伤害数字弹出 | 2天 | 无 |
| 震屏/卡帧 | 1天 | 无 |
| 战斗加速(x2/x3) | 1天 | 无 |
| 碾压模式（瞬间结算） | 3天 | 战力评估函数 |
| 音效分层 | 3天 | 音频资源 |
| **Phase 1 合计** | **12天** | |

### 15.2 Phase 2: 节奏层（3-4周）

**目标**：解决"观看90秒"问题

| 任务 | 工作量 | 依赖 |
|------|--------|------|
| 指挥官模式基础框架 | 5天 | 无 |
| 6个基础指令实现 | 4天 | 指挥官框架 |
| 战术能量系统 | 2天 | 指挥官框架 |
| Boss阶段机制框架 | 3天 | 无 |
| 4个Boss阶段设计 | 4天 | 阶段框架 |
| 层数压缩（53->35） | 1天 | 配置调整 |
| **Phase 2 合计** | **19天** | |

### 15.3 Phase 3: 系统层（4-6周）

**目标**：引入深度系统

| 任务 | 工作量 | 依赖 |
|------|--------|------|
| 遗物协同矩阵 | 5天 | 遗物系统 |
| 区域生态重构 | 4天 | 地图生成 |
| 诅咒与腐化系统 | 4天 | 遗物系统 |
| 恶魔契约系统 | 3天 | Meta进度 |
| 战前情报系统 | 3天 | 敌人AI |
| **Phase 3 合计** | **19天** | |

### 15.4 Phase 4: 叙事层（3-4周）

**目标**：增加重玩动力

| 任务 | 工作量 | 依赖 |
|------|--------|------|
| 死亡叙事系统 | 3天 | 数据分析 |
| 事件链系统 | 5天 | 事件系统 |
| NPC动态对话 | 3天 | 叙事系统 |
| Meta解锁系统 | 2天 | 存档系统 |
| **Phase 4 合计** | **13天** | |

### 15.5 总时间线

```
Week 1-2:  Phase 1（爽感层）
Week 3-5:  Phase 2（节奏层）
Week 6-9:  Phase 3（系统层）
Week 10-12: Phase 4（叙事层）
Week 13-14: 集成测试与平衡调整
```

**总计：约3个月（2个程序员全职）**

### 15.6 落地状态（2026-07-26）

| 模块 | 状态 | 备注 |
|------|------|------|
| Juice / 指挥官 / Boss 阶段 | ✅ | 含音频 stub |
| 协同矩阵（含四元） | ✅ | midas / 元素领主 / 时停刺客等 |
| 诅咒 / 腐化 / 恶魔契约 | ✅ | 含多星 UI |
| 战前情报 / 事件链 / 独立事件 | ✅ | |
| 天气 / 区域生态 / 变异节点 | ✅ | 含反转战斗玩家控敌 |
| 构建简化（2 槽装备 + 3 星） | ✅ | 旧 affix 词缀已移除 |

---

## 16. 与现有系统的兼容方案

### 16.1 开关配置

所有新系统通过配置开关控制，确保可回滚：

```javascript
// config/ascension-config.json
{
  "ascension": {
    "commanderMode": {
      "enabled": true,
      "tutorialBossRequired": true // 首次Boss战强制教学
    },
    "skirmishMode": {
      "enabled": true,
      "powerRatioThreshold": 1.5
    },
    "bossPhases": {
      "enabled": true,
      "affectedBosses": ["ab_boss_warden", "ab_boss_tyrant", "ab_boss_harbinger", "ab_boss_final"]
    },
    "synergyMatrix": {
      "enabled": true,
      "maxActiveSynergies": 5
    },
    "zoneEcology": {
      "enabled": true,
      "zoneLayout": ["ashen_wastes", "magma_rift", "void_abyss", "throne_of_end"]
    },
    "curseSystem": {
      "enabled": true,
      "corruptionEnabled": true
    },
    "demonPact": {
      "enabled": false, // 通关后解锁
      "unlockAfterVictory": true
    },
    "preCombatIntel": {
      "enabled": true,
      "accuracy": 0.9
    },
    "deathNarrative": {
      "enabled": true
    },
    "eventChains": {
      "enabled": true,
      "maxConcurrentChains": 3
    },
    "juiceSystem": {
      "enabled": true,
      "hitStopEnabled": true,
      "screenShakeEnabled": true,
      "damageNumbersEnabled": true
    }
  }
}
```

### 16.2 数据兼容

- **存档兼容**：新系统数据存储在独立命名空间，不影响旧存档
- **配置兼容**：新配置文件独立，旧配置完全保留
- **回滚方案**：关闭ascension配置中的所有开关，游戏回到重构前状态

### 16.3 代码兼容

```javascript
// 在现有代码中插入钩子，而非替换

// auto-battle-simulator.js
function tickBattle(battle, dtMs) {
  // 现有逻辑...

  // 插入：指挥官模式
  if (ASCENSION.commanderMode.enabled && battle.commanderMode) {
    battle.commanderMode.update(dtMs);
  }

  // 插入：Boss阶段
  if (ASCENSION.bossPhases.enabled && battle.bossPhaseSystem) {
    battle.bossPhaseSystem.update(dtMs);
  }

  // 插入：Juice
  if (ASCENSION.juiceSystem.enabled) {
    battle.juiceSystem.update(dtMs);
  }

  // 现有逻辑...
}
```

### 16.4 测试策略

| 测试类型 | 方法 | 通过标准 |
|----------|------|----------|
| **开关测试** | 关闭所有新系统开关 | 游戏行为与重构前完全一致 |
| **单元测试** | 每个新系统独立测试 | 所有边界条件正确处理 |
| **集成测试** | 多系统同时开启 | 无冲突，性能无显著下降 |
| **平衡测试** | 1000局自动模拟 | 通关率保持在15-25% |
| **玩家测试** | 5名玩家试玩 | 平均评分>=4/5 |

---

## 附录A：新增遗物清单

### A.1 指挥官相关遗物

| 遗物 | 稀有度 | 效果 |
|------|--------|------|
| 战术目镜 | 稀有 | 战前情报准确度100% |
| 能量核心 | 稀有 | 战术能量上限+50，恢复+2/秒 |
| 指挥官之戒 | 传说 | 指令冷却-30% |
| 灵魂契约 | 传说 | 解锁"灵魂链接"指令 |
| 虚空之钥 | 传说 | 解锁"虚空放逐"指令 |
| 时之沙漏 | 传说 | 解锁"时间回溯"指令 |

### A.2 协同相关遗物

| 遗物 | 稀有度 | 效果 |
|------|--------|------|
| 灼热之触 | 稀有 | 攻击附带燃烧（每秒5%攻击，3秒） |
| 寒冰核心 | 稀有 | 攻击附带冰冻（减速30%，2秒） |
| 闪电链 | 稀有 | 攻击弹射2次（每次50%伤害） |
| 吸血獠牙 | 稀有 | 攻击吸血10% |
| 鲜血契约 | 传说 | 生命每降低10%，攻击+5% |
| 守护天使 | 传说 | 死亡时复活一次（50%生命） |

### A.3 诅咒遗物

| 遗物 | 风险等级 | 效果 |
|------|----------|------|
| 血渴之刃 | 3 | 攻击+30%，每场-10%最大生命 |
| 时间窃贼 | 2 | 金币+50%，时限-15秒 |
| 虚空之种 | 4 | 每场随机遗物，每场随机失去遗物 |
| 殉道者之链 | 5 | 复活保留50%，但不可再复活 |

---

## 附录B：新增事件清单

### B.1 独立事件

| 事件 | 区域 | 选项 | 结果 |
|------|------|------|------|
| 神秘祭坛 | 任意 | 献祭生命/金币/遗物 | 随机获得同等价值奖励 |
| 流浪商人 | 任意 | 购买/抢劫/离开 | 购买=正常，抢劫=获得装备+触发商人复仇链 |
| 古代宝箱 | 任意 | 打开/撬锁/离开 | 打开=可能触发陷阱，撬锁=需要刺客 |
| 圣泉 | 任意 | 净化/饮用/离开 | 净化=-30腐化，饮用=全队恢复50% |

### B.2 事件链事件

| 链 | 节点 | 事件 | 触发条件 |
|----|------|------|----------|
| 恶魔猎手的复仇 | 1 | 受伤的恶魔猎手 | 灰烬荒原随机 |
| 恶魔猎手的复仇 | 2A | 猎手的回报 | 完成节点1A |
| 恶魔猎手的复仇 | 3 | 猎手的终局 | 完成节点2A |
| 失落军团 | 1 | 古代军营 | 灰烬荒原随机 |
| 失落军团 | 2 | 唤醒幽灵 | 完成节点1 |
| 失落军团 | 3 | 军团助战 | 完成节点2 |
| 商人的复仇 | 1 | 偷窃/抢劫 | 商店中选择 |
| 商人的复仇 | 2 | 刺客追杀 | 完成节点1 |
| 商人的复仇 | 3 | 商人首领 | 完成节点2 |

---

## 附录C：性能预算

| 系统 | 每帧额外开销 | 内存占用 | 优化策略 |
|------|-------------|----------|----------|
| 指挥官模式 | <0.5ms | <10KB | 能量恢复按秒计算，非每帧 |
| Juice VFX | <1ms（峰值） | <50KB | 粒子池复用，最大100个粒子 |
| 协同矩阵 | <0.1ms | <5KB | 仅在遗物获取时检查 |
| 战前情报 | <1ms（仅布阵时） | <20KB | 预计算，缓存结果 |
| Boss阶段 | <0.2ms | <10KB | 仅在Boss战激活 |
| 事件链 | <0.1ms | <5KB | 仅在事件触发时检查 |

**总预算**：每帧额外开销 <3ms，内存占用 <100KB

---

*文档结束*
