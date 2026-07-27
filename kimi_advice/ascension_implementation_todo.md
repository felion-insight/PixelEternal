# Pixel Eternal Ascension — 完整实施 TODO 清单

**依据文档**（按阅读顺序）：
1. `Pixel_Eternal_Ascension_Design_Doc.md` — 主重构蓝图
2. `more_design.md` — 系统精简 + 内容扩展
3. `map_rouge.md` — 地图/Run 肉鸽感
4. `player_rouge.md` — 构筑肉鸽感

**原则**：每项可独立验收；新系统默认走 `config/ascension-config.json` 开关，可回滚。

**状态图例**：`[ ]` 未开始 · `[~]` 进行中 · `[x]` 已完成

---

## 阶段 0 — 紧急 Bug 修复（P0，预估 1–2 天）

### 0.1 独眼巨人契约视野被覆盖

- [x] **0.1.1** 修复 `js/combat-effects-bridge.js`：`finalizeBattle` 中勿将 `run.ascension.visionHalf` 写成布尔 `true`，保留 pact 的 `'left' | 'right'`
- [x] **0.1.2** 确认 `js/demon-pact.js` 的 `applyToRun` 与 bridge 不重复/冲突
- [x] **0.1.3** 验证 `js/auto-battler-controller.js` Canvas 裁剪：`visionHalf === 'right'` 与 `'left'` 均正确
- [ ] **0.1.4** 测试：选 `cyclops` 契约 → 战斗仅显示对应半屏

**涉及文件**：`js/combat-effects-bridge.js`、`js/demon-pact.js`、`js/auto-battler-controller.js`  
**验收**：右侧黑屏契约生效；左侧契约不受影响

---

### 0.2 终末 Boss P2 指挥官永久禁用

- [x] **0.2.1** 将 `disableCommander: true` 改为限时字段 `disableCommanderMs: 5000`（`js/boss-phase-system.js` + `config/content-expansion.json` 终末 Boss 阶段）
- [x] **0.2.2** `transition()` 设置 `commanderMode.enabled = false` 与 `commanderDisabledUntil = elapsed + ms`
- [x] **0.2.3** 在 `js/ascension-hub.js` 的 `onTickBattle` 或 `boss-phase-system.tick` 中到期恢复 `enabled = true`
- [ ] **0.2.4** 测试：P2 禁 5 秒 → P3/P4 可再用指令

**涉及文件**：`js/boss-phase-system.js`、`js/ascension-hub.js`、`config/content-expansion.json`  
**验收**：与设计文档「P2 禁用指挥官 5 秒」一致

---

### 0.3 协同矩阵静默截断

- [x] **0.3.1** `js/synergy-matrix.js`：`refreshFromRun` 截断前按 tier 排序（quaternary > ternary > binary > class）
- [x] **0.3.2** 将被截断的协同 ID 写入 `run.ascension.synergiesInactive` 供 UI 展示
- [x] **0.3.3** `js/auto-battler-ui.js`：战前情报/构筑面板显示「未激活协同（已达上限）」
- [x] **0.3.4** 单元测试：6+ 协同时截断顺序可预期

**涉及文件**：`js/synergy-matrix.js`、`js/auto-battler-ui.js`、`tools/test_ascension_advanced.js`  
**验收**：玩家知晓哪些协同因上限未生效

---

## 阶段 1 — 主文档对齐（Ascension Doc，P1，预估 3–5 天）

### 1.1 瞬间结算：动画 + 数值

- [x] **1.1.1** `js/combat-pacing.js`：`winChance` 改为 `clamp(0.05, 0.95, 0.5 + (ratio - 1) * 0.3)`
- [x] **1.1.2** 失败 `hpLossPct` 对齐设计：胜利 `0.3/ratio + noise`，失败 `0.6–0.9`
- [x] **1.1.3** 新增 phase `skirmish_anim`（`js/auto-battler-controller.js`）
- [x] **1.1.4** `js/auto-battler-ui.js`：3 秒简化动画（冲出→碰撞→数字→倒地→战利品）
- [x] **1.1.5** 动画结束后才应用 HP 变化与发奖
- [x] **1.1.6** 测试：低 ratio 仍有 ~5% 翻车；动画可见

**涉及文件**：`js/combat-pacing.js`、`js/auto-battler-controller.js`、`js/auto-battler-ui.js`  
**验收**：有 3 秒流程；数值与主文档 §4.1.1 一致

---

### 1.2 指挥官模式交互层

