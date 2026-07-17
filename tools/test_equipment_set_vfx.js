/* eslint-disable no-console */
'use strict';

const assert = require('assert');

global.window = global;
require('../js/equipment-set-vfx.js');

const specials = window.EquipmentSetVFX.getSupportedSpecials();
assert.ok(specials.length >= 50, '应覆盖通用+一转/二转 4·6 件 special VFX');
assert.ok(specials.includes('oath_shield') && specials.includes('holy_balance_apex'), '应含毕业套装 special');
const sample = window.EquipmentSetVFX.getDefinition('breathless_hunt');
assert.ok(sample && sample.style === 'sniper_gaze', '死眼套应使用 sniper_gaze 分化样式');
const apex = window.EquipmentSetVFX.getDefinition('plague_altar_apex');
assert.ok(apex && apex.apex && apex.style === 'poison_cloud', '瘟疫 apex 应为毒雾族');

const effects = [];
const player = {
    x: 100,
    y: 120,
    equipment: {},
    gameInstance: {
        addEquipmentEffect(type, x, y, options) {
            effects.push({ type, x, y, options });
        }
    }
};

specials.forEach((special, index) => {
    delete player._equipmentSetVfxState;
    assert.strictEqual(window.EquipmentSetVFX.trigger(player, special, { stacks: index + 1 }), true);
    const effect = effects[effects.length - 1];
    assert.strictEqual(effect.type, 'set_special_vfx');
    assert(effect.options.variant, `${special} 应有独立视觉变体`);
});

window.getAllActiveSetEffects = () => [{
    setId: 'oath_shield',
    pieceCount: 2,
    effect: { stats: { defense: 28 } }
}];
delete player._equipmentSetVfxState;
window.EquipmentSetVFX.tick(player);
assert.strictEqual(effects[effects.length - 1].type, 'set_two_piece_aura', '二件套应生成轻量徽记');

console.log(`equipment set vfx: ok (${specials.length} specials + 2-piece aura)`);
