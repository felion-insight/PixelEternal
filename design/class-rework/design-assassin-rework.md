# 《Pixel Eternal》刺客职业系重构方案 v3.0

**文档版本**：v3.0  
**设计日期**：2026年7月12日  
**设计理念**：「极致的操作感和动作体验为核心，操作决定上限」  
**设计状态**：方案阶段，待 Review 后落地实现

---

## 目录

1. [现状诊断：当前刺客职业系的问题](#1-现状诊断)
2. [核心设计理念：影之锋](#2-核心设计理念)
3. [操作体验设计：手感是第一生产力](#3-操作体验设计)
4. [基础职业：刺客 Assassin](#4-基础职业刺客)
5. [一转·影舞者 Shadowdancer → 二转·夜刃 Nightblade](#5-影舞者--夜刃)
6. [一转·骗术师 Trickster → 二转·幻术师 Illusionist](#6-骗术师--幻术师)
7. [一转·毒师 Venomancer → 二转·瘟疫使者 Plaguebringer](#7-毒师--瘟疫使者)
8. [数值体系设计](#8-数值体系设计)
9. [配置数据（JSON schema）](#9-配置数据)
10. [实现优先级与路线图](#10-实现路线图)

---

## 1. 现状诊断

### 1.1 当前刺客职业系概览

```
刺客 (Assassin) — Energy 能量 120，+12/s
├── 影舞者 (Shadowdancer) — combo_point 连击点 5
│   └── 夜刃 (Nightblade)
├── 骗术师 (Trickster) — illusion 幻象 100
│   └── 幻术师 (Illusionist)
└── 毒师 (Venomancer) — poison_stack 毒素 10
    └── 瘟疫使者 (Plaguebringer)
```

### 1.2 核心问题

| 问题 | 现状 | 影响 |
|------|------|------|
| **操作感缺失** | 背刺判定为"仅可从背后"，无预输入/缓冲，命中判定粗糙 | 技能使用体验僵硬，"等"而非"打" |
| **普攻无深度** | 3段普攻无取消窗口、无派生、无位移选项，纯数值输出 | 基础循环单调，30秒即感枯燥 |
| **位移无博弈** | 暗影步是纯传送+必暴，没有弹反/完美闪避等交互层 | 位移沦为 CD 好了就按，无决策空间 |
| **能量系统无意义** | 120 能量/12秒回 = 几乎无限，资源管理形同虚设 | 资源系统没有带来策略深度 |
| **三个子职业差异化不足** | 背刺/毒/替身仅仅是数值层面的不同标签 | 玩法核心逻辑趋同，都是"贴脸按技能" |
| **影舞者核心技能受限** | 背刺必须从背后放 → 小型/boss 转身快 → 体验极差 | 操作挫败感远大于成就感 |
| **骗术师缺乏主动操作** | 替身/幻象纯召唤自动攻击，玩家只是"召唤完看戏" | 没有体现"骗术"的操作魅力 |
| **毒师只有叠 DOT 一条路** | 毒刃→毒雾→瘟疫爆发→等人死，中间毫无操作可言 | 表面上叫刺客，实际是远程法师 |

### 1.3 与 AGCD（动作游戏）标准的差距

当前刺客的操作深度仅"BBQ 级别"——基本攻击 + 技能循环 + 偶尔位移，缺乏任何动作游戏的核心要素：
- 无 **预输入缓冲**（input buffer）
- 无 **取消窗口**（animation cancel window）
- 无 **完美闪避/弹反**（perfect dodge/parry）
- 无 **连击奖励**（combo bonus）
- 无 **空中/立体作战**（aerial combat）
- 无 **姿态切换**（stance switch）

---

## 2. 核心设计理念

### 2.1 刺客职业宣言

> **"在刀刃上跳舞的人，不依赖数值，只依赖操作。"**

刺客是 Pixel Eternal 中**操作上限最高、容错率最低、上限回报最大**的职业系。设计目标：
- 顶级刺客玩家 DPS 应为同级战士的 1.5-2 倍
- 但触发这个上限需要：精准时机、正确站位、完美连招、零受伤
- 一个失误的刺客（吃到关键技能）直接濒死
- 新手刺客的输出可能不如其他职业

### 2.2 六大操作维度

| 维度 | 说明 | 对 DPS 影响 |
|------|------|-------------|
| **时机 (Timing)** | 完美闪避窗口、技能取消窗口、连击维持 | ⭐⭐⭐⭐⭐ |
| **站位 (Positioning)** | 背刺角度判定、烟雾区域利用、分身位置管理 | ⭐⭐⭐⭐⭐ |
| **连招 (Combo)** | 普攻取消→技能→位移→技能→普攻的流畅衔接 | ⭐⭐⭐⭐ |
| **资源 (Resource)** | 影之力管理：何时存、何时爆 | ⭐⭐⭐ |
| **决策 (Decision)** | 贪刀 or 撤退？爆发 or 存资源？ | ⭐⭐⭐⭐ |
| **反应 (Reaction)** | 弹反窗口、boss 前摇识别 | ⭐⭐⭐⭐⭐ |

### 2.3 核心机制矩阵

所有刺客子职业共享以下基础机制：

```
┌─────────────────────────────────────────────────────────────┐
│  刺客核心机制矩阵                                             │
├───────────────────┬─────────────────────────────────────────┤
│  影之力 Shadow Force  │  100 上限，普攻+8/命中，完美闪避+30    │
│                     │  技能消耗而非自然回复，决定节奏          │
├───────────────────┼─────────────────────────────────────────┤
│  完美闪避 Perfect Dodge│  攻击命中前 0.15s 内闪避 → 时缓 0.5s │
│                     │  → 下次伤害 +50% → +30 影之力           │
├───────────────────┼─────────────────────────────────────────┤
│  背刺 Backstab      │  从目标身后 120° 范围攻击 +50% 伤害     │
│                     │  +50% 暴击伤害（而非必暴）               │
├───────────────────┼─────────────────────────────────────────┤
│  连击计数器 Combo    │  每命中+1层，3s未命中衰减                │
│   Counter           │  10层：+10%移速                          │
│                     │  30层：+15%攻速                          │
│                     │  50层：+20%伤害                          │
│                     │  100层：影之解放（-50%CD，持续6s，重置）  │
├───────────────────┼─────────────────────────────────────────┤
│  动画取消 Cancel    │  普攻任何帧可被技能/闪避取消             │
│                     │  技能后摇可被闪避/另一技能取消            │
│                     │  取消的普攻：伤害-50%（高级技巧）          │
├───────────────────┼─────────────────────────────────────────┤
│  弹反 Parry（新）   │  Q键（武器技能）改为弹反架势              │
│                     │  弹反成功：0.3s无敌 + 目标硬直1s          │
│                     │  + 全额影之力恢复 + 进入影袭状态           │
│                     │  弹反失败：承受全额伤害（高风险高回报）    │
└───────────────────┴─────────────────────────────────────────┘
```

---

## 3. 操作体验设计

### 3.1 按键映射

| 按键 | 功能 | 刺客特性 |
|------|------|----------|
| WASD | 移动 | 刺客基础移速为全职业最高（8→后期更高） |
| J | 普攻（4段连击） | 每段有不同的取消窗口和位移属性 |
| K | 闪避（冲刺） | 携带 iframe，可触发完美闪避 |
| Q | 弹反架势 | 0.2s 前摇 → 0.15s 判定窗口 → 成功触发影之反击 |
| 1/2/3/4 | 技能热键栏 | core1, core2, team, survival |

### 3.2 普攻四段连击深度设计

普攻是刺客最重要的操作基石，包含位移、取消窗口、姿态变化：

```
【J键普攻】影刃 Shadow Edge（4段循环）

段1：刺击 · 影突
  范围：前方50px锥形35°
  伤害：1.0x
  前摇：0.05s / 后摇：0.15s
  取消窗口：攻击帧（0.05s~0.10s 内可取消）
  位移：无
  特效：匕首闪光

段2：横扫 · 影裂
  范围：前方55px锥形50°
  伤害：1.1x
  前摇：0.06s / 后摇：0.18s
  取消窗口：攻击帧（0.06s~0.12s）
  位移：自身向前微移 12px
  特效：双匕弧光

段3：回旋 · 影舞
  范围：周身 60px 环形
  伤害：1.2x（可命中360°）
  前摇：0.08s / 后摇：0.22s
  取消窗口：攻击帧全段（0.08s~0.16s）
  位移：无，但可360°攻击身后目标
  特效：暗色旋刃
  备注：段3是全段可取消的"万能起手"——高手从段3起手打背刺

段4：终结 · 影碎
  范围：前方65px穿刺 + 闪至身后35px
  伤害：1.6x（命中目标身后）
  前摇：0.12s / 后摇：0.25s
  取消窗口：仅穿刺命中的闪光帧可取消（约0.05s极短窗口）
  位移：穿过目标 +35px 至身后
  特效：紫色贯穿线
  备注：段4自带"背刺定位"效果——闪至身后后，下一次攻击自动享受背刺加成
```

**高手操作**：
- 段1→段2→闪避取消→段1起手（利用段1最短后摇达成最高攻速）
- 段3（打身后）→取消→core1技能直接背刺
- 段4闪至身后→接弹反预判 boss 转身攻击

### 3.3 完美闪避系统

```
K键闪避：
  - 冷却：1.2s（刺客专属减0.3s，其他职业1.5s）
  - 无敌帧：0.2s（全职业一致）
  - 完美闪避判定窗口：无敌帧的最后 0.05s
  - 触发效果：
    ├── 0.5s时间缓速（敌慢40%，自身正常）——视觉反馈极强
    ├── 下次攻击伤害 +50%（仅一次）
    ├── 恢复 30 影之力
    └── 屏幕边缘闪紫色光晕 + 特殊音效

高手博弈：
  - 完美闪避后 0.5s 时缓 = 安全输出窗口
  - 时缓中释放的大技能享受 +50% 伤害buff
  - 完美闪避→暗影突刺（背刺）→伤害爆炸
```

### 3.4 弹反系统（Q键）

```
Q键弹反架势：
  - 按下Q：进入弹反架势，0.2s前摇
  - 弹反判定窗口：0.15s（从0.2s后开始）
  - 弹反成功：
    ├── 0.3s无敌
    ├── 目标被硬直 1.0s（boss 0.5s）
    ├── 全额恢复影之力（100）
    ├── 自动释放"影之反击"：瞬移至目标身后 + 2.0x背刺伤害
    └── 重置闪避冷却
  - 弹反失败：
    ├── 架势解除
    ├── 0.4s硬直（不可移动/攻击）
    └── Q进入3s冷却
  - 冷却：3s（失败时）/ 8s（成功时，防止无脑连弹）

设计哲学：
  - 弹反 = 高风险零容错（0.15s窗口）+ 极高回报（100影力+硬直+位置）
  - 让玩家在"闪避"和"弹反"之间做决策
  - Boss战弹反成功直接改变战斗节奏
```

### 3.5 动画取消规则

```
取消层级系统：
  Lv1 取消（自由取消）：普攻任意帧→闪避
  Lv2 取消（技能取消）：普攻攻击帧→技能（伤害-50%但保留连击计数）
  Lv3 取消（闪技取消）：技能后摇→闪避（不损失伤害）
  Lv4 取消（技技取消）：技能后摇→另一技能（需满足连招条件）
  Lv5 取消（完美取消）：完美闪避中→任意技能（无伤害损失 + buff叠加）

禁止取消：
  - 弹反架势不可取消（高风险必须承担）
  - 终极技能不可取消（代价是收招硬直）
  - 闪避无敌帧中不可取消为另一个闪避
```

---

## 4. 基础职业：刺客

### 4.1 属性成长

```json
{
  "baseStats": {
    "hp": 85,
    "attack": 12,
    "defense": 3,
    "magicAttack": 5,
    "magicDefense": 4,
    "speed": 9,
    "critical": 12,
    "dodge": 15
  },
  "growthPerLevel": {
    "hp": 12,
    "attack": 3.0,
    "defense": 0.7,
    "magicAttack": 0.5,
    "magicDefense": 0.6,
    "speed": 0.45,
    "critical": 0.6,
    "dodge": 0.4
  },
  "resource": {
    "type": "shadow_force",
    "name": "影之力",
    "max": 100,
    "regen": 0,
    "onBasicAttack": 8,
    "onPerfectDodge": 30,
    "onParry": 100,
    "onBackstab": 12,
    "outOfCombatDecay": 0
  }
}
```

**设计意图**：
- **全职业最低 HP/防御**：刺客定位玻璃大炮，吃两下即濒死
- **全职业最高 speed/critical/dodge**：机动性和暴击是生存之本
- **影之力**：100上限，0自然回复 → 必须通过操作获取 → 操作 = 资源 = 输出

### 4.2 定位与战场角色

| 维度 | 设定 |
|------|------|
| 基础定位 | **速切手·敏捷**（switch，切换入场3秒爆发 buff） |
| 输出类型 | 近战物理 + 部分暗影魔法 |
| 生存方式 | 闪避/弹反/隐身，零格挡零护盾 |
| 武器 | 双匕首（Twin Daggers） |
| 难度评级 | ★★★★★（全职业最高） |
| 练级体验 | 较弱（脆皮 + 依赖操作），但速通副本上限高 |

### 4.3 基础技能组（Lv1-19）

#### 技能槽位总览

| 槽位 | 解锁等级 | 技能名 | 类型 | CD | 耗能 |
|------|----------|--------|------|-----|------|
| basic | 1 | 影刃 Shadow Edge | 4段普攻连击 | - | 0（产生） |
| core1 | 3 | 暗影突刺 Shadow Pierce | 突刺+背刺定位 | 3s | 20 |
| core2 | 6 | 影涡 Shadow Vortex | 多段打击+聚怪 | 8s | 30 |
| team | 10 | 影缚印记 Shadow Bind | 团队增伤标记 | 12s | 25 |
| survival | 15 | 暗夜影袭 Midnight Raid | 终极爆发+隐身 | 50s | 100 |

---

#### 普攻：影刃 Shadow Edge [basic, Lv1]

详见 [3.2 节](#32-普攻四段连击深度设计)。  
- 每段命中：+8 影之力，+1 连击层数
- 段4穿刺自带"背刺定位"
- 实体类型：`instant`，分段实体配置

---

#### Core1: 暗影突刺 Shadow Pierce [core1, Lv3]

```
描述：凝聚影之力向前方快速突刺，穿透第一个目标并闪至其身后。
      若有"背刺定位"buff（来自普攻段4），则自动触发背刺加成。

数值：
  伤害倍率：1.8x
  突刺距离：100px（穿透）+ 闪至身后
  能量消耗：20 影之力
  冷却：3s
  break效率：1.5x
  特殊：命中后获得"背刺姿态"buff（2s，下次背刺判定范围从120°扩至180°）

实体类型：charge + blink 复合
entityConfig: {
  "type": "shadow_pierce",
  "speed": 900,
  "maxDistance": 100,
  "collisionRadius": 18,
  "pierceThrough": true,
  "teleportBehindOnHit": true,
  "behindDistance": 35,
  "grantBackstabStance": { "durationMs": 2000, "angleDeg": 180 },
  "windupMs": 60
}

操作技巧：
  - 普攻段4(闪至身后)→暗影突刺(再闪身后)→连击流畅
  - 完美闪避后接暗影突刺 = 1.8x × 1.5(buff) × 1.5(背刺) = 4.05x
  - 也可作为逃跑位移（对空气施放也会冲刺100px）
```

---

#### Core2: 影涡 Shadow Vortex [core2, Lv6]

```
描述：向前方释放暗影漩涡，持续旋转3段，每段造成伤害并微微拉拢敌人。
      三段全命中时，最终爆发额外伤害+自身获得"影之加速"buff。

数值：
  每段伤害倍率：0.5x（三段共1.5x）
  终结爆发：1.0x（总2.5x）
  每段拉拢：15px
  范围：前方70px锥形55°
  能量消耗：30 影之力
  冷却：8s
  影之加速 buff：攻速+20%，移速+20%，持续3s
  break效率：每段0.8，终结1.2

实体类型：instant（分段判定）
entityConfig: {
  "type": "multi_strike",
  "strikeCount": 3,
  "strikeIntervalMs": 200,
  "shape": "cone",
  "range": 70,
  "halfAngleDeg": 55,
  "perStrikeDamage": 0.5,
  "perStrikePull": 15,
  "finalBurstDamage": 1.0,
  "finalBurstRadius": 85,
  "buffOnFullHit": { "attackSpeed": 20, "moveSpeed": 20, "durationMs": 3000 },
  "windupMs": 100
}

操作技巧：
  - 影涡拉人→段3普攻(环形)→最大化AOE范围
  - 弹反成功(目标硬直)→影涡全段命中+终结爆发=安全高伤
  - 影之加速期间刷新普攻连贯性
```

---

#### Team: 影缚印记 Shadow Bind [team, Lv10]

```
描述：投掷一枚暗影飞镖标记目标。标记期间：
      - 目标承受伤害 +15%
      - 队友攻击标记目标回复微量生命（0.5%最大HP/命中）
      - 标记目标被击杀时：周围120px队友获得"影之祝福"(+10%伤害，持续5s)

数值：
  投掷伤害：0.4x
  标记持续：8s
  承受伤害提升：15%
  能量消耗：25 影之力
  冷却：12s
  队友吸血：每命中回复 0.5%最大HP（内置CD 0.5s）

实体类型：projectile + mark
entityConfig: {
  "speed": 750,
  "maxRange": 400,
  "trajectory": "homing",
  "pierceCount": 0,
  "damageMultiplier": 0.4,
  "markTarget": true,
  "markDurationMs": 8000,
  "markOwnerDamageBonus": 15,
  "markTeamDamageBonus": 15,
  "markTeamLifesteal": 0.5,
  "markLifestealCooldownMs": 500,
  "markKillAura": { "radius": 120, "buffDamagePercent": 10, "durationMs": 5000 },
  "color": "#6644aa"
}

操作技巧：
  - Boss战优先标记→全队爆发窗口
  - 标记+影涡聚怪→AOE标记传播（死亡爆炸效果）
```

---

#### Survival: 暗夜影袭 Midnight Raid [survival, Lv15]

```
描述：消耗全部影之力，进入"影袭状态"：
      - 隐身 4s（攻击不破隐）
      - 移速 +80%
      - 所有攻击视为背刺（无视角度判定）
      - 攻击伤害 +40%
      - 期间每次击杀延长隐身 1s（最多+4s）
      - 结束时释放终结斩（周身半径100px，2.5x伤害）

数值：
  终结斩伤害：2.5x
  影袭状态持续：4s（+击杀延长，最多8s）
  伤害 bonus：+40%
  能量消耗：100 影之力（全部）
  冷却：50s
  break效率：终结斩 3x

实体类型：blink + stealth + burst
entityConfig: {
  "type": "midnight_raid",
  "stealthMs": 4000,
  "stealthNotBrokenByAttack": true,
  "moveSpeedBonus": 80,
  "allAttacksBackstab": true,
  "damageBonus": 40,
  "killExtendsMs": 1000,
  "maxExtendMs": 4000,
  "finalSlashRadius": 100,
  "finalSlashDamage": 2.5,
  "windupMs": 50
}

操作技巧：
  - 存够100影之力+Boss破防窗口→暗夜影袭→最大化输出
  - 隐身中先挂影缚标记→普攻4段→暗影突刺→背刺最大化
  - 终结斩在隐身最后一刻释放→不浪费隐身输出时间
```

---

## 5. 影舞者 → 夜刃

### 5.1 主题与定位

> **"一刀入魂，见血封喉"**

| 维度 | 影舞者 (Lv20-39) | 夜刃 (Lv40-60) |
|------|-------------------|-----------------|
| 主题 | 精准刺杀 | 暗影处决 |
| 核心资源 | 连击点 Combo Point（最大5） | 处决标记 Execution Mark |
| 核心玩法 | 攒连击点→终结技消耗→高效循环 | 基于目标HP的处决窗口+连斩 |
| battleRole | breaker·爆发 | breaker·暗杀 |
| 难度 | ★★★★ | ★★★★★ |
| 主题色 | `#7733aa` | `#330066` |

### 5.2 核心被动：影之律动 Shadow Rhythm [Lv60]

```
【流派核心被动·影之律动】
背刺暴击时：
  - 返还 30 影之力
  - 所有技能冷却减少 1s
  - 获得"影步"buff（2s）：闪避冷却减半（0.6s），可连续闪避

影步 buff 期间触发完美闪避 → 影步 buff 刷新 + 额外 +20 影之力

设计意图：
  这个被动将"背刺暴击"和"闪避"串联成一个正反馈循环：
  背刺暴击→减CD+更快闪避→更频繁完美闪避→更多影之力→更多技能→更多背刺暴击
  一旦"转起来"，影舞者就是永动机，但一旦断档，立刻陷入资源匮乏
```

### 5.3 技能进化链

| 槽位 | 基础（刺客） | 一转进化（影舞者 Lv20） | 二转进化（夜刃 Lv40） |
|------|-------------|------------------------|------------------------|
| basic | 影刃 | 影刃·断 Shadow Edge: Sever | 影刃·绝 Shadow Edge: Reap |
| core1 | 暗影突刺 | **背刺 Backstab** | **暗杀 Assassinate** |
| core2 | 影涡 | **影袭 Shadow Raid** | **影舞 Shadow Dance** |
| team | 影缚印记 | **死印 Death Mark** | **死神宣告 Death Sentence** |
| survival | 暗夜影袭 | **暗夜降临 Nightfall** | **永夜 Eternal Night** |

---

#### 普攻进化 [basic]

**影舞者 Lv20 → 影刃·断**
```
段4穿刺后追加第5段：影断（Shadow Sever）
  第5段：大型交叉斩（前方80px，X形判定）
  伤害：2.0x
  前摇：0.15s（可被闪避取消）
  命中后获得"影断"debuff：目标移速-30%，持续2s
  产生：+12 影之力，+1 连击点
```

**夜刃 Lv40 → 影刃·绝**
```
第5段修改为：影绝（Shadow Reap）
  第5段：消耗全部连击点，每连击点+0.3x伤害
  基础伤害：1.8x → 5连击点 = 3.3x
  命中后直接获得满连击点（5点）
  产生：+15 影之力
  若击杀目标：所有技能CD-5s
```

---

#### Core1: 背刺 → 暗杀

**影舞者 Lv20: 背刺 Backstab**
```
描述：仅可从目标背后发动致命刺击，伤害极高但判定严苛。
      命中后获得连击点并触发"影之律动"效果。

数值：
  伤害倍率：3.0x（+背刺本身+50% = 实际4.5x）
  背后判定角度：120°
  命中暴击：必暴（背刺固有属性：背刺时+50%暴击伤害）
  能量消耗：25 影之力
  冷却：2.5s
  连击点产生：+1（基础）+（暴击时额外+1）= +2
  break效率：2.5x

实体类型：instant（严格位置判定）
entityConfig: {
  "shape": "single",
  "range": 60,
  "requiresBehind": true,
  "behindAngleDeg": 120,
  "damageMultiplier": 3.0,
  "backstabBonusDmg": 50,
  "guaranteedCritOnBackstab": true,
  "breakDamageMultiplier": 2.5,
  "comboPointOnHit": 1,
  "comboPointOnCrit": 1,
  "windupMs": 80
}

操作技巧：
  - 普攻段4(闪身后)→背刺→最短路径
  - 暗影突刺(闪身后+背刺姿态180°)→背刺→"必定可背刺"安全链
  - 完美闪避(时缓)→走位到背后→背刺→时缓中无需担心boss转身
```

**夜刃 Lv40: 暗杀 Assassinate**
```
描述：终极背刺技艺。背后发动的致命一击，若目标HP<30%则触发处决。

数值：
  伤害倍率：5.0x（+背刺50% = 实际7.5x）
  背后判定角度：180°（夜刃专属扩大）
  处决阈值：目标HP<30%
  处决伤害：伤害×3.0（即22.5x！但处决不享受"完美闪避+50%"等buff叠加，固定22.5x基础）
  非处决：正常伤害+必暴+额外+3连击点
  处决时：目标低于30%HP直接秒杀（非Boss）/ Boss处决为5.0x×3.0=15.0x
  能量消耗：35 影之力
  冷却：3s
  break效率：4x

entityConfig: {
  "shape": "single",
  "range": 70,
  "requiresBehind": true,
  "behindAngleDeg": 180,
  "damageMultiplier": 5.0,
  "backstabBonusDmg": 50,
  "guaranteedCritOnBackstab": true,
  "executeThreshold": 0.30,
  "executeMultiplier": 3.0,
  "executeBossThreshold": 0.30,
  "nonExecuteComboPoints": 3,
  "breakDamageMultiplier": 4.0,
  "windupMs": 120,
  "windupSuperArmor": true
}
```

---

#### Core2: 影袭 → 影舞

**影舞者 Lv20: 影袭 Shadow Raid**
```
描述：高速冲刺穿过目标，留下暗影轨迹。0.5s内可再次按键沿轨迹返回，
      往返均造成伤害。返回后获得"影袭姿态"（下次背刺范围扩至180°）。

数值：
  冲刺伤害：1.2x
  返回伤害：1.2x
  轨迹持续：0.5s（返回窗口）
  返回后buff：背刺角度扩至180°，持续2s
  能量消耗：25 影之力
  冷却：4.5s
  break效率：1.5x

实体类型：charge（往返）
entityConfig: {
  "speed": 750,
  "maxDistance": 140,
  "collisionRadius": 22,
  "damageMultiplier": 1.2,
  "dashThrough": true,
  "returnWindowMs": 500,
  "returnDamageMultiplier": 1.2,
  "leaveShadowTrail": true,
  "trailDurationMs": 500,
  "grantBackstabStance180": { "durationMs": 2000 },
  "superArmor": true
}

操作技巧：
  - 影袭穿过→立刻背刺（享受180°判定+返回窗口取消）→返回→再背刺！
  - 影袭+暗影突刺=双重穿梭，让boss完全找不到你
```

**夜刃 Lv40: 影舞 Shadow Dance**
```
描述：在敌人之间穿梭起舞！标记范围内最多3个敌人，
      依次冲刺穿过每个目标，每次冲刺伤害递增25%。

数值：
  首次冲刺：1.5x
  二次冲刺：1.875x（+25%）
  三次冲刺：2.34x（+25%）
  冲刺次数：最多3次（自动选择最近3个不同目标）
  每次冲刺后获得0.2s无敌帧
  能量消耗：30 影之力
  冷却：5s
  break效率：2x（每段）

entityConfig: {
  "type": "shadow_dance",
  "dashCount": 3,
  "dashRange": 130,
  "dashDamage": [1.5, 1.875, 2.34],
  "dashIntervalMs": 150,
  "dashInvincibilityMs": 200,
  "preferDifferentTargets": true,
  "gainComboPointPerDash": 1,
  "superArmor": true
}

操作技巧：
  - 影舞聚怪→三段穿梭→落点正好在boss身后→接暗杀
  - 利用每段0.2s无敌帧躲boss技能（精确timing = 刀尖舔血）
```

---

#### Team: 死印 → 死神宣告

**影舞者 Lv20: 死印 Death Mark**
```
描述：标记目标为"死印"状态：
      - 目标承受伤害 +25%
      - 队友攻击死印目标暴击率 +10%
      - 影舞者攻击死印目标额外 +15% 暴击伤害

数值：
  标记持续：10s
  承受伤害提升：25%
  队友暴击加成：+10%
  自身暴击伤害加成：+15%
  能量消耗：30 影之力
  冷却：15s
```

**夜刃 Lv40: 死神宣告 Death Sentence**
```
描述：死印升级——标记时附加"死神宣告"效果：
      - 死印持续期间若目标HP降至30%以下 → 触发"死神宣告"
      - 死神宣告：全队对该目标伤害 +40%（持续至死亡）
      - 目标被击杀后：影舞者所有技能CD-50%（含终极技）

数值：
  标记持续：12s（+2s）
  承受伤害提升：25%（不变）
  死神宣告额外伤害：+40%
  CD减免：-50%
```

---

#### Survival: 暗夜降临 → 永夜

**影舞者 Lv20: 暗夜降临 Nightfall**
```
描述：创造一片黑暗领域（半径130px），持续5s：
      - 自身隐身（攻击不破隐）
      - 移速+100%
      - 任何方向攻击均视为背刺
      - 攻击伤害+30%
      - 击杀目标时影袭 CD 重置

数值：
  黑暗领域半径：130px
  领域持续：5s
  伤害 bonus：+30%
  能量消耗：100 影之力
  冷却：50s

实体类型：field + stealth
```

**夜刃 Lv40: 永夜 Eternal Night**
```
描述：暗夜降临升级——领域持续6s，额外效果：
      - 每次击杀延长领域 1.5s（最多+9s）
      - 领域内影之律动的CD减免翻倍（背刺暴击-CD 2s）
      - 终结时释放"永夜裁决"：全屏范围，5.0x伤害

数值：
  领域持续：6s（基础）+ 击杀延长
  伤害 bonus：+40%
  CD减免翻倍：背刺暴击-CD 2s
  终结伤害：5.0x（全屏）
```

---

## 6. 骗术师 → 幻术师

### 6.1 主题与定位

> **"真假难辨，虚实交错"**

| 维度 | 骗术师 (Lv20-39) | 幻术师 (Lv40-60) |
|------|-------------------|-----------------|
| 主题 | 分身戏法 | 虚实领域 |
| 核心资源 | 幻象值 Illusion（最大100） | 幻象矩阵 Phantom Matrix |
| 核心玩法 | 分身制造+分身位置管理+分身引爆 | 领域内操控分身交响攻击 |
| battleRole | switch·控制 | switch·幻象 |
| 难度 | ★★★★ | ★★★★★ |
| 主题色 | `#6688cc` | `#3344aa` |

### 6.2 核心被动：真假莫辨 Indistinguishable [Lv60]

```
【流派核心被动·真假莫辨】
当场上存在分身时：
  - 敌人攻击有 50% 概率命中分身而非本体
  - 分身死亡时：恢复 20 影之力 + 自身1s无敌
  - 每次分身消失（死亡或超时）：下一个技能的冷却减半

当施放技能时，所有活跃分身同时以60%伤害复读该技能

设计意图：
  骗术师的核心博弈是"分身是资源也是盾牌"
  高手操作：精确控制分身数量、位置、消失时机
  最大化"分身复读"的输出，同时保证至少1个分身存活作为"人肉盾牌"
```

### 6.3 技能进化链

| 槽位 | 基础（刺客） | 一转进化（骗术师 Lv20） | 二转进化（幻术师 Lv40） |
|------|-------------|------------------------|------------------------|
| basic | 影刃 | 影弹 Shadow Flick | 影弹·幻 Shadow Flick: Mirage |
| core1 | 暗影突刺 | **引渡 Transposition** | **虚实 Phantom Reality** |
| core2 | 影涡 | **替身 Decoy** | **镜影结界 Mirror Domain** |
| team | 影缚印记 | **幻影戏法 Phantom Trick** | **影之盛宴 Shadow Feast** |
| survival | 暗夜影袭 | **虚实交错 Reality Shift** | **千影幻阵 Phantom Array** |

---

#### 普攻进化 [basic]

**骗术师 Lv20: 影弹 Shadow Flick**
```
描述：改为远程投掷暗影飞镖（3连发扇形，每发跟踪最近敌人）。
      若场上有分身，分身也同时投掷飞镖（各打各的目标）。

数值：
  每发伤害：0.7x
  发射数：3发（扇形20°）
  每发追踪距离：300px
  分身复读：60%伤害
  每发产生：+6 影之力
  弹速：650px/s

实体类型：projectile
```

**幻术师 Lv40: 影弹·幻 Shadow Flick: Mirage**
```
描述：飞镖命中后会在目标身上留下"幻影印记"（持续3s），
      有印记的敌人被分身攻击时额外 +30% 伤害。
      分身复读伤害提升至80%。
```

---

#### Core1: 引渡 → 虚实

**骗术师 Lv20: 引渡 Transposition**
```
描述：在当前位置留下一个影之锚点（持续8s，不可见，上限3个）。
      再次施放：瞬移至最近锚点位置，对起点和终点各造成1.2x范围伤害。
      锚点可被手动引爆（长按技能键）造成1.0x范围伤害。

数值：
  单个锚点伤害：1.2x（瞬移时两端）
  引爆伤害：1.0x
  锚点存在时间：8s
  锚点上限：3
  每个锚点产生：1个分身（持续6s，继承40%攻击）
  能量消耗：20 影之力/锚点
  冷却：1s（放锚点）/ 6s（瞬移）

实体类型：field + blink
entityConfig: {
  "placeAnchor": true,
  "anchorMaxCount": 3,
  "anchorDurationMs": 8000,
  "anchorInvisible": true,
  "spawnCloneOnPlace": true,
  "cloneDurationMs": 6000,
  "cloneAttackRatio": 0.4,
  "teleportToNearestAnchor": true,
  "teleportBurstRadius": 80,
  "teleportBurstDamage": 1.2
}

操作技巧：
  - 三角锚点布局 → 连续引渡 → 三连爆 → 全场穿梭
  - Boss战斗前预先布3锚点 → 开战后无限瞬移
  - 锚点引爆伤害可叠影涡聚怪后再引爆→AOE清场
```

**幻术师 Lv40: 虚实 Phantom Reality**
```
描述：引渡升级——
      - 锚点上限提升至5个
      - 瞬移时所有锚点同时引爆（各1.5x伤害）
      - 瞬移后在目的地生成2个强力分身（继承60%攻击，持续8s）
      - 锚点之间若距离<150px，引爆伤害叠加（最多3层叠加×2.5x）

数值：
  锚点上限：5
  全锚点引爆：各1.5x
  近距离叠加：最多2.5x
  强力分身：2个，60%，8s
```

---

#### Core2: 替身 → 镜影结界

**骗术师 Lv20: 替身 Decoy**
```
描述：原地留下一个替身分身（持续8s，嘲讽半径140px内敌人），
      自身进入隐身3s。替身被摧毁时爆炸（半径90px，2.0x伤害+致盲3s）。

数值：
  替身HP：自身最大HP的25%
  替身持续：8s
  嘲讽半径：140px
  爆炸伤害：2.0x
  致盲时间：3s
  隐身时间：3s（攻击破隐但伤害+40%）
  能量消耗：30 影之力
  冷却：8s

实体类型：summon（taunt）
entityConfig: {
  "summonUnitId": "decoy",
  "durationMs": 8000,
  "inheritStats": { "hp": 0.25 },
  "aiType": "taunt_static",
  "tauntRadius": 140,
  "stealthSelfMs": 3000,
  "stealthFirstAttackBonus": 40,
  "explosionOnDeath": true,
  "explosionRadius": 90,
  "explosionDamage": 2.0,
  "explosionBlindMs": 3000
}

操作技巧：
  - 替身→隐身→走位到背后→破隐一击+背刺=爆炸伤害
  - 替身吃boss大招→爆炸伤害→致盲→安全输出窗口
  - 替身+引渡锚点=两个战场控制点
```

**幻术师 Lv40: 镜影结界 Mirror Domain**
```
描述：替身升级——创造一个镜影结界（半径120px，持续10s）：
      - 结界内：3个影分身自动模仿你的每次攻击（各50%伤害）
      - 结界内：所有分身受到的伤害减少40%
      - 走出结界再进入：替身CD重置（每10s最多触发一次）
      - 结界消失时：所有在场分身同时爆炸！

数值：
  结界半径：120px
  持续：10s
  自动分身：3个，50%伤害
  分身减伤：40%
  CD重置：进入结界时重置替身（内置CD 10s）

实体类型：field + summon
entityConfig: {
  "fieldRadius": 120,
  "fieldDurationMs": 10000,
  "spawnMirrorClones": 3,
  "mirrorCloneDamageRatio": 0.5,
  "cloneDamageReduction": 40,
  "resetDecoyOnEnter": true,
  "resetDecoyInternalCD": 10000,
  "explodeAllOnExpire": true
}
```

---

#### Team: 幻影戏法 → 影之盛宴

**骗术师 Lv20: 幻影戏法 Phantom Trick**
```
描述：为目标队友（或自身）召唤一个影之分身，持续10s：
      - 分身继承目标40%伤害输出
      - 分身受到的伤害转移50%至施法者（骗术师）
      - 分身死亡时：目标获得3s无敌

数值：
  持续：10s
  伤害继承：40%
  伤害转移：50%
  死亡无敌：3s
  能量消耗：35 影之力
  冷却：20s

设计哲学：高风险保护——分身是队友的护盾，但代价是你自己的HP
```

**幻术师 Lv40: 影之盛宴 Shadow Feast**
```
描述：全体队友获得影之分身（持续8s，继承40%伤害）。
      若在镜影结界内施放，分身继承提升至60%，
      且结界内的敌人承受伤害 +25%。

数值：
  全体分身：8s
  伤害继承：40%（镜影结界内60%）
  结界内敌人易伤：+25%
  能量消耗：50 影之力
  冷却：30s
```

---

#### Survival: 虚实交错 → 千影幻阵

**骗术师 Lv20: 虚实交错 Reality Shift**
```
描述：瞬间闪现+在目的地制造2个影之分身（持续8s），
      自身获得0.5s无敌。分身会主动追击附近敌人。

数值：
  闪现距离：150px
  分身数量：2
  分身持续：8s
  分身继承：50%攻击
  无敌时间：0.5s
  能量消耗：100 影之力
  冷却：50s
```

**幻术师 Lv40: 千影幻阵 Phantom Array**
```
描述：围绕目标（范围250px）召唤6个影之分身组成环形杀阵，
      所有分身同时向中心冲刺造成毁灭性打击！

数值：
  分身数量：6（环形排列）
  每个分身冲刺伤害：2.0x
  环阵范围：半径250px
  全部命中总伤害：12.0x（6×2.0x）
  施放后全部分身留在场上（持续6s，60%继承）
  能量消耗：100 影之力
  冷却：50s

操作技巧：
  - 镜影结界内力场→千影幻阵→分身x9同时攻击→DPS天花板
  - 千影幻阵+影涡聚怪=所有冲刺全部命中中心
```

---

## 7. 毒师 → 瘟疫使者

### 7.1 主题与定位

> **"毒素是我的艺术，死亡是我的画布"**

| 维度 | 毒师 (Lv20-39) | 瘟疫使者 (Lv40-60) |
|------|-------------------|-----------------|
| 主题 | 毒术师 | 瘟疫之源 |
| 核心资源 | 毒催化剂 Catalyst（最大10层） | 瘟疫能量 Plague Energy（最大20层） |
| 核心玩法 | 叠毒→催化引爆→扩散→再叠毒 | 全场毒素链式反应+自我强化 |
| battleRole | anomaly·DOT | anomaly·瘟疫 |
| 难度 | ★★★ | ★★★★ |
| 主题色 | `#44aa22` | `#228800` |

### 7.2 核心机制：毒催化 Venom Catalysis

```
毒催化机制：
  - 每次中毒 DOT 跳伤害 → +1 催化剂层数（最多10层）
  - 每层催化剂：自身毒伤+5%
  - 满10层时：下一个"毒刃系"技能消耗全部催化剂
    → 消耗时：施加双倍中毒层数 + 立即结算目标身上50%剩余毒伤

设计意图：
  毒师的核心博弈是"催化层数管理"
  - 低层引爆：稳定但效率低
  - 高层引爆：10层催化剂+双倍毒+50%结算=爆炸输出
  - 挑战：维持10层需要"中毒不断"，敌人死亡会清空中毒
```

### 7.3 核心被动：毒理学 Toxicology [Lv60]

```
【流派核心被动·毒理学】
1. 你的中毒伤害忽略目标 30% 防御
2. 当敌人死于中毒时，剩余中毒伤害的 30% 转化为你的生命
3. 每有一个敌人处于中毒状态 → 你的移速+8%（最多+40%）

设计意图：
  毒师是唯一有"续航"的刺客——通过吸血在毒雾中站得住
  满场中毒=满移速+满吸血=终极风筝形态
```

### 7.4 技能进化链

| 槽位 | 基础（刺客） | 一转进化（毒师 Lv20） | 二转进化（瘟疫使者 Lv40） |
|------|-------------|----------------------|--------------------------|
| basic | 影刃 | 淬毒暗器 Poison Shuriken | 淬毒暗器·瘟疫 Poison Shuriken: Plague |
| core1 | 暗影突刺 | **毒刺 Venom Sting** | **致命毒液 Lethal Venom** |
| core2 | 影涡 | **毒雾 Poison Mist** | **疫病云雾 Plague Cloud** |
| team | 影缚印记 | **传染 Contagion** | **瘟疫传播 Pandemic** |
| survival | 暗夜影袭 | **毒素引爆 Toxin Detonation** | **凋零 Withering** |

---

#### 普攻进化 [basic]

**毒师 Lv20: 淬毒暗器 Poison Shuriken**
```
描述：改为投掷3枚淬毒飞镖（扇形20°），每把命中施加1层中毒。
      飞镖命中后可弹射到最近的中毒目标（最多弹射2次，伤害递减20%/次）。

数值：
  每把伤害：0.6x
  每把中毒：1层（持续4s）
  飞镖数：3（扇形20°）
  弹射次数：2次
  弹射伤害递减：20%/次
  每把产生：+5 影之力
```

**瘟疫使者 Lv40: 淬毒暗器·瘟疫**
```
描述：飞镖数增至5把，每把施加2层中毒，弹射次数增至3次。
      飞镖经过毒雾区域时自动获得追踪属性。
```

---

#### Core1: 毒刺 → 致命毒液

**毒师 Lv20: 毒刺 Venom Sting**
```
描述：快速刺击注入猛毒，施加大量中毒层数 + 中毒易伤debuff。

数值：
  伤害倍率：1.2x
  施加中毒：3层（持续5s）
  中毒易伤：目标承受毒伤+15%（持续6s）
  催化剂产生：+2（命中即+2，中毒跳伤害另有+1）
  能量消耗：22 影之力
  冷却：2.5s
  范围：前方60px锥形40°

实体类型：instant
entityConfig: {
  "shape": "cone",
  "range": 60,
  "halfAngleDeg": 40,
  "damageMultiplier": 1.2,
  "statusOnHit": [{ "type": "poison", "durationMs": 5000, "stacks": 3 }],
  "debuffPoisonDmgTaken": 15,
  "debuffDurationMs": 6000,
  "grantCatalyst": 2,
  "windupMs": 60
}
```

**瘟疫使者 Lv40: 致命毒液 Lethal Venom**
```
描述：毒刺升级——
      - 伤害提升至1.8x
      - 中毒层数提升至5层
      - 中毒易伤提升至25%
      - 若目标已有5层以上中毒：额外造成目标当前HP 8%的毒伤（不超过攻击力×3）
      - 催化剂产生+3

数值：
  伤害：1.8x
  中毒：5层
  易伤：25%
  HP%额外伤：当前HP 8%（上限=攻击力×3）
```

---

#### Core2: 毒雾 → 疫病云雾

**毒师 Lv20: 毒雾 Poison Mist**
```
描述：在目标位置释放毒雾（半径80px，持续8s）：
      - 毒雾内敌人每秒获得1层中毒
      - 毒雾内敌人移速-20%
      - 同一毒雾内中毒敌人越多，毒雾伤害越高（每个敌人+10%，最多+50%）

数值：
  半径：80px
  持续：8s
  每秒中毒：1层
  减速：20%
  叠加增伤：每个中毒敌人+10%（最多+50%）
  能量消耗：28 影之力
  冷却：10s
  催化剂产生：毒雾内每跳中毒+1催化剂

实体类型：field
entityConfig: {
  "fieldRadius": 80,
  "tickIntervalMs": 1000,
  "fieldDurationMs": 8000,
  "targeted": true,
  "statusOnTick": [{ "type": "poison", "durationMs": 4000, "stacks": 1 }],
  "enemySlowPercent": 20,
  "damageAmpPerPoisonedEnemy": 10,
  "damageAmpMax": 50,
  "grantCatalystPerTick": 1,
  "color": "#55aa44"
}
```

**瘟疫使者 Lv40: 疫病云雾 Plague Cloud**
```
描述：毒雾升级——
      - 半径扩大至110px
      - 持续10s
      - 减速提升至40%
      - 新增：疫病云雾内的中毒伤害翻倍
      - 新增：敌人死在疫病云雾内→云雾半径+20px（最多扩至200px）→触发连锁！

数值：
  半径：110px（可扩大至200px）
  持续：10s
  减速：40%
  毒伤翻倍：x2.0
  击杀扩大：+20px半径
```

---

#### Team: 传染 → 瘟疫传播

**毒师 Lv20: 传染 Contagion**
```
描述：引爆目标身上所有中毒层数→向周围3个最近敌人传播等量中毒层数。
      原目标中毒层数清空（但附加"毒免疫"3s，期间无法再叠毒）。

数值：
  传播范围：120px
  传播目标数：3
  传播层数：原目标当前层数（最高10层）
  毒免疫：原目标3s
  能量消耗：30 影之力
  冷却：12s

操作技巧：
  - 毒刺叠5层→传染→3个敌人各5层=瞬间15层总中毒
  - 毒雾(每秒1层)→10层→传染→全场中毒→催化剂爆表
```

**瘟疫使者 Lv40: 瘟疫传播 Pandemic**
```
描述：传染升级——
      - 传播目标数提升至6个
      - 每个被传播的目标也会向自身周围传播2层（链式反应！）
      - 原目标不再毒免疫，改为保留1层中毒（维持催化）
      - 传播后：所有被传播目标获得"疫病易伤"（毒伤+20%，持续6s）

数值：
  传播目标：6
  次级传播：每个目标→2层×周围2个目标
  保留层数：原目标保留1层
  疫病易伤：+20%毒伤
```

---

#### Survival: 毒素引爆 → 凋零

**毒师 Lv20: 毒素引爆 Toxin Detonation**
```
描述：引爆所有可见敌人身上的中毒层数！
      每个敌人的引爆伤害 = 中毒层数 × 1.5x
      引爆后：中毒层数清空 + 敌人进入"毒竭"状态（3s内无法中毒）

数值：
  每层引爆伤害：1.5x
  毒竭持续：3s
  能量消耗：100 影之力
  冷却：50s
  催化剂：引爆时每个中毒敌人+5催化剂

entityConfig: {
  "type": "poison_detonation",
  "globalDetonate": true,
  "detonateRange": 999,
  "damagePerStack": 1.5,
  "clearPoisonAfter": true,
  "antiPoisonMs": 3000,
  "grantCatalystPerEnemy": 5
}
```

**瘟疫使者 Lv40: 凋零 Withering**
```
描述：毒素引爆升级为凋零——
      - 引爆伤害提升至每层 2.5x
      - 不再清空中毒层数！改为保留50%层数
      - 无"毒竭"debuff
      - 额外：凋零对目标附加"暗蚀"debuff（防御-30%，持续5s）
      - 额外：若目标HP<20%且有5层以上中毒→直接处决（非Boss）

数值：
  每层引爆：2.5x
  保留层数：50%
  暗蚀防御削减：30%
  处决条件：HP<20% + 5层以上中毒
```

---

## 8. 数值体系设计

### 8.1 伤害比较表（单次技能，60级满配 影之力100）

| 技能 | 基础倍率 | 背刺×1.5 | 完美闪避×1.5 | 连击50层×1.2 | 全buff最大化 | 备注 |
|------|----------|----------|--------------|-------------|-------------|------|
| 背刺 | 3.0x | 4.5x | - | 5.4x | 6.75x | 影舞者20级 |
| 暗杀 | 5.0x | 7.5x | - | 9.0x | 11.25x | 夜刃40级（非处决） |
| 暗杀(处决) | - | - | - | - | 15.0x | Boss处决 |
| 千影幻阵(全中) | 12.0x | - | - | - | 18.0x | 幻术师终极 |
| 凋零(10层×2.5x) | 25.0x | - | - | - | 37.5x | 瘟疫使者终极 |

> 注：最大化 = 背刺 + 完美闪避buff + 连击50层buff + 暗夜降临buff + 死印debuff

### 8.2 操作→DPS 映射（影舞者为例）

| 操作水平 | 背刺命中率 | 完美闪避/分钟 | 连击维持(>50层)占比 | 相对DPS |
|----------|-----------|---------------|---------------------|---------|
| 新手 | 30% | 0-1次 | 0% | 100% |
| 进阶 | 60% | 2-3次 | 30% | ~200% |
| 高手 | 85% | 5-8次 | 70% | ~350% |
| 顶级 | 95%+ | 10+次 | 90%+ | ~500%+ |

**这个差距是设计目标——操作直接等于数值**。

### 8.3 资源经济

| 操作 | 影之力获取 | 说明 |
|------|-----------|------|
| 普攻每段 | +8 | 4段普攻=32，基础循环 |
| 背刺 | +12 | 高风险高回报 |
| 完美闪避 | +30 | 鼓励极限操作 |
| 弹反成功 | +100（满） | 最高回报但最难触发 |
| 技能消耗(core1) | -20~25 | 2-3次普攻即可放技能 |
| 技能消耗(终极) | -100 | 需要精准的资源规划 |

---

## 9. 配置数据

### 9.1 class-config.json 新增/修改条目

```json
{
  "version": "3.0",
  "baseClasses": {
    "assassin": {
      "id": "assassin",
      "name": "刺客",
      "description": "暗影中的舞者，以极致的操作换取毁灭性的爆发。全职业最脆弱但上限最高。",
      "icon": "assets/icons/classes/assassin.png",
      "role": "mdps",
      "difficulty": 5,
      "baseStats": {
        "hp": 85,
        "attack": 12,
        "defense": 3,
        "magicAttack": 5,
        "magicDefense": 4,
        "speed": 9,
        "critical": 12,
        "dodge": 15
      },
      "growthPerLevel": {
        "hp": 12,
        "attack": 3.0,
        "defense": 0.7,
        "magicAttack": 0.5,
        "magicDefense": 0.6,
        "speed": 0.45,
        "critical": 0.6,
        "dodge": 0.4
      },
      "resource": {
        "type": "shadow_force",
        "name": "影之力",
        "max": 100,
        "regen": 0,
        "tooltip": "普攻+8 | 背刺+12 | 完美闪避+30 | 弹反成功+100"
      },
      "skills": [
        "assassin_basic",
        "shadow_pierce",
        "shadow_vortex",
        "shadow_bind",
        "midnight_raid"
      ],
      "advancements": ["shadowdancer", "trickster", "venomancer"],
      "battleRole": "switch",
      "battleRoleName": "速切手·敏捷",
      "themeColor": "#6644aa",
      "passives": {
        "base": [
          { "id": "backstab_mastery", "name": "背刺精通", "desc": "从目标身后120°范围攻击+50%伤害和+50%暴击伤害" },
          { "id": "perfect_dodge", "name": "极限闪避", "desc": "闪避无敌帧最后0.05s内躲避→时缓0.5s+下击+50%伤害+30影之力" },
          { "id": "shadow_combo", "name": "影之连击", "desc": "连击计数器：10/30/50/100层逐级强化" },
          { "id": "animation_cancel", "name": "暗影身法", "desc": "普攻可被技能/闪避取消；技能后摇可被闪避取消" },
          { "id": "parry_stance", "name": "弹反架势", "desc": "Q键进入弹反架势，成功弹反=无敌+硬直目标+满影之力" }
        ]
      }
    }
  },
  "firstAdvancements": {
    "shadowdancer": {
      "id": "shadowdancer",
      "name": "影舞者",
      "baseClass": "assassin",
      "requiredLevel": 20,
      "description": "精准的暗杀者，以背刺和连击点驱动的爆发循环消灭目标。",
      "role": "mdps",
      "difficulty": 4,
      "resource": {
        "type": "combo_point",
        "name": "连击点",
        "max": 5,
        "tooltip": "背刺+1 | 背刺暴击+1 | 影袭+1 | 普攻段5+1"
      },
      "advancements": ["nightblade"],
      "battleRole": "breaker",
      "battleRoleName": "击破手·爆发",
      "themeColor": "#7733aa",
      "classPassive": "shadow_rhythm_pre",
      "skillEvolution": {
        "basic": { "first": "shadow_edge_sever" },
        "core1": { "first": "backstab" },
        "core2": { "first": "shadow_raid" },
        "team": { "first": "death_mark" },
        "survival": { "first": "nightfall" }
      }
    },
    "trickster": {
      "id": "trickster",
      "name": "骗术师",
      "baseClass": "assassin",
      "requiredLevel": 20,
      "description": "操纵分身的幻术大师，以虚实掩人耳目、以分身代替自身承受伤害。",
      "role": "support",
      "difficulty": 4,
      "resource": {
        "type": "illusion",
        "name": "幻象值",
        "max": 100,
        "tooltip": "分身攻击+5 | 分身死亡+20 | 引渡锚点+10"
      },
      "advancements": ["illusionist"],
      "battleRole": "switch",
      "battleRoleName": "速切手·控制",
      "themeColor": "#6688cc",
      "classPassive": "indistinguishable_pre",
      "skillEvolution": {
        "basic": { "first": "shadow_flick" },
        "core1": { "first": "transposition" },
        "core2": { "first": "decoy" },
        "team": { "first": "phantom_trick" },
        "survival": { "first": "reality_shift" }
      }
    },
    "venomancer": {
      "id": "venomancer",
      "name": "毒师",
      "baseClass": "assassin",
      "requiredLevel": 20,
      "description": "毒术专家，以层层叠加的猛毒消磨敌人，在毒雾中优雅地收割生命。",
      "role": "mdps",
      "difficulty": 3,
      "resource": {
        "type": "catalyst",
        "name": "催化剂",
        "max": 10,
        "tooltip": "中毒每跳+1 | 毒刺命中+2 | 毒素引爆每个敌人+5"
      },
      "advancements": ["plaguebringer"],
      "battleRole": "anomaly",
      "battleRoleName": "异常手·DOT",
      "themeColor": "#44aa22",
      "classPassive": "toxicology_pre",
      "skillEvolution": {
        "basic": { "first": "poison_shuriken" },
        "core1": { "first": "venom_sting" },
        "core2": { "first": "poison_mist" },
        "team": { "first": "contagion" },
        "survival": { "first": "toxin_detonation" }
      }
    }
  },
  "secondAdvancements": {
    "nightblade": {
      "id": "nightblade",
      "name": "夜刃",
      "firstAdvancement": "shadowdancer",
      "requiredLevel": 40,
      "description": "暗影中的死神。处决敌人如同割草，在永夜领域中无人能逃脱他的刀刃。",
      "role": "mdps",
      "difficulty": 5,
      "battleRole": "breaker",
      "battleRoleName": "击破手·暗杀",
      "themeColor": "#330066",
      "classPassive": "shadow_rhythm",
      "skillEvolution": {
        "basic": { "second": "shadow_edge_reap", "first": "shadow_edge_sever" },
        "core1": { "second": "assassinate", "first": "backstab" },
        "core2": { "second": "shadow_dance", "first": "shadow_raid" },
        "team": { "second": "death_sentence", "first": "death_mark" },
        "survival": { "second": "eternal_night", "first": "nightfall" }
      }
    },
    "illusionist": {
      "id": "illusionist",
      "name": "幻术师",
      "firstAdvancement": "trickster",
      "requiredLevel": 40,
      "description": "虚实领域的掌控者。当他布下镜影结界，战场便成为他的个人舞台。",
      "role": "support",
      "difficulty": 5,
      "battleRole": "switch",
      "battleRoleName": "速切手·幻象",
      "themeColor": "#3344aa",
      "classPassive": "indistinguishable",
      "skillEvolution": {
        "basic": { "second": "shadow_flick_mirage", "first": "shadow_flick" },
        "core1": { "second": "phantom_reality", "first": "transposition" },
        "core2": { "second": "mirror_domain", "first": "decoy" },
        "team": { "second": "shadow_feast", "first": "phantom_trick" },
        "survival": { "second": "phantom_array", "first": "reality_shift" }
      }
    },
    "plaguebringer": {
      "id": "plaguebringer",
      "name": "瘟疫使者",
      "firstAdvancement": "venomancer",
      "requiredLevel": 40,
      "description": "行走的瘟疫之源。他的毒素如疫病般蔓延，所过之处寸草不生。",
      "role": "mdps",
      "difficulty": 4,
      "battleRole": "anomaly",
      "battleRoleName": "异常手·瘟疫",
      "themeColor": "#228800",
      "classPassive": "toxicology",
      "skillEvolution": {
        "basic": { "second": "poison_shuriken_plague", "first": "poison_shuriken" },
        "core1": { "second": "lethal_venom", "first": "venom_sting" },
        "core2": { "second": "plague_cloud", "first": "poison_mist" },
        "team": { "second": "pandemic", "first": "contagion" },
        "survival": { "second": "withering", "first": "toxin_detonation" }
      }
    }
  }
}
```

---

## 10. 实现优先级与路线图

### Phase 1: 核心操作框架（优先级最高）

| 任务 | 说明 | 预计工期 |
|------|------|----------|
| 完美闪避系统 | 在现有闪避逻辑中增加PerfDodge判定+时缓+伤害buff | 2-3天 |
| 弹反系统（Q键） | 弹反架势→判定→反击→无敌 | 3-4天 |
| 连击计数器 | 命中+1/3s衰减/10-30-50-100奖励 | 1-2天 |
| 动画取消框架 | 普攻→闪避/技能取消+取消伤害惩罚 | 2-3天 |
| 背刺判定优化 | 120°角度检测+背刺伤害/暴伤加成 | 1天 |

### Phase 2: 刺客基础重做

| 任务 | 说明 | 预计工期 |
|------|------|----------|
| 影之力资源系统 | 替换energy为shadow_force，0回复+命中获取 | 1-2天 |
| 普攻4段重做 | 分段位移+取消窗口+背刺定位 | 2-3天 |
| 5个基础技能重做 | shadow_pierce/vortex/bind/midnight_raid + 实体配置 | 4-5天 |
| 属性调整 | HP/attack/defense/speed等基础值修正 | 0.5天 |

### Phase 3: 子职业技能

| 任务 | 说明 | 预计工期 |
|------|------|----------|
| 影舞者/夜刃全技能 | 10个新技能+实体+进化链 | 4-5天 |
| 骗术师/幻术师全技能 | 10个新技能+分身AI+领域 | 5-6天 |
| 毒师/瘟疫使者全技能 | 10个新技能+中毒系统增强+链式反应 | 4-5天 |

### Phase 4: 流派被动与打磨

| 任务 | 说明 | 预计工期 |
|------|------|----------|
| 三个流派核心被动 | shadow_rhythm/indistinguishable/toxicology | 2-3天 |
| VFX特效 | 完美闪避光效/弹反特效/暗夜领域/毒雾 | 3-4天 |
| 音效 | 完美闪避/弹反成功/连击突破的SFX | 1-2天 |
| 数值调校 | DPS曲线/资源经济/CD平衡 | 2-3天 |

---

## 附录A：与当前设计的兼容性说明

### 保留的内容
- 职业树结构（刺客→影舞者/骗术师/毒师→夜刃/幻术师/瘟疫使者）不变
- 8技能槽位框架不变
- 战场角色标签（breaker/switch/anomaly）不变
- skill-entity-config.json 的实体类型系统不变（需要扩展但不需要推翻）

### 废弃的内容
- `assassin_basic`→重做为4段（当前3段）
- `shadow_step`→重做为`shadow_pierce`
- `smoke_bomb`→废弃（骗术师用decoy替代）
- `poison_dagger`→重做为`shadow_bind`
- `assassination`→重做为`midnight_raid`
- Energy资源→Shadow Force
- 所有旧技能ID将映射到新技能ID（存档兼容迁移脚本）

### 新增机制
- 完美闪避（Perfect Dodge）
- 弹反（Parry，Q键）
- 连击计数器（Combo Counter）
- 动画取消框架
- 毒催化机制（Catalyst）
- 引渡锚点/镜影结界/瘟疫传播等新玩法

---

## 附录B：设计参考游戏

| 游戏 | 参考元素 |
|------|----------|
| Lost Ark - Deathblade | 背后攻击焦点、身份量表、影袭冲刺 |
| Lost Ark - Reaper | 隐身爆发、分身干扰、高操作天花板 |
| DNF - Rogue (银月) | 连击点系统、Hit-and-Run风格 |
| DNF - Kunoichi (暗夜) | 影分身复读技能 |
| Sekiro: Shadows Die Twice | 弹反时机、完美格挡、高风险高回报 |
| Hades | 闪避i-frame精准判定、操作密度 |
| Devil May Cry | 动画取消、连击评分系统 |
| Dead Cells | 刺客高移速+脆皮定位+操作上限 |

---

**文档结束**

> 下一阶段：Review 后确认方案 → 进入 Phase 1（核心操作框架）实现。
