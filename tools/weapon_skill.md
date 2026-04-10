# Pixel Eternal — 武器技能图标生成辅助文档

本文档基于 `weapon-skills-reference.md` 及项目统一的暗黑像素风标准，旨在指导美术/策划人员为所有武器主动技能生成风格统一、符合游戏内视觉规范的图标，并正确集成到 `config/skill-icon-config.json` 中。

---

## 一、全局规则与约束

### 1. 画风与尺寸
- **风格**：暗黑像素风，16-bit，高对比，边缘锐利，无抗锯齿。
- **背景**：纯黑（`#000000`），工具后处理会自动将黑色转为透明，最终为透明背景 PNG。
- **尺寸**：最终游戏内使用 **68×68 像素**（由环境变量 `PE_EXPORT_ICON_SIZE` 控制）。  
  建议生成时使用 512×512 或 1024×1024，再由工具缩放（NEAREST 算法）至目标尺寸。
- **构图**：居中，主体突出，避免复杂背景或 UI 元素。

### 2. 文件存放与命名
- **根目录**：`asset/skill_icons/`
- **文件名**：`<技能中文名>.png`（例如 `崩山击.png`、`追风箭.png`）。
- **映射配置**：`config/skill-icon-config.json` 中的 `SKILL_ICON_MAP` 对象，键为技能中文名，值为文件名（含扩展名）。

### 3. 与现有工具兼容
- 项目已提供 `art_generator.py`，支持批量生成技能图标。  
  **自然语言：** `python tools/art_generator.py "生成所有武器技能的图标"`  
  **推荐 CLI（不依赖自然语言解析）：**
  - `python tools/art_generator.py --batch-weapon-skill-icons` — 标准武器技能（含品质兜底），按 `castMode` 注入构图约束（对齐本文第二节 A/B/C）。
  - `python tools/art_generator.py --batch-deep-weapon-skill-icons` — 深阶「主题·后缀」技能名；默认仅 `legendary`（可用 `--deep-weapon-skill-qualities all` 展开）；`--deep-weapon-skill-kind` 取 `both|melee|ranged`。
  - `python tools/art_generator.py --weapon-skill 崩山击` — 单张生成；深阶须写全名如 `渊隙·终焉裁断`。
  - `python tools/art_generator.py --list-missing-deep-weapon-skill-icons` — 仅列出深阶候选中缺失项。
  - 与上述批量/单张联用 `--force-weapon-skill-icons` 可覆盖已有 PNG 与映射。
  上述流程会：
  - 从 `js/data-classes.js` 解析技能与 `castMode`（及深阶主题表）；
  - 对比已有映射，只对缺失项生图（除非 `force`）；
  - 自动后处理为 68×68 透明 PNG；
  - 写入 `skill-icon-config.json` 并记录日志到 `asset/skill_icons/logs/`。
- 如需手动生成，可参照本文档的提示词模板。

---

## 二、技能图标的视觉设计原则

### 1. 依据释放形态（`castMode`）决定构图骨架

| 形态 | 图标构图建议 | 示例元素 |
|------|-------------|----------|
| `target_lock` | 中心指向性（箭头、准星、射线、锁定标记） | 箭头、十字准星、贯穿线、单点爆发 |
| `radial` | 圆形/环形扩散，以角色为中心 | 冲击波、圆环、旋风、星爆、新星 |
| `ground_aoe` | 地面落点（法阵、陨石坑、瞄准圈） | 地面裂纹、符文阵、坠击点、爆炸范围 |

### 2. 根据技能描述提炼核心元素
每个技能图标应突出 1~2 个核心关键词，例如：
- 元素：火焰、冰冻、雷电、暗影、神圣、虚空
- 动作：斩击、穿刺、射击、爆发、回旋
- 效果：暴击、治疗、减速、加速、锁定

### 3. 远程与近战的隐含区别
- 远程武器技能（如 `追风箭`、`暗影贯穿`）即使形态为 `target_lock`，也应体现**箭矢/弹道**元素，而非近战劈砍。
- 近战技能则可强调刀光、剑气、重击等。

### 4. 品质与传说感
- 普通/稀有技能：简洁，光效弱，装饰少。
- 史诗/传说技能：可加入华丽光晕、粒子、符文、多重特效。

---

## 三、分类型图标提示词模板

以下模板可直接用于 `art_generator.py` 的单次生成或批量规划。  
固定风格前缀（工具自动添加）：
```
Pixel art skill icon, retro 16-bit style, ultra-detailed pixel clusters, clean central composition, solid pure black background, no text, no borders, minimalistic design, razor-sharp edges
```

### 模板 A：单体锁定（`target_lock`）
```
[核心元素] 作为主体，[方向性元素] 指向中心，[特效元素]，暗黑像素风
```
**示例（崩山击）**：
> 巨剑重劈，崩裂大地，中心锁定标记，暗黑像素风

### 模板 B：周身范围（`radial`）
```
[核心元素] 呈环形向外扩散，[中心主体可选]，[特效元素]，暗黑像素风
```
**示例（银月弧光）**：
> 银色月牙弧光，环形斩击，周身扩散，暗黑像素风

### 模板 C：地面范围（`ground_aoe`）
```
[落点元素] 位于画面中央地面，[范围标记如圆环/法阵]，[特效元素]，暗黑像素风
```
**示例（烬灭天火）**：
> 天火陨石砸向地面法阵，火焰爆发，地面裂纹，暗黑像素风

