/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));

const legendary = readJson('config/legendary-powers.json');
const sets = readJson('config/set-config-v2.json');
const builds = readJson('config/class-build-equipment.json');

const powers = [
    ...(legendary.universal || []),
    ...Object.values(legendary.classPowers || {}).flat()
];
assert.strictEqual(powers.length, 20, 'Phase 3 应配置 20 个传奇威能');
assert.strictEqual(new Set(powers.map(power => power.id)).size, powers.length, '传奇威能 ID 必须唯一');

assert.strictEqual(Object.keys(sets.sets || {}).length, 30, '应配置 30 套：6通用+12一转+12二转');
const firstCount = Object.values(sets.sets || {}).filter(s => s.tier === 'first').length;
const secondCount = Object.values(sets.sets || {}).filter(s => s.tier === 'second').length;
const genericCount = Object.values(sets.sets || {}).filter(s => s.tier === 'generic' || (!s.tier && !s.classAffinity)).length;
assert.strictEqual(firstCount, 12, '应有 12 套一转小毕业');
assert.strictEqual(secondCount, 12, '应有 12 套二转大毕业');
assert.ok(genericCount >= 6, '应保留通用过渡套装');
assert.deepStrictEqual(sets.activationPieces || [], [2, 4, 6], '毕业套应支持 2/4/6 断点');

const gradSlots = ['weapon', 'helmet', 'body', 'hands', 'legs', 'feet'];
Object.values(sets.sets || {}).filter(s => s.tier === 'first' || s.tier === 'second').forEach(s => {
    assert.deepStrictEqual(s.slots, gradSlots, `${s.name} 应为武器+五甲六件套`);
    assert.ok(s.effects['2'] && s.effects['4'] && s.effects['6'], `${s.name} 应有 2/4/6 件效果`);
});

const setSpecials = Object.values(sets.sets || {})
    .flatMap(setDef => Object.values(setDef.effects || {}))
    .map(effect => effect.special)
    .filter(Boolean);
assert.ok(setSpecials.length >= 54, '通用4件 + 毕业4/6件应共有足够 special');
assert.strictEqual(new Set(setSpecials).size, setSpecials.length, '套装 special 必须唯一');
assert.strictEqual((builds.items || []).length, 16, '应配置 16 件流派核心装备');
builds.items.forEach(item => {
    assert.strictEqual(item.slot, 'offHand', `核心装 ${item.equipmentId} 应在副手`);
});
(legendary.universal || []).concat(...Object.values(legendary.classPowers || {})).forEach(power => {
    (power.slots || []).forEach(slot => {
        assert.ok(['amulet', 'ring', 'belt'].includes(slot), `威能 ${power.id} 应在饰品三槽`);
    });
});

const context = {
    console,
    Date,
    Math,
    Set,
    WeakSet,
    Object,
    Array,
    window: {
        getAllActiveSetEffects(playerEquipment) {
            return Object.values(playerEquipment || {})
                .filter(Boolean)
                .map(eq => eq.setSpecial)
                .filter(Boolean)
                .map(special => ({ effect: { special } }));
        }
    }
};
vm.createContext(context);
vm.runInContext(
    fs.readFileSync(path.join(root, 'js/equipment-effect-system.js'), 'utf8'),
    context,
    { filename: 'equipment-effect-system.js' }
);

const effects = context.window.EquipmentEffectSystem;
assert(effects, 'EquipmentEffectSystem 应成功注册');
const supported = effects.getSupportedEffectIds();
assert.deepStrictEqual(
    [...supported.powers].sort(),
    powers.map(power => power.id).sort(),
    '全部传奇威能必须有运行时处理器'
);
setSpecials.forEach(special => {
    assert.ok(supported.sets.includes(special), `套装 special 缺少运行时支持: ${special}`);
});

function playerWith(powerIds, options) {
    const opts = options || {};
    return {
        x: 0,
        y: 0,
        hp: opts.hp == null ? 100 : opts.hp,
        maxHp: 100,
        baseAttack: 100,
        baseDefense: 50,
        baseMagicAttack: 80,
        baseMagicDefense: 30,
        baseCritRate: 5,
        baseCritDamage: 20,
        baseDodge: 0,
        baseAttackSpeed: 100,
        equipment: {
            weapon: {
                legendaryPowers: (powerIds || []).map(id => ({ id })),
                setSpecial: opts.setSpecial || null
            }
        },
        buffs: [],
        skillCooldowns: {},
        updateStats() {},
        heal(amount) {
            this.hp = Math.min(this.maxHp, this.hp + amount);
        }
    };
}

{
    const player = playerWith(['blood_rage'], { hp: 50 });
    const result = effects.modifyBasicAttack(player, null, { damage: 100, isCrit: false });
    assert.strictEqual(result.damage, 125, '血怒在 50% HP 时应增伤 25%');
}

{
    const player = playerWith(['greed_power']);
    assert.strictEqual(effects.getGoldMultiplier(player), 1.5, '贪婪金币倍率错误');
    assert.strictEqual(effects.getPickupRangeMultiplier(player), 2, '贪婪拾取范围倍率错误');
}

{
    const player = playerWith(['phoenix']);
    player.hp = 0;
    assert.strictEqual(effects.preventDeath(player), true, '不死鸟首次应阻止死亡');
    assert.strictEqual(player.hp, 40, '不死鸟应恢复 40% 最大生命');
    assert.strictEqual(effects.preventDeath(player), false, '不死鸟冷却中不应再次触发');
}

{
    const player = playerWith([], { setSpecial: 'dragon_rage', hp: 40 });
    const result = effects.modifyBasicAttack(player, null, { damage: 100, isCrit: false });
    assert.strictEqual(result.damage, 130, '龙族血脉四件套低血增伤错误');
    assert.strictEqual(effects.beforeDamage(player, 100), 85, '龙族血脉四件套低血减伤错误');
}

console.log('Phase 3 equipment tests passed');
