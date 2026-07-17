/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.window = global;
window.CLASS_BUILD_EQUIPMENT = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../config/class-build-equipment.json'),
    'utf8'
));
window.SKILL_CONFIG = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../config/skill-config.json'),
    'utf8'
));
window.CLASS_BUILD_PASSIVES = { builds: {} };
window.getActiveClassId = classData => classData.secondAdvancement || classData.firstAdvancement || classData.baseClass;
window.getPlayerActiveBuild = () => null;
window.getSkillDefinition = skillId => window.SKILL_CONFIG.skills[skillId] || null;

require('../js/class-build-system.js');

assert.strictEqual(window.CLASS_BUILD_EQUIPMENT.items.length, 16, '应覆盖 12 二转相关核心装共 16 件');
window.CLASS_BUILD_EQUIPMENT.items.forEach(item => {
    assert.strictEqual(item.slot, 'offHand', `${item.equipmentId} 应在副手`);
});

function player(classId, equipmentId, slot) {
    const baseMap = {
        destroyer: 'warrior', paladin: 'warrior', temple_knight: 'warrior',
        archmage: 'mage', oracle: 'mage', necromancer: 'mage',
        beastmaster: 'archer', deadeye: 'archer', phantom: 'archer',
        nightblade: 'assassin', illusionist: 'assassin', plaguebringer: 'assassin',
        berserker: 'warrior', wizard: 'mage'
    };
    return {
        classData: {
            baseClass: baseMap[classId] || 'warrior',
            firstAdvancement: classId === 'destroyer' ? 'berserker' : undefined,
            secondAdvancement: classId
        },
        equipment: {
            [slot]: { buildEquipmentId: equipmentId }
        },
        hp: 50,
        maxHp: 100,
        buffs: [],
        updateStats() {}
    };
}

const furySlam = {
    id: 'fury_slam',
    entityType: 'instant',
    aoeRadius: 100,
    entityConfig: {
        shape: 'radial',
        range: 100,
        explodeRadius: 100,
        damageMultiplier: 2
    }
};

{
    const modified = window.applyBuildEquipmentSkillModifiers(
        player('berserker', 'blood_howl', 'offHand'),
        furySlam
    );
    assert.strictEqual(modified.entityConfig.explodeRadius, 150);
    assert.strictEqual(modified.entityConfig.healOnHitPercent, 1);
}

{
    const rift = window.getSkillDefinition('devastation_rift');
    const modified = window.applyBuildEquipmentSkillModifiers(
        player('destroyer', 'blood_howl', 'offHand'),
        rift
    );
    assert.strictEqual(modified.id, 'devastation_rift');
    assert(modified.entityConfig.explodeRadius >= 50 || modified.entityConfig.healOnHitPercent === 1
        || modified.entityConfig.range >= 300);
}

{
    const modified = window.applyBuildEquipmentSkillModifiers(
        player('destroyer', 'bone_crusher', 'offHand'),
        window.getSkillDefinition('devastation_rift')
    );
    assert.strictEqual(modified.entityType, 'instant');
    assert.strictEqual(modified.entityConfig.shape, 'cone');
    assert.strictEqual(modified.entityConfig.damageMultiplier, 3);
    assert.strictEqual(modified.breakDamageMultiplier, 2);
}

{
    const modified = window.applyBuildEquipmentSkillModifiers(
        player('berserker', 'bone_crusher', 'offHand'),
        furySlam
    );
    assert.strictEqual(modified.name, '碎骨重击');
    assert.strictEqual(modified.entityConfig.shape, 'cone');
}

const fireball = {
    id: 'fireball',
    entityType: 'projectile',
    damageMultiplier: 2,
    entityConfig: {
        damageMultiplier: 2,
        projectileCount: 1,
        elementTag: 'fire',
        statusOnHit: [{ type: 'burn', durationMs: 4000, stacks: 1 }],
        explodeStatusOnHit: [{ type: 'burn', durationMs: 4000, stacks: 1 }]
    }
};

