# Pixel Eternal 装备生成指导文档

本文档面向需要为《Pixel Eternal》批量生成装备图标的策划/美术，结合项目中的 `art_generator.py` 工具，提供**按套装生成全套装备提示词表**及**深阶主题 8×5 品质档位提示词模板**，确保生成的图片风格统一、符合暗黑像素风，并能直接整合到游戏项目中。

---

## 一、准备工作

### 1. 工具与依赖
- Python 3.8+
- 安装依赖：`pip install requests Pillow`
- 确保 `art_generator.py` 位于 `tools/` 目录下，项目根目录结构完整。

### 2. 配置 API（如需自动生成）
- 设置环境变量（可选）：
  ```bash
  export PE_ART_API_KEY="你的密钥"
  export PE_CHAT_URL="http://your-gpt-endpoint/v1/chat/completions"
  export PE_IMAGE_URL="http://your-imagen-endpoint/v1/images/generations"
  export PE_CHAT_MODEL="gpt-4o-mini"
  export PE_IMAGE_MODEL="imagen-4.0-ultra-generate-001"
  ```
- 若不配置，脚本会使用内置默认值（见 `art_generator.py` 开头）。

### 3. 项目目录约定
- 装备贴图统一存放在 `asset/` 下，按部位分子文件夹：
  - `weapons/`、`helmets/`、`chests/`、`legs/`、`boots/`、`necklaces/`、`rings/`、`belts/`
- 图片命名建议使用装备中文名 + `.png`（如 `龙炎剑.png`），方便游戏读取。
- 生成后需在 `config/mappings.json` 的 `equipment` 字段中添加映射，游戏才能正确加载。

---

## 二、单件装备生成方法

### 1. 自然语言描述模板
使用以下结构描述装备，让 GPT 规划提示词（或直接用于生成）：

```
[部位] + [套装/主题] + [品质] + [核心视觉特征] + [像素风格固定段]
```

**固定风格段（自动追加）**  
工具内置了 `EQUIPMENT_WEAPON_TEXTURE_STYLE_TEMPLATE`，包含像素风格、纯黑底等要求。若生成其他部位，建议在自然语言中显式包含以下关键词：

```
像素风格，暗黑奇幻，16-bit，纯黑背景，俯视45度，道具图标，透明底
```

### 2. 单个生成命令
```bash
python tools/art_generator.py "生成龙族套装的传说品质头盔，暗黑像素风，龙角造型，鳞片纹理，透明背景"
```
工具会调用 GPT 规划提示词 → 生图 → 保存到 `asset/helmets/龙族套装头盔.png`（文件名由 GPT 决定，或可手动指定）。  
生成后，**务必检查 `mappings.json` 是否已自动添加映射**（当前脚本对武器贴图批量处理会写 mapping，但单件生成时可能不会自动写入，建议手动补充）。

### 3. 手动补充映射（若未自动添加）
在 `config/mappings.json` 的 `equipment` 对象中添加：
```json
{
  "equipment": {
    "龙族头盔": "helmets/龙族头盔.png"
  }
}
```

---

## 三、批量生成全套套装装备

### 方法一：手动准备提示词列表 + 循环调用
1. 为套装内每个部位撰写一句描述（见下表示例）。
2. 编写一个简单的 shell 脚本（或 Python 脚本）循环执行。

