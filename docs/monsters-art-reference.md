# Pixel Eternal — 怪物与 Boss 贴图生成参考

本文档根据当前仓库中的 **`config/monster-config.json`**、**`config/boss-config.json`**、**`config/mappings.json`**、**`config/projectile-sprites.json`** 与 **`js/game-assets.js`**（`getMonsterImageConfig`）整理，用于统一画风、命名与复用关系，辅助像素/贴图生产。

---

## 一、引擎与资源约束（贴图落地前必读）

| 项目 | 说明 |
|------|------|
| 怪物贴图目录 | `asset/`，文件名在 `mappings.json` 的 `monster` 节中配置（如 `monster_goblin.png`） |
| 逻辑尺寸 | `game-config.json` 中 `MONSTER_SIZE` 默认 **30**；**Boss 类**在代码中约为 **1.5×** 普通怪（`Boss` 构造函数） |
| 绘制缩放 | 每种类型另有 `scale` 乘数（见下文「已有映射表」），最终绘制约 `size × scale` |
| 无映射时 | 若某 `type` 在 `mappings.json` 中无条目，会按 **`baseMonster`** 或去掉 `_elite` 后回退；仍无则 **用配置里的 `color` 画实心圆** |
| 塔层 Boss | `type` 为 **`boss_20`～`boss_240`**；当前 **`mappings.json` 未配置这些 id**，游戏中多为 **色块占位**，若要独立立绘需在 `mappings.json` 的 `monster` 中按 id 增加条目 |
| 材料秘境 | `config/dungeon-config.json` 中 **`DUNGEON_DEFINITIONS` 现为空数组**，旧文档中的「秘境守护者」**不在当前配置中** |

**远程怪（会走远程 AI，需弓/法杖/喷流等造型）** — 与 `js/game-entities.js` 中 `RANGED_MONSTER_NAMES` 一致：

哥布林萨满、哥布林斥候、骷髅弓箭手、骷髅法师、兽人萨满、恶魔术士、恶魔大法师、灰烬先知、熵能术士、星渊法师、雷纹蝠群、黑曜喷流、塔基弩炮。

---

## 二、已有怪物本体贴图映射（`config/mappings.json` → `asset/`）

下列 **25** 种为基础族系，文件名已存在或可按同名补全：

| type（ID） | 显示名 | 主色（配置） | 贴图文件 | scale |
|------------|--------|--------------|----------|-------|
| goblin | 哥布林 | `#00ff00` | monster_goblin.png | 1.2 |
| goblinWarrior | 哥布林战士 | `#00cc00` | monster_goblin_warrior.png | 1.3 |
| goblinShaman | 哥布林萨满 | `#00ff88` | monster_goblin_shaman.png | 1.1 |
| goblinScout | 哥布林斥候 | `#88ff00` | monster_goblin_scout.png | 1.1 |
| goblinChief | 哥布林酋长 | `#00aa00` | monster_goblin_chief.png | 1.6 |
| skeleton | 骷髅 | `#ffffff` | monster_skeleton.png | 1.5 |
| skeletonArcher | 骷髅弓箭手 | `#dddddd` | monster_skeleton_archer.png | 1.3 |
| skeletonKnight | 骷髅骑士 | `#cccccc` | monster_skeleton_knight.png | 2.0 |
| skeletonMage | 骷髅法师 | `#eeeeee` | monster_skeleton_mage.png | 1.2 |
| skeletonLord | 骷髅领主 | `#bbbbbb` | monster_skeleton_lord.png | 2.5 |
| orc | 兽人 | `#ff8800` | monster_orc.png | 2.2 |
| orcBerserker | 兽人狂战士 | `#ff6600` | monster_orc_berserker.png | 2.0 |
| orcShaman | 兽人萨满 | `#ffaa00` | monster_orc_shaman.png | 2.1 |
| orcWarrior | 兽人勇士 | `#ff9900` | monster_orc_warrior.png | 2.3 |
| orcWarlord | 兽人督军 | `#ff7700` | monster_orc_warlord.png | 3.5 |
| demon | 恶魔 | `#ff0000` | monster_demon.png | 2.5 |
| demonImp | 小恶魔 | `#ff4444` | monster_demon_imp.png | 1.5 |
| demonGuardian | 恶魔守卫 | `#cc0000` | monster_demon_guardian.png | 3.0 |
| demonSorcerer | 恶魔术士 | `#ff2222` | monster_demon_sorcerer.png | 2.5 |
| demonGeneral | 恶魔将军 | `#aa0000` | monster_demon_general.png | 3.5 |
| demonBoss | 恶魔领主 | `#aa00ff` | monster_demon_boss.png | 5.0 |
| demonPrince | 恶魔王子 | `#bb00ff` | monster_demon_prince.png | 3.8 |
| demonTitan | 恶魔泰坦 | `#9900ff` | monster_demon_titan.png | 5.5 |
| demonArchmage | 恶魔大法师 | `#cc00ff` | monster_demon_archmage.png | 3.0 |
| demonOverlord | 恶魔霸主 | `#8800ff` | monster_demon_overlord.png | 6.0 |

