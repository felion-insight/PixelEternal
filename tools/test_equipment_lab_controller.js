/* eslint-disable no-console */
'use strict';

const assert = require('assert');

global.window = global;
window.CONFIG = { CANVAS_WIDTH: 800, CANVAS_HEIGHT: 600 };
window.captureSkillLabPlayerState = player => ({ marker: player.marker });
let restored = false;
window.restoreSkillLabPlayerState = (player, state) => {
    player.marker = state.marker;
    restored = true;
};
window.applySkillLabPlayerConfig = () => true;
window.getSkillLabSkillList = () => [];
window.EquipmentLabCatalog = {
    buildLoadout: entry => ({ weapon: { id: entry.id } }),
    applyLoadout: (player, equipment) => {
        player.equipment = equipment;
        return true;
    }
};
window.EquipmentEffectSystem = new Proxy({}, {
    get: () => () => true
});

require('../js/equipment-lab-metrics.js');
require('../js/equipment-lab-controller.js');

const dummy = { hp: 100, totalDamage: 0 };
const scene = {
    dummies: [dummy],
    clearAllDummies() { this.dummies = []; },
    addDummy() {
        const target = { hp: 100, totalDamage: 0 };
        this.dummies.push(target);
        return target;
    }
};
const player = {
    marker: 'original',
    x: 400,
    y: 300,
    angle: 0,
    hp: 100,
    maxHp: 100,
    baseAttack: 10,
    equipment: {},
    skillCooldowns: {},
    classResource: { current: 100, max: 100 },
    attack(targets) {
        targets[0].totalDamage += 10;
    },
    useWeaponSkill(target) {
        target.totalDamage += 5;
    }
};
const game = {
    player,
    equipmentLabScene: scene,
    resetSkillLabCombatState() {},
    useClassSkillHotbar() {},
    addFloatingText() {}
};

const controller = new window.EquipmentLabController(game);
const entries = [
    { id: 'one', name: '装备一', effectId: 'one', trigger: 'basic', classData: {} },
    { id: 'two', name: '装备二', effectId: 'two', trigger: 'dodge', classData: {} }
];

assert.strictEqual(controller.start(entries, { durationMs: 2000 }), true);
assert.strictEqual(controller.currentEntry.id, 'one');
controller.togglePause();
const pausedElapsed = controller.elapsedMs;
controller.update();
assert.strictEqual(controller.elapsedMs, pausedElapsed, '暂停时不得推进时间');
controller.togglePause();
controller.next();
assert.strictEqual(controller.currentEntry.id, 'two');
controller.previous();
assert.strictEqual(controller.currentEntry.id, 'one');
controller.stop(true);
assert.strictEqual(restored, true, '停止后应恢复原状态');
assert.strictEqual(controller.isRunning, false);

console.log('equipment lab controller state machine: ok');
