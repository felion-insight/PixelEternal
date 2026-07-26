/**
 * 精简构筑 + 内容扩展回归
 */
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
window.CONFIG = { AUTO_BATTLER_CONFIG: ab };

require('../js/party-meta-system.js');
require('../js/skill-mutation-system.js');
require('../js/run-state-system.js');
require('../js/synergy-matrix.js');
require('../js/bond-system.js');
require('../js/weather-system.js');
require('../js/mutated-node-system.js');

const RSS = window.RunStateSystem;
const exp = content.CONTENT_EXPANSION;

assert.deepEqual(ab.equipmentSlots, ['weapon', 'armor'], '2-slot equipment');
assert.equal(ab.skillProgression.maxStars, 3, '3 star cap');

const run = RSS.createRunState(window.PartyMetaSystem.createDefaultPartyMeta());
const gear = RSS.makeGearLoot(() => 0.1, 'weapon', 'warrior');
assert.equal(gear.slot, 'weapon', 'archetype weapon');
assert.ok(gear.archetypeId, 'archetype id set');
assert.ok(!gear.affixLines || gear.traitLines, 'no random affix roll');

const hero = run.heroes[0];
hero.skillSlots[0] = RSS.makeSkillEntry('fireball', 2);
RSS.syncStarMutations(hero.skillSlots[0]);
assert(hero.skillSlots[0].branchMods.indexOf('fireball_star2') >= 0, 'star2 mutation applied');

assert.equal(Object.keys(exp.commanderAbilities).length, 12, '12 commander abilities');
assert.equal(exp.relics.length, 37, '37 new relics');
assert.equal(Object.keys(exp.synergyBinary).length, 10, '10 binary synergies');
assert.equal(Object.keys(exp.zones).length, 6, '6 branch zones');
assert.equal(Object.keys(exp.eventChains).length, 5, '5 event chains');
assert.equal(Object.keys(exp.demonPacts).length, 12, '12 demon pacts');
assert.equal(Object.keys(exp.weatherConfig.weathers).length, 5, '5 weathers');
assert.equal(Object.keys(exp.bondConfig.bonds).length, 6, '6 bonds');
assert.equal(Object.keys(exp.mutatedNodeConfig.types).length, 6, '6 mutations');

window.BOND_CONFIG = exp.bondConfig;
window.WEATHER_CONFIG = exp.weatherConfig;
window.MUTATED_NODE_CONFIG = exp.mutatedNodeConfig;
window.SYNERGY_MATRIX_CONFIG = { binary: {}, ternary: {}, classSynergy: {}, quaternary: exp.synergyQuaternary || {} };

const bonds = window.BondSystem.computeActiveBonds(run);
assert(Array.isArray(bonds), 'bond compute');

console.log('test_build_simplification: OK');
