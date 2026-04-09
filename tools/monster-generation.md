# Pixel Eternal — 怪物与 Boss 贴图生成辅助文档

本文档基于 `monsters-art-reference.md`、`monsters-overview.md` 及游戏代码现状编写，旨在指导美术/策划人员为所有怪物（含普通、精英、深塔变种）及 Boss 生成统一的暗黑像素风贴图，并确保与现有资源映射、尺寸、缩放规则兼容。

---

## 一、全局规则与约束（必读）

### 1. 画风与尺寸
- **风格**：暗黑像素风，16-bit，低饱和高对比，边缘锐利，纯黑背景（工具后处理会抠黑为透明）。
- **贴图逻辑尺寸**：怪物本体宽高约 `MONSTER_SIZE`（`game-config.json` 中默认 **30 像素**）。  
  实际绘制时会乘以 `scale` 系数（见映射表），最终尺寸 ≈ `30 × scale`。
- **Boss 尺寸**：`Boss` 类构造函数中尺寸约为普通怪的 **1.5 倍**（即约 45 像素基底），再乘以各自的 `scale`。
- **输出规格**：建议生成 **512×512** 原图，保持像素边缘清晰，最终由游戏代码缩放至目标大小。  
  或直接生成 **64×64** 小图（NEAREST 缩放），但需确保细节不糊。

### 2. 文件存放与命名
- 根目录：`asset/`
- 命名规则：`monster_<type>.png`，其中 `<type>` 为怪物 ID（如 `goblin`、`demonSorcerer`）。
- 映射配置：`config/mappings.json` 中的 `monster` 字段已配置了 25 种基础族系的贴图文件名与 `scale`。  
  新增或替换贴图时，需在此文件中增加对应条目，或修改已有条目的 `image` 字段。

### 3. 无独立贴图时的回退逻辑
- 若某 `type` 在 `mappings.json` 中无条目，游戏会尝试：
  1. 去掉 `_elite` 后缀后查找（如 `goblinShaman_elite` → `goblinShaman`）；
  2. 若仍无，则使用 `baseMonster` 指向的 type 的贴图（见下文“复用关系”）；
  3. 最后回退到配置里的 `color` 实心圆占位。
- 因此，**建议至少为基础族系（25 种）生成独立贴图**，其他变种可共享或做细微改色。

### 4. 远程怪物造型注意
远程怪物（`RANGED_MONSTER_NAMES` 列表）的贴图应明显体现远程特征：  
- 持弓/弩、法杖、投掷物、喷口等。  
- 避免全部画成近战武器。

---

## 二、已有基础族系贴图清单（25 种）

下表为当前 `mappings.json` 中已配置的怪物及其贴图文件、`scale`。**这些文件应优先保证质量与风格统一**，其他变种可在此基础上派生。

