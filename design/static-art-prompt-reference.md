# Pixel Eternal 静态贴图 — AI 提示词参考稿

> **用途**：批量重绘 `asset/` 与 `assets/icons/` 下审计静态资源。  
> **管线**：`tools/generate_static_art_ai.py` → `art_generator.generate_image` → `process_transparent_icon_image`（正方形缩放 + 黑/白底 flood 透明）。  
> **最后更新**：2026-07-21

---

## 1. 为什么要按「游戏内比例」生图

游戏内所有图标容器均为 **正方形 + `background-size: contain`**（装备格 44–60px、技能格 24–44px、自走棋卡片 44px 等）。  
因此：

| 要求 | 说明 |
|------|------|
| **输出必须 1:1** | 后处理强制 `resize → N×N`，非正方形源图会被拉扁/拉长 |
| **主体居中** | 占画布 **65–75%**，四周留均匀边距，小尺寸下仍可读 |
| **纯黑底生图** | `#000000` 匀质背景，便于 flood-fill 抠透明；**禁止**白底、渐变天、UI 底框 |
| **禁止画框** | 不要圆形徽章底、不要 inventory plate、不要外圈装饰边框 |

---

## 2. 输出尺寸对照表（与代码一致）

| 类别 | 路径示例 | 输出边长 | 游戏内典型显示 | 宽高比 |
|------|-----------|----------|----------------|--------|
| 装备基型 | `asset/equipment/base/*.png` | **68×68** | 背包/装备栏 50–60px | **1:1** |
| 装备槽位占位 | `asset/equipment/slots/*.png` | **68×68** | 同上 | **1:1** |
| 武器类型 | `asset/equipment/types/*.png` | **68×68** | 武器槽 fallback | **1:1** |
| 主游戏技能 | `asset/skill_icons/*.png` | **68×68** | 技能面板 36px、热键 24px | **1:1** |
| 自走棋技能/遗物 | `asset/auto_battler/skills|relics/*.png` | **68×68** | 构筑卡片 44px | **1:1** |
| 药水 | `asset/potion_icons/*.png` | **68×68** | 背包格 50px | **1:1** |
| Buff | `asset/*.png`（buff 根目录） | **68×68** | 状态栏 | **1:1** |
| 职业层级图标 | `assets/icons/classes/*.png` | **64×64** | 选职 56px、转职树 24px | **1:1** |
| 自走棋节点 | `asset/auto_battler/nodes/*.png` | **48×48** | 地图节点 30px | **1:1** |
| 自走棋英雄/敌人 | `asset/auto_battler/heroes|enemies/*.png` | **96×96** | 战场圆形容器 ~32–70px | **1:1** |
| 自走棋场景背景 | `asset/auto_battler/scenes/{battle,shop,event}.png` | **1280×720** | 全屏 canvas / 商店·事件底层 | **16:9** |

> **场景背景特殊规则**：不走透明抠图；装饰仅分布在四边与四角，**中央约 65% 留空**（暗色地面），供棋盘与 UI 叠加。

环境变量：`PE_EXPORT_ICON_SIZE=68`（默认），勿随意改动除非同步改 UI。

---

## 3. 全局画风（所有类别共用）

### 3.1 正向关键词（英文，拼进 prompt）

```
Pixel art, dark fantasy RPG, retro 16-bit, limited color palette (6-12 colors per icon),
crisp pixel clusters, no anti-aliasing, no photorealism, no 3D render,
square 1:1 composition, single subject centered, subject fills about 70% of frame,
solid pure black background (#000000) flat uniform behind subject only,
no text, no numbers, no watermark, no UI frame, no decorative border, no circular badge plate
```

### 3.2 负向关键词（程序已内置部分，可追加）

```
photorealistic, 3d render, vector gradient, smooth illustration, anime screenshot,
white background, gray gradient background, inventory slot frame, circular emblem plate,
multiple items, character full body, busy scene, motion blur, lens flare,
text, letters, stars, level numbers, element symbols, decorative corners
```

### 3.3 后处理（自动，无需写进 prompt）

