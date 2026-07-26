'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

global.window = global;

function loadJson(p) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', p), 'utf8'));
}

const ab = loadJson('config/auto-battler-config.json');
const build = loadJson('config/build-simplification.json');
const content = loadJson('config/content-expansion.json');
Object.assign(ab, build.BUILD_SIMPLIFICATION);
const exp = loadJson('config/content-expansion.json').CONTENT_EXPANSION;
ab.relics = (ab.relics || []).concat(exp.relics || []);
window.DEMON_PACT_CONFIG = { pacts: exp.demonPacts || {} };
window.CONFIG = { AUTO_BATTLER_CONFIG: ab, CURSE_CONFIG: loadJson('config/curse-config.json').CURSE_CONFIG };

require('../js/combat-effects-bridge.js');
require('../js/relic-system.js');
require('../js/party-meta-system.js');
require('../js/run-state-system.js');
require('../js/bond-system.js');
require('../js/synergy-matrix.js');
require('../js/curse-system.js');
require('../js/demon-pact.js');

window.BOND_CONFIG = content.CONTENT_EXPANSION.bondConfig;
window.SYNERGY_MATRIX_CONFIG = {
    binary: content.CONTENT_EXPANSION.synergyBinary,
    ternary: content.CONTENT_EXPANSION.synergyTernary || {},
    quaternary: content.CONTENT_EXPANSION.synergyQuaternary || {}
};

const run = window.RunStateSystem.createRunState(window.PartyMetaSystem.createDefaultPartyMeta());
run.relics.push({ id: 'combo_gloves' }, { id: 'giant_belt' });
const fx = window.RelicSystem.aggregateRelicEffects(run.relics);
assert(fx.extraAttackChance >= 0.2, 'combo gloves aggregated');
assert(fx.maxHpMult >= 1.15, 'giant belt aggregated');

window.DemonPact.applyPact(run, 'flesh_sacrifice', 1);
assert(run.ascension.pact.teamAttackMult, 'pact applied');
assert(window.DemonPact.canRestHeal(run), 'default rest ok');
window.DemonPact.applyPact(run, 'hunger_curse', 1);
assert(!window.DemonPact.canRestHeal(run), 'hunger blocks rest');

const battle = { relicFx: fx, allies: [{ side: 'ally', baseClass: 'warrior', hp: 50, maxHp: 100, attack: 10, alive: true }], enemies: [], elapsed: 0 };
window.CombatEffectsBridge.finalizeBattle(battle, run);
assert(battle.runRef === run, 'battle run ref');

const bonds = window.BondSystem.computeActiveBonds(run);
assert(Array.isArray(bonds), 'bonds array');

console.log('test_combat_effects_bridge: OK');
