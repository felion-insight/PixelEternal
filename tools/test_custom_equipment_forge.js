/**
 * 烟雾：任意词缀 + 威能组合生成
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
global.WEAPON_AFFINITY_CONFIG = loadJson('config/weapon-affinity-config.json');
global.DROP_BIAS_CONFIG = {};
global.DROP_RARITY_TABLES = undefined;
global.SLOT_NAMES = { weapon: '武器', body: '胸甲' };

class Equipment {
    constructor(data) {
        Object.assign(this, data);
        this.stats = data.stats || {};
        this.baseStats = JSON.parse(JSON.stringify(this.stats));
        this.prefixes = data.prefixes || [];
        this.suffixes = data.suffixes || [];
        this.legendaryPowers = data.legendaryPowers || [];
    }
}
global.Equipment = Equipment;

require(path.join(root, 'js/equipment-generator.js'));
require(path.join(root, 'js/equipment-codex.js'));

const eq = window.buildCustomProceduralEquipment({
    baseTypeId: 'sword_balanced',
    quality: 'mythic',
    level: 50,
    forcePrefixes: [{ id: 'assault', tier: 5 }, { id: 'flame', tier: 3 }],
    forceSuffixes: [{ id: 'deadly', tier: 5 }],
    forcePowers: ['dragon_breath', 'phoenix', 'war_god_fury'] // phoenix 本属 body，故意塞到武器
});

assert.ok(eq, '应生成装备');
assert.strictEqual(eq.baseTypeId, 'sword_balanced');
assert.strictEqual(eq.prefixes.length, 2);
assert.strictEqual(eq.suffixes.length, 1);
assert.strictEqual(eq.legendaryPowers.length, 3);
assert.ok(eq.legendaryPowers.some(p => p.id === 'phoenix'), '应允许无视槽位塞入不死鸟');
assert.ok(eq.prefixes.every(p => typeof p.value === 'number' && p.value > 0));
assert.ok(eq.stats.attack > 0 || eq.stats.critDamage > 0, '词缀应写入属性');

const empty = window.buildCustomProceduralEquipment({
    slot: 'ring',
    quality: 'rare',
    level: 10,
    forcePrefixes: [],
    forceSuffixes: [],
    forcePowers: []
});
assert.ok(empty);
assert.strictEqual(empty.prefixes.length, 0);
assert.strictEqual(empty.suffixes.length, 0);
assert.strictEqual(empty.legendaryPowers.length, 0);

const viaCodex = window.EquipmentCodex.buildCustomEquipment({
    quality: 'legendary',
    level: 30,
    forcePrefixes: [{ id: 'vitality', tier: 4 }],
    forceSuffixes: [],
    forcePowers: ['blood_rage']
});
assert.ok(viaCodex);
assert.strictEqual(viaCodex.prefixes[0].id, 'vitality');
assert.strictEqual(viaCodex.legendaryPowers[0].id, 'blood_rage');

console.log('custom equipment forge: ok');
console.log(' sample:', eq.name, '| powers:', eq.legendaryPowers.map(p => p.name).join(','));