**示例：龙族套装批量生成脚本（bash）**
```bash
#!/bin/bash
# 生成龙族套装全部9件装备
# 假设已 cd 到项目根目录

declare -A pieces=(
  ["武器"]="生成龙族套装的传说品质近战武器，暗黑像素风，剑身暗红金属，龙翼护手，红宝石"
  ["头盔"]="生成龙族套装的传说品质头盔，暗黑像素风，龙角造型，鳞片纹理，眼缝红光"
  ["胸甲"]="生成龙族套装的传说品质胸甲，暗黑像素风，龙鳞胸板，龙翼肩甲，暗红金属"
  ["腿甲"]="生成龙族套装的传说品质腿甲，暗黑像素风，膝甲龙爪装饰，鳞片纹理"
  ["足具"]="生成龙族套装的传说品质足具，暗黑像素风，龙鳞护踝，尖刺靴底"
  ["项链"]="生成龙族套装的传说品质项链，暗黑像素风，龙爪抓握红宝石，金属链"
  ["指环"]="生成龙族套装的传说品质指环，暗黑像素风，龙鳞纹饰，暗红宝石"
  ["腰带"]="生成龙族套装的传说品质腰带，暗黑像素风，龙首带扣，金属链节"
)

for piece in "${!pieces[@]}"; do
  echo "正在生成 $piece ..."
  python tools/art_generator.py "${pieces[$piece]}"
  sleep 2   # 避免 API 限流
done
```

### 方法二：直接调用 GPT 规划批量生成（需扩展脚本）
当前 `art_generator.py` 已支持**武器贴图批量生成**（`run_batch_weapon_textures`），可类比扩展至其他部位。若需要，可修改脚本增加 `run_batch_equipment_by_slot(slot)` 函数。  
**但在指导文档中，我们推荐使用方法一，简单可控。**

---

## 四、深阶装备提示词模板（8主题 × 5品质）

深阶装备命名格式：`{主题}{凡|良|湛|炽|曜}·{后缀}`，每个主题对应一套视觉基调，品质字（凡→曜）决定细节复杂度。  
为便于批量生成，我们为每个主题提供一套基础模板，并将品质字映射为视觉修饰词。

### 1. 主题视觉关键词表

| 主题 | 视觉关键词（英文，用于提示词） |
|------|--------------------------------|
| 渊隙 | `abyss`, `cracked earth`, `glowing purple fissures`, `void`, `dark rock` |
| 虚印 | `rune`, `ethereal`, `ghostly light`, `silver-blue`, `spiritual` |
| 腐噬 | `corrosion`, `green slime`, `rotted metal`, `decay`, `mold` |
| 黑曜 | `obsidian`, `sharp edges`, `black crystal`, `volcanic glass` |
| 终幕 | `curtain`, `shadow`, `draped fabric`, `dark gold`, `theatrical` |
| 星骸 | `star fragments`, `meteor iron`, `cosmic dust`, `dark blue`, `cracks` |
| 裂点 | `fracture`, `cracked crystal`, `shattered`, `lightning cracks` |
| 终焉 | `apocalyptic`, `ruined`, `dark sun`, `crimson`, `ash` |

### 2. 品质复杂度映射

| 品质字 | 复杂度修饰（英文） | 示例 |
|--------|------------------|------|
| 凡 | `simple`, `minimal decoration` | 基础造型，无装饰 |
| 良 | `some details`, `minor ornaments` | 少量装饰纹路 |
| 湛 | `intricate`, `detailed engravings` | 精密雕刻，宝石 |
| 炽 | `ornate`, `glowing accents`, `rich details` | 华丽，发光元素 |
| 曜 | `magnificent`, `radiant aura`, `legendary` | 辉煌，光效，复杂结构 |

### 3. 完整提示词模板（以近战武器为例）

```
{部位} {主题视觉关键词} {品质复杂度修饰}，暗黑像素风，16-bit，纯黑背景，道具图标，透明底
```

**例：渊隙·曜 近战武器**
> `近战武器，渊隙主题，暗紫色裂痕，发光裂缝，华丽细节，辐射光效，暗黑像素风，16-bit，纯黑背景，道具图标，透明底`

### 4. 各部位提示词差异

- **武器**：需强调刃型、柄部、护手。
- **头盔**：强调面甲、角、冠饰。
- **胸甲**：强调肩甲、胸板纹理。
- **腿甲**：强调膝甲、裙甲。
- **足具**：强调靴型、护踝。
- **项链/指环/腰带**：小型装备，需强调主宝石、链节、搭扣。

**模板生成建议**：使用上述关键词和复杂度修饰，按部位逐一生成描述。

---

## 五、实战：为“渊隙”主题生成全套5品质装备（9部位）

