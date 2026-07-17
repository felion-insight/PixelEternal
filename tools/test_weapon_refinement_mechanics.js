/* eslint-disable no-console */
'use strict';

const assert = require('assert');

global.window = global;
const triggered = [];
window.EquipmentLabMetrics = {
    recordEffect(effectId) {
        triggered.push(effectId);
    }
};

require('../js/weapon-refinement-system.js');

const types = [
    'sword', 'axe', 'hammer', 'spear',
    'bow', 'crossbow', 'longbow', 'shortbow',
    'staff', 'book', 'orb', 'rune',
    'dagger', 'claw', 'shortblade', 'chainblade'
];

function createTarget(x = 90) {
    return {
        x,
        y: 0,
        hp: 1000,
        maxHp: 1000,
        angle: 0,
        totalDamage: 0,
        takeDamage(amount) {
            this.totalDamage += amount;
            this.hp = Math.max(0, this.hp - amount);
        }
    };
}

function createPlayer(type, level) {
    const targets = [createTarget(), createTarget(110), createTarget(130)];
    const player = {
        x: 0,
        y: 0,
        angle: 0,
        hp: 800,
        maxHp: 1000,
        baseAttack: 100,
        baseMagicAttack: 120,
        equipment: {
            weapon: {
                id: `test_${type}_${level}`,
                weaponType: type,
                refineLevel: level,
                skill: { cooldown: 8000 }
            }
        },
        weaponSkillCooldown: Date.now() + 8000,
        damageMonsterFromEnvironment(target, amount) {
            target.takeDamage(amount);
        },
        heal(amount) {
            this.hp = Math.min(this.maxHp, this.hp + amount);
        },
        gameInstance: {
            getCurrentSceneTargets: () => targets,
            addFloatingText() {},
            addEquipmentEffect() {}
        }
    };
    return { player, targets };
}

function basic(player, target, count) {
    for (let i = 0; i < count; i++) {
        window.WeaponRefinementSystem.modifyBasicAttack(player, target, { damage: 100, isCrit: false });
        window.WeaponRefinementSystem.afterBasicAttack(player, target, {});
    }
}

function triggerCore(type, player, targets) {
    const target = targets[0];
    if (type === 'sword') basic(player, target, 3);
    else if (type === 'axe') basic(player, target, 1);
    else if (type === 'hammer') basic(player, target, 4);
    else if (type === 'spear') {
        target.x = 100;
        window.WeaponRefinementSystem.modifyBasicAttack(player, target, { damage: 100 });
    } else if (type === 'bow') basic(player, target, 3);
    else if (type === 'crossbow') basic(player, target, 2);
    else if (type === 'longbow') {
        target.x = 180;
        window.WeaponRefinementSystem.modifyBasicAttack(player, target, { damage: 100 });
    } else if (type === 'shortbow') basic(player, target, 5);
    else if (['staff', 'orb', 'rune'].includes(type)) {
        for (let i = 0; i < 3; i++) window.WeaponRefinementSystem.onSkillCast(player, { id: `${type}_${i}` });
        window.WeaponRefinementSystem.afterBasicAttack(player, target, {});
    } else if (type === 'book') {
        for (let i = 0; i < 3; i++) window.WeaponRefinementSystem.onSkillCast(player, { id: `book_${i}` });
    } else if (type === 'dagger') {
        target.angle = 0;
        window.WeaponRefinementSystem.modifyBasicAttack(player, target, { damage: 100 });
    } else if (type === 'claw') basic(player, target, 4);
    else if (type === 'shortblade') {
        window.WeaponRefinementSystem.onDodge(player);
        window.WeaponRefinementSystem.modifyBasicAttack(player, target, { damage: 100 });
    } else if (type === 'chainblade') {
        window.WeaponRefinementSystem.onWeaponSkill(player, player.equipment.weapon, targets);
    }
}

types.forEach(type => {
    assert(window.WeaponRefinementSystem.getMechanic(type), `${type} 应注册机制`);

    triggered.length = 0;
    const core = createPlayer(type, 3);
    triggerCore(type, core.player, core.targets);
    assert(triggered.includes(`weapon_${type}_3`), `${type} 3星机制应触发`);

    triggered.length = 0;
    const capstone = createPlayer(type, 5);
    triggerCore(type, capstone.player, capstone.targets);
    if (type === 'axe') capstone.targets[0].hp = 300;
    if (type === 'dagger') capstone.targets[0].hp = 250;
    if (type === 'longbow') capstone.targets[0].hp = capstone.targets[0].maxHp;
    if (type === 'shortblade') {
        window.WeaponRefinementSystem.onDodge(capstone.player);
        window.WeaponRefinementSystem.modifyBasicAttack(capstone.player, capstone.targets[0], { damage: 100 });
    } else if (type === 'claw') {
        basic(capstone.player, capstone.targets[0], 4);
    } else {
        window.WeaponRefinementSystem.onWeaponSkill(
            capstone.player,
            capstone.player.equipment.weapon,
            capstone.targets
        );
    }
    assert(triggered.includes(`weapon_${type}_5`), `${type} 5星机制应触发`);
});

console.log('weapon refinement mechanics: ok (16 types, 3/5 star)');
