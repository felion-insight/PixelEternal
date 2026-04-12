# 游戏美术资源生成工具

用自然语言描述需求，自动规划提示词与风格、调用 Imagen 生成图片，并写入项目（可选更新装备配置与贴图映射）。

## 环境

- Python 3.8+
- 依赖：`pip install -r requirements.txt`

## 配置

**必须先配置 `PE_ART_API_KEY`**（服务方提供的 Bearer 密钥）。任选其一即可，**不要提交到 git**：

1. **推荐**：在项目根目录或 `tools/` 下创建 `.env`（已列入仓库根 `.gitignore`），写入一行  
   `PE_ART_API_KEY=你的密钥`  
   脚本启动时会自动加载（不覆盖已在终端里 `export` / `$env:` 设置的变量）。模板见 `tools/.env.example`。
2. 或在 PowerShell 里临时设置：`$env:PE_ART_API_KEY = "sk-你的密钥"`。

**浏览器内游戏**（合铸、合铸成功生图等）通过 `js/pe-env.generated.js` 注入密钥：仓库根执行 `node scripts/build-pe-env-js.js` 从 `.env` 生成（勿提交含真实密钥的文件）。`config.js` 亦会读取本机 **localStorage** 中前缀 `pixel_eternal.api.` 的同名键（可选，用于不便跑构建脚本时自行写入）。变量别名见仓库根 `.env.example`。

同一网关下常见路径（根地址默认为 `http://35.220.164.252:3888`，可用 `PE_API_BASE` 修改）：

| 能力 | 方法 | 路径 |
|------|------|------|
| OpenAI 式生图 | `POST` | `/v1/images/generations` |
| Gemini 式 Imagen | `POST` | `/v1beta/models/imagen-4.0-ultra-generate-001:generateContent` |
| OpenAI 式对话 | `POST` | `/v1/chat/completions` |

**生图通道 `PE_IMAGE_BACKEND`**（仅影响生图，不影响对话）：

- **`openai`**：只走 `PE_IMAGE_URL`，OpenAI 兼容 JSON（`prompt`、`b64_json` 等）。
- **`gemini`**：走 `PE_GEMINI_IMAGE_URL`（默认 `{PE_API_BASE}/v1beta/models/{PE_IMAGE_MODEL}:generateContent`），请求体为 `contents` + `parts` 文本；响应需含可解析的 `inlineData` 图片（若你方网关格式不同，需对照文档再改脚本）。
- **`auto`（默认）**：先按 `openai` 请求，若返回 **HTTP 403** 则自动再试 `gemini` 一次（适合你方仅开放 `generateContent` 或 OpenAI 路径被拒绝的情况）。若希望永远只打一条通路，可显式设为 `openai` 或 `gemini`。

可通过环境变量覆盖：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PE_ART_API_KEY` | Bearer 密钥 | （无，必填；可写在 `.env`） |
| `PE_API_BASE` | 网关根 URL，末尾无 `/` | `http://35.220.164.252:3888` |
| `PE_CHAT_URL` | 对话完整 URL | `{PE_API_BASE}/v1/chat/completions` |
| `PE_IMAGE_URL` | OpenAI 式生图 URL | `{PE_API_BASE}/v1/images/generations` |
| `PE_GEMINI_IMAGE_URL` | Gemini 式生图完整 URL | `{PE_API_BASE}/v1beta/models/{PE_IMAGE_MODEL}:generateContent` |
| `PE_IMAGE_BACKEND` | `openai` / `gemini` / `auto` | `auto` |
| `PE_CHAT_MODEL` | 对话模型 | `gpt-4o-mini` |
| `PE_IMAGE_MODEL` | 生图模型名（用于默认 Gemini URL 路径段） | `imagen-4.0-ultra-generate-001` |

PowerShell 示例（将密钥换成你自己的）：

```powershell
$env:PE_ART_API_KEY = "sk-你的密钥"
$env:PE_IMAGE_BACKEND = "auto"
python tools/art_generator.py "补齐所有深阶装备贴图"
```

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

# 生成/补齐「所有增幅图标」：按 icon-requirements.md 为所有增幅类型生图，画风与技能图标一致
python tools/art_generator.py "生成所有增幅的图标"
python tools/art_generator.py "生成所有增幅图标"

