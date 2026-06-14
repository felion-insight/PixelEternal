# Pixel Eternal 设计文档

本文件夹包含《Pixel Eternal》完整设计文档，按阅读顺序排列：

## 文档索引

| # | 文档 | 内容 | 状态 |
|---|------|------|------|
| 1 | [class-system-design.md](./class-system-design.md) | 职业体系：4基础→12一转→12二转，团队定位，转职流程 | ✅ |
| 2 | [skill-system-design.md](./skill-system-design.md) | 128个职业技能：四大资源系统，Lv1~60完整技能表 | ✅ |
| 3 | [equipment-system-rework.md](./equipment-system-rework.md) | 装备重构：基型/词缀前缀后缀Tier/传奇威能/2-4件套装/10槽位 | ✅ |
| 4 | [growth-and-gameplay.md](./growth-and-gameplay.md) | 成长曲线/职业选择流/转职接入/天赋系统/主城扩建/UI重设计 | ✅ |
| 5 | [dungeon-and-progression.md](./dungeon-and-progression.md) | 副本体系(日常/周常/深渊/裂隙/远古遗迹)/强化+20系统/装备突破觉醒/徽记/回路/材料体系 | ✅ |
| 6 | [equipment-class-adaptation.md](./equipment-class-adaptation.md) | 装备适配第一版（已被第3篇取代，存档参考） | 📦 |

## 阅读顺序建议

```
职业体系 → 技能设计 → 装备重构 → 成长玩法 → 副本与养成
```

## 全局概览

```
职业系统 (28职业)
    │
    ├── 4 基础 → 12 一转 → 12 二转
    ├── 20级/40级 双转职
    └── 团队定位：坦/治疗/近战DPS/远程DPS/辅助

技能系统 (128技能)
    │
    ├── 怒气/集中值/法力/能量 四资源
    ├── Lv1~60 完整技能树
    └── 技能强化 +1~+5

装备系统 (重构)
    │
    ├── 10槽位（主手/副手/头/身/手/腿/足/护符/指环/腰带）
    ├── 6稀有度（普通→神话）
    ├── 基型系统（16武器基型 × 3防具基型）
    ├── 词缀前缀/后缀 + T1~T5
    ├── 传奇威能：提取/刻印
    └── 2/4件套装，10套可混搭

成长与玩法
    │
    ├── 经验曲线平滑化 + 职业属性分化
    ├── 职业选择流程 + 转职试炼
    ├── 天赋系统：3分支×6层，20点自由分配
    ├── 主城扩建：+3 NPC + 觉醒之门
    └── UI重设计：技能栏/角色面板/资源条

副本与养成 (新)
    │
    ├── 日常副本 ×4：强化石矿洞/徽记遗迹/回路工坊/金币金库
    ├── 周常副本 ×3：守护者试炼/远古龙巢/终焉之塔
    ├── 深渊副本 ×4：装备+徽记+回路掉落
    ├── 裂隙副本：随机词缀+奖励翻倍
    ├── 远古遗迹 ×3：职业专属+觉醒材料
    ├── 强化系统：+0→+20，6段保护
    ├── 装备突破：突破1(+10)/突破2(+15)/觉醒(+18)
    ├── 徽记系统：3孔(红·蓝·金)，5品质
    └── 回路系统：4槽(攻/防/机动/资源)，5等级
```

## 涉及文件清单

### 新建配置
- `config/class-config.json` — 28职业定义
- `config/skill-config.json` — 128技能定义
- `config/base-types.json` — 装备基型
- `config/affix-pool.json` — 词缀池
- `config/legendary-powers.json` — 传奇威能池
- `config/set-config-v2.json` — 新套装(2/4件)
- `config/dungeon-config.json` — 副本定义
- `config/material-config.json` — 材料定义
- `config/enhance-config.json` — 强化表
- `config/sigil-config.json` — 徽记池
- `config/circuit-config.json` — 回路池
- `config/awakening-config.json` — 觉醒效果池

### 修改代码
- `js/data-classes.js` — Equipment类重构
- `js/game-entities.js` — Player类新增职业/资源/技能/天赋
- `js/game-main.js` — UI/键盘绑定/掉落/主城扩建/副本入口
- `js/config-loader.js` — 新增配置加载
- `index.html` — 新增UI元素
- `styles.css` — 新增样式

### 资源新增
- `asset/` — 职业图标/技能图标/徽记图标/材料图标
