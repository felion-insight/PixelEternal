# 飞射体 / 子弹 — 生图参考

仅保留 **出图用**：文件名 slug、英文代号、中文/英文气质关键词。不涉及程序实现。

**通用后缀（可拼在所有弹射物提示词末尾）**  
`pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt`

---

## 一、玩家 · 普通打造远程（5）

| 建议文件名 slug | English Codename | 武器 | 气质关键词（中文） |
|-----------------|------------------|------|-------------------|
| `proj_player_windfang` | **Windfang Shaft** | 猎风短弓 | 短矢、青绿尾迹、木猎手感 |
| `proj_player_shadow_pierce` | **Shadow Pierce Bolt** | 幽影弩 | 弩矢、紫黑残影、冷金属 |
| `proj_player_dawnbreak` | **Dawnbreak Arrowhead** | 曦光长弓 | 金白、晨曦、柔和光 |
| `proj_player_moon_through` | **Moon-Through Needle** | 穿云破月 | 银蓝、月白、锐利针矢 |
| `proj_player_starfall_pin` | **Starfall Pin** | 永夜·星坠 | 深紫夜空、星屑拖尾 |

---

## 二、玩家 · 深阶远程飞射体（40）

**品质档与 slug 尾缀**：凡 `_c`、良 `_r`、湛 `_f`、炽 `_e`、曜 `_l`（与下表 slug 一致）。

**按主题统一色相**（同主题 5 把弹体应共用这套主色，再随凡→曜加复杂度：凡哑光少光 → 曜强粒子/光环）。

| 主题 | slug 前缀 | 主色与材质关键词 |
|------|-----------|------------------|
| 渊隙（25 档） | `proj_deep_rift_*` | 暗紫 + 黑、裂隙光、暗金属 |
| 虚印（30） | `proj_deep_sigil_*` | 银蓝 + 白、符文、灵体微光 |
| 腐噬（35） | `proj_deep_rot_*` | 暗绿 + 锈褐、腐蚀、黏液感 |
| 黑曜（40） | `proj_deep_obsidian_*` | 纯黑 + 暗红纹、玻璃/火山高光 |
| 终幕（45） | `proj_deep_finale_*` | 深紫 + 暗金、帷幕、古铜镶边 |
| 星骸（50） | `proj_deep_starbone_*` | 深蓝 + 暗银、陨铁、星尘碎裂 |
| 裂点（55） | `proj_deep_fissure_*` | 暗蓝 + 银灰、裂晶、电弧感 |
| 终焉（60） | `proj_deep_term_*` | 焦黑 + 余烬红、废墟、日蚀感 |

### 渊隙

| 武器名 | slug | English Codename |
|--------|------|------------------|
| 渊隙凡·穿云 | `proj_deep_rift_c` | **Riftgap Dust Shaft** |
| 渊隙良·破穹 | `proj_deep_rift_r` | **Riftgap Vault Spire** |
| 渊隙湛·逐星 | `proj_deep_rift_f` | **Riftgap Comet Chaser** |
| 渊隙炽·坠虹 | `proj_deep_rift_e` | **Riftgap Iris Drop** |
| 渊隙曜·凌弦 | `proj_deep_rift_l` | **Riftgap Zenith String** |

### 虚印

| 武器名 | slug | English Codename |
|--------|------|------------------|
| 虚印凡·虚矢 | `proj_deep_sigil_c` | **Voidseal Ghost Bolt** |
| 虚印良·印弓 | `proj_deep_sigil_r` | **Voidseal Seal Longshot** |
| 虚印湛·脉弦 | `proj_deep_sigil_f` | **Voidseal Vein String** |
| 虚印炽·终矢 | `proj_deep_sigil_e` | **Voidseal Last Arrow** |
| 虚印曜·归羽 | `proj_deep_sigil_l` | **Voidseal Return Plume** |

### 腐噬

| 武器名 | slug | English Codename |
|--------|------|------------------|
| 腐噬凡·腐弦 | `proj_deep_rot_c` | **Rotmaw Rotstring** |
| 腐噬良·噬矢 | `proj_deep_rot_r` | **Rotmaw Devour Dart** |
| 腐噬湛·裂羽 | `proj_deep_rot_f` | **Rotmaw Split Feather** |
| 腐噬炽·黯弓 | `proj_deep_rot_e` | **Rotmaw Gloom Bolt** |
| 腐噬曜·吞弦 | `proj_deep_rot_l` | **Rotmaw Gullet String** |

### 黑曜

| 武器名 | slug | English Codename |
|--------|------|------------------|
| 黑曜凡·黑矢 | `proj_deep_obsidian_c` | **Obsidian Black Needle** |
| 黑曜良·曜弓 | `proj_deep_obsidian_r` | **Obsidian Gleam Bowshot** |
| 黑曜湛·渊弦 | `proj_deep_obsidian_f` | **Obsidian Abyss String** |
| 黑曜炽·锢羽 | `proj_deep_obsidian_e` | **Obsidian Lock Plume** |
| 黑曜曜·壁矢 | `proj_deep_obsidian_l` | **Obsidian Rampart Bolt** |

