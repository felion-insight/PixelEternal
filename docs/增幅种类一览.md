# Pixel Eternal - 游戏中所有增幅种类一览

本文档列举当前游戏中所有可影响角色属性的「增幅」类型及其出现位置。

---

## 一、基础属性增幅（数值键）

以下为装备、药水、Buff、套装等共同使用的**属性键**，对应玩家面板中的数值：

| 键名 | 中文名 | 说明 | 单位/格式 |
|------|--------|------|-----------|
| `attack` | 攻击力 | 物理/普攻伤害相关 | 数值 |
| `defense` | 防御力 | 减伤相关 | 数值 |
| `health` | 生命值 | 最大生命 / 恢复量 | 数值 |
| `critRate` | 暴击率 | 暴击概率 | % |
| `critDamage` | 暴击伤害 | 暴击时伤害倍率加成 | % |
| `dodge` | 闪避率 | 闪避攻击概率 | % |
| `attackSpeed` | 攻击速度 | 攻速加成 | % |
| `moveSpeed` | 移动速度 | 移速加成 | % |
| `vision` | 视野 | 玩家视野范围（影响可见范围） | 数值 |
| `allStats` | 所有属性 | 全属性按比例加成（仅套装） | 小数，如 0.1 表示 +10% |

**出现位置**：装备 `stats`、药水/炼金 `effects`、Buff `effects`、套装效果 `stats`。

---

## 二、药水 / Buff 效果增幅

药水与临时 Buff 使用与上面相同的基础属性键，另外有：

| 键名 | 中文名 | 说明 |
|------|--------|------|
| `duration` | 持续时间 | 药水/Buff 持续时间（毫秒），仅药水配置使用，Buff 显示用 `expireTime` |

**显示名映射**（游戏内 HUD/图鉴）：  
攻击力、防御力、暴击率、暴击伤害、闪避率、攻击速度、移动速度、视野、生命值（或生命值恢复）。

---

## 三、武器精炼增幅（精炼效果中的键）

武器精炼 1～5 级在 `getWeaponRefineEffects()` 中为每条效果定义以下**增幅相关键**（非直接玩家面板，但影响技能与战斗）：

| 键名 | 说明 |
|------|------|
| `damageMultiplier` | 技能伤害加成（比例） |
| `cooldownReduction` | 技能冷却减少（毫秒） |
| `rangeMultiplier` | 技能范围加成（比例） |
| `speedBoostBonus` | 技能给予的移速提升（比例） |
| `buffDurationBonus` | 技能 Buff 持续时间增加（毫秒） |
| `dodgeBoostBonus` | 技能给予的闪避率提升（比例） |
| `dodgeCritBonus` | 闪避后下次攻击必定暴击 |
| `dodgeInvincibleDuration` | 闪避后无敌时长（毫秒） |
| `slowEffectBonus` | 技能减速效果加成（比例） |
| `debuffDurationBonus` | 减速等 Debuff 持续时间增加（毫秒） |
| `attackSpeedBoostBonus` | 技能给予的攻速提升（比例） |
| `attackSpeedBoostDuration` | 攻速 Buff 持续时间（毫秒） |
| `attackBoostBonus` | 技能给予的攻击力提升（比例） |
| `attackBoostDuration` | 攻击力 Buff 持续时间（毫秒） |
| `critRateBonus` | 精炼提供的暴击率加成（数值） |
| `critDamageBonus` | 精炼提供的暴击伤害加成（比例） |
| `guaranteedCrit` | 技能必定暴击 |
| `dotDamage` / `dotDuration` | 持续伤害比例与持续时间 |
| `extraDamage` / `rangeMultiplier` | 额外伤害与范围 |
| `freezeEffect` / `freezeDuration` | 冰冻效果与时长 |
| `healPercent` | 技能恢复生命比例 |
| `allStatsBoost` / `allStatsBoostDuration` | 全属性提升比例与持续时间 |
| `enemyDebuff` / `debuffDuration` | 对敌人属性削弱比例与持续时间 |
| `postSkillFireDamage` / `postSkillFireDuration` | 技能后附加火焰伤害与持续时间 |
| `pierce` | 技能可穿透敌人 |
| `slowStackable` / `slowToFreeze` / `freezeDuration` | 减速可叠加、减速转冰冻等 |
| `refine_reduceAllCooldownsOnHit` | 精炼：技能命中减少所有技能冷却 |
| `refine_healOnSkillHit` | 精炼：技能命中恢复生命 |
| `refine_resetAttackCooldownOnHit` | 精炼：技能命中重置普攻冷却 |
| `refine_resetSkillCooldownOnKill` | 精炼：击杀重置技能冷却 |

