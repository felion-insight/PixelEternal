# 《Pixel Eternal》职业技能系统重构方案 v2.0

**文档版本**：v2.0  
**设计日期**：2026年6月26日  
**实现状态**：核心机制已落地（配置 + 运行时）

---

## 相对 v1.0 的核心变化

| 维度 | v1.0 | v2.0 |
|------|------|------|
| 技能槽位 | 14 槽（~120 技能） | **8 核心槽**（~63–80 技能） |
| 转职收益 | 倍率提升 | **技能形态进化**（20/40 级） |
| 传说被动 | 空泛描述 | **流派 Build 定义器** |
| 职业交互 | 各自为战 | **5 状态 + 6 联动反应** |
| 战斗节奏 | 纯伤害 | **击破 → 异常 → 强攻** 循环 |
| 装备 | 属性加成 | **改变技能行为**（流派核心装） |

## 8 核心技能槽

1. 普攻（Lv1）
2. 核心技能·壹（Lv3，20/40 进化）
3. 核心技能·贰（Lv6，20/40 进化）
4. 团队技能（Lv10）
5. 位移/生存（Lv15，20/40 进化）
6. 一转特色（Lv30）
7. 终极技能（Lv55）
8. 流派核心被动（Lv60）

## 战场定位

- **击破手** breaker：破防效率 ×2
- **强攻手** striker：破防窗口伤害 +50%
- **异常手** anomaly：状态效率 +40%，状态伤害 +30%
- **支援手** support：支援效果 +30%，冷却 -20%
- **速切手** switch：切换入场 3 秒 Buff

## 状态联动

| 状态 | 效果 |
|------|------|
| 灼烧 | 每秒火伤，4 秒 |
| 冻伤 | 移速/攻速降低，4 秒 |
| 感电 | 受击溅射，4 秒 |
| 中毒 | 可叠 5 层 DOT |
| 暗蚀 | 防御 -20%，4 秒 |

联动：热震、剧毒火焰、导电冻结、暗影电弧、凋零、混乱（详见 `config/status-synergy-config.json`）。

## 配置文件

| 文件 | 说明 |
|------|------|
| `config/class-config.json` | 职业 + battleRole + evolutionSlots |
| `config/skill-config.json` | 8 槽技能 + 进化路径 + progressions |
| `config/status-synergy-config.json` | 状态与联动 |
| `config/skill-combo-config.json` | 技能连携序列 |
| `config/class-build-equipment.json` | 流派核心装备 |

## 运行时模块

| 模块 | 职责 |
|------|------|
| `js/combat-status-system.js` | 状态施加、联动检测、DOT tick |
| `js/break-gauge-system.js` | 精英/Boss 破防条 |
| `js/skill-system.js` | 进化解析、连携记录、伤害整合 |

## 生成命令

```bash
node tools/gen-class-config.js
node tools/gen-skill-config.js
# 或（无 Node 环境）：
python tools/gen_configs_py.py
```

## 技能实体系统（v2.1）

**问题**：旧实现将火球/召唤等技能当作「自身中心 AOE 瞬伤」，抹杀空间博弈。

**解决**：每个技能必须声明 `entityType` + `entityConfig`。

| entityType | 行为 |
|------------|------|
| `projectile` | 飞行弹丸，碰撞/爆炸结算 |
| `summon` | 独立单位，AI 追击攻击 |
| `field` | 地面场域/地雷，持续或触发 |
| `instant` | 扇形/连锁等瞬击判定 |
| `blink` | 位移/隐身 |
| `charge` | 玩家本体冲撞 |

配置文件：`config/skill-entity-config.json`  
运行时：`js/skill-entity-system.js`

已实体化：火球术、盾击、冲锋、召唤狼/骷髅、冰冻陷阱、闪电链、暗影步等。

---

## 后续扩展

- [ ] 破防条 UI（血条下紫色护盾条）
- [ ] 流派被动完整战斗逻辑（血魔 HP 上限、惩戒神圣能量等）
- [ ] 装备 skillModifiers 运行时应用
- [ ] 全 28 职业进化技能补全至 ~80 条

---

完整设计细节见用户提供的 v2.0 重构方案原文。
