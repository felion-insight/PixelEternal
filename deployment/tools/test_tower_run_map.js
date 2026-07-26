/**
 * 动态楼层生成 + 敌人编队
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
const RSS = window.RunStateSystem;

const expectedLayers = TRM.totalLayers();
assert.ok(expectedLayers >= 35, 'run should be long enough (>=35 compressed)');

const map = TRM.generateRunMap(12345);
assert.equal(map.layers, expectedLayers, 'layers match act layout');

const layout = TRM.computeActLayout();
assert.equal(layout.length, 4, '4 acts');
assert.equal(layout[0].preBossSteps, 9, 'act1 length');
assert.equal(layout[0].bossLayer, 9, 'first boss layer');
assert.equal(layout[0].forceRestAt.indexOf(2) >= 0, true, 'early rest');

// 动态三选一：入门前 3 步无 elite；选项不全是精英
const dyn = TRM.createEmptyMap(4242);
const rng = RSS.mulberry32(4242);
TRM.generateOpeningChoices(dyn, rng);
assert.equal(dyn.nextChoices.length, 1, 'opening single battle');
let cur = TRM.getNode(dyn, dyn.startId);
const seenEliteBefore3 = [];
for (let step = 0; step < 16; step++) {
    cur.cleared = true;
    const choices = TRM.generateNextChoices(dyn, cur, rng);
    assert.ok(choices.length >= 1 && choices.length <= 3, '1-3 choices');
    const types = choices.map((c) => c.type);
    if (types.every((t) => t === 'elite')) {
        assert.fail('choices should not be all elite');
    }
    if (step < 2) {
        types.forEach((t) => {
            if (t === 'elite') seenEliteBefore3.push(step + 1);
        });
    }
    // 强制 rest 步（act step 2 = next layer 2 after clearing layer 1...）
    // after clearing layer L, next is L+1. Opening is L0.
    // When we clear L0, next is L1; clear L1 → L2 (force rest at step 2)
    if (choices[0].layer === 2) {
        assert.ok(types.every((t) => t === 'rest'), 'layer 2 forced rest');
    }
    if (choices[0].layer === layout[0].bossLayer) {
        assert.equal(choices.length, 1, 'boss single choice');
        assert.equal(choices[0].type, 'boss', 'boss type');
        break;
    }
    cur = choices[0];
}
assert.equal(seenEliteBefore3.length, 0, 'no elite in first 3 act steps options');

const comp = ECS.pickComposition('battle', 5, () => 0.2);
assert(comp && comp.squad && comp.name, 'composition pick');
assert(comp.squad.length >= 2, 'valid squad');

const units = ABS.generateEnemies('battle', 4, () => 0);
assert(units.length >= 2, 'generated units');
assert(units[0].encounterName, 'encounter name on unit');
assert(units.some((u) => (u.traits || []).length > 0), 'traits attached');

const elite = ABS.generateEnemies('elite', 20, () => 0.5);
assert(elite.length >= 3, 'elite squad');

const boss = ABS.generateEnemies('boss', layout[0].bossLayer, () => 0.5);
assert(boss.some((u) => u.templateId === 'ab_boss_warden'), 'boss composition');

const finLayer = layout[layout.length - 1].bossLayer;
const fin = ABS.generateEnemies('boss_final', finLayer, () => 0.5);
assert(fin.length >= 5, 'final squad');
assert(fin[0].encounterName, 'final encounter name');

const list = window.CONFIG.AUTO_BATTLER_CONFIG.encounterCompositions || [];
assert.equal(list.length, 78, '78 compositions (72 base + 6 branch bosses)');

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

const finComp = ECS.pickComposition('boss_final', finLayer, () => 0.5);
assert(finComp && finComp.squad && finComp.squad.length >= 5, 'final boss composition');

console.log('test_tower_run_map.js: OK');