- [x] **1.2.1** Canvas 绘制半透明指挥官幽灵（读 `battle.commanderMode.ghost`）
- [x] **1.2.2** 鼠标/触摸拖拽 → `CommanderMode.setGhostPosition`
- [x] **1.2.3** 需选目标指令（集火/后撤/放逐/换位等）改为点击单位确认，替代纯 `pickAbilityTarget` 自动选
- [x] **1.2.4** 能量不足/冷却中 UI 反馈（条抖动、按钮 disabled 态）对齐主文档 §3.3.3
- [ ] **1.2.5**（可选）单位上方径向指令菜单

**涉及文件**：`js/auto-battler-controller.js`、`js/auto-battler-ui.js`、`js/commander-mode.js`  
**验收**：玩家可手动集火；幽灵可见可拖

---

### 1.3 指挥官 TE — 友方阵亡恢复

- [x] **1.3.1** `js/commander-mode.js` 新增 `onAllyDeath(cm)`，读 `regenPerAllyDeath: 15`
- [x] **1.3.2** `js/ascension-hub.js` 友方死亡钩子调用 `onAllyDeath`
- [x] **1.3.3** Juice：`energy_gain_death` 事件（`js/juice-core.js`）

**涉及文件**：`js/commander-mode.js`、`js/ascension-hub.js`、`js/juice-core.js`  
**验收**：友方阵亡 TE +15

---

### 1.4 扩展区域环境特质 runtime

- [x] **1.4.1** 新建 `js/zone-trait-runtime.js`（或扩展 `zone-ecology.js` + `combat-effects-bridge.js`）
- [x] **1.4.2** 实现 `poisonIntervalMs` / `poisonDpsPct` — 周期性随机中毒
- [x] **1.4.3** 实现 `iceSlideChance` / `stunMs` — 移动滑倒
- [x] **1.4.4** 实现 `lightningIntervalMs` / `lightningDamage` — 全场落雷
- [x] **1.4.5** 实现 `goldDropMult` — 战斗奖励倍率
- [x] **1.4.6** 实现 `hazard.poisonStack` — 毒池地形叠加
- [x] **1.4.7** 在 `ascension-hub.onTickBattle` 或 `combat-effects-bridge.tickBattle` 调用 zone trait tick
- [x] **1.4.8** 测试：腐化沼泽 / 雷霆高原 / 冰封要塞 特质可感知

**涉及文件**：新建 `js/zone-trait-runtime.js`，改 `js/zone-ecology.js`、`js/combat-effects-bridge.js`、`js/ascension-hub.js`  
**配置**：`config/content-expansion.json` zones、`config/zone-ecology-config.json`  
**验收**：`battle.zoneTrait` 不再只是赋值不消费

---

### 1.5 Boss 阶段阈值与机制对齐

- [x] **1.5.1** 狱门守将：P2 threshold 0.66→**0.60**，P3 0.33→**0.25**
- [x] **1.5.2** 对照主文档 §4.2.2 四 Boss + more_design §2.5 六 Boss 逐阶段核对（`content-expansion.json` + `BOSS_PHASES_EXPANSION`）
- [x] **1.5.3** 确认各 phase flag（`healReverse`/`mirrorAllies`/`goldShield`/`bossRewindMs` 等）在 `combat-effects-bridge.tickBattle` 生效
- [x] **1.5.4** UI 显示 `commanderHint` / 阶段 banner（`auto-battler-controller.js` Canvas banner）

**涉及文件**：`js/boss-phase-system.js`、`js/combat-effects-bridge.js`、`config/content-expansion.json`  
**验收**：10 个 Boss 阶段与设计表一致

---

### 1.6 装备精简彻底化

- [~] **1.6.1** 移除或禁用 `js/run-state-system.js` 中 `makeGearLootLegacy()` 及 affix 随机逻辑（已改走 `makeGearLootMinimal`，legacy 函数仍保留未删）
- [x] **1.6.2** `js/auto-battler-ui.js` 移除 `head/chest/hands/feet` 槽位 UI（仅保留 weapon/armor）
- [x] **1.6.3** 统一 `maxStars`：所有 fallback `|| 5` 改为读 `skillProgressionCfg().maxStars`（默认 3）
- [x] **1.6.4** 清理 `config/auto-battler-config.json` lineages 内纯数值 `damageMult: 1.12` 升星条目
- [~] **1.6.5** 确认 `config/build-simplification.json` 的 `starMutations` 覆盖所有常用技能，或文档标注范围（当前覆盖核心 4 职业主技能；其余走默认升星）
- [ ] **1.6.6** 测试：掉落仅 2 槽 archetype；3 星仅质变无 +12% 堆叠

