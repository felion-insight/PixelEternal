# 飞射体像素精灵图提示词文档

> 本文档用于生成 **16-bit 风格像素艺术飞射体（子弹/魔法弹）**。所有提示词末尾请统一拼接通用后缀，如需调整颜色或形态可微调中间描述部分。  
> **构图约定**：批量生图工具会对**弓弩类**追加实体箭式水平构图，对**第三节法杖类**追加「纯魔弹、禁止木箭尾羽」的专用构图与 negative；全量重绘用 `--force-projectile-textures`，只重画法杖魔弹用 `--batch-staff-magic-projectiles --force-staff-magic-projectiles`。

## 通用后缀（必须加在每条提示词末尾）

```
pixel art projectile sprite, retro 16-bit game asset, pure black background, horizontal pointing right tip on right tail straight left along axis, no bow no crossbow no bowstring, no text, no gun, no rifle, magic missile or fantasy bolt
```

---

## 一、玩家 · 普通弓弩类（5）

| 文件名 slug | 提示词（拼接通用后缀） |
|-------------|----------------------|
| `proj_player_windfang` | `Windfang Shaft, short green-feathered arrow with cyan tail trail, wooden hunting grip style, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_player_shadow_pierce` | `Shadow Pierce Bolt, crossbow bolt with purple-black afterimage, cold metallic grey tip, dark mist wisp, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_player_dawnbreak` | `Dawnbreak Arrowhead, golden-white arrowhead with soft dawn glow, pale gold tail, warm light particles, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_player_moon_through` | `Moon-Through Needle, silver-blue needle-like arrow, moon-white sharp tip, thin luminous trail, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_player_starfall_pin` | `Starfall Pin, deep purple arrow with stardust tail, tiny star sparkles, night-sky gradient, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |

---

## 二、玩家 · 深阶弓弩类（26）

> 以下飞射体均为 **弓/弩发射的实体箭矢**，不是魔法弹。品质从凡（_c）到曜（_l）依次增加粒子与光效复杂度。

### 渊隙主题（暗紫+黑，裂隙光）—— 弓弩类：凡·穿云、良·破穹、湛·逐星、炽·坠虹、曜·凌弦

| slug | 提示词 |
|------|--------|
| `proj_deep_rift_c` | `Riftgap Dust Shaft, dark violet-black wooden arrow, faint rift crack glow, matte finish, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_deep_rift_r` | `Riftgap Vault Spire, violet-black bolt with subtle glowing fissure lines, metallic dark tip, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_deep_rift_f` | `Riftgap Comet Chaser, dark purple arrow with bright violet comet tail, small spark particles, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_deep_rift_e` | `Riftgap Iris Drop, violet-black bolt with rainbow-edged trail, glowing rift fragments orbiting, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_deep_rift_l` | `Riftgap Zenith String, pure dark purple arrow with intense violet core, star-like sparkle trail, pulsating glow, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |

### 虚印主题（银蓝+白，符文）—— 弓弩类：凡·虚矢、炽·终矢、曜·归羽（良·印弓、湛·脉弦 为法杖类，见第三节）

| slug | 提示词 |
|------|--------|
| `proj_deep_sigil_c` | `Voidseal Ghost Bolt, silver-blue translucent arrow, pale white core, ghostly wisp tail, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_deep_sigil_e` | `Voidseal Last Arrow, bright silver-blue bolt with runic markings, intense icy glow trail, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_deep_sigil_l` | `Voidseal Return Plume, white-silver arrow with returning feather trail, soft cyan afterglow, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |

### 腐噬主题（暗绿+锈褐，腐蚀）—— 弓弩类：凡·腐弦、良·噬矢、炽·黯弓（湛·裂羽、曜·吞弦 为法杖类）

| slug | 提示词 |
|------|--------|
| `proj_deep_rot_c` | `Rotmaw Rotstring, sickly green-brown arrow, dull rusted tip, slight slime drip, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_deep_rot_r` | `Rotmaw Devour Dart, dark olive bolt with corroded iron head, faint green smoke trail, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_deep_rot_e` | `Rotmaw Gloom Bolt, deep murky green arrow with brown rot spots, ichor dripping tail, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |

### 黑曜主题（纯黑+暗红纹，玻璃/火山）—— 弓弩类：凡·黑矢、良·曜弓、炽·锢羽（湛·渊弦、曜·壁矢 为法杖类）