| type | 显示名 | 贴图文件名 | scale | 建议视觉特征 |
|------|--------|------------|-------|----------------|
| goblin | 哥布林 | monster_goblin.png | 1.2 | 绿色皮肤，破布衣，小刀/棍棒，驼背 |
| goblinWarrior | 哥布林战士 | monster_goblin_warrior.png | 1.3 | 绿色，皮甲，短剑，更壮 |
| goblinShaman | 哥布林萨满 | monster_goblin_shaman.png | 1.1 | 绿色，兽骨法杖，部落纹身 |
| goblinScout | 哥布林斥候 | monster_goblin_scout.png | 1.1 | 绿色，轻装，匕首，蒙面 |
| goblinChief | 哥布林酋长 | monster_goblin_chief.png | 1.6 | 绿色，大个头，戴角盔，双手斧 |
| skeleton | 骷髅 | monster_skeleton.png | 1.5 | 白骨，破旧铠甲，单手剑盾 |
| skeletonArcher | 骷髅弓箭手 | monster_skeleton_archer.png | 1.3 | 白骨，无下颚，长弓，箭袋 |
| skeletonKnight | 骷髅骑士 | monster_skeleton_knight.png | 2.0 | 白骨，重甲，骑骷髅马（或步行重装） |
| skeletonMage | 骷髅法师 | monster_skeleton_mage.png | 1.2 | 白骨，法袍，法杖，鬼火环绕 |
| skeletonLord | 骷髅领主 | monster_skeleton_lord.png | 2.5 | 白骨，王冠，大剑，披风 |
| orc | 兽人 | monster_orc.png | 2.2 | 绿/灰色，蛮族装，大斧 |
| orcBerserker | 兽人狂战士 | monster_orc_berserker.png | 2.0 | 红眼，双持武器，无甲 |
| orcShaman | 兽人萨满 | monster_orc_shaman.png | 2.1 | 图腾法杖，兽骨装饰，施法姿态 |
| orcWarrior | 兽人勇士 | monster_orc_warrior.png | 2.3 | 板甲，长柄刀，更魁梧 |
| orcWarlord | 兽人督军 | monster_orc_warlord.png | 3.5 | 巨型，全身重铠，战旗背饰 |
| demon | 恶魔 | monster_demon.png | 2.5 | 红色皮肤，角，翼，利爪 |
| demonImp | 小恶魔 | monster_demon_imp.png | 1.5 | 小型，蝠翼，叉尾，尖牙 |
| demonGuardian | 恶魔守卫 | monster_demon_guardian.png | 3.0 | 重甲，巨盾，红色铠甲 |
| demonSorcerer | 恶魔术士 | monster_demon_sorcerer.png | 2.5 | 黑袍，暗紫魔杖，邪光 |
| demonGeneral | 恶魔将军 | monster_demon_general.png | 3.5 | 金甲，大剑，披风 |
| demonBoss | 恶魔领主 | monster_demon_boss.png | 5.0 | 巨大，王座元素，火焰特效 |
| demonPrince | 恶魔王子 | monster_demon_prince.png | 3.8 | 优雅，细剑，紫黑色调 |
| demonTitan | 恶魔泰坦 | monster_demon_titan.png | 5.5 | 岩石皮肤，巨锤，山岭体型 |
| demonArchmage | 恶魔大法师 | monster_demon_archmage.png | 3.0 | 华丽法袍，星盘，高阶符文 |
| demonOverlord | 恶魔霸主 | monster_demon_overlord.png | 6.0 | 终极恶魔，多翼，深渊光环 |

**注意**：`scale` 值表示相对于 `MONSTER_SIZE` 的倍数，绘制时最终尺寸 = 30 × scale。  
生成贴图时不必严格按该尺寸输出，只需保持比例协调（例如 512×512 原图，游戏内缩放即可）。

---

## 三、复用关系与派生贴图建议

以下类型的怪物**当前没有独立贴图**，会从基础族系继承。你可以选择：
- **仅使用基础贴图**（游戏内可正常显示，但外观相同）。
- **生成差异化贴图**，提高辨识度。若生成，需在 `mappings.json` 中增加条目，并给出建议的 scale。

### 3.1 精英后缀 `_elite`

这些怪物与普通版共用贴图，但配置中属性更强、颜色更亮。建议**不生成独立贴图**，或仅添加一个小角标（如红色光环）以示精英。若想独立，命名规则：`monster_<type>_elite.png`。

列表（部分）：  
`goblin_elite`、`goblinWarrior_elite`、`goblinShaman_elite`、`skeletonKnight_elite`、`skeletonMage_elite`、`orcWarrior_elite`、`orcWarlord_elite`、`demon_elite`、`demonImp_elite`、`demonBoss_elite`、`demonAbyss_elite`、`demonVoid_elite`、`demonTyrant_elite`、`crystalColossus_elite`、`sporeHorror_elite`、`rustChain_elite`。

### 3.2 深塔变种（baseMonster 指向基础 type）

这些怪物拥有独立 ID，但默认继承 `baseMonster` 的贴图。**强烈建议为以下高亮怪物生成独立贴图**，以体现深塔特色。下表列出建议的视觉方向。