**涉及文件**：`js/run-state-system.js`、`js/auto-battler-ui.js`、`config/auto-battler-config.json`、`config/build-simplification.json`  
**验收**：more_design §1 精简架构落地

---

## 阶段 2 — 地图层肉鸽感（map_rouge，P2，预估 ~1 周）

> 新系统建议先在 `config/ascension-config.json` 增加开关，默认 `enabled: false`。

### 2.0 配置开关

- [x] **2.0.1** `config/ascension-config.json` 新增：
  - `runZoneRandomizer`
  - `enemyMutations`
  - `intelTiers`
  - `zoneMutations`（见 `config/zone-mutations-config.json`）

---

### 2.1 区域完全随机化

- [x] **2.1.1** 新建 `js/run-zone-generator.js`
- [x] **2.1.2** 新建 `config/zone-mutations-config.json`（elite_rich / cursed / no_heal / double_gold 等）
- [x] **2.1.3** `generateRunZones(rng)`：从 10 区池随机 3–5 区 + shuffle
- [x] **2.1.4** 每区 roll 1 个 zone mutation → `run.ascension.zoneMutations`
- [x] **2.1.5** `js/run-state-system.js` Run 开局调用；写入 `run.ascension.zoneLayout`（经 `ascension-hub.onStartRun`）
- [x] **2.1.6** `js/zone-ecology.js` 优先读 run 级 layout，固定 layout 作 fallback
- [x] **2.1.7** 修复 `js/config-loader.js`：`branchZones` 仅 append `branchZone: true` 的区域
- [x] **2.1.8** UI：地图 HUD 显示当前区 + mutation 名
- [x] **2.1.9** 测试：区域 mutation 禁疗/双倍金币（`test_ascension_advanced.js`）
- [x] **2.1.10** 新建 `js/zone-mutation-runtime.js`：禁疗/双倍金/精英权重/战前换位/强制诅咒 runtime

**涉及文件**：新建 `js/run-zone-generator.js`、`config/zone-mutations-config.json`，改 `js/run-state-system.js`、`js/zone-ecology.js`、`js/config-loader.js`、`config/ascension-config.json`  
**验收**：map_rouge 方向 1

---

### 2.2 战前情报分级（信息不透明）

- [x] **2.2.1** 新建情报 tier 枚举：`none | count_only | types | intents_1 | intents_2 | full`
- [x] **2.2.2** `js/pre-combat-intel.js` 重构：`analyze()` 按 tier 过滤输出
- [x] **2.2.3** 默认 tier = `count_only`（仅数量，名称 `[???]`，无意图）
- [x] **2.2.4** 遗物映射：`tactical_goggles`→types，`scout_eye`→intents_1，`prophecy_scroll`→full（配置化）
- [x] **2.2.5** 诅咒「盲目」降级；`visionPenalty` 叠加
- [x] **2.2.6** `js/auto-battler-ui.js` `renderDeployIntel()` 按 tier 渲染
- [x] **2.2.7** `config/ascension-config.json`：`intelTiers.defaultTier`、`enabled`
- [x] **2.2.8** 测试：无遗物看不到类型；逐级解锁（`test_ascension_advanced.js` count_only）

**涉及文件**：`js/pre-combat-intel.js`、`js/auto-battler-ui.js`、`config/ascension-config.json`、遗物配置  
**验收**：map_rouge 方向 4

---

### 2.3 敌人变异系统

- [x] **2.3.1** 新建 `config/enemy-mutations-config.json`（狂暴/硬化/分裂/吸血/反伤/瞬移/复活/召唤）
- [x] **2.3.2** 新建 `js/enemy-mutation-system.js`
- [x] **2.3.3** 遭遇生成时 30% roll 1 mutation → 修改 stat + 行为 hook
- [x] **2.3.4** `js/auto-battle-simulator.js` 接入变异 AI（分裂死亡、周期瞬移、复活等）
- [x] **2.3.5** Canvas/UI aura 色标识
- [x] **2.3.6** 战前情报（tier≥types）显示变异名
- [ ] **2.3.7** 测试：同模板敌人可有不同变异

