# Pixel Eternal - 像素永恒

基于 HTML5 Canvas 的像素风游戏。  
**现行主循环**：四人编队自走棋 Roguelike（恶魔塔）——开战前布阵，战斗自动进行；局外从零开荒，局内养构筑。

> 旧版单人实时 ARPG（WASD 爬塔、铁匠/NPC 经济等）已归档至 `archive/legacy/js/`，不再从主入口加载。

## 快速开始

### 重要提示

**不能直接双击打开 HTML 文件。** 受浏览器 CORS 限制，必须通过本地服务器访问。

### 运行方法

#### 方法 1：启动脚本（推荐）

```bash
python start-server.py
# 或
./start-server.sh
```

脚本会启动本地服务器（默认端口 8000）并打开浏览器。

#### 方法 2：Python 内置服务器

```bash
python -m http.server 8000
```

访问：`http://localhost:8000/index.html`

#### 方法 3：Node.js

```bash
npx http-server -p 8000
```

访问：`http://localhost:8000/index.html`

按 `Ctrl+C` 停止服务器。

## 怎么玩（最短路径）

1. 进入主城，交互 **开始攀塔**
2. 每层在战斗 / 休息 / 商店 / 事件 / 精英等节点中三选一
3. 开战前调整四人站位，观看自动战斗
4. 有人阵亡后尽快去 **休息** 复活并分配等级点
5. 用技能、装备、遗物成型，打过四章 Boss
6. 通关或失败后构筑清空，再开一局从零养局

**Ascension 扩展**（可通过 `config/ascension-config.json` 开关）：指挥官指令、瞬间结算、Boss 阶段、遗物协同、区域生态、腐化/契约、战前情报、死亡叙事与事件链等。详见 [Pixel_Eternal_Ascension_Design_Doc.md](Pixel_Eternal_Ascension_Design_Doc.md)。

## 文档

| 文档 | 说明 |
|------|------|
| [docs/游戏总览与玩法.md](docs/游戏总览与玩法.md) | **现行玩法与系统总览（推荐）** |
| [PROJECT.md](PROJECT.md) | 工程结构、主循环摘要、遗留 ARPG 说明 |
| [design/](design/) | 设计草案（部分可能过时，以代码为准） |
| [docs/](docs/) | 装备、怪物等专题参考 |

## 开发与测试

```bash
# 自走棋地图 / 遭遇冒烟
node tools/test_tower_run_map.js

# Ascension 系统回归（开关回滚 + 命名空间）
node tools/test_ascension_systems.js

# 爬塔平衡报告（写入 artifacts/）
node tools/test_auto_battler_balance.js
node tools/test_auto_battler_balance.js --quick --climb-only
```

常用工具：

- `tools/sync_deployment.py` — 同步到 `deployment/`
- `tools/art_generator.py` — 美术资源相关
- `tools/export_equipment_csv.py` — 装备数据导出

主配置：

- `config/auto-battler-config.json`
- `config/auto-battler-encounters.json`
- `config/ascension-config.json`（Ascension 功能开关）

## 技术栈

- HTML5 + CSS + 原生 JavaScript
- Canvas 2D 渲染
- LocalStorage 存档（支持导出/导入，LZ-String 压缩）

## 仓库说明

- 默认开启自走棋恶魔塔（`auto-battler-config.json` → `enabled: true`）
- 完整单人 ARPG（实时操作、旧塔、秘境、铁匠等）代码仍在库中，关闭自走棋后可走旧主城入口
- 发布产物目录：`deployment/`