### 终幕

| 武器名 | slug | English Codename |
|--------|------|------------------|
| 终幕凡·终弦 | `proj_deep_finale_c` | **Finale Last String** |
| 终幕良·幕矢 | `proj_deep_finale_r` | **Finale Curtain Dart** |
| 终幕湛·誓弓 | `proj_deep_finale_f` | **Finale Oath Bow** |
| 终幕炽·星羽 | `proj_deep_finale_e` | **Finale Star Plume** |
| 终幕曜·墟弦 | `proj_deep_finale_l` | **Finale Ruin String** |

### 星骸

| 武器名 | slug | English Codename |
|--------|------|------------------|
| 星骸凡·星矢 | `proj_deep_starbone_c` | **Starbone Star Needle** |
| 星骸良·骸弓 | `proj_deep_starbone_r` | **Starbone Carrion Bow** |
| 星骸湛·链羽 | `proj_deep_starbone_f` | **Starbone Chain Feather** |
| 星骸炽·裂弦 | `proj_deep_starbone_e` | **Starbone Rift String** |
| 星骸曜·陨矢 | `proj_deep_starbone_l` | **Starbone Meteor Arrow** |

### 裂点

| 武器名 | slug | English Codename |
|--------|------|------------------|
| 裂点凡·裂弓 | `proj_deep_fissure_c` | **Fissure Crack Bowshot** |
| 裂点良·点羽 | `proj_deep_fissure_r` | **Fissure Pinion Shard** |
| 裂点湛·隙矢 | `proj_deep_fissure_f` | **Fissure Gap Bolt** |
| 裂点炽·穿弦 | `proj_deep_fissure_e` | **Fissure Pierce String** |
| 裂点曜·断羽 | `proj_deep_fissure_l` | **Fissure Sever Plume** |

### 终焉

| 武器名 | slug | English Codename |
|--------|------|------------------|
| 终焉凡·殒弓 | `proj_deep_term_c` | **Terminus Ruin Bow** |
| 终焉良·焉矢 | `proj_deep_term_r` | **Terminus Extinction Dart** |
| 终焉湛·终羽 | `proj_deep_term_f` | **Terminus Final Plume** |
| 终焉炽·归弦 | `proj_deep_term_e` | **Terminus Home String** |
| 终焉曜·墟弓 | `proj_deep_term_l` | **Terminus Void Bowshot** |

---

## 三、法杖形制深阶远程 · 魔法弹（14）

Icon 偏法杖/魔杖，飞射体请画 **魔弹 / 能量体 / 晶尖射流**，避免画成实体木箭。提示词可拼接 **English Codename + 下列英文句 + § 通用后缀**。

| 武器名 | 主题 | slug | English Codename | 色相 · 形态（中文） | 英文飞射体提示 |
|--------|------|------|------------------|---------------------|----------------|
| 渊隙凡·穿云 | 渊隙 | `proj_deep_rift_c` | **Riftgap Dust Shaft** | 暗紫黑 · 细长裂隙光刃 | narrow violet-black rift slash, void crack core, magic bolt not wooden arrow |
| 虚印良·印弓 | 虚印 | `proj_deep_sigil_r` | **Voidseal Seal Longshot** | 银蓝白 · 印纹扁球 | flat arcane seal orb, silver-blue glow, floating rune ring |
| 虚印湛·脉弦 | 虚印 | `proj_deep_sigil_f` | **Voidseal Vein String** | 冷白青 · 脉路细针 | thread-thin mana needle, cyan-white circuit trail |
| 腐噬湛·裂羽 | 腐噬 | `proj_deep_rot_f` | **Rotmaw Split Feather** | 污绿褐 · 分裂羽状碎片 | sickly green-brown split plume shard, ichor drip |
| 腐噬曜·吞弦 | 腐噬 | `proj_deep_rot_l` | **Rotmaw Gullet String** | 深绿近黑 · 涡吞椭球 | swallowing vortex ellipsoid, dark olive-black |
| 黑曜湛·渊弦 | 黑曜 | `proj_deep_obsidian_f` | **Obsidian Abyss String** | 漆黑 + 暗红纹 · 玻璃棱针 | glossy black glass spike, thin lava-red vein inside |
| 黑曜曜·壁矢 | 黑曜 | `proj_deep_obsidian_l` | **Obsidian Rampart Bolt** | 黑镜 + 炽红裂网 · 三角楔 | heavy obsidian wedge, mirror black, red fracture web |
| 终幕凡·终弦 | 终幕 | `proj_deep_finale_c` | **Finale Last String** | 灰紫 + 暗金边 · 短锥幕影 | short curtain-shadow cone, dusk purple, muted gold edge |
| 终幕湛·誓弓 | 终幕 | `proj_deep_finale_f` | **Finale Oath Bow** | 深紫 + 古铜金 · 誓印法球 | compact oath orb, deep purple, antique gold filigree |
| 终幕炽·星羽 | 终幕 | `proj_deep_finale_e` | **Finale Star Plume** | 暖金 + 幕红 · 星羽多尖镖 | star-plume flechette, warm ember-gold core |
| 终幕曜·墟弦 | 终幕 | `proj_deep_finale_l` | **Finale Ruin String** | 墟紫 + 烬金 · 坍缩环脉冲 | collapsing ring pulse, ruin purple, ash-gold afterglow |
| 星骸炽·裂弦 | 星骸 | `proj_deep_starbone_e` | **Starbone Rift String** | 钴蓝 + 陨银 · 碎裂星晶块 | jagged star-crystal chunk, cobalt-blue, meteor silver shards |
| 裂点良·点羽 | 裂点 | `proj_deep_fissure_r` | **Fissure Pinion Shard** | 电青 + 银灰 · 裂核小球 + 电丝羽尾 | small crack-core sphere, electric cyan, lightning-thread tail |
| 终焉炽·归弦 | 终焉 | `proj_deep_term_e` | **Terminus Home String** | 焦黑 + 余烬红 · 回环符纹梭镖 | returning-loop sigil dart, scorched black, ember-red groove |