1. 缩放到目标 N×N（`NEAREST`，保持像素锐度）  
2. 从四边 flood-fill：RGB≤32 或 RGB≥248 → alpha=0  
3. 输出 RGBA PNG  

---

## 4. 分类提示词模板

以下 `{…}` 由 `generate_static_art_ai.py` 的 `build_task()` 自动填充。

### 4.1 装备基型 — 武器 `equipment/base`（slot=weapon）

**模板（英文）**  
```
{EQUIPMENT_WEAPON_TEXTURE_STYLE_TEMPLATE},
{weapon_type} fantasy weapon, design inspired by "{item_name}",
isolated weapon only, diagonal or vertical pose, no hand, no character,
square 1:1, centered, 70% frame fill, pure black background
```

**示例**  
- `longsword fantasy weapon, design inspired by "Arcane Axe", isolated weapon only…`

**避免**：多把武器、持握的手、战场、发光全屏特效。

---

### 4.2 装备基型 — 防具/饰品 `equipment/base`（非 weapon）

**模板**  
```
{EQUIPMENT_NON_WEAPON_TEXTURE_STYLE_TEMPLATE},
{slot} piece: {slot_hint}, inspired by "{item_name}",
45-degree top-down inventory still-life, single piece only,
square 1:1, centered, pure black background
```

**slot_hint 对照**：helmet / chest armor / gauntlets / boots / amulet / ring / belt / shield

---

### 4.3 装备槽位 UI `equipment/slots`

极简 **槽位语义图标**（非具体装备），用于空槽 fallback。

```
{SKILL_ICON_CORE_TEMPLATE},
minimalist {slot} slot emblem, simple silhouette icon, UI glyph style,
square 1:1, centered, pure black background, no ornate frame
```

---

### 4.4 武器类型 `equipment/types`

```
{SKILL_ICON_CORE_TEMPLATE},
{weapon_type} category icon, simple weapon silhouette for RPG filter UI,
square 1:1, centered, pure black background
```

---

### 4.5 主游戏技能 `asset/skill_icons`（28 项，中文名）

```
{SKILL_ICON_CORE_TEMPLATE},
skill icon for Chinese ability "{skill_name_cn}",
visual metaphor: {one_line_effect_description},
single magical effect emblem, square 1:1, centered, pure black background
```

**示例**  
- `skill icon for "崩山击", visual metaphor: crushing shockwave slash, …`  
- `skill icon for "永冻新星", visual metaphor: frost nova ring, …`

**原则**：一个技能 = 一个清晰符号（火焰/冰霜/箭矢/暗影），不要画成整屏技能截图。

---

### 4.6 自走棋技能 `auto_battler/skills`

```
{SKILL_ICON_CORE_TEMPLATE},
auto battler skill "{name_en}": {description},
{aoe|single target} ability emblem,
square 1:1, centered, pure black background
```

---

### 4.7 自走棋遗物 `auto_battler/relics`

```
{SKILL_ICON_CORE_TEMPLATE},
relic trinket "{name}", {description}, rarity {rarity},
small ornate talisman icon, square 1:1, centered, pure black background
```

---

### 4.8 职业层级图标 `assets/icons/classes`（64×64）

```
{SKILL_ICON_CORE_TEMPLATE},
class job emblem for "{class_name_cn}" ({class_id}),
iconic class silhouette or symbol (not full portrait),
gold accent trim optional, square 1:1, centered, pure black background,
readable at 24px
```

**层级说明**：含 4 基础 + 12 一转 + 12 二转，共 28 张；风格需 **同一系列**（线宽、对比度、调色板一致）。

---

### 4.9 自走棋地图节点 `auto_battler/nodes`（48×48）

```
{SKILL_ICON_CORE_TEMPLATE},
roguelike map node icon: {node_type_hint},
simple bold symbol for small map marker, square 1:1, centered, pure black background
```

| node | 视觉 |
|------|------|
| battle | 交叉剑 |
| elite | 紫色精英纹 |
| rest | 篝火 |
| event | 问号/卷轴 |
| shop | 金币/袋子 |
| boss / boss_final | 骷髅/王冠 |

---

### 4.10 自走棋英雄 / 敌人（96×96）

