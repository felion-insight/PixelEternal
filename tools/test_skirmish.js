'use strict';
/**
 * 瞬间结算：winChance 边界、层数阈值、skirmish 资格
 */
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
    ASCENSION: ascensionConfig.ascension
};
window.ASCENSION_CONFIG = ascensionConfig;

require('../js/party-meta-system.js');
require('../js/run-state-system.js');
require('../js/ascension-hub.js');
require('../js/combat-pacing.js');

const RSS = window.RunStateSystem;
const CP = window.CombatPacing;
const run = RSS.createRunState(window.PartyMetaSystem.createDefaultPartyMeta());
run.heroes.forEach((h) => { h.hp = h.maxHp = 500; h.level = 12; });

const weakEncounter = { enemies: [{ hp: 30, maxHp: 30, attack: 5, defense: 2, alive: true }] };
const strongEncounter = { enemies: [{ hp: 8000, maxHp: 8000, attack: 80, defense: 20, alive: true }] };

assert(!CP.canSkirmish(run, strongEncounter, { type: 'battle', layer: 1 }), 'weak team cannot skirmish strong foe');

run.heroes.forEach((h) => { h.hp = h.maxHp = 5000; h.level = 20; });
assert(CP.canSkirmish(run, weakEncounter, { type: 'battle', layer: 3 }), 'strong team can skirmish weak foe');

assert(!CP.canSkirmish(run, weakEncounter, { type: 'boss', layer: 3 }), 'boss nodes never skirmish');
assert(!CP.canSkirmish(run, weakEncounter, { type: 'elite', layer: 3 }), 'elite nodes never skirmish');

const weakRun = RSS.createRunState(window.PartyMetaSystem.createDefaultPartyMeta());
weakRun.heroes.forEach((h) => { h.hp = h.maxHp = 80; h.level = 1; });

const failResult = CP.resolveSkirmish(weakRun, strongEncounter, () => 0.99);
if (!failResult.victory) {
    assert(failResult.hpLossPct >= 0.6 && failResult.hpLossPct <= 0.9, 'defeat hpLossPct in 0.6–0.9');
}

const lowRatio = CP.resolveSkirmish(weakRun, strongEncounter, () => 0.99);
assert(lowRatio.winChance >= 0.05 && lowRatio.winChance <= 0.95, 'winChance clamped 5–95%');
assert(lowRatio.winChance < 0.5, 'underpowered run has low win chance');

run.heroes.forEach((h) => { h.hp = h.maxHp = 5000; h.level = 20; });
const winResult = CP.resolveSkirmish(run, weakEncounter, () => 0.01);
assert(winResult.winChance >= 0.5, 'overpowered run has high win chance');
assert(winResult.victory === true, 'overpowered skirmish wins with low rng roll');
assert(winResult.hpLossPct >= 0.05 && winResult.hpLossPct <= 0.45, 'victory hpLossPct clamped');
assert(winResult.durationMs === 3000, 'skirmish anim duration 3s');

assert(CP.skirmishThreshold(1) === 2.0, 'layer 1 threshold 2.0');
assert(CP.skirmishThreshold(5) === 1.75, 'layer 5 threshold 1.75');
assert(CP.skirmishThreshold(20) === 1.5, 'late layer uses powerRatioThreshold');

console.log('test_skirmish: OK');
