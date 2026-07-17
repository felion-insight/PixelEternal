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
require('../js/weapon-refinement-resonance.js');

function createTarget(x = 190) {
    return {
        x,
        y: 0,
        hp: 1000,
        maxHp: 1000,
        angle: Math.PI,
        totalDamage: 0,
        takeDamage(amount) {
            this.totalDamage += amount;
            this.hp = Math.max(0, this.hp - amount);
        }
    };
}

function identityItem(def, type = 'sword') {
    return {
        id: `resonance_set_${def.sourceId}_${type}`,
        weaponType: type,
        refineLevel: 5,
        skill: { cooldown: 8000 },
        setId: def.sourceId,
        legendaryPowers: []
    };
}

function createPlayer(def, type) {
    const targets = [createTarget(), createTarget(205), createTarget(220)];
    const player = {
        x: 0,
        y: 0,
        angle: 0,
        hp: 800,
        maxHp: 1000,
        baseAttack: 100,
        baseMagicAttack: 120,
        buffs: [],
        equipment: { weapon: identityItem(def, type) },
        weaponSkillCooldown: Date.now() + 8000,
        damageMonsterFromEnvironment(target, amount) {
            target.takeDamage(amount);
        },
        updateStats() {},
        gameInstance: {
            getCurrentSceneTargets: () => targets,
            addFloatingText() {},
            addEquipmentEffect() {}
        }
    };
    return { player, targets };
}

function prepare(def, player, targets) {
    const system = window.WeaponRefinementResonance;
    const target = targets[0];
    const famMap = {
        holy_balance: 'dragonblood', rift_howl: 'fireheart', breathless_hunt: 'stormfury',
        echo_fold: 'shadow', torrent_throne: 'arcane', grave_throne: 'dragonblood',
        evernight_seal: 'shadow', plague_altar: 'stormfury',
        temple_covenant: 'dragonblood', beast_pact: 'stormfury',
        fate_web: 'arcane', myriad_mirror: 'shadow'
    };
    const fam = famMap[def.sourceId] || def.sourceId;
    if (fam === 'fireheart') {
        for (let i = 0; i < 3; i++) system.afterBasicAttack(player, target, { isCrit: true });
    } else if (fam === 'stormfury') {
        for (let i = 0; i < 5; i++) system.afterBasicAttack(player, target, { isCrit: false });
    } else if (fam === 'dragonblood') {
        for (let i = 0; i < 3; i++) system.afterDamage(player, target, 20);
    } else if (fam === 'arcane') {
        ['a', 'b', 'c'].forEach(id => system.onSkillCast(player, { id }));
    } else if (fam === 'shadow') {
        for (let i = 0; i < 3; i++) system.onDodge(player);
    }
}

const resonance = window.WeaponRefinementResonance;
const definitions = Object.values(resonance.getDefinitions());
assert.strictEqual(definitions.length, 15, '应注册3通用+12二转大毕业共鸣');
assert.strictEqual(resonance.getSupportedIdentityIds().length, 15, '共鸣ID应为15');
assert.strictEqual(resonance.getDefinition('power', 'dragon_breath'), null, '不应再有威能共鸣');

const weaponTypeBySet = {
    fireheart: 'sword', stormfury: 'bow', dragonblood: 'axe',
    holy_balance: 'sword', rift_howl: 'hammer', temple_covenant: 'sword',
    beast_pact: 'bow', breathless_hunt: 'longbow', echo_fold: 'shortbow',
    torrent_throne: 'staff', fate_web: 'book', grave_throne: 'staff',
    evernight_seal: 'dagger', myriad_mirror: 'dagger', plague_altar: 'dagger'
};

definitions.forEach(def => {
    triggered.length = 0;
    const type = weaponTypeBySet[def.sourceId] || 'sword';
    const { player, targets } = createPlayer(def, type);
    assert.strictEqual(resonance.resolve(player.equipment.weapon).id, def.id, `${def.id} 应正确解析`);
    prepare(def, player, targets);
    assert.strictEqual(
        resonance.onWeaponSkill(player, player.equipment.weapon, targets),
        true,
        `${def.id} 应接管5星机制`
    );
    assert(triggered.includes(def.id), `${def.id} 应触发并上报`);
});

// 套装优先：即使带威能，也只解析套装
{
    const setDef = resonance.getDefinition('set', 'fireheart');
    const { player } = createPlayer(setDef, 'sword');
    player.equipment.weapon.legendaryPowers = [{ id: 'dragon_breath' }];
    assert.strictEqual(resonance.resolve(player.equipment.weapon).id, setDef.id);
}

// 无套装的威能武器：5星不走共鸣
{
    const item = {
        id: 'power_only',
        weaponType: 'sword',
        refineLevel: 5,
        setId: null,
        legendaryPowers: [{ id: 'dragon_breath' }]
    };
    assert.strictEqual(resonance.resolve(item), null, '纯威能武器不应解析出共鸣');
    const capstone = window.WeaponRefinementSystem.resolveCapstone(item);
    assert.strictEqual(capstone.isResonance, false);
    assert.strictEqual(capstone.id, 'sword_echo');
}

// 组合矩阵：5套装 × 16武器类型均可解析
const types = [
    'sword', 'axe', 'hammer', 'spear',
    'bow', 'crossbow', 'longbow', 'shortbow',
    'staff', 'book', 'orb', 'rune',
    'dagger', 'claw', 'shortblade', 'chainblade'
];
let combo = 0;
definitions.forEach(def => {
    types.forEach(type => {
        const item = identityItem(def, type);
        assert.strictEqual(resonance.resolve(item).id, def.id);
        combo += 1;
    });
});
assert.strictEqual(combo, 240, '15套装×16武器类型=240');

console.log(`weapon refinement resonance: ok (15 set identities, ${combo} combinations)`);