---

## 四、怪物直线弹（12 + 精英火球）

| slug | English Codename | 气质关键词（中文） |
|------|------------------|-------------------|
| `proj_mob_goblin_hex` | **Bog Hex Dart** | 粗糙铁尖、绿褐、部落符咒微光 |
| `proj_mob_bone_arrow` | **Boneyard Arrow** | 骨箭杆、裂骨箭头、灰白尘尾 |
| `proj_mob_skull_wisp` | **Skull Wisp Bolt** | 骨白弹体、淡蓝鬼火尾迹 |
| `proj_mob_warg_spark` | **Warg Ritual Spark** | 橙红图腾火花、兽牙感 |
| `proj_mob_demon_ember` | **Abyss Ember Spear** | 暗红核、黑紫外焰 |
| `proj_mob_ash_prophet` | **Ash Prophet Cinder** | 余烬颗粒、橙灰烟迹 |
| `proj_mob_entropy_shard` | **Entropy Shard** | 不稳定晶棱、紫青噪点 |
| `proj_mob_void_star` | **Void Star Spine** | 深蓝星刺、虚空裂纹 |
| `proj_mob_volt_flechette` | **Voltbat Flechette** | 亮黄电弧、锯齿小镖 |
| `proj_mob_obsidian_jet` | **Obsidian Jet Pellet** | 黑红熔核、玻璃高光 |
| `proj_mob_rampart_bolt` | **Rampart Harpoon Bolt** | 重型弩矢、铁锈木羽 |
| `proj_mob_elite_ember_comet` | **Elite Ember Comet** | 大火核、金边拖尾（精英火球） |

---

## 五、Boss 追踪弹（8）

| slug | English Codename | 技能名（中文） | 气质关键词（中文） |
|------|------------------|----------------|-------------------|
| `proj_boss_frost_star` | **Frost Star Shard** | 寒星弹 | 冰蓝星碎、霜雾尾迹 |
| `proj_boss_thunder_orb` | **Thunder Core Orb** | 雷球 | 黄紫电弧、球形雷核 |
| `proj_boss_specter_wisp` | **Specter Wisp** | 幽魂弹 | 半透明紫魂、拖影 |
| `proj_boss_inferno_bead` | **Inferno Bead** | 焚世弹 | 熔岩珠、橙红拉丝尾焰 |
| `proj_boss_void_mass` | **Void Mass Glob** | 虚弹群 | 黑紫团块、颗粒边缘 |
| `proj_boss_chaos_split` | **Chaos Split Shard** | 分裂弹 | 青/品红双色碎片 |
| `proj_boss_meteor_seed` | **Meteor Seed** | 流星雨 | 金橙陨石核、星尘长尾 |
| `proj_boss_pixel_salvo` | **Pixel Salvo Bit** | 像素弹幕 | 方块弹体、霓虹、8-bit 尾迹 |

---

## 工作量参考（仅飞射体贴图）

| 方案 | 约张数 |
|------|--------|
| 极简 | 玩家 1 + 怪 1 + Boss 8 |
| 常用 | 玩家 5 + 怪 12 + Boss 8 + 深阶 40（或 8 主题各 1 套再调色） |
| 含法杖魔法弹细化 | 在上行基础上，**第三节 14** 把单独精修 |