（以上为在 `data-classes.js` 精炼配置中出现过的键，实际每条武器只使用其中一部分。）

---

## 四、套装效果增幅

套装效果由 `config/set-config.json` 的 `SET_DEFINITIONS` 定义，分两类：

### 4.1 数值类（stats）

与「一、基础属性增幅」一致：  
`attack`、`defense`、`health`、`critRate`、`critDamage`、`dodge`、`attackSpeed`、`moveSpeed`、`vision`、`allStats`。

### 4.2 特殊效果（special）

| special 键 | 说明（简要） |
|------------|--------------|
| `killHeal` | 击杀敌人时恢复一定比例最大生命值 |
| `cooldownReduction` | 技能冷却时间减少 |
| `damageToHeal` | 受到伤害时概率将部分伤害转化为生命恢复 |
| `deathImmunity` | 受到致命伤害时概率免疫 |
| `flameExplosion` | 攻击时概率触发火焰爆炸 |
| `flameAura` | 攻击时概率对周围造成持续火焰伤害 |
| `freezeChance` | 攻击时概率冰冻目标 |
| `counterFreeze` | 受到攻击时概率冰冻攻击者 |
| `areaFreeze` | 攻击时概率范围冰冻 |
| `chainLightning` | 攻击时概率连锁闪电 |
| `skillBoost` | 技能伤害提升、技能冷却减少等 |
| `killBuff` | 击杀时恢复生命并提升全属性（持续） |
| `ultimate` | 全属性大幅提升 + 致命伤概率免疫等终极效果 |
| `dragonCounter` | 受到攻击时概率对攻击者造成火焰伤害 |
| `dragonRage` | 低血量时攻击力提升 |
| `damageImmunity` | 受到伤害时概率免疫 |
| `divineProtection` | 全属性提升、暴击伤害提升、致命伤概率保留 1 血等 |

---

## 五、装备词条（描述性增幅）

装备词条在 `data-classes.js` 的 `generateEquipmentTraits()` 中按装备名称或品质生成，**不直接使用数值键**，而是通过 `description` 描述效果，在战斗/技能逻辑中由代码解析对应 id 或描述实现。  
词条效果类型包括但不限于：

- 攻击/暴击/伤害类：额外伤害、暴击相关、攻击力提升、技能伤害提升等  
- 防御/生存类：减伤、免疫、生命恢复、护盾、反弹伤害等  
- 控制/负面类：冰冻、减速、降低攻速等  
- 移速/攻速/闪避：移速、攻速、闪避率提升等  
- 特殊：击杀回复、低血加成、冷却减少、连击、范围/连锁伤害等  

（具体每条词条的 id 与 description 见 `data-classes.js` 中 `nameTraits` 与 `qualityTraits`。）

---

## 六、炼金词条增幅（材料与药水）

炼金材料与药水合成使用的词条键与「一、基础属性增幅」一致，另加 `duration`（持续时间，秒或毫秒视配置而定）：  
`attack`、`defense`、`critRate`、`critDamage`、`dodge`、`attackSpeed`、`moveSpeed`、`vision`、`health`、`duration`。

---

## 汇总表：基础属性键与主要出现位置

| 属性键 | 装备 | 药水/Buff | 套装 stats | 炼金词条 |
|--------|------|-----------|------------|----------|
| attack | ✓ | ✓ | ✓ | ✓ |
| defense | ✓ | ✓ | ✓ | ✓ |
| health | ✓ | ✓ | ✓ | ✓ |
| critRate | ✓ | ✓ | ✓ | ✓ |
| critDamage | ✓ | ✓ | ✓ | ✓ |
| dodge | ✓ | ✓ | ✓ | ✓ |
| attackSpeed | ✓ | ✓ | ✓ | ✓ |
| moveSpeed | ✓ | ✓ | ✓ | ✓ |
| vision | ✓ | ✓ | ✓ | ✓ |
| allStats | — | — | ✓ | — |
| duration | — | ✓（药水） | — | ✓ |

以上为当前游戏中所有增幅种类及其出现位置的完整列举。若后续新增装备部位、新套装或新系统，只需在对应配置中增加上述键或新的 special/词条即可。
