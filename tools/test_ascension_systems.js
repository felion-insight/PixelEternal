/**
 * Ascension 系统回归：开关回滚 + 命名空间 + 钩子
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

global.window = global;

const ascensionConfig = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../config/ascension-config.json'), 'utf8')
);
window.CONFIG = {
    AUTO_BATTLER_CONFIG: JSON.parse(
        fs.readFileSync(path.join(__dirname, '../config/auto-battler-config.json'), 'utf8')
    ),
    ASCENSION: ascensionConfig.ascension,
    JUICE_CONFIG: JSON.parse(fs.readFileSync(path.join(__dirname, '../config/juice-config.json'), 'utf8')).JUICE_CONFIG,
    COMMANDER_CONFIG: JSON.parse(fs.readFileSync(path.join(__dirname, '../config/commander-config.json'), 'utf8')).COMMANDER_CONFIG,
    SYNERGY_MATRIX_CONFIG: JSON.parse(fs.readFileSync(path.join(__dirname, '../config/synergy-matrix-config.json'), 'utf8')).SYNERGY_MATRIX_CONFIG,
    ZONE_ECOLOGY_CONFIG: JSON.parse(fs.readFileSync(path.join(__dirname, '../config/zone-ecology-config.json'), 'utf8')).ZONE_ECOLOGY_CONFIG,
    CURSE_CONFIG: JSON.parse(fs.readFileSync(path.join(__dirname, '../config/curse-config.json'), 'utf8')).CURSE_CONFIG,
    DEMON_PACT_CONFIG: JSON.parse(fs.readFileSync(path.join(__dirname, '../config/demon-pact-config.json'), 'utf8')).DEMON_PACT_CONFIG,
    EVENT_CHAINS_CONFIG: JSON.parse(fs.readFileSync(path.join(__dirname, '../config/event-chains-config.json'), 'utf8')).EVENT_CHAINS_CONFIG
};

require('../js/party-meta-system.js');
require('../js/ascension-hub.js');
require('../js/juice-core.js');
require('../js/juice-vfx.js');
require('../js/combat-pacing.js');
require('../js/commander-mode.js');
require('../js/commander-abilities.js');
require('../js/boss-phase-system.js');
require('../js/synergy-matrix.js');
require('../js/synergy-vfx.js');
require('../js/zone-ecology.js');
require('../js/curse-system.js');
require('../js/demon-pact.js');
require('../js/pre-combat-intel.js');
require('../js/run-analytics.js');
require('../js/death-narrative.js');
require('../js/event-chain-system.js');
require('../js/run-state-system.js');

const Hub = window.AscensionHub;
const PMS = window.PartyMetaSystem;
const RSS = window.RunStateSystem;

// P0: 命名空间
const meta = PMS.createDefaultPartyMeta();
assert(meta.ascension, 'meta.ascension exists');
assert(Array.isArray(meta.ascension.deathArchive), 'deathArchive array');

const run = RSS.createRunState(meta);
assert(run.ascension, 'run.ascension exists');
assert(run.ascension.corruption === 0, 'corruption starts at 0');

// P0: 开关读取
assert(Hub.isEnabled('juiceSystem') === true, 'juice enabled by default');
assert(Hub.isEnabled('commanderMode') === true, 'commander enabled');

// P0-7: 全关 = 行为回退（钩子 no-op）
function disableAllAscension(cfg) {
    Object.keys(cfg).forEach((k) => {
        if (cfg[k] && typeof cfg[k] === 'object' && 'enabled' in cfg[k]) cfg[k].enabled = false;
    });
}
const rollbackCfg = JSON.parse(JSON.stringify(ascensionConfig.ascension));
disableAllAscension(rollbackCfg);
window.CONFIG.ASCENSION = rollbackCfg;
assert(Hub.isEnabled('juiceSystem') === false, 'rollback disables juice');
assert(Hub.isEnabled('synergyMatrix') === false, 'rollback disables synergy');

// 恢复全开配置
window.CONFIG.ASCENSION = ascensionConfig.ascension;

// 协同：黄金律
run.relics = ['greedy_purse', 'fortune_coin'];
Hub.onRelicAcquired(run, 'fortune_coin');
const syn = window.SynergyMatrix.refreshFromRun(run);
assert(syn.indexOf('golden_rule') >= 0, 'golden_rule synergy activates');

// 瞬间结算
run.heroes.forEach((h) => { h.hp = h.maxHp = 500; h.level = 10; });
const sk = window.CombatPacing.resolveSkirmish(run, {
    enemies: [{ hp: 50, maxHp: 50, attack: 5, defense: 2, alive: true }]
}, () => 0.1);
assert(sk.victory === true, 'skirmish victory when strong');

// 腐化阈值
window.CurseSystem.addCorruption(run, 25);
assert(run.ascension.corruption >= 20, 'corruption threshold crossed');
const cfx = window.CurseSystem.getCorruptionEffects(run);
assert(cfx.enemyAttackMult > 1, 'corruption buffs enemies');

// 契约
const meta2 = PMS.createDefaultPartyMeta();
meta2.ascension.firstVictory = true;
assert(window.DemonPact.isUnlocked(meta2), 'pact unlocked after victory');
window.DemonPact.applyPact(run, 'wrath', 2);
assert(run.ascension.pact.id === 'wrath', 'pact applied');

// 事件链
window.EventChainSystem.startChain(run, 'lost_legion', 'll_1');
const adv1 = window.EventChainSystem.advanceChain(run, 'lost_legion', 'explore');
assert(adv1 && run.ascension.activeChains[0].currentNode === 'll_2', 'chain advances');
const adv2 = window.EventChainSystem.advanceChain(run, 'lost_legion', 'awaken');
assert(adv2 && adv2.corruption === 10, 'chain choice applies corruption');

// 战前情报
const intel = window.PreCombatIntel.analyze(run, {
    enemies: [{ name: '魔卒', attack: 10, hp: 100, range: 50 }]
}, { type: 'battle' });
assert(intel.enabled && intel.threat, 'intel report');

// 指挥官
const fakeBattle = {
    allies: [], enemies: [], elapsed: 0,
    boardOriginX: 100, boardOriginY: 200,
    combat: {}, relicFx: {}
};
Hub.onBattleStart(run, fakeBattle, { type: 'battle', layer: 1 });
assert(fakeBattle.commanderMode || !Hub.isEnabled('commanderMode'), 'commander attached when enabled');
assert(fakeBattle.juiceSystem, 'juice attached');

// P0：cyclops 契约 visionHalf 保留字符串方向
const contentExp = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/content-expansion.json'), 'utf8')).CONTENT_EXPANSION;
window.DEMON_PACT_CONFIG = window.CONFIG.DEMON_PACT_CONFIG || { pacts: {} };
window.DEMON_PACT_CONFIG.pacts = Object.assign({}, window.DEMON_PACT_CONFIG.pacts || {}, contentExp.demonPacts || {});
require('../js/combat-effects-bridge.js');
const visionRun = RSS.createRunState(meta2);
window.DemonPact.applyPact(visionRun, 'cyclops', 1);
const visionBattle = { allies: [], enemies: [], elapsed: 0, relicFx: {}, runRef: visionRun };
window.CombatEffectsBridge.finalizeBattle(visionBattle, visionRun);
assert(visionRun.ascension.visionHalf === 'left', 'cyclops pact sets visionHalf left string');

// P1：指挥官 TE 友方阵亡 +15
const cmBattle = {
    allies: [], enemies: [], elapsed: 0,
    boardOriginX: 100, boardOriginY: 200,
    combat: {}, relicFx: {}, runRef: run
};
Hub.onBattleStart(run, cmBattle, { type: 'battle', layer: 1 });
const cm = cmBattle.commanderMode;
assert(cm, 'commander mode for TE test');
const beforeTe = cm.energy;
window.CommanderMode.onAllyDeath(cm);
assert(cm.energy >= beforeTe + 14, 'onAllyDeath grants ~15 TE');

// P1：时停指令
const tsBattle = {
    allies: [], enemies: [], elapsed: 0,
    boardOriginX: 100, boardOriginY: 200,
    combat: {}, relicFx: {}, timeStopRemaining: 0, runRef: run
};
cm.battle = tsBattle;
window.COMMANDER_CONFIG = window.CONFIG.COMMANDER_CONFIG;
window.CommanderAbilities.execute(cm, window.COMMANDER_CONFIG.abilities.time_stop, null);
assert(tsBattle.timeStopRemaining > 0, 'time_stop sets timeStopRemaining');

// 指挥官编成：局内仅携带 slotCount 个指令
run.ascension.commanderLoadout = [];
run.ascension.commanderLoadoutCustomized = false;
window.CommanderMode.ensureLoadout(run);
const slots = window.CommanderMode.getSlotCount(run);
assert.equal(slots, 4, 'default slot count is 4');
const loadout = window.CommanderMode.getLoadout(run);
assert.equal(loadout.length, slots, 'default loadout fills all slots');
assert(window.CommanderMode.setLoadout(run, loadout.slice(0, 2)) === false, 'partial loadout rejected');
assert(window.CommanderMode.setLoadout(run, loadout) === true, 'full loadout saved');
const cmLoadoutBattle = {
    allies: [], enemies: [], elapsed: 0,
    boardOriginX: 100, boardOriginY: 200,
    combat: {}, relicFx: {}, runRef: run
};
Hub.onBattleStart(run, cmLoadoutBattle, { type: 'battle', layer: 1 });
assert.equal(cmLoadoutBattle.commanderMode.abilityIds.length, slots, 'battle uses equipped loadout only');

console.log('test_ascension_systems: all assertions passed');
