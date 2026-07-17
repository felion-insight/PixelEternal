/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const runScript = relative => vm.runInThisContext(
    fs.readFileSync(path.join(root, relative), 'utf8'),
    { filename: relative }
);

global.window = global;
window.CONFIG = { PLAYER_ATTACK_RANGE: 50 };
window.QUALITY_COLORS = {};
window.QUALITY_NAMES = {};
window.SLOT_NAMES = {};
window.BASE_TYPES = readJson('config/base-types.json');
window.AFFIX_POOL = readJson('config/affix-pool.json');
window.LEGENDARY_POWERS = readJson('config/legendary-powers.json');
window.SET_DEFINITIONS_V2 = readJson('config/set-config-v2.json');
window.CLASS_BUILD_EQUIPMENT = readJson('config/class-build-equipment.json');
window.WEAPON_AFFINITY_CONFIG = readJson('config/weapon-affinity-config.json');
window.SKILL_CONFIG = readJson('config/skill-config.json');
window.DROP_RARITY_TABLES = readJson('config/game-config.json').DROP_RARITY_TABLES;
window.DROP_BIAS_CONFIG = readJson('config/game-config.json').DROP_BIAS_CONFIG;
window.normalizeEquipmentSlot = slot => slot;
window.normalizeEquipmentQuality = quality => quality;
window.computeEquipmentGearScore = equipment =>
    Math.round(Object.values(equipment.stats || {}).reduce((sum, value) => sum + (Number(value) || 0), 0));
window.computeEquipmentGearScoreV2 = window.computeEquipmentGearScore;
window.refreshEquipmentGearScore = equipment => {
    equipment.gearScore = window.computeEquipmentGearScoreV2(equipment);
    return equipment.gearScore;
};
window.resolveQualityDisplay = quality => ({ color: '#fff', name: quality });
window.resolveWeaponTypeFromLegacy = weaponType => ({
    greatsword: 'sword'
}[weaponType] || weaponType);
window.getPlayerBaseClassId = classData => classData.baseClass;
window.getEquipmentDropTierLevelsForMonsterLevel = level => [level];

runScript('js/weapon-refinement-system.js');
runScript('js/weapon-refinement-resonance.js');
runScript('js/equipment-weapon-skills.js');
runScript('js/equipment-set-vfx.js');
runScript('js/equipment-power-vfx.js');
runScript('js/data-classes.js');
runScript('js/equipment-generator.js');
runScript('js/config-helpers.js');

assert.deepStrictEqual(window.validatePhase3EquipmentConfig(), [], 'Phase 3 装备配置应通过校验');

const slots = ['weapon', 'offHand', 'helmet', 'body', 'hands', 'legs', 'feet', 'amulet', 'ring', 'belt'];
slots.forEach(slot => {
    const item = window.generateProceduralEquipment({
        level: 60,
        monsterLevel: 60,
        monsterTier: 'boss',
        quality: 'legendary',
        slot,
        playerClass: 'warrior',
        classId: 'destroyer'
    });
    assert(item, `${slot} 应可生成`);
    assert.strictEqual(item.slot, slot);
    assert.strictEqual(item.procedural, true);
    assert(item.baseTypeId, `${slot} 应包含基型`);
    assert(item.gearScore >= 0, `${slot} 应计算装备分数`);
});

const weaponTypes = Object.keys(window.WEAPON_AFFINITY_CONFIG.weaponTypes || {});
assert.strictEqual(weaponTypes.length, 16, '应配置 16 类武器');
weaponTypes.forEach(weaponType => {
    const base = window.getProceduralWeaponSkill(weaponType, 'legendary', 0);
    assert(base && base.refineEffects.length === 5, `${weaponType} 应有 5 阶精炼`);
    let lastDamage = base.damageMultiplier;
    let lastCooldown = base.cooldown;
    for (let level = 1; level <= 5; level++) {
        const refined = window.getProceduralWeaponSkill(weaponType, 'legendary', level);
        assert(refined.damageMultiplier > lastDamage, `${weaponType} ${level}阶伤害应提升`);
        assert(refined.cooldown <= lastCooldown, `${weaponType} ${level}阶冷却不应增加`);
        lastDamage = refined.damageMultiplier;
        lastCooldown = refined.cooldown;
    }
    const threeStar = window.getProceduralWeaponSkill(weaponType, 'legendary', 3);
    const fiveStar = window.getProceduralWeaponSkill(weaponType, 'legendary', 5);
    assert(threeStar.refineEffect.coreMechanic, `${weaponType} 3星应解锁核心机制`);
    assert(fiveStar.refineEffect.capstoneMechanic, `${weaponType} 5星应解锁进阶机制`);
});

const subclassBase = {
    berserker: 'warrior',
    destroyer: 'warrior',
    wizard: 'mage',
    archmage: 'mage',
    sage: 'mage',
    oracle: 'mage'
};
(window.CLASS_BUILD_EQUIPMENT.items || []).forEach(def => {
    const activeClass = def.classRestriction[0];
    const baseClass = subclassBase[activeClass] || activeClass;
    const item = window.generateProceduralEquipment({
        level: 60,
        monsterLevel: 60,
        monsterTier: 'boss',
        quality: 'legendary',
        slot: def.slot,
        weaponType: def.weaponType,
        playerClass: baseClass,
        classId: activeClass,
        buildEquipmentId: def.equipmentId
    });
    assert(item, `流派装备 ${def.equipmentId} 应可定向生成`);
    assert.strictEqual(item.buildEquipmentId, def.equipmentId);
    assert.strictEqual(item.name, def.name);
});

const originalRandom = Math.random;
let buildDrops = 0;
try {
    let seed = 123456789;
    Math.random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
    };
    for (let i = 0; i < 1000; i++) {
        const item = window.generateProceduralEquipment({
            level: 60,
            monsterLevel: 60,
            monsterTier: 'boss',
            quality: 'legendary',
            playerClass: 'warrior',
            classId: 'destroyer'
        });
        if (item && item.buildEquipmentId) buildDrops++;
    }
} finally {
    Math.random = originalRandom;
}
assert(buildDrops > 0 && buildDrops < 150, `流派装备掉率异常: ${buildDrops}/1000`);

console.log(`equipment generation/refinement/build loot: ok (${buildDrops}/1000 build drops)`);