| type | 显示名 | baseMonster | 建议视觉特征（区别于基底） |
|------|--------|-------------|----------------------------|
| demonAbyssWarden | 深渊巡卫 | demonGuardian | 暗红重甲，锁链盾，头部有角 |
| demonSoulRift | 裂隙噬魂者 | demonImp | 半透明，紫色裂隙纹，镰刀爪 |
| demonAshSeer | 灰烬先知 | demonSorcerer | 灰烬长袍，水晶球，橙色符文 |
| demonVoidRunner | 虚空步卒 | demon | 紫黑色，虚空粒子，双刃 |
| demonEntropySage | 熵能术士 | demonSorcerer | 破碎晶体法杖，绿紫噪点特效 |
| demonCorruptionMarshal | 腐化督军 | demonGeneral | 腐化绿光，触须肩膀，长戟 |
| demonFinalKeeper | 终焉看守 | demonTitan | 巨型，锁链缠身，独眼 |
| demonStarVoidMage | 星渊法师 | demonArchmage | 星轨法阵，深蓝法袍，星点 |
| demonNullKnight | 湮灭骑士 | demonGuardian | 漆黑铠甲，符文盾，无头 |
| crystalColossus | 晶簇巨像 | demonGuardian | 水晶簇身体，发光的核心 |
| rustChainShade | 锈链囚影 | skeletonKnight | 锈铁链缠绕，破败铠甲，空洞眼 |
| sporeMatriarch | 孢囊主母 | demon | 蘑菇状，孢子囊，触手 |
| mirrorPhantom | 镜影残像 | demonImp | 镜面碎片身体，多重重影 |
| bloodLeechMass | 血蛭聚合体 | demon | 血红色团块，吸盘，触须 |
| silentZealot | 缄默狂信 | demonSorcerer | 蒙面，封印符文，自爆装置 |
| hollowPilgrim | 空壳朝圣者 | skeleton | 空壳骨架，背着炸弹，引线 |
| frostHound | 霜缚猎犬 | demonImp | 冰蓝色，四足，霜雾呼吸 |
| voltBatSwarm | 雷纹蝠群 | demonImp | 蝙蝠群，电弧翅膀，亮黄色 |
| acidStalker | 酸沼爬行者 | demon | 绿色黏液，爬行姿态，酸液滴 |
| obsidianGargoyle | 黑曜喷流 | demonSorcerer | 黑曜石像鬼，翼，喷口 |
| galeWisp | 飓风灵 | demonImp | 半透明风灵，旋风下半身 |
| riftAssassin | 隙间割喉者 | demonImp | 刺客装，紫色裂隙匕首 |
| bastionBallista | 塔基弩炮 | skeletonArcher | 弩炮座，骷髅操作员 |
| deepTowerMarshal | 深塔巡察 | demonGeneral | 军官帽，肩章，指挥剑 |
| twinVesselLeft/Right | 双生缚命·左/右缀 | demonImp | 成对设计，左右配色一明一暗 |
| circlePriest | 法阵祭司 | demonSorcerer | 悬浮法阵，祭袍，面具 |
| apostateFallenKnight | 叛教圣骑 | demonGuardian | 褪色圣徽，破损圣剑 |
| clockworkSlasher | 钟摆械偶 | skeletonKnight | 齿轮关节，摆刃手臂 |
| goldGlareThief | 金瞳窃贼 | goblinScout | 金色瞳孔，盗贼面罩 |
| plateFiendSoldier | 板甲魔卒 | demonGuardian | 板甲，开场护盾特效 |

**生成建议**：优先为 **恶魔系深塔变种** 和 **特色精英**（如星渊法师、晶簇巨像）制作独立贴图，其余可暂用基础贴图。

---

## 四、塔层 Boss 贴图（12 名）

Boss 的贴图命名建议：`boss_<id>.png`，例如 `boss_20.png`。  
目前 `mappings.json` 中未配置任何 Boss 贴图，游戏内以实心圆占位。**强烈建议为每个 Boss 生成独立贴图**，体现各自主题。

下表提供每个 Boss 的视觉关键词，用于生成提示词。