说明：`asset/` 下另有 **`monster_goblin_mage.png`**，当前配置未引用，可作废件或改映射给萨满系变体。

---

## 三、复用关系（未单独映射的类型画什么）

以下类型 **没有** 单独的 `mappings` 条目时，会 **自动沿用** 上表某一基础族的贴图（通过 `baseMonster` 或 `_elite` 规则）。做贴图时可 **先做基底，再做差异化皮肤**。

### 3.1 精英后缀 `_elite`

去掉 `_elite` 后若在上表中有 type，则 **与同族普通/基底共用贴图**（颜色在配置里可能更亮，可做调色层或角标区分）。

包含：`goblin_elite`、`goblinWarrior_elite`、`goblinShaman_elite`、`skeletonKnight_elite`、`skeletonMage_elite`、`orcWarrior_elite`、`orcWarlord_elite`、`demon_elite`、`demonImp_elite`、`demonBoss_elite`、`demonAbyss_elite`、`demonVoid_elite`、`demonTyrant_elite`、`crystalColossus_elite`、`sporeHorror_elite`、`rustChain_elite`。

### 3.2 深塔变种（`baseMonster` 指向基础 type）

| type（ID） | 显示名 | 建议视觉方向（文案+基底） | baseMonster |
|------------|--------|---------------------------|-------------|
| demonAbyssWarden | 深渊巡卫 | 重甲、暗红、盾击压迫 | demonGuardian |
| demonSoulRift | 裂隙噬魂者 | 纤瘦高速、裂隙/爪 | demonImp |
| demonAshSeer | 灰烬先知 | 灰烬、预言者、远程火矢 | demonSorcerer |
| demonVoidRunner | 虚空步卒 | 紫虚空纹、轻装疾行 | demon |
| demonEntropySage | 熵能术士 | 熵/碎晶、多段弹 | demonSorcerer |
| demonCorruptionMarshal | 腐化督军 | 腐化装甲、长柄/斧 | demonGeneral |
| demonFinalKeeper | 终焉看守 | 巨体、门扉/锁链意象 | demonTitan |
| demonStarVoidMage | 星渊法师 | 星轨法阵、范围爆心 | demonArchmage |
| demonNullKnight | 湮灭骑士 | 护盾符文、深紫黑 | demonGuardian |
| crystalColossus | 晶簇巨像 | 水晶簇、站桩重甲 | demonGuardian |
| rustChainShade | 锈链囚影 | 锈链、囚笼、骑士骨架 | skeletonKnight |
| sporeMatriarch | 孢囊主母 | 菌孢、母体臃肿 | demon |
| mirrorPhantom | 镜影残像 | 镜面/残像、敏捷 | demonImp |
| bloodLeechMass | 血蛭聚合体 | 血蛭团块、触须 | demon |
| silentZealot | 缄默狂信 | 邪典、沉默符印 | demonSorcerer |
| hollowPilgrim | 空壳朝圣者 | 空洞骨架、自爆引线 | skeleton |
| frostHound | 霜缚猎犬 | 霜牙四足、冰雾 | demonImp |
| voltBatSwarm | 雷纹蝠群 | 群聚蝙蝠、电弧 | demonImp |
| acidStalker | 酸沼爬行者 | 酸绿黏液、拖尾 | demon |
| obsidianGargoyle | 黑曜喷流 | 黑曜石像、短距喷浆 | demonSorcerer |
| galeWisp | 飓风灵 | 风灵体、半透明 | demonImp |
| riftAssassin | 隙间割喉者 | 刺客剪影、粉紫隙间 | demonImp |
| bastionBallista | 塔基弩炮 | 重型弩/炮座 | skeletonArcher |
| deepTowerMarshal | 深塔巡察 | 军官肩章、光环指挥 | demonGeneral |
| twinVesselLeft | 双生缚命·左缀 | 成对设计左（紫偏亮） | demonImp |
| twinVesselRight | 双生缚命·右缀 | 成对设计右（紫偏暗） | demonImp |
| circlePriest | 法阵祭司 | 地面法阵、祭袍 | demonSorcerer |
| apostateFallenKnight | 叛教圣骑 | 褪色圣徽、双姿态光效 | demonGuardian |
| clockworkSlasher | 钟摆械偶 | 齿轮、摆刃、骷髅骑士骨架 | skeletonKnight |
| goldGlareThief | 金瞳窃贼 | 金瞳、窃贼轻装 | goblinScout |
| plateFiendSoldier | 板甲魔卒 | 板甲、开场护盾特效 | demonGuardian |