| slug | 提示词 |
|------|--------|
| `proj_deep_obsidian_c` | `Obsidian Black Needle, pure black obsidian arrow, minimal dark red vein, glossy surface, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_deep_obsidian_r` | `Obsidian Gleam Bowshot, black glass-like bolt with subtle dark red glow, sharp volcanic edge, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_deep_obsidian_e` | `Obsidian Lock Plume, jet-black arrow with cinnabar red veins, smoldering ember tail, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |

### 终幕主题（深紫+暗金，帷幕/古铜）—— 弓弩类：良·幕矢、炽·星羽？（注意：炽·星羽在第三节是法杖类，这里终幕主题下只有凡·终弦、良·幕矢、湛·誓弓、炽·星羽、曜·墟弦，但根据用户列表，终幕凡·终弦、终幕湛·誓弓、终幕炽·星羽、终幕曜·墟弦均为法杖类，所以终幕弓弩类仅良·幕矢？检查用户原文：“终幕凡·终弦、终幕湛·誓弓、终幕炽·星羽、终幕曜·墟弦是法杖类”，未提良·幕矢。故良·幕矢为弓弩类。）

| slug | 提示词 |
|------|--------|
| `proj_deep_finale_r` | `Finale Curtain Dart, deep purple crossbow bolt with muted gold edge, curtain-like smoky tail, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |

### 星骸主题（深蓝+暗银，陨铁）—— 弓弩类：凡·星矢、良·骸弓、湛·链羽、曜·陨矢（炽·裂弦为法杖类）

| slug | 提示词 |
|------|--------|
| `proj_deep_starbone_c` | `Starbone Star Needle, deep blue arrow with dark silver speckles, tiny stardust tail, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_deep_starbone_r` | `Starbone Carrion Bow, cobalt-blue bolt with meteor iron fletching, rough fractured surface, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_deep_starbone_f` | `Starbone Chain Feather, blue-silver arrow with chain-link feather pattern, fragmented starlight trail, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_deep_starbone_l` | `Starbone Meteor Arrow, dark indigo bolt with bright meteor core, long fiery stardust tail, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |

### 裂点主题（暗蓝+银灰，裂晶/电弧）—— 弓弩类：凡·裂弓、湛·隙矢、炽·穿弦、曜·断羽（良·点羽为法杖类）

| slug | 提示词 |
|------|--------|
| `proj_deep_fissure_c` | `Fissure Crack Bowshot, dark blue arrow with silver-grey crack lines, small electric flickers, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_deep_fissure_f` | `Fissure Gap Bolt, cracked ice-blue bolt, silver arc sparks, jagged crystalline tail, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_deep_fissure_e` | `Fissure Pierce String, electric cyan arrow with lightning-thread trail, bright silver fissure glow, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_deep_fissure_l` | `Fissure Sever Plume, dark azure bolt with intense electric arc aura, shattered crystal tail, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |

### 终焉主题（焦黑+余烬红，废墟/日蚀）—— 弓弩类：凡·殒弓、良·焉矢、湛·终羽、曜·墟弓（炽·归弦为法杖类）