**涉及文件**：新建 `js/enemy-mutation-system.js`、`config/enemy-mutations-config.json`，改 `js/auto-battler-controller.js`、`js/auto-battle-simulator.js`、`js/auto-battler-ui.js`  
**验收**：map_rouge 方向 2

---

## 阶段 3 — 构筑层肉鸽感（player_rouge，P2，预估 ~2 周）

### 3.0 配置开关

- [x] **3.0.1** `config/ascension-config.json` 新增：
  - `skillRunMutations`
  - `classVariants`
  - `buildCommitment`
  - `runMechanics`
  - `relicExclusivity`
  - `negativeSynergies`

---

### 3.1 技能 Run 内随机改造

- [x] **3.1.1** 新建 `config/skill-run-mutations-config.json`（split/overload/echo/burn 等 12 种）
- [x] **3.1.2** `js/run-state-system.js`：获得技能时 roll 0–2 改造
- [x] **3.1.3** `js/skill-run-mutation-system.js`：应用 run mutation（与 lineage branchMods 叠加）
- [x] **3.1.4** 显示名：`火球·分裂·燃烧`
- [x] **3.1.5** UI 技能面板展示改造 tag
- [x] **3.1.6** 测试：两局同 skillId 效果可不同

**涉及文件**：新建 `config/skill-run-mutations-config.json`，改 `js/run-state-system.js`、`js/skill-mutation-system.js`、`js/auto-battler-ui.js`  
**验收**：player_rouge 维度 1

---

### 3.2 职业变异（开局选择）

- [x] **3.2.1** 新建 `config/class-variants-config.json`（4 职业 × 3 变异）
- [x] **3.2.2** 新建 `js/class-variant-system.js`
- [x] **3.2.3** 开局 UI：每职业展示 2 个随机变异选项，选 1
- [x] **3.2.4** 写入 `hero.classVariant`；`auto-battle-simulator` 战斗 stat hook
- [x] **3.2.5** 测试：本局选定后不可更改

**涉及文件**：新建 `js/class-variant-system.js`、`config/class-variants-config.json`，改 `js/auto-battler-ui.js`、`js/run-state-system.js`、`js/party-meta-system.js`  
**验收**：player_rouge 维度 3

---

### 3.3 构筑路径承诺（Build Commitment）

- [x] **3.3.1** 新建 `config/build-commitment-config.json`（第 5 层 / 第 15 层选择点）
- [x] **3.3.2** 新建 `js/build-commitment-system.js`
- [x] **3.3.3** `js/tower-run-map.js`：特定层强制 commitment 节点
- [x] **3.3.4** `js/relic-system.js` / 商店：按 `run.ascension.buildPath` 调整 tag 权重 ±50%
- [x] **3.3.5** 技能改造 roll 权重偏移（与 3.1 联动）
- [x] **3.3.6** UI：选择后显示当前路径与锁定提示
- [x] **3.3.7** 测试：选火系后冰系遗物显著减少

**涉及文件**：新建 `js/build-commitment-system.js`、`config/build-commitment-config.json`，改 `js/tower-run-map.js`、`js/relic-system.js`、`js/run-state-system.js`  
**验收**：player_rouge 维度 4

---

### 3.4 遗物互斥 + 效果浮动

- [x] **3.4.1** 新建 `config/relic-exclusivity-config.json`（互斥组 + variance 0.2）
- [x] **3.4.2** `js/relic-system.js`：拾取时检测互斥，拒绝或提示替换
- [x] **3.4.3** 掉落时 roll `effectValue` multiplier；UI 品质标签（劣质/普通/优秀）
- [x] **3.4.4** 测试：持有灼热之触时无法拿寒冰核心

**涉及文件**：新建 `config/relic-exclusivity-config.json`，改 `js/relic-system.js`、`js/run-state-system.js`、`js/auto-battler-ui.js`  
**验收**：map_rouge 方向 3

---

### 3.5 Run 专属全局机制

- [x] **3.5.1** 新建 `config/run-mechanics-config.json`（元素潮汐/生命交易/技能饥渴等 10 种）
- [x] **3.5.2** 新建 `js/run-mechanic-system.js`
- [x] **3.5.3** Run 开局 roll 1 机制 → `run.ascension.runMechanic`
- [x] **3.5.4** `js/auto-battler-controller.js` 商店生命交易 hook（`life_trade`）
- [x] **3.5.5** HUD 常驻显示机制名 + 说明
- [x] **3.5.6** 测试：两局机制不同且全局生效