若要为某一变种 **单独文件**，在 `mappings.json` 的 `monster` 中 **新增该 type 与 `image`/`scale`** 即可覆盖继承逻辑。

---

## 四、怪物远程弹幕贴图（`config/projectile-sprites.json`）

怪物名 → `asset/projectiles/<id>.png`：

| 怪物显示名 | sprite id |
|------------|-----------|
| 哥布林萨满 | proj_mob_goblin_hex |
| 哥布林斥候 | proj_mob_rampart_bolt |
| 骷髅弓箭手 | proj_mob_bone_arrow |
| 骷髅法师 | proj_mob_skull_wisp |
| 兽人萨满 | proj_mob_warg_spark |
| 恶魔术士 | proj_mob_demon_ember |
| 恶魔大法师 | proj_mob_void_star |
| 灰烬先知 | proj_mob_ash_prophet |
| 熵能术士 | proj_mob_entropy_shard |
| 星渊法师 | proj_mob_void_star |
| 雷纹蝠群 | proj_mob_volt_flechette |
| 黑曜喷流 | proj_mob_obsidian_jet |
| 塔基弩炮 | proj_mob_rampart_bolt |
| 其他远程缺省 | proj_mob_skull_wisp（`monsterDefault`） |

---

## 五、恶魔塔层 Boss（`config/boss-config.json`）

每 **20 层** 一座 Boss 房（`TOWER_BOSS_INTERVAL`: 20），共 **12** 名。表中 **主色** 为无贴图时的占位圆颜色；**技能类型** 便于你设计特效帧或召唤物。

| id | 名称 | 配置等级 | 主色 | 技能摘要 |
|----|------|----------|------|----------|
| boss_20 | 塔卫·初临 | 20 | `#ff66aa` | 裂空冲（冲锋） |
| boss_40 | 熔核看守 | 25 | `#ff4422` | 重锤冲、地火环（AOE） |
| boss_60 | 霜渊领主 | 30 | `#66ccff` | 冰环爆、寒星弹（追踪弹→`proj_boss_frost_star`） |
| boss_80 | 雷殛化身 | 35 | `#ffee44` | 雷球（`proj_boss_thunder_orb`）、狂雷（狂暴） |
| boss_100 | 暗影统御 | 40 | `#8844ff` | 影袭、暗潮、幽魂弹（`proj_boss_specter_wisp`） |
| boss_120 | 血契暴君 | 45 | `#cc0044` | 血冲、血祭环、血怒 |
| boss_140 | 炼狱典狱官 | 48 | `#ff2200` | 狱火冲、炼狱池、焚世弹（`proj_boss_inferno_bead`） |
| boss_160 | 虚空噬界者 | 52 | `#aa44cc` | 虚空冲、坍缩、虚弹群（`proj_boss_void_mass`） |
| boss_180 | 终焉骑士 | 55 | `#c0c0ff` | 圣裁冲、天罚圈、终焉狂化 |
| boss_200 | 混沌双生 | 58 | `#44ffaa` | 双极冲、混沌爆、分裂弹（`proj_boss_chaos_split`）、混沌狂暴 |
| boss_220 | 星骸君王 | 60 | `#ffd700` | 星陨冲、星爆、流星雨（`proj_boss_meteor_seed`） |
| boss_240 | 像素永恒之主 | 60 | `#ff00ff` | 永恒冲锋、永恒湮灭、像素弹幕（`proj_boss_pixel_salvo`）、终末狂怒 |

**Boss 追踪弹技能名 ↔ 贴图 id**（`bossSkillByName`）：寒星弹、雷球、幽魂弹、焚世弹、虚弹群、分裂弹、流星雨、像素弹幕 — 上表已标注对应 `proj_boss_*`。

---

## 六、数量汇总

| 类别 | 数量 |
|------|------|
| `MONSTER_TYPES` 条目（含精英与深塔变种） | **72** |
| 已有独立 `monster_*.png` 映射的基础族 | **25** |
| 塔层 Boss（`BOSS_DEFINITIONS`） | **12** |

---

## 七、数据溯源

- 怪物数值与描述：`config/monster-config.json`
- Boss：`config/boss-config.json`
- 本体贴图映射：`config/mappings.json` → `monster`
- 弹幕映射：`config/projectile-sprites.json`
- 贴图解析：`js/game-assets.js` → `getMonsterImageConfig`

配置变更时请以 JSON 为准，并同步更新本文档。
