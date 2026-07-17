/* eslint-disable no-console */
'use strict';

const assert = require('assert');

global.window = global;
window.normalizeClassData = value => value;
window.getActiveClassId = value =>
    value.secondAdvancement || value.firstAdvancement || value.baseClass;
window.EQUIPMENT_SLOT_ORDER = [
    'weapon', 'offHand', 'helmet', 'body', 'hands',
    'legs', 'feet', 'amulet', 'ring', 'belt'
];
window.createEmptyEquipmentSlots = () => Object.fromEntries(
    window.EQUIPMENT_SLOT_ORDER.map(slot => [slot, null])
);
window.SET_DEFINITIONS_V2 = {
    sets: {
        oath_shield: { slots: ['helmet', 'body', 'offHand', 'belt'], tier: 'first', classAffinity: 'knight' },
        hundred_pace: { slots: ['weapon', 'hands', 'ring', 'amulet'], tier: 'first', classAffinity: 'marksman' },
        ember_residue: { slots: ['weapon', 'offHand', 'helmet', 'amulet'], tier: 'first', classAffinity: 'wizard' },
        night_veil: { slots: ['weapon', 'hands', 'legs', 'feet'], tier: 'first', classAffinity: 'shadowdancer' }
    }
};
window.CLASS_BUILD_EQUIPMENT = {
    items: [{
        equipmentId: 'blood_howl',
        slot: 'weapon',
        weaponType: 'greatsword',
        classRestriction: ['destroyer']
    }]
};
window.generateProceduralEquipment = context => ({
    id: 'generated',
    slot: context.slot,
    quality: context.quality,
    level: context.level,
    stats: { attack: Math.floor(Math.random() * 1000) },
    setId: context.setId || null,
    classAffinity: context.playerClass,
    buildEquipmentId: context.buildEquipmentId || null
});

require('../js/skill-lab-ui.js');

function createPlayer() {
    return {
        classData: {
            baseClass: 'warrior',
            firstAdvancement: 'berserker',
            secondAdvancement: 'destroyer'
        },
        level: 60,
        equipment: window.createEmptyEquipmentSlots(),
        skillHotbar: ['furious_charge'],
        skillCooldowns: { furious_charge: 123 },
        classResource: { current: 3, max: 5 },
        hp: 50,
        maxHp: 100,
        buffs: [],
        updateStats() {
            this.maxHp = 100;
        }
    };
}

const deterministicPresets = window.SKILL_LAB_EQUIPMENT_PRESETS
    .filter(name => name !== 'preserve');

deterministicPresets.forEach(preset => {
    const first = createPlayer();
    const second = createPlayer();
    assert.strictEqual(
        window.applySkillLabEquipmentPreset(first, preset, { seed: 7, level: 60 }).ok,
        true
    );
    assert.strictEqual(
        window.applySkillLabEquipmentPreset(second, preset, { seed: 7, level: 60 }).ok,
        true
    );
    assert.deepStrictEqual(first.equipment, second.equipment, `${preset} 必须可重复`);
});

const matched = createPlayer();
const mismatched = createPlayer();
window.applySkillLabEquipmentPreset(matched, 'legendary', { seed: 7, level: 60 });
window.applySkillLabEquipmentPreset(mismatched, 'affinity_mismatch', { seed: 7, level: 60 });
window.EQUIPMENT_SLOT_ORDER.forEach(slot => {
    assert.deepStrictEqual(
        mismatched.equipment[slot].stats,
        matched.equipment[slot].stats,
        `${slot} 错亲和预设应保持同一数值基线`
    );
    assert.notStrictEqual(
        mismatched.equipment[slot].classAffinity,
        'warrior',
        `${slot} 应改为非战士亲和`
    );
});

const player = createPlayer();
const originalWeapon = { id: 'original', slot: 'weapon' };
player.equipment.weapon = originalWeapon;
const state = window.captureSkillLabPlayerState(player);
window.applySkillLabEquipmentPreset(player, 'naked');
window.restoreSkillLabPlayerState(player, state);

assert.strictEqual(player.equipment.weapon, originalWeapon, '应恢复原装备对象');
assert.deepStrictEqual(player.skillCooldowns, { furious_charge: 123 });
assert.deepStrictEqual(player.classResource, { current: 3, max: 5 });

console.log('equipment preset determinism/restore: ok');
