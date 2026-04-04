# Pixel Eternal — 恶魔塔深阶新怪物设计（汇总稿）

本文档汇总恶魔塔（240 层、怪物等级上限 60）的**深阶新怪策划**与**工程侧已落地**内容的对照。表中「建议/暂定」条目未必已全部实装；**以 `config/monster-config.json` 与 [`monsters-overview.md`](./monsters-overview.md) 为准**。`deployment/` 目录需与主工程配置保持同步。

---

## 一、设计前提与数值环境

### 1.1 与工程一致的规则

| 项目 | 说明 |
|------|------|
| 塔层上限 | `TOWER_MAX_FLOOR` 默认 240 |
| 怪物等级上限 | `MONSTER_MAX_LEVEL` 默认 60 |
| 楼层 → 等级上限 | 约线性：1 层≈1 级，240 层≈60 级（`maxMonsterLevelForFloor`） |
| 房内实际等级 | 普通战斗房将怪物 `boostMonsterTowardLevel` 到约 **[楼层上限−10, 楼层上限]**；生命/伤害约按 **每级 ×1.082** 放大 |
| **刷怪池限制** | 普通战斗房收集 `monsterData.level <= CONFIG.MONSTER_MAX_LEVEL`（默认 60）的非常规精英类型；单类型最早楼层见 `towerMinFloor` 或 `towerMinFloorForMonsterType` |
| 最早出现楼层 | `towerMinFloorForMonsterType` 对 `goblin` / `skeleton` / `orc` / `demon` 有前缀规则；**其余类型**可在 JSON 中写 **`towerMinFloor`** 覆盖 |

### 1.2 模板数值锚点

以现版 **恶魔霸主**（`demonOverlord`，模板约 1200 HP / 150 伤害 / 20 级）为基准：

- 深塔新怪同档模板可较旧恶魔线 **总威胁高约 0～15%**（用「脆高攻 / 肉低攻」错开）。
- 经验/金币建议在同级旧恶魔上每 **5 个模板等级** 约 **+12%～18%**；若担心高层刷金可略压低金币占比。

### 1.3 分阶与模板等级（建议）

| 阶段 | 建议楼层 | 模板等级（示意） | 说明 |
|------|-----------|------------------|------|
| 浅塔 | 1～40 | 1～20 | 已实现：哥布林～恶魔霸主 |
| 深塔 I | 41～100 | 25～30 | 恶魔强化线 + 机制入门 |
| 深塔 II | 101～170 | 35～45 | 机制组合、远程/变体 |
| 深塔 III | 171～240 | 50～60 | 终盘与高威胁机制 |

模板不必逐整数填满；**每阶 3～6 只**即可，中间层靠 boost 覆盖。

---

## 二、深塔恶魔线（第一组 · 核心扩展）

建议 `type` 使用 **`demon` 前缀**（如 `demonAbyssWarden`），便于与现有「恶魔 20 档 41 层起」规则衔接；若需 **61 层后** 才出现，再在 `towerMinFloorForMonsterType` 中按 id 或等级细分。

| 暂定名 | 建议模板等级 | 定位 | 机制概要 |
|--------|----------------|------|-----------|
| **深渊巡卫** | 25～28 | 坦克 | 略低于同级平均输出；纯数值向即可先落地 |
| **裂隙噬魂者** | 26～30 | 玻璃炮 | HP 约 −15%、伤害约 +20%，强调走位 |
| **灰烬先知** | 27～30 | 远程 | 读条直线火矢；伤害略低于同级近战；需加入 `RANGED_MONSTER_NAMES` |
| **虚空步卒** | 35～38 | 近战 | 移速 +10%、伤害 −5%（用属性表达「压迫走位」） |
| **熵能术士** | 38～42 | 远程 | 概念：第二发弱追踪弹，或缩短间隔的简化版 |
| **腐化督军** | 40～44 | 中高血量近战 | 命中附带 **约 2s 减速**（对标精英「王之践踏」量级减半） |
| **终焉看守** | 50～54 | 高 HP 中伤 | 血量 **低于 40%** 时攻击间隔 **−20%**（狂暴） |
| **星渊法师** | 52～56 | 远程 AOE | 瞄准落点范围伤害（对标精英爆裂法球，范围略大、伤害略低） |
| **湮灭骑士** | 55～60 | 中高攻防 | 概念：**正面扇形减伤**；工程量大时可先做「周期性护盾」 |

