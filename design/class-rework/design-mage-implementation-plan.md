# 《Pixel Eternal》法师职业系重做 — 现状审计与实施规划报告

**文档版本**：v1.0  
**审计日期**：2026年7月10日  
**文档状态**：实施规划阶段  
**关联文档**：`design-mage-rework.md`（设计方案），`../class-system-design.md`（原始设计）

---

## 目录

1. [审计结论摘要](#1-审计结论摘要)
2. [已完成部分详细审计](#2-已完成部分详细审计)
3. [未完成部分详细审计](#3-未完成部分详细审计)
4. [四支柱对比矩阵](#4-四支柱对比矩阵)
5. [分阶段实施计划](#5-分阶段实施计划)
6. [每个阶段的工作清单](#6-每个阶段工作清单)
7. [风险与依赖](#7-风险与依赖)

---

## 1. 审计结论摘要

### 关键发现

代码库中已经存在一个**部分实施中的法师重做**。约 35% 的基础设施已就位，但核心玩法逻辑几乎为 0%。

```
整体完成度： ~12%

  ┌─────────────────────────────────────────────────────┐
  │ ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░  基础框架 35% │
  │ ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  Config 配置 5% │
  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  玩法逻辑 <1% │
  │ ███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  UI 视觉 10%  │
  └─────────────────────────────────────────────────────┘
```

### 已在代码中的 "幽灵代码"

大量函数调用使用了 `typeof window.xxx === 'function'` 守卫，意味着**调用点已经写好，但函数本身还不存在**。调用链完整，只差实现。

---

## 2. 已完成部分详细审计

### 2.1 资源系统（skill-system.js，完成度 ~60%）

#### ✅ 已实现：VFX 家族映射

`js/skill-system.js` 第 199-206 行：

```javascript
const MAGE_VFX_FAMILY = {
    wizard: 'elemental_power',
    archmage: 'elemental_power',
    sage: 'chronos_sand',
    oracle: 'chronos_sand',
    warlock: 'soul_shard_v2',
    necromancer: 'soul_shard_v2'
};
```

**评价**：三种新资源族已正确注册。`getSkillVfxFamilyForPlayer()` 可以正确返回法师各分支的资源类型。技能粒子特效颜色可以跟随资源族变化。

#### ✅ 已实现：通用资源管理

`js/skill-system.js`：
- `getResourceFamilyForClass()`（第 162 行）— 通用地从 `classData` → `resource.type` → `resourceToFamily` 解析资源族
- `initPlayerClassResource()`（第 825 行）— 初始化 `player.classResource` 结构
- `getPlayerResourceState()`（第 815 行）— 返回当前/最大资源量和名称

**评价**：完全通用实现，任何新增资源只需在 JSON 中声明即可自动生效。**无需修改此文件。**

#### ✅ 已实现：技能演化解析

`resolveEvolvedSkill()`（第 854 行）— 根据转职进度自动选择正确技能版本。**无需修改。**

---

### 2.2 钩子与调用点（多个文件，完成度 ~40%）

以下调用点已经存在，用 `typeof window.xxx === 'function'` 守卫，等待函数实现：

| 调用点 | 所在文件 | 行号 | 说明 |
|--------|----------|------|------|
| `applySageSkillPrimary()` | class-skill-effects.js | 589 | 贤者技能主效果（如预知之盾、净化时序） |
| `applyWarlockSkillPrimary()` | class-skill-effects.js | 593 | 术士技能主效果（如痛苦诅咒、生命汲取） |
| `applyElementalLiberationEffect()` | class-skill-effects.js | 598 | 元素解放效果（巫师大招） |
| `tickWizardElementStates()` | skill-entity-system.js | 2153 | 每帧更新巫师元素相位/能量 |
| `tickSageChronosStates()` | skill-entity-system.js | 2156 | 每帧更新贤者时光沙漏/护盾 |
| `tickWarlockSoulStates()` | skill-entity-system.js | 2159 | 每帧更新术士灵魂碎片/DOT状态 |
| `getElementPhase()` | class-ui.js | 645 | 获取当前元素相位（UI显示） |
| `isWizardTreePlayer()` | class-ui.js | 647 | 判断是否为巫师分支（UI显示） |
| `spendAllSoulShardsForLegion()` | skill-entity-system.js | 1452 | 消耗全部灵魂碎片召唤亡灵军团 |

**评价**：调用链已完全铺设，意味着**实现时只需创建 JS 文件并挂载函数到 window，无需修改调用方**。

---

### 2.3 亡灵军团召唤（skill-entity-system.js，完成度 ~95%）

`skill-entity-system.js` 第 1448-1489 行 `spawnSummon()` 函数中的 `undeadLegion` 分支：

```javascript
if (c.undeadLegion && typeof window.spendAllSoulShardsForLegion === 'function') {
    const shardCount = window.spendAllSoulShardsForLegion(player);
    // 加权随机生成：骷髅战士40%/骷髅法师30%/幽灵20%/骨龙10%
    // 每个召唤物继承玩家属性的比例
    // AI类型、持续时间、视觉效果均已实现
}
```

**✅ 已实现的内容**：
- 4种亡灵类型加权随机生成
- 属性继承（hp 35%, attack 42%, defense 12%）
- AI 类型（近战/远程）
- 过期清理

**❌ 需要补充**：
- `spendAllSoulShardsForLegion()` 函数本身（消耗灵魂碎片逻辑）
- 亡灵与 DOT 联动（亡灵攻击受 DOT 影响的目标增伤）
- 亡灵死亡时的 DOT 转移
- 亡灵军团的生命周期 UI（小血条/计数器）

---

### 2.4 防御技能类型注册（class-skill-effects.js，完成度 ~100%）

`isDefensiveClassSkill()` 第 1153-1157 行已注册所有新法师技能类型：

```javascript
// 贤者系
'foresight_shield', 'purify_time', 'chrono_aura', 'sacred_rewind',
'time_field', 'fate_weave', 'fate_reversal', 'time_rewind',
// 术士系
'agony_curse', 'life_drain', 'dark_harvest', 'spreading_curse', 'soul_harvest',
// 巫师系
'elemental_liberation', 'meteor_liberation'
```

**评价**：完美匹配设计方案中的技能命名。**无需修改。**

---

### 2.5 元素相位 UI（class-ui.js，完成度 ~50%）

`class-ui.js` 第 644-658 行：

```javascript
const phaseEl = $('element-phase-indicator');
if (phaseEl && typeof window.getElementPhase === 'function') {
    const phase = window.getElementPhase(this.game.player);
    if (phase && typeof window.isWizardTreePlayer === 'function'
        && window.isWizardTreePlayer(this.game.player)) {
        phaseEl.style.display = 'block';
        phaseEl.textContent = phase === 'fire' ? '灼热相位'
            : phase === 'frost' ? '霜寒相位'
            : phase === 'overload' ? '过载相位'
            : phase === 'arctic' ? '极寒相位' : phase;
    }
}
```

**✅ 已实现**：HTML 元素查找、4种相位文本映射、显示/隐藏逻辑  
**❌ 需要补充**：`getElementPhase()` 函数、`isWizardTreePlayer()` 函数、`element-phase-indicator` HTML 元素 + CSS

---

### 2.6 状态系统（combat-status-system.js + status-synergy-config.json，完成度 ~70%）

#### ✅ 已有状态效果

| 状态 | 用途 | 巫师 | 术士 |
|------|------|:---:|:---:|
| `burn` (灼烧) | DOT + 火伤 | ✅ | — |
| `frostbite` (冻伤) | 减速 + 降攻速 | ✅ | — |
| `shock` (感电) | 受击溅射 | ✅ | — |
| `dark_erosion` (暗蚀) | 降防 | — | ✅ |
| `corruption` (腐蚀) | DOT 暗伤 0.3x/s × 6s | — | ✅ |

#### ✅ 已有元素协同

| 协同 | 条件 | 效果 |
|------|------|------|
| `thermal_shock` | 灼烧 + 冻伤 | 3%最大生命真伤 |
| `conductive_freeze` | 冻伤 + 感电 | 眩晕1.5s + 20%增伤4s |
| `shadow_arc` | 感电 + 暗蚀 | 连锁伤害 |
| `chaos` | 任意3状态 | 结算所有DOT+眩晕 |

**评价**：状态系统已有很好的基础。`corruption` 状态（0.3x/s × 6s）正好匹配术士设计中的腐蚀 DOT。只需要补充 `agony_curse`（痛苦诅咒，可叠加 DOT）即可。

---

## 3. 未完成部分详细审计

### 3.1 配置文件 — 最大瓶颈（完成度 ~5%）

#### ❌ class-config.json

当前所有法师分支的 `resource.type` 仍为 `mana`，需要更新为：

| 职业 | 当前 | 应改为 |
|------|------|--------|
| wizard | `mana` → 220 | `elemental_power` → 100 |
| archmage | 无 resource 声明 | `elemental_power` → 100 |
| sage | `mana` → 250 | `chronos_sand` → 100 |
| oracle | 无 resource 声明 | `chronos_sand` → 100 |
| warlock | `soul_shard` → 100 | `soul_shard` → 8 |
| necromancer | 无 resource 声明 | `soul_shard` → 8 |

**注意**：术士的 `soul_shard` 目前在 `resourceToFamily` 中被映射到 `mana`，必须改为映射到 `soul_shard_v2`（如果需要）或独立处理。

所有法师分支均无 `classPassive` 字段，需要补充。

#### ❌ skill-config.json

需要在 `resourceFamilies` 中新增三种资源族的完整定义。当前只有一个骨架的 `mana` 定义。

需要在 `skills` 中新增/重定义 ~15 个新技能。需要更新所有法师分支的 `hotbarSlots`。

---

### 3.2 核心玩法文件 — 完全空白（完成度 0%）

以下三个文件**完全不存在**，是本次重做的核心工作量：

| 文件 | 内容 | 预估行数 |
|------|------|----------|
| `js/wizard-element-system.js` | 元素相位状态机、元素共鸣触发、元素能量管理 | ~400行 |
| `js/sage-chronos-system.js` | 时光沙漏经济、预知之盾逻辑、时间法术效果 | ~500行 |
| `js/warlock-soul-system.js` | 灵魂碎片经济、DOT追踪/叠加、诅咒管理、召唤物AI | ~600行 |

---

### 3.3 资源恢复逻辑 — 未适配（完成度 ~10%）

当前资源恢复逻辑在 `skill-system.js` 的通用资源 tick 中，按 `resourceFamilies` 中的 `regenPerSec` 进行每秒恢复。对于新资源：

- **elemental_power**：不应自动回复。需要通过相位切换、共鸣触发来获取。需要特殊 tick 逻辑。
- **chronos_sand**：仅有极低的 3/s 自然回复。主要来源是预知之盾吸收成功。需要特殊 tick 逻辑。
- **soul_shard**：不应自动回复。通过击杀、DOT 跳概率、生命汲取完成来获取。需要特殊 tick 逻辑。

当前通用的 `tickPlayerClassResource()` 需要对新资源族进行跳过或特化处理。

---

### 3.4 UI 元素 — 部分 HTML/CSS 缺失

需要在 HTML/CSS 中添加：

| 元素 | 用途 | 文件 |
|------|------|------|
| `#element-phase-indicator` | 元素相位文字提示 | index.html + styles.css |
| `#sage-chronos-bar` | 时光沙漏资源条 | index.html + styles.css |
| `#soul-shard-counter` | 灵魂碎片数量 + 图标 | index.html + styles.css |
| `#undead-legion-counter` | 亡灵军团存活数量 | index.html + styles.css |
| DOT 图标指示器 | 怪物身上 DOT 类型提示 | styles.css |

---

### 3.5 技能 VFX — 未适配

当前 `class-skill-vfx.js` 中的法师 VFX 仅有旧有技能（火球、冰环）的特效。新技能（极光束、熔岩风暴、冥界之门、时光倒流等）需要全新视觉特效。

---

## 4. 四支柱对比矩阵

下表将"设计方案"与"代码现状"逐项对齐：

### 4.1 巫师/大魔导师

| 设计项 | 设计方案要求 | 代码现状 | 差距 |
|--------|-------------|----------|:--:|
| 资源类型 | `elemental_power` | MAGE_VFX_FAMILY 已注册，但 class-config 仍用 `mana` | 🔴 |
| 元素相位 | 灼热/霜寒/过载/极寒 四相位切换 | UI 有 phase indicator 代码，但 `getElementPhase()` 不存在 | 🟡 |
| 相位效果 | 切换时触发元素脉冲 + 属性变化 | 未实现 | 🔴 |
| 元素共鸣 | 热冲击/超导/过载/元素解放 | status-synergy-config 有 thermal_shock 等，但非巫师专属触发 | 🟡 |
| 元素协奏 | 消耗相位 → 触发共鸣 → 解放 | skillEffect type 已注册 `elemental_liberation`，函数不存在 | 🔴 |
| 熔岩风暴 | 双元素不切换相位 | 未实现 | 🔴 |
| classPassive | `elemental_rhythm` / `elemental_mastery` | 未定义 | 🔴 |
| 系统文件 | `wizard-element-system.js` | 不存在 | 🔴 |
| 钩子调用 | `tickWizardElementStates()` | 调用点已存在 | 🟢 |
| 钩子调用 | `isWizardTreePlayer()` | 调用点已存在 | 🟢 |

### 4.2 贤者/先知

| 设计项 | 设计方案要求 | 代码现状 | 差距 |
|--------|-------------|----------|:--:|
| 资源类型 | `chronos_sand` | MAGE_VFX_FAMILY 已注册，但 class-config 仍用 `mana` | 🔴 |
| 时序弹 | 双效 basic（伤害+治疗） | `mage_basic` 仍是纯攻击 | 🔴 |
| 预知之盾 | 护盾吸收→获得沙漏 | skillEffect type 已注册，函数不存在 | 🟡 |
| 净化时序 | 驱散+时序守护 | skillEffect type 已注册 `purify_time` | 🟡 |
| 神圣回溯 | 记录生命→回溯 | skillEffect type 已注册 `sacred_rewind` | 🟡 |
| 时光倒流 | 全队回溯4秒 | skillEffect type 已注册 `time_rewind` | 🟡 |
| 命运编织 | 伤害转治疗 | skillEffect type 已注册 `fate_weave` | 🟡 |
| classPassive | `temporal_intuition` / `paradox_walker` | 未定义 | 🔴 |
| 系统文件 | `sage-chronos-system.js` | 不存在 | 🔴 |
| 钩子调用 | `applySageSkillPrimary()` | 调用点已存在 | 🟢 |
| 钩子调用 | `tickSageChronosStates()` | 调用点已存在 | 🟢 |

### 4.3 术士/死灵法师

| 设计项 | 设计方案要求 | 代码现状 | 差距 |
|--------|-------------|----------|:--:|
| 资源类型 | `soul_shard` (8 max, 不自动回复) | MAGE_VFX_FAMILY 已注册 `soul_shard_v2`，但 config 仍映射到 `mana` | 🟡 |
| 痛苦诅咒 | 可叠加DOT（最多5层） | skillEffect type 已注册 `agony_curse`，corruption 状态已定义 | 🟡 |
| 生命汲取 | 引导DOT+自愈+产碎片 | skillEffect type 已注册 `life_drain` | 🟡 |
| 传染诅咒 | DOT 扩散 | skillEffect type 已注册 `spreading_curse` | 🟡 |
| 灵魂收割 | DOT 结算引爆 | skillEffect type 已注册 `soul_harvest` | 🟡 |
| 亡灵军团 | 消耗碎片召唤4种亡灵 | `spawnSummon()` 中 undeadLegion 分支**已完全实现** | 🟢 |
| `spendAllSoulShardsForLegion()` | 消耗逻辑 | 被调用但函数不存在 | 🟡 |
| 冥界之门 | DOT加速+亡灵强化+关门结算 | 未实现 | 🔴 |
| 亡灵DOT联动 | 亡灵攻击DOT目标增伤 | 未实现 | 🔴 |
| classPassive | `soul_reaper` / `undeath_sovereign` | 未定义 | 🔴 |
| 系统文件 | `warlock-soul-system.js` | 不存在 | 🔴 |
| 钩子调用 | `applyWarlockSkillPrimary()` | 调用点已存在 | 🟢 |
| 钩子调用 | `tickWarlockSoulStates()` | 调用点已存在 | 🟢 |

---

## 5. 分阶段实施计划

### 总体时间线

```
第1周          第2-3周        第4-5周        第6-7周        第8-9周
────┼─────────────┼──────────────┼──────────────┼──────────────┼─────→
    │  阶段一      │   阶段二      │   阶段三      │   阶段四      │阶段五
    │  基础配置    │   术士重做    │   贤者重做    │   巫师重做    │UI/VFX/打磨
    │  资源系统    │   灵魂+DOT    │   预判治疗    │   相位+共鸣   │测试+上线
```

### 阶段依赖关系

```
阶段一（基础）
    │
    ├──→ 阶段二（术士）── 阶段三（贤者）── 阶段四（巫师）
    │         │               │               │
    │         └───────────────┴───────────────┘
    │                       │
    └───────────────────────┴──→ 阶段五（UI/VFX/打磨）
```

术士/贤者/巫师可并行开发，但建议按顺序（先易后难）。

---

## 6. 每个阶段工作清单

### 阶段一：基础配置与资源系统（1周）

#### 目标
让三种新资源在游戏中能正确初始化和显示，为后续所有阶段打好地基。

#### 工作项

##### A1. 更新 skill-config.json — `resourceFamilies`

新增三种资源族的完整定义：

```json
"elemental_power": {
  "name": "元素能量",
  "max": 100,
  "regenPerSec": 0,
  "description": "相位切换+20，共鸣触发+35"
},
"chronos_sand": {
  "name": "时光沙漏",
  "max": 100,
  "regenPerSec": 3,
  "description": "预知之盾吸收+25，时序弹命中+5"
},
"soul_shard_v2": {
  "name": "灵魂碎片",
  "max": 8,
  "regenPerSec": 0,
  "description": "击杀+1，DOT跳8%概率+1"
}
```

##### A2. 更新 skill-config.json — `resourceToFamily`

```json
// 当前（需修改）：
"soul_shard": "mana"

// 修改为：
"soul_shard": "soul_shard_v2"
// 并确保：
"elemental_power": "elemental_power",
"chronos_sand": "chronos_sand"
```

##### A3. 更新 class-config.json

修改以下职业的 `resource` 字段：

| 职业 | resource.type | resource.max | resource.regen | 新增 classPassive |
|------|---------------|--------------|---------------|-------------------|
| wizard | `elemental_power` | 100 | 0 | `elemental_rhythm` |
| archmage | `elemental_power` | 100 | 0 | `elemental_mastery` |
| sage | `chronos_sand` | 100 | 3 | `temporal_intuition` |
| oracle | `chronos_sand` | 100 | 3 | `paradox_walker` |
| warlock | `soul_shard` | 8 | 0 | `soul_reaper` |
| necromancer | `soul_shard` | 8 | 0 | `undeath_sovereign` |

> **兼容性注意**：`soul_shard` 的 `max` 从 100 改为 8，需处理旧存档的 `classResource.current` 溢出问题（在 `initPlayerClassResource` 中 clamp）。

##### A4. 技能资源适配（skill-system.js）

在通用资源 tick 中跳过 `regenPerSec === 0` 的资源族（当前可能已处理，需验证）。确认 `elemental_power`、`soul_shard` 不会获得每秒自动回复。

##### A5. 验证

- 创建 wizard/sage/warlock 角色 → 确认资源初始值正确
- 升级到 20/40 级转职 → 确认资源随职业切换更新
- 存档/读档 → 确认 classResource 正确序列化

---

### 阶段二：术士/死灵法师重做（2周）

> **选择优先做术士的原因**：亡灵军团召唤的基础设施最完整（~95%），实现阻力最小，可最快产出可测试内容。

#### 工作项

##### B1. 创建 `js/warlock-soul-system.js`

核心模块，对外暴露的函数：

| 函数 | 功能 |
|------|------|
| `initWarlockSoulShards(player)` | 初始化灵魂碎片 |
| `grantSoulShard(player, count)` | 获得灵魂碎片 |
| `spendSoulShards(player, count)` | 消耗灵魂碎片，返回是否成功 |
| `spendAllSoulShardsForLegion(player)` | 消耗全部碎片，返回数量（亡灵军团调用） |
| `hasSoulShards(player, min)` | 检查碎片数量 |
| `addAgonyCurse(monster, player, stacks)` | 施加/叠加痛苦诅咒 |
| `addCorruption(monster, player)` | 施加腐蚀 |
| `getAgonyStacks(monster)` | 获取痛苦诅咒层数 |
| `spreadDOTs(fromMonster, gameInstance)` | DOT 扩散 |
| `soulHarvest(monster, player, gameInstance)` | 引爆 DOT |
| `tickWarlockSoulStates(player, gameInstance, monsters, now)` | 每帧 tick |
| `applyWarlockSkillPrimary(player, skillDef, gameInstance, now, ctx)` | 术士技能主效果 |
| `isWarlockTreePlayer(player)` | 判断是否为术士分支 |

##### B2. 实现痛苦诅咒（可叠加 DOT）

- 在 `monster.combatStatuses` 中新增 `agony_curse` 类型
- 叠加逻辑：同 `poison` 的 stackable 模式，但每层独立伤害
- 满层（5层）时每跳 15% 概率产出 1 灵魂碎片
- tick 在 `tickMonsterCombatStatuses` 中已通用处理，DOT 跳逻辑可用现有框架

##### B3. 实现 `spendAllSoulShardsForLegion()`

此函数消费掉全部灵魂碎片并返回数量。`spawnSummon()` 中的 undeadLegion 分支已实现完整召唤逻辑。

```javascript
window.spendAllSoulShardsForLegion = function(player) {
    const st = player.classResource;
    if (!st || st.family !== 'soul_shard_v2' || st.current <= 0) return 0;
    const count = st.current;
    st.current = 0;
    // 更新 UI
    if (typeof window.updateWarlockSoulUI === 'function') {
        window.updateWarlockSoulUI(player);
    }
    return count;
};
```

##### B4. 实现 `applyWarlockSkillPrimary()`

处理术士特有技能的 skillEffect（需要为 skill-config.json 中新增的技能设置正确的 `skillEffect.type`）：

| skillEffect.type | 效果 |
|------------------|------|
| `agony_curse` | 施加/叠加痛苦诅咒 |
| `life_drain` | 引导：DOT加速+自愈+每跳概率产碎片 |
| `dark_harvest` | 消耗碎片 → 结算 DOT + 传播诅咒 |
| `spreading_curse` | 目标死亡时 DOT 自动扩散 |
| `soul_harvest` | 引爆 DOT → 返还碎片 |

##### B5. 实现亡灵-DOT联动

在召唤物的攻击逻辑中检查目标是否有 DOT：
- 若目标有痛苦诅咒 → 亡灵伤害 +30%
- 若目标有腐蚀 → 亡灵伤害 +30%（与诅咒可叠加）

在亡灵死亡时（`expireTime` 到达或被击杀），对其攻击目标施加 DOT 转移。

##### B6. 更新 skill-config.json — 术士技能

需要新增/修改以下技能定义（具体数值后续平衡调整）：

| 技能ID | 名称 | slotType | 说明 |
|--------|------|----------|------|
| `shadow_bolt_v2` | 暗影箭 | basic | 替换 mage_basic |
| `agony_curse_skill` | 痛苦诅咒 | core1 | 叠加DOT |
| `life_drain_skill` | 生命汲取 | core2 | 引导DOT+自愈 |
| `summon_skeleton_v2` | 召唤骷髅战士 | team | 已有，需更新 |
| `dark_harvest_skill` | 暗黑丰收 | survival | 碎片→DOT结算 |
| `death_coil_v2` | 死亡缠绕 | basic | 穿透弹 |
| `spreading_curse_skill` | 传染诅咒 | core1 | DOT扩散 |
| `soul_harvest_skill` | 灵魂收割 | core2 | DOT引爆 |
| `skeleton_legion_v2` | 亡灵军团 | team | 已有 summon 逻辑 |
| `nether_gate_skill` | 冥界之门 | survival | DOT加速场 |

更新术士/死灵法师的 `hotbarSlots`。

##### B7. 实现 classPassive

- `soul_reaper`（术士）：每个存活骷髅 +8% DOT 伤害；3骷髅时 DOT 跳 +5% 碎片概率
- `undeath_sovereign`（死灵法师）：每有1个亡灵 +1 碎片上限（最多15个）；亡灵死亡时 DOT 转移 + 暗影爆发

---

### 阶段三：贤者/先知重做（2周）

#### 工作项

##### C1. 创建 `js/sage-chronos-system.js`

对外暴露的函数：

| 函数 | 功能 |
|------|------|
| `initSageChronosSand(player)` | 初始化时光沙漏 |
| `grantChronosSand(player, amount)` | 获得沙漏 |
| `spendChronosSand(player, amount)` | 消耗沙漏 |
| `applyForesightShield(player, target, skillDef, gameInstance, now)` | 预知之盾 |
| `recordPlayerHP(target)` | 记录生命百分比（神圣回溯用） |
| `triggerSacredRewind(target)` | 回溯触发 |
| `tickSageChronosStates(player, gameInstance, monsters, now)` | 每帧 tick |
| `applySageSkillPrimary(player, skillDef, gameInstance, now, ctx)` | 贤者技能主效果 |
| `isSageTreePlayer(player)` | 判断是否为贤者分支 |

##### C2. 实现预知之盾

核心沙漏经济引擎：
1. 为目标施加护盾（吸收量 = 2.0×魔攻）
2. 4秒后检查：若被消耗 >50% → 奖励 25 沙漏 + CD-3s；若未被消耗 → 返还 15 沙漏
3. 施放消耗 30 沙漏

需要监听目标的实际伤害接收事件来追踪护盾吸收量。

##### C3. 实现时序弹（双效 basic）

在普攻处理中，当玩家是贤者分支时：
- 命中敌人 → 伤害 + 5沙漏
- 命中队友 → 治疗 + 3沙漏（需要检测 target 是否为队友）

##### C4. 实现时间法术效果

| skillEffect.type | 效果 |
|------------------|------|
| `purify_time` | 驱散 debuff + 时序守护（3秒内下一次伤害-40%） |
| `chrono_aura` | 光环：范围内队友冷却+15%，每2秒微量回血 |
| `sacred_rewind` | 标记队友→6秒后或致命伤时回溯到记录百分比 |
| `fate_weave` | 8秒：20%伤害转给贤者 + 10%伤害转团队治疗 |
| `fate_reversal` | 对敌：返还3秒伤害为真伤；对友：返还3秒受伤为治疗 |
| `time_rewind` | 全队回溯到4秒前状态（生命/位置），保留 buff |

**实现 `time_rewind` 的注意点**：
- 需要持续记录队友的快照（每 ~200ms 一次）
- 回溯时替换当前生命值和位置，但保留正面 buff
- 不复活已死亡队友

##### C5. 更新 skill-config.json — 贤者技能

新增/修改技能定义，更新 hotbarSlots。贤者**移除火球术**。

##### C6. 实现 classPassive

- `temporal_intuition`（贤者）：预知之盾成功吸收→自身获40%吸收量护盾；时序弹治疗过量→转护盾
- `paradox_walker`（先知）：时间法术生效期间目标生命不低于1；时光倒流窗口延长到5秒

---

### 阶段四：巫师/大魔导师重做（2周）

#### 工作项

##### D1. 创建 `js/wizard-element-system.js`

对外暴露的函数：

| 函数 | 功能 |
|------|------|
| `initWizardElementStates(player)` | 初始化元素相位 |
| `getElementPhase(player)` | 获取当前相位（UI 用） |
| `switchElementPhase(player, newPhase)` | 切换相位 + 触发元素脉冲 |
| `grantElementPower(player, amount)` | 获得元素能量 |
| `spendElementPower(player, amount)` | 消耗元素能量 |
| `triggerElementResonance(monster, types, player, gameInstance)` | 触发元素共鸣 |
| `enterElementalLiberation(player, gameInstance, now)` | 进入元素解放状态 |
| `tickWizardElementStates(player, gameInstance, now)` | 每帧 tick |
| `applyElementalLiberationEffect(player, skillDef, gameInstance, now)` | 元素解放效果 |
| `isWizardTreePlayer(player)` | 判断是否为巫师分支 |

##### D2. 实现元素相位状态机

```
状态：NEUTRAL → FIRE → FROST → OVERLOAD → ARCTIC

FIRE（灼热）：火伤+25%，消耗+50%，回蓝-50%，移速-10%
FROST（霜寒）：冰伤+15%，消耗-30%，回蓝+200%，移速+15%
OVERLOAD（过载）：电伤+25%，消耗+20%，每命中回复5法力
ARCTIC（极寒）：全局冷却速度×2（大魔导师专属）

相位切换触发"元素脉冲"：半径80，1.0x混合元素伤+施加状态
```

##### D3. 实现元素共鸣

在 `triggerElementResonance()` 中：
1. 检测目标身上的状态组合
2. 匹配对应的共鸣效果
3. 触发效果（伤害/眩晕/增伤等，参考 status-synergy-config 但作为巫师专属触发）
4. 积累元素能量 → 能量满触发元素解放

##### D4. 实现元素解放

进入解放状态：
- 全伤 +50%
- 冷却 -60%
- 持续 6秒
- 灼烧频率翻倍、冻伤减速翻倍、感电溅射翻倍（大魔导师专属）
- 奥术飞弹变为范围溅射
- 视觉特效：四色光环

##### D5. 更新 skill-config.json — 巫师技能

更新现有技能定义以包含 `skillEffect` 配置，使火焰弹/闪电链/元素协奏有正确的 `skillEffect.type`。

##### D6. 实现 classPassive

- `elemental_rhythm`（巫师）：每次相位切换后，下一技能伤害 +18%
- `elemental_mastery`（大魔导师）：元素解放期间额外属性翻倍

---

### 阶段五：UI/VFX/打磨（2周）

#### E1. HTML/CSS

在 `index.html` 和 `styles.css` 中添加：

- `#element-phase-indicator` — 元素相位文字（已有 JS 代码，需补 HTML）
- 贤者时光沙漏资源条样式（金色/紫色主题）
- 术士灵魂碎片计数器（暗紫色碎片图标 + 数字）
- 亡灵军团存活计数器
- `#sage-chronos-bar` / `#warlock-soul-bar` 如需要独立资源条

#### E2. 资源条颜色主题

`class-ui.js` 的 `updateResourceBar()` 中，根据 `st.family` 设置资源条颜色：

| family | 颜色 | 说明 |
|--------|------|------|
| mana | `#7755ff` | 紫色（已有） |
| elemental_power | `#ff6633` | 橙红色 |
| chronos_sand | `#ddaa44` | 金色 |
| soul_shard_v2 | `#8844cc` | 暗紫色 |

#### E3. 视觉特效（class-skill-vfx.js）

新增技能 VFX：

| 技能 | VFX 描述 |
|------|----------|
| 痛苦诅咒 | 暗紫色螺旋缠绕目标 |
| 生命汲取 | 绿色光线连接 + 粒子流 |
| 冥界之门 | 地面紫色法阵 + 亡灵涌现 |
| 预知之盾 | 金色时钟齿轮旋转护盾 |
| 时序弹 | 蓝金色螺旋弹道 |
| 时光倒流 | 全屏蓝色反转粒子流 |
| 元素解放 | 四色光环爆发 + 地面裂纹 |
| 熔岩风暴 | 地面火坑 + 岩浆喷发 |
| 极光束 | 冰蓝色粗激光 |
| 陨石 | 天空落石 + 地面冲击波 |

#### E4. 旧存档兼容

- 检测到 `soul_shard` 资源且 current > 8 → clamp 到 8
- 检测到贤者/巫师/术士分支但资源类型为 `mana` → 自动迁移到新资源
- classResource 序列化/反序列化验证

#### E5. 测试清单

| 测试场景 | 验证点 |
|----------|--------|
| 新建巫师 → 使用火球 | 进入灼热相位，属性变化生效 |
| 巫师火球 → 冰环 | 相位切换触发元素脉冲 |
| 巫师施加灼烧+冻伤 | 触发热冲击共鸣 |
| 巫师3次共鸣 → 元素协奏 | 进入元素解放，6秒爆发 |
| 新建贤者 → 时序弹打队友 | 产生治疗 + 3沙漏 |
| 贤者预知之盾被消耗 >50% | 获得 25 沙漏 + CD缩减 |
| 贤者预知之盾未被消耗 | 返还 15 沙漏 |
| 先知时光倒流 | 全队生命/位置回溯 |
| 术士击杀敌人 | +1 灵魂碎片 |
| 术士施加痛苦诅咒满层 | DOT 跳概率产碎片 |
| 术士消耗碎片召唤亡灵军团 | 4种亡灵随机生成 |
| 亡灵攻击DOT目标 | 伤害增加 |
| 死灵法师冥界之门 | DOT加速 + 关门结算 |

---

## 7. 风险与依赖

### 7.1 技术风险

| 风险 | 级别 | 缓解措施 |
|------|:---:|----------|
| 时光倒流实现复杂（需持续记录快照） | 🟡 中 | 先实现简化版（仅回溯生命，不回溯位置），后续迭代 |
| 旧存档兼容性 | 🟡 中 | 在 `initPlayerClassResource` 中添加迁移逻辑 |
| 召唤物 AI 性能（亡灵军团最多6+单位） | 🟢 低 | 已有 summon 框架，6个单位在可接受范围 |
| 元素相位与现有技能冷却系统冲突 | 🟢 低 | 相位仅影响属性乘数，不影响冷却系统本身 |

### 7.2 依赖关系

```
阶段一（基础配置）
    │
    ├── 必须先完成，否则后续所有阶段的资源初始化都会失败
    │
阶段二（术士）
    │
    ├── 依赖：阶段一（资源系统）
    ├── 依赖：spawnSummon() 中 undeadLegion 分支（✅ 已有）
    │
阶段三（贤者）
    │
    ├── 依赖：阶段一（资源系统）
    ├── 依赖：combat-status-system.js 状态框架（✅ 已有）
    │
阶段四（巫师）
    │
    ├── 依赖：阶段一（资源系统）
    ├── 依赖：status-synergy-config.json（✅ 已有）
    │
阶段五（UI/VFX）
    │
    └── 依赖：阶段二/三/四（至少有一个完成才能测试 UI）
```

### 7.3 资源估算

| 阶段 | 新增代码 | 修改代码 | 新增配置 | 预估工时 |
|------|----------|----------|----------|:---:|
| 阶段一 | ~50行 | ~30行 | ~80行 | 3天 |
| 阶段二 | ~600行 | ~80行 | ~200行 | 7天 |
| 阶段三 | ~500行 | ~60行 | ~180行 | 7天 |
| 阶段四 | ~400行 | ~50行 | ~160行 | 7天 |
| 阶段五 | ~300行 | ~100行 | ~50行 | 5天 |
| **总计** | **~1850行** | **~320行** | **~670行** | **~29天** |

---

## 附录A：代码审计数据来源

审计基于以下文件的逐行阅读：

| 文件 | 审计重点 |
|------|----------|
| `config/class-config.json` | 法师系三个分支的 resource/stats/evolutionSlots/hotbar |
| `config/skill-config.json` | 全部法师技能定义、resourceFamilies、resourceToFamily、hotbarSlots |
| `config/status-synergy-config.json` | burn/frostbite/shock/corruption/dark_erosion + 6种协同 |
| `config/skill-entity-config.json` | 技能实体定义 |
| `js/class-system.js` | 职业工具函数，无 mage 专属逻辑 |
| `js/skill-system.js` | MAGE_VFX_FAMILY、资源初始化、技能演化 |
| `js/class-skill-effects.js` | applySageSkillPrimary/applyWarlockSkillPrimary 钩子、isDefensiveClassSkill 大量注册、elemental_liberation 分支 |
| `js/class-skill-vfx.js` | 旧有技能 VFX |
| `js/class-ui.js` | element-phase-indicator UI 逻辑 |
| `js/combat-status-system.js` | 状态施加/移除/tick、协同触发 |
| `js/skill-entity-system.js` | undeadLegion 召唤、tickWizardElementStates/tickSageChronosStates/tickWarlockSoulStates 钩子 |
| `js/game-main.js` | classResource 存档/读档、initPlayerClassResource |
| `js/class-build-system.js` | arcaneStacks 引用（无 mage 专属 build） |

---

## 附录B：需要新增的文件清单

```
js/wizard-element-system.js     — 巫师元素相位+共鸣系统（~400行）
js/sage-chronos-system.js       — 贤者时光沙漏+时间法术系统（~500行）
js/warlock-soul-system.js       — 术士灵魂碎片+DOT+召唤管理系统（~600行）
```

## 附录C：需要修改的文件清单

```
config/skill-config.json           — resourceFamilies + resourceToFamily + ~10个新技能 + hotbarSlots
config/class-config.json           — 6个职业的 resource + classPassive + themeLabel
index.html                         — element-phase-indicator + chronos/灵魂 UI 元素
styles.css                         — 新 UI 元素样式 + 相位颜色变量
js/class-ui.js                     — resource bar 颜色根据 family 变化（少量修改）
js/skill-system.js                 — 资源 tick 跳过 regenPerSec===0 的族（验证）
js/class-skill-vfx.js              — 新增 10+ 技能特效
```

---

**文档结束**
