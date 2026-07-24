/**
 * 固定编队 + 敌人特质协同
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

global.window = global;
const baseCfg = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/auto-battler-config.json'), 'utf8'));
const encCfg = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/auto-battler-encounters.json'), 'utf8'));
window.CONFIG = { AUTO_BATTLER_CONFIG: Object.assign({}, baseCfg, encCfg) };

require('../js/enemy-composition-system.js');
require('../js/run-state-system.js');
require('../js/tower-run-map.js');
require('../js/auto-battle-simulator.js');

const TRM = window.TowerRunMap;
const ABS = window.AutoBattleSimulator;
const ECS = window.EnemyCompositionSystem;

const map = TRM.generateRunMap(12345);
assert.equal(map.layers, 27, '27 layers');

const comp = ECS.pickComposition('battle', 5, () => 0.2);
assert(comp && comp.squad && comp.name, 'composition pick');
assert(comp.squad.length >= 2, 'valid squad');

const units = ABS.generateEnemies('battle', 4, () => 0);
assert(units.length >= 2, 'generated units');
assert(units[0].encounterName, 'encounter name on unit');
assert(units.some((u) => (u.traits || []).length > 0), 'traits attached');

const elite = ABS.generateEnemies('elite', 12, () => 0.5);
assert(elite.length >= 3, 'elite squad');

const boss = ABS.generateEnemies('boss', 8, () => 0.5);
assert(boss.some((u) => u.templateId === 'ab_boss_warden'), 'boss composition');

const fin = ABS.generateEnemies('boss_final', 26, () => 0.5);
assert(fin.length >= 5, 'final squad');
assert(fin[0].encounterName, 'final encounter name');

const list = window.CONFIG.AUTO_BATTLER_CONFIG.encounterCompositions || [];
assert.equal(list.length, 72, '72 compositions (4 stages x 18)');

function countStage(prefix, nodeType, idHint) {
    return list.filter((c) => {
        if (c.id.indexOf(prefix) !== 0) return false;
        const types = c.nodeTypes || ['battle'];
        if (types.indexOf(nodeType) < 0) return false;
        if (idHint === 'battle') return !/_elite_|_boss_|_final_/.test(c.id);
        if (idHint === 'elite') return c.id.indexOf('_elite_') >= 0;
        if (idHint === 'boss') return c.id.indexOf('_boss_') >= 0;
        if (idHint === 'boss_final') return c.id.indexOf('_final_') >= 0;
        return true;
    }).length;
}

[
    { prefix: 's1_', bossType: 'boss', hint: 'boss' },
    { prefix: 's2_', bossType: 'boss', hint: 'boss' },
    { prefix: 's3_', bossType: 'boss', hint: 'boss' },
    { prefix: 's4_', bossType: 'boss_final', hint: 'boss_final' }
].forEach((s, i) => {
    const stage = i + 1;
    assert.equal(countStage(s.prefix, 'battle', 'battle'), 10, `stage ${stage} battle`);
    assert.equal(countStage(s.prefix, 'elite', 'elite'), 5, `stage ${stage} elite`);
    assert.equal(countStage(s.prefix, s.bossType, s.hint), 3, `stage ${stage} boss`);
});

const finComp = ECS.pickComposition('boss_final', 26, () => 0.5);
assert(finComp && finComp.squad && finComp.squad.length >= 5, 'final boss composition');

console.log('test_tower_run_map.js: OK');
