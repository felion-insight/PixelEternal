# 《Pixel Eternal》装备体系职业适配方案

**文档版本**：v1.0  
**设计日期**：2026年6月7日  
**配套文档**：class-system-design.md / skill-system-design.md  

---

## 目录

1. [现有装备体系分析](#1-现有装备体系分析)
2. [改造目标与原则](#2-改造目标与原则)
3. [武器类型重构](#3-武器类型重构)
4. [装备属性扩展](#4-装备属性扩展)
5. [职业亲和系统](#5-职业亲和系统)
6. [掉落偏向机制](#6-掉落偏向机制)
7. [套装职业化](#7-套装职业化)
8. [装备命名体系](#8-装备命名体系)
9. [数据结构变更清单](#9-数据结构变更清单)

---

## 1. 现有装备体系分析

### 1.1 当前装备架构

```
8个槽位
├── weapon (武器)     → attack / critRate / critDamage
├── helmet (头盔)     → health / defense
├── chest  (胸甲)     → health / defense
├── legs   (腿甲)     → health / defense
├── boots  (足具)     → health / defense
├── necklace (项链)  → dodge / attackSpeed / moveSpeed
├── ring    (指环)    → dodge / attackSpeed / moveSpeed
└── belt    (腰带)    → dodge / attackSpeed / moveSpeed
```

### 1.2 当前武器类型（仅2种）

| 类型 | 标识 | 示例 |
|------|------|------|
| 近战 | `melee` | 斑驳铁剑、淬火精钢剑 |
| 远程 | `ranged` | 猎风短弓、幽影弩 |

### 1.3 当前属性全集

| 属性类别 | 属性名 | 所属部位 |
|----------|--------|----------|
| 主属性 | attack | 武器 |
| 主属性 | critRate | 武器 |
| 主属性 | critDamage | 武器 |
| 主属性 | health | 头盔/胸甲/腿甲/足具 |
| 主属性 | defense | 头盔/胸甲/腿甲/足具 |
| 主属性 | dodge | 项链/指环/腰带 |
| 主属性 | attackSpeed | 项链/指环/腰带 |
| 主属性 | moveSpeed | 项链/指环/腰带 |
| 机制属性 | lifeSteal | 任意 |
| 机制属性 | thorn | 任意 |
| 机制属性 | skillHaste | 任意 |
| 机制属性 | damageReduction | 任意 |
| 机制属性 | towerGoldBonus | 任意 |

### 1.4 当前套装（8套）

| 套装ID | 名称 | 核心效果 |
|--------|------|----------|
| bronze | 青铜 | 全属性+10%，击杀回血5% |
| silver | 银月 | 全属性+12%，技能冷却-12% |
| crystal | 晶化 | 受伤12%概率转化伤害为治疗，击杀回血6% |
| flame | 烈焰 | 20%火焰爆炸，18%范围火焰持续伤害 |
| frost | 霜寒 | 25%冰冻，30%反冰，28%范围冰冻 |
| thunder | 雷霆 | 25%连锁闪电，全属性+20% |
| star | 星辰 | 全属性+8%，击杀+5%全属性buff，每秒回血1% |
| dragon | 龙族 | 15%反伤火焰，HP<30%攻击+35%，全属性+15%，暴伤+55% |

### 1.5 品质与等级体系

| 层级 | 品质 | 等级范围 |
|------|------|----------|
| 基础装备 | common/rare/fine/epic/legendary | Lv 1/5/10/15/20 |
| 深阶装备 | 凡/良/湛/炽/曜(对应5品质) | Lv 25/30/35/40/45/50/55/60 |

---

## 2. 改造目标与原则

### 2.1 核心目标

在不破坏现有装备/套装/词条体系的前提下，为装备增加职业维度：

1. **武器分类**：4种武器类型对应4个职业系
2. **职业亲和**：部分装备偏向特定职业，同职业加成
3. **掉落智能**：掉落偏向玩家所选职业
4. **属性扩展**：增加职业技能相关属性
5. **套装丰富**：增加职业专属套装

### 2.2 兼容性原则

| 原则 | 说明 |
|------|------|
| **向后兼容** | 旧存档装备不受影响，自动继承默认值 |
| **不删不改** | 现有8套套装、词条系统、精炼系统全部保留 |
| **增量叠加** | 新属性/新套装以追加方式加入 |
| **通用优先** | 大部分装备全职业可用，只有少数"职业专属装备"有限制 |

---

## 3. 武器类型重构

### 3.1 新武器类型定义

```
melee / ranged (旧，保留兼容)
    ↓ 扩展为
sword / bow / staff / dagger (新，4职业对应)
```

| weaponType | 对应职业 | 武器形态 | 属性倾向 | 攻击方式 |
|------------|----------|----------|----------|----------|
| `sword` | 战士系 | 剑、大剑、长剑、刃 | 高攻击、中暴击 | 近战（原melee） |
| `bow` | 弓箭手系 | 弓、弩、长弓、短弓、重弩 | 高暴击、中攻速 | 远程（原ranged） |
| `staff` | 法师系 | 法杖、魔杖、秘典 | 高攻击、中暴伤 | 远程 |
| `dagger` | 刺客系 | 匕首、双刃、利爪 | 高攻速、高暴击 | 近战 |

### 3.2 武器技能重映射

现有武器技能是根据 `weaponType` + 等级段自动生成的。需要扩展映射：

```javascript
// 旧：只有melee/ranged两套技能
// 新：4套技能对应4种武器类型

const WEAPON_SKILL_MAP = {
  sword:  [...],  // 沿用原 melee 技能池 + 新增
  bow:    [...],  // 沿用原 ranged 技能池 + 新增
  staff:  [...],  // 新增：法系武器技能
  dagger: [...],  // 新增：刺客武器技能
};
```

### 3.3 武器职业亲和加成

装备自带武器的职业获得加成：

| 条件 | 效果 |
|------|------|
| 战士装备 sword | 攻击力 +15% |
| 弓箭手装备 bow | 暴击率 +10% |
| 法师装备 staff | 法术/技能伤害 +15% |
| 刺客装备 dagger | 攻速 +15% |
| 跨职业装备 | 无加成，可正常使用 |

**设计理由**：鼓励但不强制职业专属武器。开荒期自由拿武器，后期追求专属。

### 3.4 武器兼容映射

| 基础职业 | 可装备武器类型 | 亲和武器（有加成） |
|----------|---------------|-------------------|
| 战士 | sword / dagger / 所有 | sword |
| 弓箭手 | bow / dagger / 所有 | bow |
| 法师 | staff / dagger / 所有 | staff |
| 刺客 | dagger / sword / 所有 | dagger |

---

## 4. 装备属性扩展

### 4.1 新增属性

为支撑职业技能系统，在现有属性基础上增加：

| 新属性名 | 中文名 | 作用 | 出现部位 |
|----------|--------|------|----------|
| `skillDamage` | 技能伤害加成 | 职业技能伤害 +N% | 武器/项链/指环 |
| `resourceRegen` | 资源恢复速度 | 职业资源恢复 +N% | 指环/腰带 |
| `healingPower` | 治疗强度 | 治疗/护盾效果 +N% | 项链/指环 |
| `cooldownReduction` | 冷却缩减 | 职业技能冷却 -N%（与skillHaste区分：skillHaste加速施法，CDR减冷却） | 头盔/腰带 |

### 4.2 现有属性利用

| 现有属性 | 职业技能关联 |
|----------|-------------|
| `skillHaste` | 加快职业技能施法速度，对引导型技能（生命汲取等）缩短引导时间 |
| `lifeSteal` | 对近战职业更有价值（战士/刺客），远程/法师吸血效率50% |
| `thorn` | 坦克职业核心属性（骑士/守护者），反伤受防御加成 |
| `damageReduction` | 坦克职业核心属性，全职业可用 |
| `attackSpeed` | 影响普攻速度，不影响技能冷却 |

### 4.3 属性按职业价值分级

| 属性 | 战士 | 弓箭 | 法师 | 刺客 |
|------|:--:|:--:|:--:|:--:|
| attack | ★★★ | ★★★ | ★★ | ★★ |
| health | ★★★ | ★★ | ★ | ★★ |
| defense | ★★★ | ★★ | ★ | ★ |
| critRate | ★★ | ★★★ | ★★ | ★★★ |
| critDamage | ★★ | ★★★ | ★★ | ★★★ |
| dodge | ★ | ★★ | ★★ | ★★★ |
| attackSpeed | ★★ | ★★★ | ★ | ★★★ |
| moveSpeed | ★★ | ★★★ | ★★ | ★★★ |
| lifeSteal | ★★★ | ★ | ★ | ★★ |
| thorn | ★★★ | ★ | ★ | ★ |
| skillHaste | ★★ | ★★ | ★★★ | ★★ |
| damageReduction | ★★★ | ★ | ★★ | ★ |
| skillDamage | ★★ | ★★ | ★★★ | ★★ |
| resourceRegen | ★★ | ★★ | ★★★ | ★ |
| healingPower | ★★(圣骑) | ★ | ★★★ | ★ |
| cooldownReduction | ★★ | ★★ | ★★★ | ★★ |

---

## 5. 职业亲和系统

### 5.1 设计思路

不是限制谁穿什么装备，而是**穿对了有额外收益**。

每件装备新增一个可选字段 `classAffinity`：

```javascript
{
  "slot": "chest",
  "name": "圣盾重铠",
  "level": 20,
  "quality": "legendary",
  "health": 98,
  "defense": 13,
  "classAffinity": "warrior",  // 新增
  "affinityBonus": {            // 新增
    "health": 30,               // 战士穿额外+30HP
    "defense": 5                // 战士穿额外+5防
  }
}
```

### 5.2 亲和等级

| 亲和度 | 标识 | 说明 |
|--------|------|------|
| **专属** | `classAffinity: "warrior"` | 特定职业穿上获得额外属性加成 |
| **通用** | `classAffinity: undefined` 或不设置 | 全职业可用，无额外加成 |
| **排斥** | `classNerf: "mage"` | 某个职业穿上会有惩罚（极少使用） |

### 5.3 亲和装备比例

| 装备类型 | 有亲和的占比 | 说明 |
|----------|------------|------|
| 武器 | 90% | 大多数武器有职业倾向 |
| 头盔 | 40% | 部分头盔有职业特色 |
| 胸甲 | 50% | 重甲→战士，轻甲→刺客，长袍→法师 |
| 腿甲 | 30% | 少量职业特色 |
| 足具 | 30% | 少量职业特色 |
| 项链 | 20% | 大部分通用 |
| 指环 | 20% | 大部分通用 |
| 腰带 | 20% | 大部分通用 |

---

## 6. 掉落偏向机制

### 6.1 智能掉落

怪物掉落装备时，根据玩家当前职业偏向：

```
掉落流程：
1. 随机决定槽位（均匀分布）
2. 如果槽位是武器：
   - 70%概率掉落玩家亲和武器类型
   - 30%概率随机武器类型
3. 如果槽位是防具/饰品：
   - 50%概率掉落玩家亲和装备（如果有）
   - 50%概率随机
4. 按怪物等级窗口确定装备等级
5. 按概率分布确定品质
```

### 6.2 掉落偏向可配置项

```javascript
// 在 game-config.json 或 class-config.json 中
"dropBias": {
  "weaponAffinityChance": 0.70,    // 武器亲和掉落概率
  "armorAffinityChance": 0.50,     // 防具亲和掉落概率
  "minBiasTowerFloor": 1,          // 从第几层开始偏向
}
```

---

## 7. 套装职业化

### 7.1 现有8套 → 保持不变

现有8套（青铜/银月/晶化/烈焰/霜寒/雷霆/星辰/龙族）**完全不变**，全职业可用。

### 7.2 新增4套职业专属套装

在深阶装备层（Lv25+）新增4套职业主题套装：

#### 战士专属：无畏套装 (Valor Set)

| 件数 | 效果 |
|------|------|
| 2 | 防御+25，生命+120 |
| 4 | 受到攻击时20%概率获得护盾（15%最大HP），持续5秒 |
| 6 | 怒气获取速度+50%，防御+30 |
| 8 | 全属性+18%，受到致命伤害时保留1HP并3秒无敌，冷却180秒 |

#### 弓箭手专属：追风套装 (Windchaser Set)

| 件数 | 效果 |
|------|------|
| 2 | 攻速+25%，移速+15% |
| 4 | 与敌人距离超过100时，伤害+20% |
| 6 | 闪避+15%，暴击伤害+40% |
| 8 | 全属性+18%，攻击时有15%概率触发风之箭（额外200%伤害并穿透） |

#### 法师专属：秘法套装 (Arcane Set)

| 件数 | 效果 |
|------|------|
| 2 | 技能伤害+15%，法力恢复+30% |
| 4 | 释放技能后2秒内下一个技能伤害+35% |
| 6 | 法力>70%时，所有伤害+25%；冷却缩减+15% |
| 8 | 全属性+18%，终极技能冷却-40%，释放终极技能后10秒内伤害+50% |

#### 刺客专属：暗影套装 (Shadow Set)

| 件数 | 效果 |
|------|------|
| 2 | 暴击率+12%，暴击伤害+30% |
| 4 | 攻击时有25%概率施加暗影印记（目标受到伤害+15%，持续4秒） |
| 6 | 击杀敌人后2秒内隐身，破隐一击+80%伤害 |
| 8 | 全属性+18%，生命<30%时闪避+25%、伤害+35%、移速+30% |

### 7.3 套装总量

| 类型 | 数量 | 职业适用范围 |
|------|------|-------------|
| 现有通用套装 | 8套 | 全职业 |
| 新职业专属套装 | 4套 | 单职业 |
| **合计** | **12套** | — |

---

## 8. 装备命名体系

### 8.1 武器命名规则

按 `武器类型 + 品质词缀 + 意境名` 组合：

| 武器类型 | 品质前缀 | 示例 |
|----------|----------|------|
| sword | 凡/淬/辉/逆/圣 | 辉光秘银刃、圣耀·断罪 |
| bow | 猎/幽/曦/穿/永 | 穿云破月、永夜·星坠 |
| staff | 微/秘/耀/虚/终 | 秘法之光、终焉·星落 |
| dagger | 暗/影/冥/绝/无 | 影刃暗流、无明·刹那 |

### 8.2 防具命名按职业风格

| 职业 | 防具风格 | 关键词 |
|------|----------|--------|
| 战士 | 厚重金属 | 铁/钢/龙/圣/盾/铠 |
| 弓箭手 | 轻便皮革 | 猎/风/羽/迅/踪 |
| 法师 | 布质长袍 | 秘/星/咒/织/咏 |
| 刺客 | 紧身暗色 | 暗/影/夜/潜/隐 |

---

## 9. 数据结构变更清单

### 9.1 config/equipment-config.json 变更

```javascript
// 现有条目追加字段示例
{
  "slot": "weapon",
  "name": "斑驳铁剑",
  "level": 1,
  "quality": "common",
  "weaponType": "sword",        // 变更：melee → sword
  "classAffinity": "warrior",   // 新增：战士亲和
  "affinityBonus": {            // 新增：亲和加成
    "attack": 3
  },
  "attack": 12,
  "critRate": 4,
  "critDamage": 18
}
```

### 9.2 config/equipment-deep-config.json 变更

```javascript
// 深阶装备同样追加
{
  "slot": "weapon",
  "name": "渊隙凡·残锋",
  "level": 25,
  "quality": "common",
  "weaponType": "sword",        // 变更：melee → sword
  "classAffinity": "warrior",   // 新增
  "affinityBonus": {            // 新增
    "attack": 10,
    "lifeSteal": 1
  },
  "attack": 84,
  "critRate": 28,
  "critDamage": 94,
  "lifeSteal": 3
}
```

### 9.3 Equipment 类（data-classes.js）变更

```javascript
class Equipment {
  constructor(data) {
    // ...现有字段...
    this.weaponType = data.weaponType || 'sword'; // 变更默认值
    
    // 新增字段
    this.classAffinity = data.classAffinity || null;     // 职业亲和
    this.affinityBonus = data.affinityBonus || null;     // 亲和额外属性
    this.classNerf = data.classNerf || null;             // 职业惩罚（极少用）
    
    // 新增属性
    if (data.stats) {
      this.stats.skillDamage = this.stats.skillDamage || 0;
      this.stats.resourceRegen = this.stats.resourceRegen || 0;
      this.stats.healingPower = this.stats.healingPower || 0;
      this.stats.cooldownReduction = this.stats.cooldownReduction || 0;
    }
  }
  
  // 新增方法：计算职业亲和加成
  getAffinityStats(playerClass) {
    if (this.classAffinity === playerClass && this.affinityBonus) {
      return this.affinityBonus;
    }
    return {};
  }
  
  // 新增方法：获取惩罚倍率
  getNerfMultiplier(playerClass) {
    if (this.classNerf === playerClass) return 0.85; // 15%惩罚
    return 1.0;
  }
}
```

### 9.4 Player.updateStats() 变更（game-entities.js）

在现有装备统计循环中加入亲和计算：

```javascript
// 在装备遍历循环内追加
const affinityStats = eq.getAffinityStats(this.classData?.baseClass);
if (affinityStats) {
  for (const [key, val] of Object.entries(affinityStats)) {
    if (stats[key] !== undefined) stats[key] += val;
  }
}
```

### 9.5 掉落函数变更（game-entities.js）

```javascript
function rollEquipmentDropAtMonster(monster, gameInstance, dropChance) {
  // ...前面不变...
  
  // 新增：根据玩家职业偏向掉落
  const playerClass = gameInstance?.player?.classData?.baseClass;
  if (playerClass && Math.random() < 0.70) {
    // 70%概率偏向玩家职业
    pool = pool.filter(eq => {
      if (eq.slot === 'weapon') {
        // 武器匹配职业亲和类型
        return eq.classAffinity === playerClass || !eq.classAffinity;
      }
      return true; // 防具不严格过滤，但可在后续加权
    });
    if (pool.length === 0) pool = allEquipments.filter(eq => tierLevels.includes(eq.level) && !eq.isCrafted);
  }
  
  // ...后续不变...
}
```

### 9.6 武器技能生成扩展（data-classes.js）

`getWeaponSkill()` 方法需要根据新的 `weaponType` 扩展技能池：

```javascript
getWeaponSkill() {
  const skillMap = {
    sword:  { /* 沿用原 melee 技能池 + 战士新技能 */ },
    bow:    { /* 沿用原 ranged 技能池 + 弓手新技能 */ },
    staff:  { /* 法师武器技能池 */ },
    dagger: { /* 刺客武器技能池 */ },
  };
  return skillMap[this.weaponType] || skillMap.sword;
}
```

### 9.7 game-config.json 追加

```javascript
{
  "CONFIG": {
    // ...现有配置不变...
    
    // 新增职业配置
    "CLASS_DROP_BIAS_WEAPON": 0.70,
    "CLASS_DROP_BIAS_ARMOR": 0.50,
    "CLASS_AFFINITY_ENABLED": true
  }
}
```

---

## 10. 变更总结

### 改动文件清单

| 文件 | 改动类型 | 侵入度 |
|------|----------|--------|
| `config/equipment-config.json` | 武器 weaponType 值变更 + 新字段 | 中 |
| `config/equipment-deep-config.json` | 武器 weaponType 值变更 + 新字段 | 中 |
| `config/game-config.json` | 追加配置项 | 小 |
| `config/set-config.json` | **不动** | 无 |
| `config/set-deep-config.json` | 追加4套新套装 | 小（纯追加） |
| `js/data-classes.js` | Equipment类新增字段+方法；generateEquipments新增字段映射；getWeaponSkill扩展 | 中 |
| `js/game-entities.js` | updateStats加入亲和计算；掉落加入职业偏向 | 中 |
| `js/game-main.js` | UI可能需要显示武器类型/职业标签 | 小 |

### 不变模块（零改动）

- ✅ 所有怪物/Boss配置
- ✅ 词条系统（equipmentTraits）
- ✅ 精炼系统（refine）
- ✅ 强化系统（enhance）
- ✅ 锻造系统（crafting）
- ✅ 背包系统（inventory）
- ✅ 现有8套套装效果
- ✅ 品质颜色/名称系统
- ✅ 8个装备槽位

---

**文档结束**
