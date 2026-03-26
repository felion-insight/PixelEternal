# 游戏美术资源生成工具

用自然语言描述需求，自动规划提示词与风格、调用 Imagen 生成图片，并写入项目（可选更新装备配置与贴图映射）。

## 环境

- Python 3.8+
- 依赖：`pip install -r requirements.txt`

## 配置

脚本内已写默认 API 地址与模型，可通过环境变量覆盖：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PE_ART_API_KEY` | API 密钥 | （脚本内默认） |
| `PE_CHAT_URL` | 对话接口 | `http://35.220.164.252:3888/v1/chat/completions` |
| `PE_IMAGE_URL` | 图像生成接口 | `http://35.220.164.252:3888/v1/images/generations` |
| `PE_CHAT_MODEL` | 对话模型 | `gpt-4o-mini` |
| `PE_IMAGE_MODEL` | 图像模型 | `imagen-4.0-ultra-generate-001` |

**若出现「GPT 返回错误状态码: 400」**：多为请求参数不被服务接受。脚本会打印 API 返回的响应内容，请根据内容排查：
- 若提示模型不存在/无效，请设置 `PE_CHAT_MODEL` 为你的服务支持的模型名（如 `gpt-4o-mini`、`gpt-3.5-turbo` 等）。
- 若为其他字段错误，请对照 `PE_CHAT_URL` 对应接口的文档调整环境变量。

## 使用

在项目根目录或 `tools` 目录下执行：

```bash
# 命令行直接传入描述
python tools/art_generator.py "一把传说品质的龙炎剑装备图标，像素风"

# 生成/补齐「所有武器技能图标」：自动读项目里武器技能列表，只给还没有图标的技能生图并写入配置
python tools/art_generator.py "生成所有武器技能的图标"
python tools/art_generator.py "补齐所有武器技能图标"

# 不传参数时会在运行后提示输入
python tools/art_generator.py

# 仅规划不生图、不写文件（调试用）
python tools/art_generator.py "一把龙炎剑图标" --dry-run
python tools/art_generator.py "生成所有武器技能的图标" --dry-run

# 仅列出尚未配置图标的武器技能（不调用 API，用于核对解析是否正确）
python tools/art_generator.py --list-missing

# 生成/补齐「所有增幅图标」：按 图标要求.md 为所有增幅类型生图，画风与技能图标一致
python tools/art_generator.py "生成所有增幅的图标"
python tools/art_generator.py "生成所有增幅图标"

# 仅列出尚未配置图标的增幅类型（不调用 API）
python tools/art_generator.py --list-missing-buff
```

## 行为说明

1. **收集项目上下文**：读取 `PROJECT.md`、`config/equipment-config.json`、`asset/` 下已有文件列表。
2. **GPT 规划**：根据你的自然语言和项目内容，输出生图提示词、风格、保存路径，以及是否写入装备配置和贴图映射。
3. **生图**：用 Imagen 接口生成一张图，保存到 `asset/`（或子文件夹如 `weapons/`、`helmets/` 等，保持整洁）。
4. **写回项目**（按规划结果）：
   - 新装备：在 `config/equipment-config.json` 的 `EQUIPMENT_DEFINITIONS` 中追加一条装备定义。
   - 需要做图标：在 `game-main.js` 的装备名称→图片文件名映射中增加一条；游戏通过 `asset/文件名` 或 `asset/子文件夹/文件名` 加载。

## 批量生成：所有武器技能图标

当输入类似「生成所有武器技能的图标」「补齐所有武器技能图标」时，工具会：

1. 从 `js/data-classes.js` 的 `getWeaponSkill` 中解析出所有武器技能（名称与描述）；
2. 读取 `config/skill-icon-config.json` 中的 `SKILL_ICON_MAP`，得到已有图标的技能；
3. 对**尚未有图标**的技能逐个：用 GPT 规划提示词 → 调用 Imagen 生图 → 保存到 `asset/skill_icons/` → 在 `config/skill-icon-config.json` 中追加映射。

游戏内武器技能按钮（Q 键）会按 `SKILL_ICON_MAP` 显示对应图标（若存在）。

**技能图标画风与流程**（与 `tools/生图要求.md` 对齐，API 与保存目录沿用你提供的配置）：
- **画风**：固定核心模板 + 三变量 `{shape} with {texture} in {color} palette`；GPT 只输出 shape / texture / color，工具拼成完整提示词。
- **API**：使用你提供的接口（`PE_ART_*` 环境变量 / 脚本内默认）；技能图标请求为 512x512、带 `negative_prompt`，失败时重试 3 次（指数退避）。
- **后处理**：生成 512x512 后，强制纯黑背景 + 用 NEAREST 缩放到 64x64，再保存到 `asset/skill_icons/`，文件名为技能中文名。
- **日志**：每条成功/失败记录到 `asset/skill_icons/logs/generate_YYYYMMDD.log`。

## 项目整洁

- 新装备贴图建议放在对应子文件夹：`weapons`、`helmets`、`chests`、`legs`、`boots`、`necklaces`、`rings`、`belts`。
- 技能图标统一放在 `asset/skill_icons/`，由 `config/skill-icon-config.json` 维护技能名→文件名映射。

**增幅图标**（与 `tools/图标要求.md` 一致，画风与技能图标一致）：
- 输入「生成所有增幅的图标」或「生成所有增幅图标」时，按 `BUFF_ICON_PROMPTS` 为所有增幅类型（基础属性、药水/Buff、精炼、套装特殊、装备词条、炼金）生图。
- 图标保存到 `asset/buff_icons/`，映射写入 `config/buff-icon-config.json` 的 `BUFF_ICON_MAP`（键为增幅键如 `attack`、`defense`）。
- 非装备图可放在 `items` 或 `asset` 根目录。
- 工具可创建新子文件夹，不会改动已有文件路径，仅追加配置与映射。
