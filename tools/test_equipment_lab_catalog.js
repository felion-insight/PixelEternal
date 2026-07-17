/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const json = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));

global.window = global;
window.LEGENDARY_POWERS = json('config/legendary-powers.json');
window.SET_DEFINITIONS_V2 = json('config/set-config-v2.json');
window.CLASS_BUILD_EQUIPMENT = json('config/class-build-equipment.json');
window.WEAPON_AFFINITY_CONFIG = json('config/weapon-affinity-config.json');
window.AFFIX_POOL = json('config/affix-pool.json');
window.EQUIPMENT_SLOT_ORDER = [
    'weapon', 'offHand', 'helmet', 'body', 'hands',
    'legs', 'feet', 'amulet', 'ring', 'belt'
];
window.createEmptyEquipmentSlots = () => Object.fromEntries(
    window.EQUIPMENT_SLOT_ORDER.map(slot => [slot, null])
);
window.generateProceduralEquipment = context => ({
    id: 'generated',
    name: `${context.slot}-${context.quality}`,
    slot: context.slot,
    weaponType: context.weaponType || 'sword',
    legendaryPowers: [],
    prefixes: [],
    suffixes: [],
    setId: context.setId || null,
    buildEquipmentId: context.buildEquipmentId || null,
    applyEnhancement() {}
});
window.rebuildProceduralEquipmentStats = () => true;
window.WeaponRefinementSystem = {
    getMechanic: weaponType => ({
        core: { id: `${weaponType}_core`, name: '核心', description: '核心机制' },
        capstone: { id: `${weaponType}_capstone`, name: '进阶', description: '进阶机制' }
    })
};
require('../js/weapon-refinement-resonance.js');

require('../js/equipment-lab-catalog.js');

const catalog = window.EquipmentLabCatalog.buildCatalog();
const groups = Object.groupBy(catalog, entry => entry.category);
assert.strictEqual(groups.power.length, 20, '应覆盖 20 个传奇威能');
assert.strictEqual(groups.set.length, 84, '6通用×2 + 24毕业×3 应有 84 条套装展示');
assert.strictEqual(groups.build.length, 16, '应覆盖 16 件流派核心');
assert.strictEqual(groups.weapon.length, 48, '16 类武器应各有基础/3星/5星演示');
assert.strictEqual(groups.resonance.length, 15, '应覆盖15个套装身份共鸣');
assert.strictEqual(groups.affix.length, 17, '应覆盖 17 个前后缀');
assert.strictEqual(new Set(catalog.map(entry => entry.id)).size, catalog.length, '目录 ID 必须唯一');
assert.strictEqual(catalog.length, 20 + 84 + 16 + 48 + 15 + 17, '目录条目总数应匹配');

catalog.forEach(entry => {
    const first = window.EquipmentLabCatalog.buildLoadout(entry, 7);
    const second = window.EquipmentLabCatalog.buildLoadout(entry, 7);
    assert(Object.values(first).some(Boolean), `${entry.id} 应生成至少一件装备`);
    assert.strictEqual(JSON.stringify(first), JSON.stringify(second), `${entry.id} 应确定性生成`);
});

groups.resonance.forEach(entry => {
    const weapon = window.EquipmentLabCatalog.buildLoadout(entry, 7).weapon;
    assert.strictEqual(weapon.refineLevel, 5, `${entry.id} 应为5星武器`);
    const resolved = window.WeaponRefinementResonance.resolve(weapon);
    assert(resolved && resolved.id === entry.effectId, `${entry.id} 应解析到对应身份共鸣`);
});

{
    const mirror = catalog.find(e => e.id === 'set:mirror_mask:2' || e.id === 'set:mirror_mask:6')
        || catalog.find(e => e.setId === 'mirror_mask' && e.pieceCount >= 2);
    assert.ok(mirror, '应有镜戏面具套装条目');
    assert.strictEqual(mirror.classData.baseClass, 'assassin', '镜戏面具应为刺客系');
    assert.strictEqual(mirror.classData.firstAdvancement, 'trickster', '镜戏面具亲和应为骗术师');
    const loadout = window.EquipmentLabCatalog.buildLoadout(mirror, 7);
    assert.ok(loadout.weapon, '应生成武器');
    assert.strictEqual(loadout.weapon.weaponType, 'dagger', '骗术师套装演示武器应为匕首，不应是剑');
}

console.log(`equipment lab catalog: ok (${catalog.length} entries)`);
