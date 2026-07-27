'use strict';
/**
 * 肉鸽系统：区域随机、敌人变异、情报分级、构筑承诺
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

global.window = global;

function loadJson(p) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', p), 'utf8'));
}

const content = loadJson('config/content-expansion.json').CONTENT_EXPANSION;
const ascensionConfig = loadJson('config/ascension-config.json');
window.CONFIG = {
    AUTO_BATTLER_CONFIG: loadJson('config/auto-battler-config.json'),
    ASCENSION: ascensionConfig.ascension
};
window.ASCENSION_CONFIG = ascensionConfig;
window.ZONE_ECOLOGY_CONFIG = loadJson('config/zone-ecology-config.json').ZONE_ECOLOGY_CONFIG;
Object.assign(window.ZONE_ECOLOGY_CONFIG.zones, content.zones || {});
window.ZONE_MUTATIONS_CONFIG = loadJson('config/zone-mutations-config.json').ZONE_MUTATIONS_CONFIG;
window.ENEMY_MUTATIONS_CONFIG = loadJson('config/enemy-mutations-config.json').ENEMY_MUTATIONS_CONFIG;
window.BUILD_COMMITMENT_CONFIG = loadJson('config/build-commitment-config.json').BUILD_COMMITMENT_CONFIG;
window.RELIC_EXCLUSIVITY_CONFIG = loadJson('config/relic-exclusivity-config.json').RELIC_EXCLUSIVITY_CONFIG;

require('../js/party-meta-system.js');
require('../js/ascension-hub.js');
require('../js/run-state-system.js');
require('../js/run-zone-generator.js');
require('../js/zone-mutation-runtime.js');
require('../js/enemy-mutation-system.js');
require('../js/pre-combat-intel.js');
require('../js/build-commitment-system.js');

const RSS = window.RunStateSystem;
const meta = window.PartyMetaSystem.createDefaultPartyMeta();

window.ASCENSION_CONFIG.ascension.runZoneRandomizer = { enabled: true, minZones: 3, maxZones: 5 };
window.ASCENSION_CONFIG.ascension.enemyMutations = { enabled: true, chance: 1 };
window.ASCENSION_CONFIG.ascension.intelTiers = {
    enabled: true,
    defaultTier: 'count_only',
    relicBoosts: {
        tactical_goggles: 'types',
        scout_eye: 'intents_1',
        prophecy_scroll: 'full'
    }
};
window.ASCENSION_CONFIG.ascension.buildCommitment = { enabled: true };

const runA = RSS.createRunState(meta);
const runB = RSS.createRunState(meta);
const genA = window.RunZoneGenerator.generateRunZones(runA, () => 0.1);
const genB = window.RunZoneGenerator.generateRunZones(runB, () => 0.9);
runA.ascension.zoneLayout = genA.layout;
runA.ascension.zoneMutations = genA.mutations;
runB.ascension.zoneLayout = genB.layout;
runB.ascension.zoneMutations = genB.mutations;
assert(runA.ascension.zoneLayout && runA.ascension.zoneLayout.length >= 3, 'run zone layout generated');
assert(
    JSON.stringify(runA.ascension.zoneLayout) !== JSON.stringify(runB.ascension.zoneLayout) ||
    JSON.stringify(runA.ascension.zoneMutations) !== JSON.stringify(runB.ascension.zoneMutations),
    'different seeds yield different run layouts or mutations'
);

const enemy = { id: 'e1', hp: 100, maxHp: 100, attack: 10, defense: 4, alive: true };
const mutated = window.EnemyMutationSystem.mutateEncounterEnemies([Object.assign({}, enemy)], () => 0.05);
assert(mutated[0].mutationId, 'enemy mutation applied when enabled');

const intelRun = RSS.createRunState(meta);
const intel = window.PreCombatIntel.analyze(intelRun, {
    enemies: [{ name: 'Grunt', hp: 100, attack: 10 }]
}, { type: 'battle' });
assert(intel.tier === 'count_only', 'default intel tier count_only');
assert(intel.intents[0].name === '[???]', 'count_only hides enemy name');

intelRun.relics = ['tactical_goggles'];
const intelTypes = window.PreCombatIntel.analyze(intelRun, {
    enemies: [{ name: 'Grunt', hp: 100, attack: 10 }]
}, { type: 'battle' });
assert(intelTypes.tier === 'types' || intelTypes.intents[0].name !== '[???]', 'tactical_goggles upgrades intel');

const commitRun = RSS.createRunState(meta);
const choices = window.BuildCommitmentSystem.getChoices(commitRun, 5);
assert(choices && choices.length >= 2, 'build commitment choices at layer 5');

console.log('test_rogue_systems: OK');