{
    const modified = window.applyBuildEquipmentSkillModifiers(
        player('archmage', 'elemental_staff', 'offHand'),
        fireball
    );
    assert.strictEqual(modified.entityConfig.projectileCount, 3);
    assert.strictEqual(modified.entityConfig.damageMultiplier, 0.7);
    assert.strictEqual(modified.entityConfig.statusOnHit[0].stacks, 3);
}

{
    const evolved = window.getSkillDefinition('elemental_burst');
    const modified = window.applyBuildEquipmentSkillModifiers(
        player('archmage', 'elemental_staff', 'offHand'),
        evolved
    );
    assert.strictEqual(modified.id, 'elemental_burst');
    assert.strictEqual(modified.entityType, 'projectile');
    assert.strictEqual(modified.entityConfig.projectileCount, 3);
    assert.strictEqual(modified.evolutionPath.baseSkillId, 'fireball');
}

{
    const modified = window.applyBuildEquipmentSkillModifiers(
        player('archmage', 'ice_crystal_staff', 'offHand'),
        fireball
    );
    assert.strictEqual(modified.name, '冰锥术');
    assert.strictEqual(modified.entityConfig.elementTag, 'ice');
    assert.strictEqual(modified.entityConfig.statusOnHit[0].type, 'frostbite');
    assert.strictEqual(modified._buildBonusVsStatus.frostbite, 1.4);
}

{
    const blink = {
        id: 'blink',
        entityType: 'blink',
        entityConfig: { distance: 100 }
    };
    const modified = window.applyBuildEquipmentSkillModifiers(
        player('archmage', 'arcane_eye', 'offHand'),
        blink
    );
    assert.strictEqual(modified.entityConfig.noDisplacement, true);
    assert.strictEqual(modified.entityConfig.leaveEchoOnCast, true);
    assert.strictEqual(modified.entityConfig.echoDurationMs, 3000);
    assert.strictEqual(modified.entityConfig.echoDamagePercent, 50);
}

{
    const evolved = window.getSkillDefinition('phase_shift');
    const modified = window.applyBuildEquipmentSkillModifiers(
        player('archmage', 'arcane_eye', 'offHand'),
        evolved
    );
    assert.strictEqual(modified.id, 'phase_shift');
    assert.strictEqual(modified.entityConfig.noDisplacement, true);
    assert.strictEqual(modified.evolutionPath.baseSkillId, 'blink');
}

{
    const p = player('destroyer', 'berserker_heart', 'offHand');
    window.onBuildEquipmentSkillCast(p, { id: 'blood_demon_form' });
    assert(p._berserkerHeartEndAt > Date.now());
    assert(p.buffs.some(buff => buff.id === 'berserk'));
    window.applyBuildEquipmentConditionals(p);
    assert.strictEqual(p._buildAttackSpeedBonus, 75);
}

{
    const p = player('destroyer', 'blood_howl', 'offHand');
    p.buffs = [{ id: 'berserk', expireTime: Date.now() + 60000 }];
    window.applyBuildEquipmentConditionals(p);
    assert.strictEqual(p._buildMoveSpeedPenalty, -30);
}

{
    const judgment = {
        id: 'judgment_ground',
        entityType: 'instant',
        entityConfig: { explodeRadius: 80, damageMultiplier: 1 }
    };
    const modified = window.applyBuildEquipmentSkillModifiers(
        player('paladin', 'judgment_crest', 'offHand'),
        judgment
    );
    assert.strictEqual(modified.entityConfig.explodeRadius, 120);
    assert.strictEqual(modified.entityConfig.damageMultiplier, 1.25);
}

{
    const snipe = {
        id: 'deadeye_snipe',
        castTimeMs: 1000,
        damageMultiplier: 2,
        entityConfig: { windupMs: 1000, damageMultiplier: 2 }
    };
    const modified = window.applyBuildEquipmentSkillModifiers(
        player('deadeye', 'breath_scope', 'offHand'),
        snipe
    );
    assert.strictEqual(modified.entityConfig.damageMultiplier, 1.35);
    assert.strictEqual(modified.entityConfig.windupMs, 750);
}

console.log('build equipment skill behavior: ok');