---

## 三、机制分类速查（第一组 + 通用）

| 机制 | 玩家对抗点 | 实现难度（相对现有代码） |
|------|------------|---------------------------|
| 远程直线 / 火矢 | 侧移 | 低：复用 `addMonsterProjectile` |
| 追踪弹射 / 二连射 | 拉开、掩体 | 中 |
| 命中减速 | 不贪刀 | 低：已有 `player.slowEffects` |
| 低血狂暴 | 控血线爆发 | 低～中：`Monster.update` 内按 HP% |
| 预警地面 AOE | 走出圈 | 中：可参考 `ELITE_TELEGRAPH_MS` 缩短版 |
| 正面减伤 / 护盾 | 绕背、破盾 | 高（朝向判定）/ 低（护盾条） |

**精英扩展方向**：为上述线路增加 `_elite` 变体，在 `EliteSkillRunner` 中增加 1～2 个技能，并扩展 **120+ 层** `elitePools.top`。

---

## 四、多主题杂项（第二组 · 种类扩展）

非恶魔主题可用独立 `type` 前缀 + `mappings.json` 贴图；**最早出现楼层**必须在 `towerMinFloorForMonsterType` 中声明。

### 4.1 主题怪

| 暂定名 | 意象 | 建议模板等级 | 职责 | 机制概念 |
|--------|------|----------------|------|-----------|
| **晶簇石像** | 魔晶寄生体 | 28～32 | 肉盾 | 站立叠「晶壳」减伤（上限 3），移动清空 |
| **锈链囚魂** | 锁链灵体 | 30～36 | 中速近战 | 每第 3 次普攻伤害 +40%，前两次偏弱 |
| **孢囊母体** | 真菌/腐殖 | 33～40 | 区域威胁 | 死亡留下 **毒雾** 3～5 秒 |
| **钟摆械偶** | 炼金机关 | 38～44 | 中高伤近战 | **已实装**：`clockworkSlasher`，`pendulumSweep`（非精英独立扇形预警 + 挥击，见下「已实现」） |
| **镜影残像** | 幻术 | 40～48 | 骚扰 | 低血分身；真身 **长 CD 闪现贴近** |
| **血蛭聚合体** | 血肉团 | 45～52 | 吸血坦 | 命中回复 **造成伤害的 8%～12%**（设上限防赖皮） |
| **缄默修士** | 禁魔邪教 | 48～55 | 干扰 | 光环：圈内玩家 **技能/冲刺感知变慢**，或先做攻速 −10% |
| **空壳朝圣者** | 空洞人形 | 52～58 | 自爆威胁 | 血量 <15% **缓慢追击**，接触或数秒后 **小范围爆炸** |

### 4.2 元素 / 环境变种

| 暂定名 | 元素 | 建议档位 | 机制概念 |
|--------|------|-----------|-----------|
| **霜缚猎犬** | 冰 | 26～34 | 近战；低概率 **强减速** 或极短冰冻 |
| **雷纹蝠群** | 电 | 32～40 | 远程；快弹低伤，**叠层** 触发额外小伤害 |
| **酸沼爬行者** | 酸 | 36～44 | 近战；走过留 **极短毒径** |
| **黑曜喷流** | 熔岩/暗 | 42～50 | 远程；**锥形短喷**，越近越痛 |
| **飓风灵** | 风 | 48～56 | 中程；单次 **吸引或推开**（二选一，注意与玩家位移冲突） |

### 4.3 行为标签型（易用数值区分）

| 标签 | 示例名 | 设计要点 |
|------|--------|----------|
| 刺客 | 隙间割喉者 | 高移速、低 HP；首击或背击加成（背击需朝向） |
| 炮台 | 塔基弩炮 | 低移速、高射程、长读条；近身弱化 |
| 队长 | 深塔巡察（`deepTowerMarshal`） | **已实装**：`allyDamageAura`（范围内非队长友军伤害 ×1.08，与命中减速并存） |
| 奖励怪 | 金瞳窃贼 | 死亡额外金币；本体偏脆 |
| 护盾怪 | 板甲魔卒 | 开场 **10% 最大生命护盾**，破盾前减伤、破盾后易伤 |