| slug | 提示词 |
|------|--------|
| `proj_deep_term_c` | `Terminus Ruin Bow, scorched black arrow with faint ember red cracks, ash-gray tail, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_deep_term_r` | `Terminus Extinction Dart, charcoal-black bolt with dying ember core, smoky orange trail, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_deep_term_f` | `Terminus Final Plume, burnt black arrow with dark red ember veins, faint eclipse halo, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_deep_term_l` | `Terminus Void Bowshot, void-black bolt with smoldering red-orange embers, crumbling ruin dust trail, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |

---

## 三、玩家 · 深阶法杖类（14）

> 以下为 **法杖/魔杖发射的魔法弹**：只能是能量体、魔弹、符文光团、裂隙光刃、晶尘球等，**禁止**画成实体箭、弩矢、木杆、尾羽。英文提示词中避免使用 *bolt / dart / arrow / flechette* 指物理弹药；若需「弹体」请写 *spell orb / mana core / arcane shard*。

| 武器名 | slug | 提示词（已包含形态描述，末尾加通用后缀） |
|--------|------|------------------------------------------|
| 渊隙凡·穿云 | `proj_deep_rift_c` | `Riftgap Spell Rift, narrow horizontal slash of violet-black void energy, bright crack core, pure magic missile made of light and shadow, no wood no metal arrowhead, no shaft, no feathers, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| 虚印良·印弓 | `proj_deep_sigil_r` | `Voidseal Sigil Disc, flat floating arcane seal plate, silver-blue glow, concentric rune rings, magical energy plate not a physical object, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| 虚印湛·脉弦 | `proj_deep_sigil_f` | `Voidseal Mana Thread, elongated bead of cyan-white spell light, hairline straight pixel trail of circuit-glow lines, energy filament not a metal needle, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| 腐噬湛·裂羽 | `proj_deep_rot_f` | `Rotmaw Ichor Splinter, sickly green-brown corrupted magic shard, dripping ichor glow, jagged spell crystal not feather not arrow, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| 腐噬曜·吞弦 | `proj_deep_rot_l` | `Rotmaw Hunger Orb, dark olive-black magical vortex blob, soft pull-in spiral glow, spell sphere not crossbow ammo, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| 黑曜湛·渊弦 | `proj_deep_obsidian_f` | `Obsidian Abyss Spike, glossy volcanic-glass spell spike, inner lava-red arcane vein, condensed shadow-magic shard not iron bolt, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| 黑曜曜·壁矢 | `proj_deep_obsidian_l` | `Obsidian Rampart Shard, heavy black mirror magic wedge, red fracture web glow, floating obsidian spell fragment not a quarrel, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| 终幕凡·终弦 | `proj_deep_finale_c` | `Finale Twilight Cone, short cone of curtain-shadow purple spell-light, muted gold rim, soft magical burst not wood, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| 终幕湛·誓弓 | `proj_deep_finale_f` | `Finale Oath Sphere, compact deep-purple oath magic orb, antique gold filigree runes, floating spell globe not bow weapon, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| 终幕炽·星羽 | `proj_deep_finale_e` | `Finale Starfire Comet, warm ember-gold magical comet head, soft trailing stardust pixels, spell fire mass not metal flechette, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| 终幕曜·墟弦 | `proj_deep_finale_l` | `Finale Ruin Pulse Ring, collapsing magical ring shockwave, ruin purple and ash-gold afterglow, annulus of spell energy not arrow, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| 星骸炽·裂弦 | `proj_deep_starbone_e` | `Starbone Meteor Crystal, jagged cobalt-blue star-magic crystal chunk, silver stardust shards orbiting, arcane meteor fragment not arrow shaft, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| 裂点良·点羽 | `proj_deep_fissure_r` | `Fissure Arc Core Orb, small electric crack-core magic sphere, cyan plasma threads, lightning spell ball not pinion feather, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| 终焉炽·归弦 | `proj_deep_term_e` | `Terminus Homing Sigil Loop, scorched black arcane loop glyph, ember-red groove glow, boomerang-shaped spell trace not physical dart, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |

---

## 四、怪物直线弹（13）

| slug | 提示词（拼接通用后缀） |
|------|----------------------|
| `proj_mob_goblin_hex` | `Bog Hex Dart, crude iron tip, green-brown shaft, faint tribal charm glow, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_mob_bone_arrow` | `Boneyard Arrow, bone shaft, cracked skull tip, grey-white dust tail, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_mob_skull_wisp` | `Skull Wisp Bolt, bone-white projectile, pale blue ghost flame tail, wispy smoke, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_mob_warg_spark` | `Warg Ritual Spark, orange-red totem spark, fang-like shape, coarse fire particles, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_mob_demon_ember` | `Abyss Ember Spear, dark red core, black-purple outer flame, demonic horn tip, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_mob_ash_prophet` | `Ash Prophet Cinder, ember particle cluster, orange-grey smoke trail, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_mob_entropy_shard` | `Entropy Shard, unstable crystal prism, purple-cyan static noise, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_mob_void_star` | `Void Star Spine, deep blue star spike, void crack lines, dark spine tail, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_mob_volt_flechette` | `Voltbat Flechette, bright yellow arc, jagged small dart, electric sizzle trail, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_mob_obsidian_jet` | `Obsidian Jet Pellet, black-red molten core, glassy highlight, volcanic pellet, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_mob_rampart_bolt` | `Rampart Harpoon Bolt, heavy crossbow bolt, rusted iron tip, wooden feather fletching, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_mob_elite_ember_comet` | `Elite Ember Comet, large fire core, golden edge trail, comet-like elongated tail, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |

---

## 五、Boss 追踪弹（8）

| slug | 提示词（拼接通用后缀） |
|------|----------------------|
| `proj_boss_frost_star` | `Frost Star Shard, ice-blue star fragment, frost mist tail, freezing sparkles, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_boss_thunder_orb` | `Thunder Core Orb, yellow-purple electric arc, spherical lightning core, crackling orb, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_boss_specter_wisp` | `Specter Wisp, semi-transparent purple ghost, trailing shadow, eerie wisp shape, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_boss_inferno_bead` | `Inferno Bead, molten lava bead, orange-red drawn flame tail, burning core, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_boss_void_mass` | `Void Mass Glob, black-purple clump, granular edge, void tendrils, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_boss_chaos_split` | `Chaos Split Shard, cyan and magenta split fragments, chaotic dual-color shard, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_boss_meteor_seed` | `Meteor Seed, golden-orange meteor nucleus, long stardust tail, burning seed shape, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |
| `proj_boss_pixel_salvo` | `Pixel Salvo Bit, square block projectile, neon cyan/magenta, 8-bit pixel trail, retro game bit, pixel art projectile sprite, retro 16-bit game asset, pure black background, no text, no gun, no rifle, magic missile or fantasy bolt` |

---

## 使用说明

1. 每条提示词直接复制，末尾已隐含通用后缀（上述每条都已完整写出，可直接使用）。
3. 品质档位（凡/良/湛/炽/曜）的复杂度差异已在提示词中通过“matte finish → glow → particles → orbiting fragments → pulsating aura”体现，可按需调整。
4. 法杖类与弓弩类的核心区别：弓弩类可用 arrow/bolt/quarrel 等实体箭矢词；**法杖类第三节**必须用 orb/shard/sigil/spell energy/mana/plasma 等词，**避免** bolt、dart、flechette、arrow、feather、fletching 形容实体弹药。批量生图时程序对第三节条目自动追加「法杖魔弹」构图后缀。