| id | 名称 | 主题色 | 视觉关键词（英文提示词用） |
|----|------|--------|----------------------------|
| boss_20 | 塔卫·初临 | `#ff66aa` | pinkish armored knight, ornate tower shield, halberd, glowing pink eyes, pixel art |
| boss_40 | 熔核看守 | `#ff4422` | lava golem, cracked magma skin, hammer fist, burning core, pixel art |
| boss_60 | 霜渊领主 | `#66ccff` | ice lich, frozen crown, frost staff, trailing ice crystals, pixel art |
| boss_80 | 雷殛化身 | `#ffee44` | lightning elemental, thundercloud body, electric arcs, yellow-white glow, pixel art |
| boss_100 | 暗影统御 | `#8844ff` | shadow overlord, wispy cloak, dark scepter, purple-black aura, pixel art |
| boss_120 | 血契暴君 | `#cc0044` | blood knight, crimson plate armor, greatsword with blood drip, red mist, pixel art |
| boss_140 | 炼狱典狱官 | `#ff2200` | infernal warden, chains and hooks, fiery horns, molten whip, pixel art |
| boss_160 | 虚空噬界者 | `#aa44cc` | void entity, distorted sphere, tentacles, starless black with purple rim, pixel art |
| boss_180 | 终焉骑士 | `#c0c0ff` | apocalypse knight, pale armor, scythe, spectral wings, pixel art |
| boss_200 | 混沌双生 | `#44ffaa` | twin beings, one cyan one magenta, yin-yang stance, chaotic particles, pixel art |
| boss_220 | 星骸君王 | `#ffd700` | star skeleton king, gold crown, meteor shoulder pads, cosmic dust trail, pixel art |
| boss_240 | 像素永恒之主 | `#ff00ff` | pixelated titan, retro 8-bit blocks, neon pink/cyan, glitch effects, pixel art |

**尺寸建议**：Boss 贴图应比普通怪更大，建议原图 1024×1024 或 512×512，`scale` 可设为 5~8。在 `mappings.json` 的 `monster` 字段中为每个 boss 增加条目，例如：
```json
"boss_20": { "image": "boss_20.png", "scale": 5.0 }
```

---

## 五、批量生成提示词模板

以下提供针对怪物和 Boss 的通用提示词模板，可直接用于 `art_generator.py` 或手动生成。

### 怪物贴图模板
```
像素风格，暗黑奇幻，[怪物描述]，全身站立，正面或 3/4 侧面，16-bit，纯黑背景，无UI，无文字，锐利边缘。
```

**示例（哥布林萨满）**：
> 像素风格，暗黑奇幻，绿色皮肤哥布林，身穿兽皮袍，手持骨质法杖，杖头有绿色魔光，驼背站姿，16-bit，纯黑背景，无UI，无文字。

### Boss 贴图模板
```
像素风格，暗黑奇幻，[Boss 描述]，巨大体型，威压姿态，[主题元素]，16-bit，纯黑背景，无UI，无文字，细节丰富。
```

**示例（霜渊领主）**：
> 像素风格，暗黑奇幻，冰霜巫妖，头戴冰晶王冠，手持冰杖，身披破碎披风，脚下有冰雾，巨大体型，16-bit，纯黑背景。

---

## 六、集成到项目的步骤

1. **生成贴图**：根据上述建议和模板，为所需怪物生成 PNG 文件。
2. **存放文件**：放入 `asset/` 目录，文件名遵循 `monster_<type>.png`。
3. **更新映射**：编辑 `config/mappings.json`，在 `monster` 对象中添加或修改条目，指定 `image` 和 `scale`。
4. **测试**：运行游戏，确认贴图正确加载且缩放合适（scale 可微调）。
5. **子弹贴图（可选）**：若怪物有远程攻击，可参考 `projectiles-overview.md` 生成对应子弹贴图，并更新 `config/projectile-sprites.json`。

---

## 七、常见问题

- **贴图显示过大或过小**：调整 `scale` 值，普通怪一般 1.0~2.0，Boss 3.0~6.0。
- **透明背景无效**：确保生成时背景为纯黑，工具会将其转为透明；或使用支持透明通道的 PNG。
- **像素风格不明显**：在提示词中强调 `pixel art`、`no anti-aliasing`、`sharp edges`。
- **远程怪物误判为近战**：检查 `js/game-entities.js` 中的 `RANGED_MONSTER_NAMES` 是否包含该怪物 ID，以及贴图是否体现了远程武器。

---

本辅助文档应与 `monsters-art-reference.md` 和 `monsters-overview.md` 配合使用，配置变更时请同步更新。如有新增怪物或 Boss，请参照上述规则补充贴图与映射。