---

## 五、原「精英专属创意」机制（已按普通怪落地）

以下三项已从「仅创意」**实装为配置字段 + 运行时逻辑**（不限于精英房；精英变体可后续再做）。

| 方向 | 配置字段 / 逻辑要点 | 代表怪物 ID |
|------|---------------------|-------------|
| **双生缚命** | `twinSoulBond.tag`；`pairTwinSoulMonstersInRoom` 同 tag 两两绑定共享 `hp`；击杀只结算一次奖励 | `twinVesselLeft`、`twinVesselRight`（`bound_core_pair`） |
| **法阵祭司** | `soulCircleCaster`；`Game.addSoulCircle` / `updateSoulCircles`：圈内怪周期性回血、玩家叠减速 | `circlePriest` |
| **叛教圣骑** | `apostateStance`（`switchMs`、`blessingDamageTakenMult`、`judgmentOutDamageMult`）；祝福减伤 / 裁决加攻轮换 | `apostateFallenKnight` |

**说明**：同房间同 tag 的缚命体若为奇数只，**多出来的一只不配对**，按普通单体怪处理。

---

## 六、落地工程检查清单（维护用）

1. **`config/monster-config.json`**（及 **`deployment/config/`** 同步）：新怪字段齐全；精英加 `isElite`、`baseMonster`。
2. **`js/game-entities.js`**：`Room.generateRoom` 刷怪上限与 **`pairTwinSoulMonstersInRoom`**（战斗/精英房末尾）；`bindExtendedMonsterMechanics` 读取新 trait；`Room.update` 内 **`applyMarshalAurasToMonsters`**。
3. **`towerMinFloor`**（JSON）或 **`towerMinFloorForMonsterType`**（前缀规则）：控制最早出现楼层。
4. **远程怪**：中文名加入 **`RANGED_MONSTER_NAMES`**（`game-entities.js`）。
5. **`config/mappings.json`**：新 `type` 贴图映射；可暂用 `baseMonster` 继承贴图。
6. **需主循环/画布的机制**：如法阵接 **`game-main.js`**（`soulCircles`、绘制与 `updateSoulCircles`）。

---

## 七、分期建议

| 批次 | 内容 |
|------|------|
| 第一批 | 刷怪条件修复 + 3～4 只深塔恶魔线（纯数值或仅远程） |
| 第二批 | 减速、低血狂暴、地面残留、锥形喷吐等低风险机制 |
| 第三批 | 精英技能 + `elitePools` 扩展 + 主题怪（晶簇、孢囊等） |

---

## 八、已实现机制速查（代码入口）

| 机制 | 主要代码位置 |
|------|----------------|
| 双生缚命 | `pairTwinSoulMonstersInRoom`、`Monster.takeDamage`（`_twinSoulShared`） |
| 法阵 | `Monster._tickSpecialMechanics` → `addSoulCircle`；`Game.updateSoulCircles`、`drawGroundHazardsAndPendingAoE` |
| 叛教姿态 | `Monster.update`（伤害倍率）、`takeDamage`（祝福减伤）、`_tickSpecialMechanics`（切换计时） |
| 队长光环 | `applyMarshalAurasToMonsters`、`allyDamageAura` |
| 钟摆横扫 | `Monster._tickPendulumSweep`、`_drawPendulumTelegraph`、`attack` 中屏蔽预警期普攻 |

**与本节机制直接对应的配置 ID（示例）**：`twinVesselLeft`、`twinVesselRight`、`circlePriest`、`apostateFallenKnight`、`clockworkSlasher`；队长光环挂载在 **`deepTowerMarshal`（深塔巡察）**。其余深塔普通怪/精英见 `monster-config.json` 全文。

---

## 九、文档维护

- **状态**：本文兼顾策划表与**已落地**对照；新增/改动怪物请以 **`monster-config.json`** 与 **`monsters-overview.md`** 为权威。
- **关联代码**：`js/game-entities.js`（`Room`、`Monster`、`EliteSkillRunner`、`towerMinFloorForMonsterType`、`boostMonsterTowardLevel`、`bindExtendedMonsterMechanics`）、`js/game-main.js`（地面 hazard、延迟 AOE、**法阵** 等）、`js/config.js`、`config/game-config.json`。
