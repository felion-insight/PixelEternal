/**
 * 毕业套装亲和掉落烟雾
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
function loadJson(rel) {
    return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

global.window = global;
global.BASE_TYPES = loadJson('config/base-types.json');
global.AFFIX_POOL = loadJson('config/affix-pool.json');
global.LEGENDARY_POWERS = loadJson('config/legendary-powers.json');
global.SET_DEFINITIONS_V2 = loadJson('config/set-config-v2.json');
global.CLASS_BUILD_EQUIPMENT = loadJson('config/class-build-equipment.json');
global.CLASS_CONFIG = loadJson('config/class-config.json');
global.WEAPON_AFFINITY_CONFIG = loadJson('config/weapon-affinity-config.json');
global.DROP_BIAS_CONFIG = { setChance: 1, setChanceBoss: 1 };
global.normalizeClassData = cd => cd || {};

class Equipment {
    constructor(data) {
        Object.assign(this, data);
        this.stats = data.stats || {};
        this.prefixes = data.prefixes || [];
        this.suffixes = data.suffixes || [];
        this.legendaryPowers = data.legendaryPowers || [];
    }
}
global.Equipment = Equipment;

require(path.join(root, 'js/equipment-generator.js'));

const counts = Object.create(null);
for (let i = 0; i < 200; i++) {
    const eq = window.generateProceduralEquipment({
        slot: 'weapon',
        quality: 'epic',
        monsterLevel: 35,
        monsterTier: 'boss',
        exactLevel: 35,
        classData: { baseClass: 'archer', firstAdvancement: 'marksman', secondAdvancement: null },
        firstAdvancement: 'marksman',
        playerClass: 'archer',
        classId: 'marksman',
        forcePrefixes: [],
        forceSuffixes: [],
        forcePowers: [],
        forceEmptyAffixes: true,
        skipBuildRoll: true
    });
    if (eq && eq.setId) counts[eq.setId] = (counts[eq.setId] || 0) + 1;
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);
assert.ok(total > 50, 'Boss 应常掉套装');
assert.ok((counts.hundred_pace || 0) > (counts.fireheart || 0), '一转神射手应更偏向百步凝视');
assert.ok((counts.hundred_pace || 0) >= total * 0.25, '专属小毕业应占明显比例');

const counts2 = Object.create(null);
for (let i = 0; i < 200; i++) {
    const eq = window.generateProceduralEquipment({
        slot: 'weapon',
        quality: 'legendary',
        monsterLevel: 50,
        monsterTier: 'boss',
        exactLevel: 50,
        classData: { baseClass: 'archer', firstAdvancement: 'marksman', secondAdvancement: 'deadeye' },
        firstAdvancement: 'marksman',
        secondAdvancement: 'deadeye',
        playerClass: 'archer',
        classId: 'deadeye',
        forcePrefixes: [],
        forceSuffixes: [],
        forcePowers: [],
        forceEmptyAffixes: true,
        skipBuildRoll: true
    });
    if (eq && eq.setId) counts2[eq.setId] = (counts2[eq.setId] || 0) + 1;
}
const total2 = Object.values(counts2).reduce((a, b) => a + b, 0);
assert.ok((counts2.breathless_hunt || 0) > (counts2.hundred_pace || 0), '二转死眼应更偏向绝息猎杀');
assert.ok((counts2.breathless_hunt || 0) >= total2 * 0.2, '大毕业应可刷出');

console.log('graduation set affinity: ok');
console.log(' marksman sample', counts);
console.log(' deadeye sample', counts2);
