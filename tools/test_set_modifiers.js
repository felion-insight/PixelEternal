/* eslint-disable no-console */
'use strict';

/**
 * 套装 2 件 modifiers 接线烟雾：验证 getSetModifier 与关键职业入口会读取。
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const json = rel => JSON.parse(read(rel));

const sets = json('config/set-config-v2.json');
const first = Object.values(sets.sets).filter(s => s.tier === 'first');
const second = Object.values(sets.sets).filter(s => s.tier === 'second');
assert.strictEqual(first.length, 12);
assert.strictEqual(second.length, 12);
first.concat(second).forEach(s => {
    assert.ok(s.effects['2'] && s.effects['2'].modifiers, `${s.name} 2件应有 modifiers`);
    assert.ok(s.effects['4'] && s.effects['4'].special, `${s.name} 4件应有 special`);
    assert.ok(s.effects['6'] && s.effects['6'].special, `${s.name} 6件应有 special`);
});

const context = {
    console, Date, Math, Set, WeakSet, Object, Array, Number, String,
    window: {
        getAllActiveSetEffects() { return []; }
    }
};
vm.createContext(context);
vm.runInContext(read('js/equipment-effect-system.js'), context, { filename: 'equipment-effect-system.js' });

assert.strictEqual(typeof context.window.getSetModifier, 'function', '应导出 getSetModifier');
assert.strictEqual(typeof context.window.EquipmentEffectSystem.getModifier, 'function');

const player = { _setModifiers: { precisionGainBonus: 0.25, petDamagePercent: 18, holyShieldMaxBonus: 1 } };
assert.strictEqual(context.window.getSetModifier(player, 'precisionGainBonus', 0), 0.25);
assert.strictEqual(context.window.getSetModifier(player, 'petDamagePercent', 0), 18);
assert.strictEqual(context.window.getSetModifier(player, 'missing', 3), 3);

// echoDodge：有残影时由 phantom-clone-system 叠加到闪避 buff
assert.ok(read('js/phantom-clone-system.js').includes("getSetModifier(owner, 'echoDodge'"),
    'echoDodge 应接入残影掩护闪避');

// 试验场：毕业 4/6 件应有专属 set 脚本
assert.ok(read('js/equipment-lab-controller.js').includes('runSetLabScript'),
    '试验场应有毕业套专属脚本');
assert.ok(read('js/equipment-lab-controller.js').includes("type === 'chainblade'"),
    '试验场应覆盖链刃精炼演示');

// VFX：毕业 special 均有 style
vm.runInContext(read('js/equipment-set-vfx.js'), context, { filename: 'equipment-set-vfx.js' });
const vfx = context.window.EquipmentSetVFX;
const styles = new Set();
['oath_shield', 'crimson_scar', 'trail_sigil', 'hundred_pace', 'swift_plume',
    'ember_residue', 'star_oracle', 'curse_echo', 'night_veil', 'mirror_mask',
    'venom_censer', 'holy_balance_apex', 'breathless_hunt', 'plague_altar_apex'
].forEach(id => {
    const def = vfx.getDefinition(id);
    assert.ok(def && def.style, `${id} 应有分化 style`);
    styles.add(def.style);
});
assert.ok(styles.size >= 8, '毕业套装 VFX style 应足够分化');

console.log(`set modifiers wiring: ok (${styles.size} vfx styles sampled)`);
