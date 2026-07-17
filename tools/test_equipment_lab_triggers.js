/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const controller = read('js/equipment-lab-controller.js');
assert.ok(controller.includes('runSetLabScript'), '应有毕业套试验场脚本');
assert.ok(controller.includes("type === 'chainblade'"), '应覆盖链刃精炼');

const graduationTriggers = [
    'oath_shield', 'crimson_scar', 'bulwark_oath', 'trail_sigil', 'hundred_pace',
    'swift_plume', 'ember_residue', 'star_oracle', 'curse_echo', 'night_veil',
    'mirror_mask', 'venom_censer', 'holy_balance', 'rift_howl', 'temple_covenant',
    'beast_pact', 'breathless_hunt', 'echo_fold', 'torrent_throne', 'fate_web',
    'grave_throne', 'evernight_seal', 'myriad_mirror', 'plague_altar'
];
graduationTriggers.forEach(id => {
    assert.ok(controller.includes(id), `runSetLabScript 应引用 ${id}`);
});

assert.ok(read('js/phantom-clone-system.js').includes("getSetModifier(owner, 'echoDodge'"),
    'echoDodge 应接入残影闪避');
assert.ok(read('js/equipment-effect-system.js').includes("'echo_fold'"),
    'echo_fold special 应有战斗逻辑');

console.log('equipment lab triggers: ok');
