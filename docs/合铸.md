实现以下功能：
添加一个新的铁匠铺功能“合铸”
玩家可以使用这个功能将消耗两个拥有不同装备词条的装备融合成一个全新的装备。新装备的词条应该兼有原材料装备词条的特点。合铸出来的装备可以同时激活两个原材料所属套装的套装效果。
此功能通过调用API实现。

| 配置项 | 值 | 代码位置 |
|--------|-----|----------|
| API 根地址 | http://35.220.164.252:3888/ | `CONFIG.HEZHU_API_BASE` |
| API Key | sk-KIok6ajQEs9IMRfrCoMXwFYEs2kL3EDgJwCYdN7vgaTnWbV2 | `CONFIG.HEZHU_API_KEY` |
| 模型名 | gemini-3.1-flash-lite-preview | `CONFIG.HEZHU_MODEL` |

AI接口需要实现以下内容：了解这个游戏中所有的内容。设计全新的装备词条名称及内容。为全新的装备命名。设计新装备的基础词条。

---

## 使用说明（已实现）

- 铁匠铺「合铸」入口：须选择两件**相同部位**（如均为武器）且**拥有不同装备词条**的装备后点击「合铸」，会调用上述 API 生成新装备名称、新词条与基础属性；新装备会同时计入两件原材料所属套装。**武器**还须**同为近战或同为远程**（不可近战与远程混铸）。
- **无需 VPN**：当无法连接 Google（超时、无代理）时，会**自动使用本地规则**生成融合装备（名称、词条描述、基础属性），无需任何外网。也可在配置中设置 `CONFIG.HEZHU_USE_LOCAL = true`，则合铸**始终**使用本地规则，不发起任何 API 请求。
- **API Key**：已写在 `CONFIG.HEZHU_API_KEY`。若网络可用会优先调用 AI 生成更有创意的名称与词条；无 Key 或连接失败时自动走本地合铸。
- **连接超时**：若希望用 AI 又无法直连 Google，可开 VPN/代理，或自建代理并设置 `CONFIG.HEZHU_API_BASE` 为代理地址。
- **合铸装备贴图**：合铸成功后会异步调用与 `tools/art_generator` 相同的服务器接口（`HEZHU_API_BASE` 下的 `/v1/chat/completions` 与 `/v1/images/generations`），根据**新装备名、两件原材料名称与词条、新词条说明**规划并生成 **68×68 透明底** 像素风贴图，写入浏览器 `localStorage`（键 `pe_fusion_equipment_icons_v1`），刷新后仍有效。需在 `config.js`（或等价配置）中设置 **`HEZHU_FUSION_ICON_API_KEY` 或 `HEZHU_ART_API_KEY`**（与 `PE_ART_API_KEY` 一致）；未配置则跳过生图，合铸流程不受影响。`HEZHU_FUSION_ICON_ENABLE: false` 可关闭。