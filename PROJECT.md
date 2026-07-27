# Pixel Eternal - 像素永恒

## 项目概述

Pixel Eternal（像素永恒）是一款基于 HTML5 Canvas 的像素风游戏。

**现行默认主循环**：四人编队 · 开战前布阵 · 战斗自动进行的 **自走棋 Roguelike（恶魔塔）**。

旧版单人 ARPG 模块已移至 `archive/legacy/js/`，主入口 `index.html` 仅加载自走棋相关脚本与 UI。

设计核心：

- **局外几乎不养成**（每次从 Lv.1 开荒）
- **局内养局**（站位、技能、装备、遗物、休息处加点）
- **战斗交给算法**（玩家主要决策路线与布阵）

更完整的玩法说明见：[docs/游戏总览与玩法.md](docs/游戏总览与玩法.md)

---

## 游戏架构

### 技术栈

- **前端**：HTML5 + CSS + 原生 JavaScript
- **渲染**：Canvas 2D
- **存储**：LocalStorage（支持存档导出/导入，LZ-String 压缩）
- **无独立游戏引擎 / 无强制 Node 依赖**（本地用 Python HTTP 服务即可）

### 核心文件结构

```
Pixel Eternal/
├── index.html                 # 主页面
├── styles.css                 # 样式
├── start-server.py            # 本地开发服务器
├── deploy.py                  # 部署脚本
│
├── js/                        # 游戏逻辑
│   ├── init.js / game-main.js # 初始化与主循环
│   ├── game-entities.js       # 实体与主城建筑
│   ├── config-loader.js       # JSON 配置加载
│   ├── party-meta-system.js   # 四人局外数据（强制 Lv.1）
│   ├── run-state-system.js    # 单局状态 / 休息加点
│   ├── tower-run-map.js       # 动态三选一地图
│   ├── auto-battler-*.js      # 自走棋流程 / UI / 事件
│   ├── ascension-hub.js       # Ascension 集成枢纽与开关
│   ├── commander-mode.js / juice-core.js / synergy-matrix.js …
│   ├── auto-battle-simulator.js
│   ├── relic-system.js / skill-mutation-system.js
│   ├── enemy-composition-system.js
│   └── …                      # 职业、技能、旧 ARPG 模块等
│
├── config/
│   ├── auto-battler-config.json      # 自走棋主配置
│   ├── auto-battler-encounters.json  # 遭遇编成
│   ├── ascension-config.json         # Ascension 功能开关
│   ├── commander-config.json / juice-config.json / …
│   ├── game-config.json / class-config.json / skill-config.json
│   └── …                      # 装备、怪物、秘境等（多用于旧模式）
│
├── asset/
│   ├── auto_battler/          # 自走棋专用贴图
│   └── …                      # ARPG 装备/技能/怪物等
│
├── design/                    # 设计草案（部分可能过时，以代码为准）
├── docs/                      # 总览与专题文档
├── tools/                     # 平衡测试、同步、生成工具
├── artifacts/                 # 测试报告输出（默认 git 忽略）
└── deployment/                # 部署产物
```

---

## 现行主循环：恶魔塔（自走棋）

### 入口

1. 主城（自走棋模式下建筑极简）
2. 交互 **「开始攀塔」**
3. 直接开局（无独立编队大厅）

### 一局流程

```text
开局（四人满血 Lv.1，仅起始技能）
  → 动态生成可选节点（通常三选一）
  → 选择节点
      ├─ 战斗 / 精英 / Boss：布阵 → 自动战斗 → 奖励
      ├─ 商店：局内金币购买
      ├─ 事件：叙事选项
      └─ 休息：分配等级 / 回血（可复活）/ 升星 / 离开
  → 生成下一层选项 → 循环
  → 通关最终 Boss 或战败 / 放弃 → 结算 → 回城（构筑清空）
```

### 章节结构（Ascension 压缩约 35 步）

| 章节 | 名称 | Boss 前步数 | 区域 ID |
|------|------|------------:|---------|
| 1 | 灰烬荒原 | 9 | ashen_wastes |
| 2 | 熔岩裂谷 | 9 | magma_rift |
| 3 | 虚空深渊 | 9 | void_abyss |
| 4 | 终末王座 | 4 | throne_of_end |

地图不预生成整图；按章节节拍动态生成，并带精英上限、强制休息/商店等约束。

### 节点类型

