'use strict';
/**
 * Ascension 高级效果：四元协同、诅咒负面、反转战斗、天气
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

global.window = global;

function loadJson(p) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', p), 'utf8'));
}

const content = loadJson('config/content-expansion.json').CONTENT_EXPANSION;
const ab = loadJson('config/auto-battler-config.json');
Object.assign(ab, loadJson('config/build-simplification.json').BUILD_SIMPLIFICATION);
ab.relics = (ab.relics || []).concat(content.relics || []);

window.CONFIG = {
    AUTO_BATTLER_CONFIG: ab,
    CURSE_CONFIG: loadJson('config/curse-config.json').CURSE_CONFIG,
    WEATHER_CONFIG: content.weatherConfig || {}
};
const curseRoot = window.CONFIG.CURSE_CONFIG;
curseRoot.cursedRelics = curseRoot.cursedRelics || {};
(content.relics || []).forEach((r) => {
    if (!r || r.rarity !== 'curse') return;
    const fx = r.effects || {};
    curseRoot.cursedRelics[r.id] = {
        id: r.id,
        name: r.name,
        positive: fx.positive || {},
        negative: fx.negative || {},
        riskLevel: fx.riskLevel || 3
    };
});
window.CURSE_CONFIG = curseRoot;
window.WEATHER_CONFIG = window.CONFIG.WEATHER_CONFIG;
window.SYNERGY_MATRIX_CONFIG = {
    binary: content.synergyBinary || {},
    ternary: content.synergyTernary || {},
    quaternary: content.synergyQuaternary || {}
};
window.MUTATED_NODE_CONFIG = content.mutatedNodeConfig || {};

require('../js/party-meta-system.js');
require('../js/ascension-hub.js');
require('../js/combat-effects-bridge.js');
require('../js/relic-system.js');
require('../js/run-state-system.js');
require('../js/synergy-matrix.js');
require('../js/curse-system.js');
require('../js/weather-system.js');
require('../js/mutated-node-system.js');
require('../js/demon-pact.js');

const RSS = window.RunStateSystem;
const run = RSS.createRunState(window.PartyMetaSystem.createDefaultPartyMeta());

// 四元协同：元素领主
run.relics = ['scorching_touch', 'frost_core', 'lightning_chain_relic', 'chaos_orb'];
window.SynergyMatrix.refreshFromRun(run);
assert((run.ascension.synergies || []).includes('elemental_lord'), 'elemental_lord synergy active');

const battle = {
    allies: [{ side: 'ally', id: 'a1', attack: 20, hp: 100, maxHp: 100, alive: true }],
    enemies: [{ side: 'enemy', id: 'e1', hp: 100, maxHp: 100, alive: true, defense: 5 }],
    relicFx: {},
    synergyFx: {},
    elapsed: 0
};
window.SynergyMatrix.applyCombatEffects(run, battle);
window.CombatEffectsBridge.finalizeBattle(battle, run);
assert(battle.relicFx.elementalLord, 'elemental lord applied to relicFx');
assert(battle.relicFx.elementalReactionMult >= 2, 'elemental reaction mult');

// infiniteCombo 经 finalizeBattle 合并
const comboBattle = {
    relicFx: {},
    synergyFx: { extraAttackChance: 0.5, infiniteCombo: true },
    allies: [], enemies: [], elapsed: 0
};
window.CombatEffectsBridge.finalizeBattle(comboBattle, run);
assert(comboBattle.relicFx.infiniteCombo === true, 'infiniteCombo merged via finalizeBattle');

// 诅咒：契约锁链遗物上限
run.ascension.cursedRelicIds = ['pact_chain'];
window.CurseSystem.onRelicAcquired(run, 'pact_chain');
assert(window.RelicSystem.softCap(run) >= 24, 'pact_chain raises relic soft cap');

const curseBattle = { allies: [{ attack: 10, defense: 5, maxHp: 100, hp: 100 }] };
window.CurseSystem.onBattleStart(run, curseBattle);
assert(curseBattle.curseBattleFx.hpPerRelicPenalty > 0, 'hp per relic penalty applied');

// 赌徒骰子：随机属性惩罚标记
run.ascension.cursedRelicIds = ['gambler_dice'];
const gamblerMods = window.CurseSystem.buildBattleModifiers(run);
assert(gamblerMods._randomStatPenalty > 0, 'gambler random stat penalty');

// 天气：spawnChance + cooldownMult 映射
const w = window.WeatherSystem.rollWeatherForZone('ashen_wastes', () => 0.1);
assert(!w || w.def, 'weather roll returns def or null');
const wb = {};
window.WeatherSystem.onBattleStart(run, wb);
if (run.ascension.weather && run.ascension.weather.def) {
    run.ascension.weather.def.effects = { cooldownMult: 0.8, fireDamageMult: 0.7 };
    window.WeatherSystem.onBattleStart(run, wb);
    assert(wb.weatherSkillCdMult === 0.8, 'aurora cooldownMult mapped');
    assert(wb.weatherFireDmgMult === 0.7, 'rainstorm fire mult on battle');
}

// 反转战斗：变异节点
const revBattle = {
    allies: [{ id: 'h1', hp: 50, maxHp: 50, alive: true }],
    enemies: [{ id: 'e1', hp: 50, maxHp: 50, alive: true }, { id: 'e2', hp: 50, maxHp: 50, alive: true }]
};
window.MutatedNodeSystem.applyToBattle(revBattle, { mutationId: 'reverse_battle' });
assert(revBattle.mutationReverse === true, 'reverse_battle flag');
assert(revBattle.reverseSelectedId === 'e1', 'first enemy auto-selected');
assert(revBattle.enemies[0].playerControlled === true, 'first enemy player controlled');

// 战前情报视野惩罚
require('../js/pre-combat-intel.js');
run.ascension.visionPenalty = 0.3;
assert(window.PreCombatIntel.accuracy(run) <= 0.7, 'vision penalty reduces intel accuracy');

console.log('test_ascension_advanced: OK');