**涉及文件**：新建 `js/run-mechanic-system.js`、`config/run-mechanics-config.json`，改 `js/run-state-system.js`、`js/combat-effects-bridge.js`、`js/auto-battler-ui.js`  
**验收**：player_rouge 维度 6

---

### 3.6 负面构筑组合（Negative Synergy）

- [x] **3.6.1** 配置负面协同表（如 生命-50% + 防御-50% → 濒死狂怒）
- [x] **3.6.2** `js/synergy-matrix.js` 扩展检测负面组合 OR 新建 `negative` tier
- [ ] **3.6.3** 触发时 VFX + 命名展示（`js/synergy-vfx.js`）
- [x] **3.6.4** 测试：特定「垃圾」遗物组合产生隐藏强力效果

**涉及文件**：`config/synergy-matrix-config.json` 或 content-expansion，`js/synergy-matrix.js`  
**验收**：player_rouge 维度 5

---

## 阶段 4 — 内容补全（more_design，P3，预估 1–2 周）

### 4.1 恶魔契约补全（目标 ~30）

- [x] **4.1.1** 对照主文档 §8 + more_design §2.7，列出缺失 pact ID
- [x] **4.1.2** 补全 `config/demon-pact-config.json` / `content-expansion.json`（当前 **28** 条）
- [x] **4.1.3** 基础契约 hook：`enemyAttackMult` / `shopPriceMult` / `relicDropMult`（`demon-pact.js` + controller）
- [x] **4.1.4** `listChoices()` ≥ 28 条；UI 按 stars 分组

**验收**：more_design §2.7 表格条目均可选可玩

---

### 4.2 指挥官指令（目标 23 — 已基本达成）

- [x] **4.2.1** 核对合并后 23 条指令均有 `js/commander-abilities.js` case
- [x] **4.2.2** 补全缺失 effectType handler（`time_rewind` 战斗快照回溯）
- [x] **4.2.3** 解锁条件（pact stars / zone / chain / relic）UI 可见
- [x] **4.2.4** `unlockPactStars` 与 5 星上限对齐（7/10/15 → 4/5/5）

**验收**：more_design §2.1 全部可释放

---

### 4.3 遗物 + 协同 runtime 审计

- [x] **4.3.1** 核心扩展遗物 handler：`blood_pact_synergy` / `mirror_core` / `time_warp_device`
- [x] **4.3.2** 协同 type 对齐 + 补 handler（`range_bonus`、`low_hp_berserk`、`blade_dance` 等）
- [x] **4.3.3** 配置修正：`full_assault` / `true_phoenix` required 引用错误
- [ ] **4.3.4** 规则改变型遗物（双持者/血法师/玻璃炮等）优先补 handler — **runtime 已接**；`dualWeaponSlots` 装备槽 UI 待补

**验收**：配置与 runtime 一一对应，无「空壳遗物」

---

### 4.4 事件链全路径

- [x] **4.4.1** 8 条链（3 基础 + 5 扩展）trigger 条件接入地图/事件（`tryStartChainByTrigger`）
- [x] **4.4.2** 分支 choice 效果：`rewards.relic` / `rewards.gear` / `randomEncounter` / `battlesInRow`
- [x] **4.4.3** Meta 解锁与 `death-narrative.js` 联动（事件链完成 + metaUnlock 展示）
- [x] **4.4.4** 商人复仇链 walkthrough 测试（`merchant_revenge` → `fortune_coin`）

**涉及文件**：`js/event-chain-system.js`、`js/auto-battler-events.js`、`config/event-chains-config.json`  
**验收**：more_design §2.6 八条链可从头到尾跑通

---

### 4.5 小系统内容核对

- [x] **4.5.1** 天气 5 种 — `js/weather-system.js` 效果全覆盖
- [x] **4.5.2** 羁绊 6 种 — `js/bond-system.js` 相邻判定与效果
- [x] **4.5.3** 变异节点 6 种 — `js/mutated-node-system.js`（含 reverse_battle 可控性）
- [x] **4.5.4** 扩展 6 区域 + 6 Boss — 与阶段 1.4 / 1.5 联动验收（`zone-trait-runtime` + `boss-phase-system` + `test_ascension_advanced.js`）

**验收**：more_design §2.4–2.8 + 系统 A/B/C

---

### 4.6 Juice 音效（Polish，可选）