### 步骤
1. 准备描述列表（可手动编写，或利用上述模板生成）。
2. 编写批量脚本（如 Python 循环）。
3. 执行脚本，生成图片。
4. 手动添加 `mappings.json` 映射（若脚本未自动添加）。

### 示例：生成渊隙凡·低语（头盔）的描述
```
“渊隙主题头盔，简单造型，暗紫色裂隙，朴素无装饰，暗黑像素风，16-bit，纯黑背景，道具图标，透明底”
```
生成命令：
```bash
python tools/art_generator.py "渊隙主题头盔，简单造型，暗紫色裂隙，朴素无装饰，暗黑像素风，16-bit，纯黑背景，道具图标，透明底"
```

### 批量生成脚本（Python 示例）
```python
import subprocess
import time

themes = {
    "渊隙": "abyss, cracked earth, glowing purple fissures, void",
    "虚印": "rune, ethereal, ghostly light, silver-blue",
    "腐噬": "corrosion, green slime, rotted metal, decay",
    # ... 其他主题
}

qualities = {
    "凡": "simple, minimal decoration",
    "良": "some details, minor ornaments",
    "湛": "intricate, detailed engravings",
    "炽": "ornate, glowing accents, rich details",
    "曜": "magnificent, radiant aura, legendary"
}

slots = {
    "weapon": "近战武器",  # 或远程
    "helmet": "头盔",
    "chest": "胸甲",
    "legs": "腿甲",
    "boots": "足具",
    "necklace": "项链",
    "ring": "指环",
    "belt": "腰带"
}

for theme_name, theme_key in themes.items():
    for qual_name, qual_desc in qualities.items():
        for slot_cn, slot_name in slots.items():
            desc = f"{slot_cn}，{theme_name}主题，{theme_key}，{qual_desc}，暗黑像素风，16-bit，纯黑背景，道具图标，透明底"
            # 构建完整描述，可根据部位调整重点（如武器强调刃型）
            if slot_cn == "weapon":
                desc = f"近战武器，{theme_name}主题，{theme_key}，{qual_desc}，暗黑像素风，16-bit，纯黑背景，道具图标，透明底"
            # 调用命令
            cmd = f'python tools/art_generator.py "{desc}"'
            subprocess.run(cmd, shell=True)
            time.sleep(2)  # 避免请求过快
```

---

## 六、注意事项与常见问题

### 1. 风格一致性
- 所有装备必须包含 **像素风、纯黑背景、透明底** 关键词，确保后处理时能正确抠出透明背景。
- 同一套装的装备应共享主色调与装饰元素，描述中务必体现。

### 2. 文件命名与映射
- 推荐文件名使用装备中文名，便于维护。例如 `龙族头盔.png`。
- 生成后立即在 `mappings.json` 中写入映射，否则游戏内无法显示。
- 如果使用脚本批量生成，可让脚本自动写入 mapping（参考 `art_generator.py` 中 `add_equipment_mapping` 函数）。

### 3. 远程与近战武器区分
- 描述中明确写明 `远程武器` 或 `近战武器`，且远程武器应避免动态特效（如箭矢飞行），保持静物道具感。

### 4. 深阶装备后缀
- 深阶装备的 `后缀`（如“残锋”）不直接体现在视觉描述中，但可由主题与品质决定装饰细节。无需刻意描述后缀。

### 5. 生成失败处理
- 若 API 返回错误，检查网络、密钥、模型名称。
- 若提示词被内容策略拦截，尝试简化描述，移除敏感词。
- 可启用 `--dry-run` 先测试规划结果，确认后再实际生成。

---

## 七、扩展建议

如果希望实现**一键生成全套深阶装备**，可对 `art_generator.py` 进行二次开发：
- 新增 `run_batch_deep_equipment(theme, quality)` 函数。
- 内部循环部位，为每个部位调用 GPT 规划提示词（或直接使用上述模板拼接）。
- 生成后自动写入 `mappings.json` 和装备配置（如需要）。

当前版本已支持武器批量生成，可参考其实现方式扩展至其他部位。