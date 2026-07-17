/* eslint-disable no-console */
'use strict';

const assert = require('assert');

global.window = global;
require('../js/equipment-power-vfx.js');

const powers = [
    'dragon_breath', 'chain_lightning', 'thorn_aura', 'phoenix', 'phantom_step',
    'frost_nova', 'greed_power', 'blood_rage', 'war_god_fury', 'immortal_shield',
    'titan_body', 'eagle_eye', 'arrow_rain', 'wind_soul', 'arcane_surge',
    'mana_shield', 'element_avatar', 'assassinate', 'shadow_dance', 'death_arrival'
];

assert.deepStrictEqual(
    new Set(window.EquipmentPowerVFX.getSupportedPowers()),
    new Set(powers),
    '20个传奇威能应全部注册VFX'
);

const effects = [];
const player = {
    x: 100,
    y: 120,
    angle: 0.4,
    gameInstance: {
        addEquipmentEffect(type, x, y, options) {
            effects.push({ type, x, y, options });
        }
    }
};

powers.forEach(powerId => {
    delete player._equipmentPowerVfxState;
    assert.strictEqual(window.EquipmentPowerVFX.trigger(player, powerId, {}), true);
    const effect = effects[effects.length - 1];
    assert.strictEqual(effect.type, 'power_vfx');
    assert.strictEqual(effect.options.variant, powerId, `${powerId} 应使用独立视觉变体`);
    const minDuration = powerId === 'arrow_rain' ? 600 : 850;
    assert(effect.options.duration >= minDuration, `${powerId} 特效时长过短`);
    if (window.EquipmentPowerVFX.isBuffStyle(powerId)) {
        assert.strictEqual(effect.options.style, 'buff', `${powerId} 应为增益型轻量标志`);
    } else {
        assert.strictEqual(effect.options.style, 'attack', `${powerId} 应为攻击型特效`);
    }
});

// 连锁闪电应烘焙怪间跳跃点
delete player._equipmentPowerVfxState;
player.gameInstance._getSkillMonsters = () => ([
    { x: 100, y: 120, hp: 10 },
    { x: 160, y: 140, hp: 10 },
    { x: 210, y: 100, hp: 10 }
]);
assert.strictEqual(window.EquipmentPowerVFX.trigger(player, 'chain_lightning', { target: { x: 100, y: 120 } }), true);
const chainFx = effects[effects.length - 1];
assert(Array.isArray(chainFx.options.chainPoints) && chainFx.options.chainPoints.length >= 2, '连锁闪电应包含跳跃点');

assert.ok(new Set(effects.filter(e => e.options.variant).map(effect => effect.options.variant)).size >= 20, '威能视觉变体不得重复');
console.log('equipment power vfx: ok (20 powers)');