**英雄**  
```
{MONSTER_TEXTURE_STYLE_TEMPLATE},
chibi hero sprite, {class_cn} adventurer, signature weapon visible,
cute but fierce, full body standing, square 1:1, centered, pure black background
```

**敌人**  
```
{MONSTER_TEXTURE_STYLE_TEMPLATE},
{MONSTER_BOSS_EXTRA if boss},
enemy "{name}", roguelike mob, menacing readable silhouette,
square 1:1, centered, pure black background
```

---

### 4.11 药水 `potion_icons`

```
{SKILL_ICON_CORE_TEMPLATE},
{potion_type} potion bottle, glass flask, glowing liquid,
consumable icon, square 1:1, centered, pure black background
```

---

### 4.12 Buff 图标 `asset/{buff_key}.png`

```
{SKILL_ICON_CORE_TEMPLATE},
{BUFF_ICON_PROMPTS[key]} — RPG buff status symbol,
square 1:1, centered, pure black background
```

---

### 4.13 自走棋场景背景 `auto_battler/scenes`（1280×720，16:9）

**用途**：战斗（含精英/Boss）、商店、事件房间全屏背景；中央留空供棋盘/UI。

**正向模板（英文）**

```
{MONSTER_TEXTURE_STYLE_TEMPLATE}, 16:9 widescreen pixel art dark fantasy roguelike room background for {场景中文名},
{四边装饰 — 见下表}, center 65 percent empty plain dark stone floor with minimal texture,
no characters no UI no text no central props no throne in middle, subtle edge vignette
```

| 文件 | 边缘装饰 |
|------|----------|
| `battle.png` | stone pillars and torch sconces on left/right edges, cracked arena arches at top corners, broken weapon racks along bottom edge only |
| `shop.png` | wooden shelves with potions and coin sacks on left/right edges, lantern hooks at top corners, merchant crates along bottom edge only |
| `event.png` | glowing rune pillars at four corners, floating crystal shards along top/bottom edges, mystic banners on side edges only |

**负向（追加）**：characters, monsters, UI panels, text, busy center, large central object, boss throne in middle

**后处理**：`process_scene_background_image` → 1280×720 RGB PNG，**不**抠透明。

---

## 5. 批量重绘命令

```bash
# 1. 预览待生成项与 prompt（不调用 API）
python tools/generate_static_art_ai.py --dry-run --force

# 2. 清除旧图并全量重绘（约 276 项，含 28 主游戏技能）
python tools/generate_static_art_ai.py --clear-first --force --sleep 3

# 3. 仅重绘某一类
python tools/generate_static_art_ai.py --force --category equipment_base --sleep 2

# 4. 审计缺失
python tools/audit_static_assets.py --missing-only
```

日志建议：`tools/static-art-ai-regen.log`

---

## 6. 质量自检清单（人工 spot-check）

- [ ] 文件尺寸与上表一致（1:1）  
- [ ] 四角/边缘无白块、无灰底圆角框  
- [ ] 缩放到 44px 仍辨认主体  
- [ ] 同类别图标风格统一（装备之间、技能之间）  
- [ ] 职业 28 图标线宽/对比度一致  

---

## 7. 与旧版差异（为何重绘）

| 旧问题 | 新规范 |
|--------|--------|
| 程序化占位带深色 UI 底框 | 禁止 plate/frame，纯黑底 + 抠图 |
| AI 图白底/渐变底 | 强制 `#000000`，后处理双阈值 |
| 主体过小或贴边 | 明确要求 70% 居中 |
| 非 1:1 源图被拉伸 | 分类固定输出边长 |
| prompt 堆叠 `highly detailed ornate` 导致杂乱 | 改为 limited palette + readable silhouette |

---

## 8. 相关文件

| 文件 | 作用 |
|------|------|
| `tools/generate_static_art_ai.py` | 批量 prompt 与尺寸 |
| `tools/art_generator.py` | 画风模板、API、后处理 |
| `tools/audit_static_assets.py` | 资产审计 |
| `tools/clear_static_art.py` | 清除旧 PNG |
| `js/static-art-processor.js` | 运行时补抠（白/黑/边缘色） |