# 仅列出尚未配置图标的增幅类型（不调用 API）
python tools/art_generator.py --list-missing-buff
```

## 行为说明

1. **收集项目上下文**：读取 `PROJECT.md`、`config/equipment-config.json`、`asset/` 下已有文件列表。
2. **GPT 规划**：根据你的自然语言和项目内容，输出生图提示词、风格、保存路径，以及是否写入装备配置和贴图映射。
3. **生图**：用 Imagen 接口生成一张图，保存到 `asset/`（或子文件夹如 `weapons/`、`helmets/` 等，保持整洁）。
4. **文件名**：本工具写入磁盘的 PNG **统一为英文/ASCII 文件名**（装备如 `eq_weapon_xxxxxxxx.png`、`deep_abyss_rift_q01_xxxxxxxx.png`；技能图标 `skill_xxxxxxxx.png` 等）。游戏内仍用中文装备名/技能名；`mappings.json` 与 `SKILL_ICON_MAP` 负责「显示名 → 文件路径」。若曾用旧版生成过中文文件名，只要映射仍指向该路径，工具会继续识别为「已有贴图」；新补缺则写入新的英文路径并更新映射。
5. **写回项目**（按规划结果）：
   - 新装备：在 `config/equipment-config.json` 的 `EQUIPMENT_DEFINITIONS` 中追加一条装备定义。
   - 需要做图标：在 `config/mappings.json` 的 `equipment` 中写入「装备中文名 → 相对 `asset/` 的路径」；游戏经 `AssetManager` 读取该映射加载 `asset/` 下贴图。

## 批量生成：所有武器技能图标

当输入类似「生成所有武器技能的图标」「补齐所有武器技能图标」时，工具会：

1. 从 `js/data-classes.js` 的 `getWeaponSkill` 中解析出所有武器技能（名称与描述）；
2. 读取 `config/skill-icon-config.json` 中的 `SKILL_ICON_MAP`，得到已有图标的技能；
3. 对**尚未有图标**的技能逐个：用 GPT 规划提示词 → 调用 Imagen 生图 → 保存到 `asset/skill_icons/` → 在 `config/skill-icon-config.json` 中追加映射。

游戏内武器技能按钮（Q 键）会按 `SKILL_ICON_MAP` 显示对应图标（若存在）。

**技能图标画风与流程**（与 `tools/art-requirements.md` 对齐，API 与保存目录沿用你提供的配置）：
- **画风**：固定核心模板 + 三变量 `{shape} with {texture} in {color} palette`；GPT 只输出 shape / texture / color，工具拼成完整提示词。
- **API**：使用你提供的接口（`PE_ART_*` 环境变量 / 脚本内默认）；技能图标请求为 512x512、带 `negative_prompt`，失败时重试 3 次（指数退避）。
- **后处理**：生成 512x512 后，强制纯黑背景 + 用 NEAREST 缩放到 64x64，再保存到 `asset/skill_icons/`，文件名为技能中文名。
- **日志**：每条成功/失败记录到 `asset/skill_icons/logs/generate_YYYYMMDD.log`。

## 项目整洁

- 新装备贴图建议放在对应子文件夹：`weapons`、`helmets`、`chests`、`legs`、`boots`、`necklaces`、`rings`、`belts`。
- 技能图标统一放在 `asset/skill_icons/`，由 `config/skill-icon-config.json` 维护技能名→文件名映射。

**增幅图标**（与 `tools/icon-requirements.md` 一致，画风与技能图标一致）：
- 输入「生成所有增幅的图标」或「生成所有增幅图标」时，按 `BUFF_ICON_PROMPTS` 为所有增幅类型（基础属性、药水/Buff、精炼、套装特殊、装备词条、炼金）生图。
- 图标保存到 `asset/buff_icons/`，映射写入 `config/buff-icon-config.json` 的 `BUFF_ICON_MAP`（键为增幅键如 `attack`、`defense`）。
- 非装备图可放在 `items` 或 `asset` 根目录。
- 工具可创建新子文件夹，不会改动已有文件路径，仅追加配置与映射。