| 类型 | 说明 |
|------|------|
| 战斗 | 常规战；金币 + 技能/装备向奖励；入门章小胜可回血（不复活） |
| 精英 | 高收益；主产遗物三选一 |
| 休息 | 分配等级点、回血（可复活）、技能升星 |
| 商店 | 购买装备/遗物 |
| 事件 | 风险与收益选项 |
| Boss / 最终 Boss | 章末与通关战 |

### 布阵与战斗

- 棋盘 **4×3**，横向（左己右敌）；row 0 前排、row 2 后排
- 开战前拖拽站位；开战后自动寻敌/普攻/技能（最长约 90 秒）
- **阵亡角色不能再上场**；休息处可复活
- 默认站位：战士前排、刺客中排、弓箭手/法师后排

### 局内养成

| 资源 | 说明 |
|------|------|
| 金币 | 战斗/事件获得，商店消费 |
| 等级点 | 战斗经验转化；**仅休息处**分配；局外不保留 |
| 技能 | 最多 4 主动槽；可升星/进化 |
| 装备 | 局内槽位（武器与防具等） |
| 遗物 | 队伍被动；软上限约 16 |

**无经验银行**：每次开局全体 Lv.1，转职清空。

### 四人职业

| 职业 | 定位 | 起始主动 |
|------|------|----------|
| 战士 | 前排承伤 | 盾击 |
| 刺客 | 中排切入，偏后排索敌 | 暗影穿刺 |
| 弓箭手 | 后排远程 | 后撤射击 |
| 法师 | 后排法术 | 火球 |

---

## 主城

### 自走棋开启时（默认）

仅保留 **开始攀塔**。顶栏提示：等级在休息处分配。

### 自走棋关闭时（完整 ARPG 主城）

仍包含恶魔塔入口、铁匠铺、商店、训练场、材料秘境、技能训练师、附魔师、转职官、珠宝匠、编队大厅、编年史、觉醒之门等。

---

## 遗留 ARPG 系统（非默认主路径）

以下系统代码与资源仍在库中，供旧模式或资源复用。

### 实时操作

- 移动 WASD、攻击 J、冲刺 K、武器技能 Q、交互 E
- 战力综合等级与装备显示

### 旧恶魔塔房间

战斗房、宝箱房、休整房、炼金房等（实时清怪推进）。

### 装备与背包

- 多部位装备、品质、词缀、套装、传奇威能
- 强化 / 精炼 / 打造；材料与消耗品（药水、许可证、图纸等）

### 材料秘境

分难度 Boss 战，消耗攻略许可证，掉落打造材料。

### 炼金 / 商店（ARPG）

多材料炼药；商店装备与随机礼箱、出售等。

更细说明见历史章节与 `docs/` 下装备等专题（注意与现行自走棋差异）。

---

## 关键配置与工具

| 路径 | 用途 |
|------|------|
| `config/auto-battler-config.json` | 自走棋主配置（章节、奖励、缩放、技能/遗物等） |
| `config/auto-battler-encounters.json` | 遭遇编成 |
| `tools/test_auto_battler_balance.js` | 爬塔平衡自动测试 |
| `tools/test_tower_run_map.js` | 地图/遭遇冒烟测试 |
| `tools/sync_deployment.py` | 同步到 `deployment/` |

```bash
# 平衡测试示例
node tools/test_auto_battler_balance.js
node tools/test_tower_run_map.js
```

---

## 配置常量（节选）

```javascript
// 自走棋（见 auto-battler-config.json）
board: 4 cols × 3 rows
combat.maxDurationMs: 90000
run: 约 53 层；Boss 层 15 / 30 / 45 / 52
rewards.inRunExpPerLevel: 180
rewards.inRunLevelCap: 8
rewards.restHealPct: 0.4

// 全局画布等（见 config.js / game-config）
CANVAS_WIDTH / CANVAS_HEIGHT 等
```

---

## 快捷键（通用 UI）

| 按键 | 功能 |
|------|------|
| E | 交互（主城建筑等） |
| B | 背包（ARPG UI） |
| H | 图鉴 |
| G | 游戏指导 |
| F1 | 开发者模式 |
| ESC | 关闭弹窗 |

自走棋局内主要用鼠标：选路、布阵、领奖励、休息分配。

---

## 开发说明

### 运行游戏

不能直接双击打开 HTML（`file://` CORS 限制）。请用本地服务器：

```bash
# 推荐
python start-server.py
# 或
python -m http.server 8000
```

访问 `http://localhost:8000/index.html`。

### 其他

- 存档支持导出/导入
- 自走棋贴图在 `asset/auto_battler/`
- 玩法总览：[docs/游戏总览与玩法.md](docs/游戏总览与玩法.md)
- 设计草案：`design/`（以代码与配置为准）