- [ ] **4.6.1** `config/juice-config.json` 映射真实 mp3 资源
- [ ] **4.6.2** 替换 `js/juice-core.js` audioStub → 真实 `playGameSound`
- [ ] **4.6.3** 分层：击杀 / 协同激活 / 指挥官 / Boss 阶段 / 瞬间结算

**验收**：主文档 §12 感官反馈非 stub

---

## 阶段 5 — 配置、加载与测试（贯穿全程）

### 5.1 配置加载

- [x] **5.1.1** `js/config-loader.js` 加载所有新 config JSON
- [x] **5.1.2** `mergeContentExpansion` refactor：`mergeExpansionZones/Pacts/Chains` 增量 merge
- [x] **5.1.3** `js/config.js` / `assignToGlobals` 暴露新命名空间（含 `BOSS_PHASES_EXPANSION`）
- [x] **5.1.4** deployment 目录同步（`deploy.py` 复制 `config/*.json` + `js/*.js`）

---

### 5.2 单元 / 回归测试

- [x] **5.2.1** `tools/test_ascension_systems.js` — TE 阵亡、时停、visionHalf
- [x] **5.2.2** `tools/test_ascension_advanced.js` — 协同截断、zone trait、负面协同、4.5.4
- [x] **5.2.3** 新建 `tools/test_skirmish.js` — winChance 边界、skirmish 阈值
- [x] **5.2.4** 新建 `tools/test_rogue_systems.js` — 区域随机、敌人变异、intel tier、build commitment
- [x] **5.2.5** CI / 本地脚本：`tools/run_ascension_tests.js`

---

### 5.3 文档与开关

- [x] **5.3.1** 更新 `config/ascension-config.json` + README「Ascension 开关」表
- [x] **5.3.2** 主设计文档落地状态：`README.md` ↔ `ascension_implementation_todo.md` 互链
- [x] **5.3.3** `code-safe.md` 补充 Ascension 模块回滚说明

---

## 推荐实施顺序（单线排期）

| 周次 | 任务 ID | 说明 |
|------|---------|------|
| W1 | 0.1 → 0.2 → 0.3 → 1.3 → 1.6 | Bug + 小改先行 |
| W2 | 1.1 → 1.2 → 1.4 → 1.5 | 主文档核心体验 |
| W3 | 2.0 → 2.2 → 2.3 → 2.1 | 肉鸽感：情报 + 敌人变异 + 区域随机 |
| W4 | 3.1 → 3.4 → 3.3 | 构筑：技能改造 + 互斥 + 路径承诺 |
| W5 | 3.2 → 3.5 → 3.6 | 职业变异 + Run 机制 + 负面协同 |
| W6+ | 4.x + 5.x | 内容补全、测试、Juice polish |

---

## 新建文件一览

| 路径 | 用途 |
|------|------|
| `js/run-zone-generator.js` | Run 区域随机 + zone mutation |
| `js/zone-trait-runtime.js` | 区域特质 tick（可选，可并入 zone-ecology） |
| `js/enemy-mutation-system.js` | 敌人变异 |
| `js/class-variant-system.js` | 职业变异 |
| `js/build-commitment-system.js` | 构筑路径承诺 |
| `js/run-mechanic-system.js` | Run 全局机制 |
| `config/zone-mutations-config.json` | 区域 mutation 规则 |
| `config/enemy-mutations-config.json` | 敌人变异表 |
| `config/skill-run-mutations-config.json` | 技能 Run 改造 |
| `config/class-variants-config.json` | 职业变异表 |
| `config/build-commitment-config.json` | 路径承诺节点 |
| `config/run-mechanics-config.json` | Run 机制池 |
| `config/relic-exclusivity-config.json` | 遗物互斥 + 浮动 |
| `tools/test_skirmish.js` | 瞬间结算测试 |
| `tools/test_rogue_systems.js` | 肉鸽系统测试 |

---

## 进度统计

| 阶段 | 任务组数 | 子项约计 | 完成 |
|------|----------|----------|------|
| 0 紧急 Bug | 3 | 12 | 0 |
| 1 主文档对齐 | 6 | 35 | 0 |
| 2 地图肉鸽 | 4 | 28 | 0 |
| 3 构筑肉鸽 | 7 | 38 | 0 |
| 4 内容补全 | 6 | 22 | 0 |
| 5 配置测试 | 3 | 12 | 0 |
| **合计** | **29** | **~147** | **0** |

> 实施时在 `[ ]` 改为 `[x]` 并更新上表完成数。

---

*生成日期：2026-07-27 · 与 `kimi_advice/` 设计文档配套使用*