### 模板 D：通用品质兜底（适用于未具名技能）
- 品质 common：`简单武器光影，单体重击`
- 品质 rare：`武器锋芒，战意光效`
- 品质 fine：`闪电刀光，暴击火花`
- 品质 epic：`炎狱风暴，环形火焰`
- 品质 legendary：`天罚光柱，落点神圣裁决`

---

## 四、深阶武器技能图标批量生成策略

深阶武器技能数量极大（近战 40 种后缀 × 8 档 = 320 组合，远程同理），**不建议为每个组合单独设计图标**。推荐以下分层策略：

### 1. 按主题档（8 个主题）设计系列图标基底
每个主题对应一种**主色调与装饰纹样**，例如：

| 主题 | 主色调 | 纹样/元素 |
|------|--------|------------|
| 渊隙 | 暗紫 + 黑 | 发光裂缝、岩石碎片 |
| 虚印 | 银蓝 + 白 | 符文、幽灵轮廓 |
| 腐噬 | 暗绿 + 锈棕 | 菌斑、黏液、腐蚀孔 |
| 黑曜 | 纯黑 + 暗红 | 黑曜石棱角、岩浆纹 |
| 终幕 | 深紫 + 暗金 | 帷幕褶皱、布纹 |
| 星骸 | 深蓝 + 银 | 星点、陨铁裂纹 |
| 裂点 | 暗蓝 + 银灰 | 闪电裂痕、破碎晶体 |
| 终焉 | 暗红 + 焦黑 | 日蚀纹、燃烧余烬 |

### 2. 根据释放形态（`radial` / `ground_aoe` / `target_lock`）复用构图模板
将主题色/纹样套入上述 A/B/C 模板，即可生成具有主题特征且形态正确的图标。

**示例（渊隙·radial 技能）**：
> 暗紫色发光裂缝呈环形扩散，中心岩石碎片，暗黑像素风

### 3. 品质差异仅通过光效强度与细节密度体现
- 凡/良：无光或微弱光，简单纹样
- 湛/炽：明显光效，精密纹样，少量宝石/符文
- 曜：强烈光晕，粒子飘浮，复杂结构

### 4. 实现方式
- **手动批量**：编写脚本，按主题+形态+品质组合循环，调用 `art_generator.py` 或直接调用底层 `generate_image`。
- **利用现有工具**：由于深阶技能名动态生成，无法预先全部录入 `skill-icon-config.json`。可在游戏运行时，若某深阶技能无独立图标，则根据其主题、形态、品质**动态合成**一个图标（例如使用一个基础图叠加颜色与光效）。  
  若仍需静态图标，建议只为**传说品质的深阶技能**（共 8 个主题 × 2 种武器类型 = 16 个）生成独立图标，其余使用默认主题图标。

---

## 五、与项目工具的集成步骤

### 1. 使用 `art_generator.py` 批量生成缺失图标（推荐）
```bash
python tools/art_generator.py --batch-weapon-skill-icons
# 或自然语言：
python tools/art_generator.py "生成所有武器技能的图标"
```
工具会自动：
- 解析 `data-classes.js` 中所有技能与 `castMode`，并向 GPT 注入本文 A/B/C 构图约束；
- 对比 `skill-icon-config.json`，只生成缺失的（加 `--force-weapon-skill-icons` 可重绘）；
- 为每个技能调用 GPT 规划提示词（已内置画风模板）；
- 后处理为 68×68 透明 PNG；
- 写入配置并记录日志到 `asset/skill_icons/logs/`。

深阶静态图标（可选，默认只生成传说档以控制数量）：
```bash
python tools/art_generator.py --batch-deep-weapon-skill-icons
python tools/art_generator.py --batch-deep-weapon-skill-icons --deep-weapon-skill-qualities all --deep-weapon-skill-kind melee
```

### 2. 手动生成单个技能图标
```bash
python tools/art_generator.py --weapon-skill 崩山击
# 或自然语言：
python tools/art_generator.py "生成崩山击技能图标，暗黑像素风"
```
可指定具体技能名称；深阶技能使用 `--weapon-skill 渊隙·终焉裁断` 等形式。

### 3. 更新已有图标映射
若手动添加图片文件，需在 `skill-icon-config.json` 的 `SKILL_ICON_MAP` 中增加条目：
```json
{
  "SKILL_ICON_MAP": {
    "崩山击": "崩山击.png",
    "追风箭": "追风箭.png"
  }
}
```
确保文件名与 `asset/skill_icons/` 下的文件一致。

---

## 六、质量检查清单

- [ ] 图标为透明背景（边缘无杂色黑边）。
- [ ] 尺寸为 68×68 像素（缩放后依然清晰）。
- [ ] 符合暗黑像素风，无抗锯齿，无渐变。
- [ ] 构图符合技能释放形态（锁定/范围/地面）。
- [ ] 技能核心元素清晰可辨（火焰、冰冻、箭矢等）。
- [ ] 映射文件已更新，游戏内测试显示正确。

---

## 七、常见问题

- **图标模糊**：检查是否使用了非 NEAREST 缩放，或生成时尺寸过小。建议原图至少 256×256。
- **背景未透明**：确认生图时使用了纯黑背景，且工具执行了后处理（`process_skill_icon_image`）。
- **深阶技能图标缺失**：游戏运行时会使用默认占位（或回退到品质兜底图标），若需独立图标，请按上述策略生成并增加映射。

---

本辅助文档应与 `weapon-skills-reference.md` 及 `art_generator.py` 配合使用。如有新增技能或调整画风，请同步更新本文档。