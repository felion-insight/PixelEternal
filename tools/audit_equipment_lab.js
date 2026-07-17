/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const json = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));

global.window = global;
window.LEGENDARY_POWERS = json('config/legendary-powers.json');
window.SET_DEFINITIONS_V2 = json('config/set-config-v2.json');
window.CLASS_BUILD_EQUIPMENT = json('config/class-build-equipment.json');
window.WEAPON_AFFINITY_CONFIG = json('config/weapon-affinity-config.json');
window.AFFIX_POOL = json('config/affix-pool.json');
window.EQUIPMENT_SLOT_ORDER = [
    'weapon', 'offHand', 'helmet', 'body', 'hands',
    'legs', 'feet', 'amulet', 'ring', 'belt'
];
window.createEmptyEquipmentSlots = () => Object.fromEntries(
    window.EQUIPMENT_SLOT_ORDER.map(slot => [slot, null])
);
window.generateProceduralEquipment = context => ({
    id: 'generated',
    name: `${context.slot}-${context.quality}`,
    slot: context.slot,
    weaponType: context.weaponType || 'sword',
    legendaryPowers: [],
    prefixes: [],
    suffixes: [],
    setId: context.setId || null,
    buildEquipmentId: context.buildEquipmentId || null,
    refineLevel: context.refineLevel || 0,
    applyEnhancement() {}
});
window.rebuildProceduralEquipmentStats = () => true;
window.WeaponRefinementSystem = {
    getMechanic: weaponType => ({
        core: { id: `${weaponType}_core`, name: '核心' },
        capstone: { id: `${weaponType}_capstone`, name: '进阶' }
    }),
    reset() {},
    tick() {},
    modifyBasicAttack(player, target, ctx) { return ctx; },
    afterBasicAttack() {},
    onDodge() {},
    onSkillCast() {},
    onWeaponSkill() {},
    onBlock() {}
};

require('../js/equipment-effect-system.js');
require('../js/equipment-set-vfx.js');
require('../js/equipment-power-vfx.js');
require('../js/weapon-refinement-resonance.js');
require('../js/equipment-lab-catalog.js');

const catalog = window.EquipmentLabCatalog.buildCatalog();
const ees = window.EquipmentEffectSystem.getSupportedEffectIds();
const setVfx = new Set(window.EquipmentSetVFX.getSupportedSpecials());
const powerVfx = new Set(window.EquipmentPowerVFX.getSupportedPowers());
const powers = new Set(ees.powers);
const sets = new Set(ees.sets);

const resSrc = fs.readFileSync(path.join(root, 'js/weapon-refinement-resonance.js'), 'utf8');
const resIdSet = new Set([...resSrc.matchAll(/id:\s*'([^']+)'/g)].map(m => m[1]));

const buildIds = new Set((window.CLASS_BUILD_EQUIPMENT.items || []).map(b => b.equipmentId));
const affixIds = new Set(
    [...(window.AFFIX_POOL.prefixes || []), ...(window.AFFIX_POOL.suffixes || [])].map(a => a.id)
);

const WEAPON_TYPES = new Set([
    'sword', 'axe', 'hammer', 'bow', 'crossbow', 'shortbow', 'longbow',
    'dagger', 'shortblade', 'claw', 'staff', 'orb', 'rune', 'book', 'spear', 'chainblade'
]);

const setDefs = window.SET_DEFINITIONS_V2.sets || {};
const modKeys = new Set();
Object.values(setDefs).forEach(set => {
    Object.values(set.effects || {}).forEach(effect => {
        if (effect.modifiers) Object.keys(effect.modifiers).forEach(k => modKeys.add(k));
    });
});

const wiredKeys = new Set();
const eesSrc = fs.readFileSync(path.join(root, 'js/equipment-effect-system.js'), 'utf8');
[...eesSrc.matchAll(/mod\(player,\s*'([^']+)'/g)].forEach(m => wiredKeys.add(m[1]));

const jsFiles = fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js'));
jsFiles.forEach(file => {
    const text = fs.readFileSync(path.join(root, 'js', file), 'utf8');
    [...text.matchAll(/getSetModifier\([^,]+,\s*'([^']+)'/g)].forEach(m => wiredKeys.add(m[1]));
});

const controllerSrc = fs.readFileSync(path.join(root, 'js/equipment-lab-controller.js'), 'utf8');
const dedicatedTriggers = new Set();
[...controllerSrc.matchAll(/effectId === '([^']+)'/g)].forEach(m => dedicatedTriggers.add(m[1]));

const signalSpecials = new Set();
[...eesSrc.matchAll(/signal\(player,\s*'([^']+)'/g)].forEach(m => signalSpecials.add(m[1]));

function grade(mech, vfx, lab) {
    if (mech === 'missing' || vfx === 'missing') return 'missing';
    if (mech === 'partial' || vfx === 'partial' || lab === 'partial') return 'partial';
    return 'ok';
}

const rows = [];
catalog.forEach(entry => {
    const row = {
        id: entry.id,
        name: entry.name,
        category: entry.category,
        effectId: entry.effectId,
        mech: 'ok',
        vfx: 'n/a',
        lab: 'ok',
        notes: []
    };

    if (entry.category === 'power') {
        if (!powers.has(entry.effectId)) {
            row.mech = 'missing';
            row.notes.push('EES未注册威能');
        }
        row.vfx = powerVfx.has(entry.effectId) ? 'ok' : 'missing';
        if (!dedicatedTriggers.has(entry.effectId)) {
            row.lab = 'partial';
            row.notes.push('试验场无专属触发脚本，依赖通用路径');
        }
    } else if (entry.category === 'set') {
        if (entry.pieceCount === 2) {
            const effect = (setDefs[entry.setId] && setDefs[entry.setId].effects || {})['2'];
            const mods = effect && effect.modifiers ? Object.keys(effect.modifiers) : [];
            if (!mods.length) {
                row.mech = 'partial';
                row.notes.push('通用套2件仅属性加成');
            } else {
                const unwired = mods.filter(k => !wiredKeys.has(k));
                const inEes = mods.filter(k => [...eesSrc.matchAll(/mod\(player,\s*'([^']+)'/g)].map(m => m[1]).includes(k));
                if (unwired.length) {
                    row.mech = 'partial';
                    row.notes.push(`modifiers未接线: ${unwired.join(', ')}`);
                } else if (inEes.length < mods.length) {
                    row.mech = 'partial';
                    row.notes.push(`modifiers仅职业系统接线: ${mods.join(', ')}`);
                }
            }
            row.vfx = 'n/a';
            row.lab = 'partial';
            row.notes.push('2件无special，试验场仅普攻/技能间接展示');
        } else {
            const special = entry.effectId;
            if (!sets.has(special)) {
                row.mech = 'missing';
                row.notes.push('EES未注册套装special');
            } else if (!signalSpecials.has(special) && !signalSpecials.has(special.replace(/_apex$/, ''))) {
                row.mech = 'partial';
                row.notes.push('已注册但战斗signal路径薄弱');
            }
            row.vfx = setVfx.has(special) ? 'ok' : 'missing';
            if (!dedicatedTriggers.has(special) && !dedicatedTriggers.has(special.replace(/_apex$/, ''))) {
                if (special.endsWith('_apex')) {
                    row.lab = 'partial';
                    row.notes.push('apex依赖4件同类触发脚本+满编');
                } else {
                    row.lab = 'partial';
                    row.notes.push('试验场走通用simulateBasic，非专属脚本');
                }
            }
        }
    } else if (entry.category === 'build') {
        if (!buildIds.has(entry.effectId)) row.mech = 'missing';
        row.vfx = 'n/a';
        row.notes.push('流派核心改技能，无独立装备VFX');
    } else if (entry.category === 'weapon') {
        if (!WEAPON_TYPES.has(entry.weaponType)) row.mech = 'missing';
        row.vfx = entry.refineLevel >= 3 ? 'partial' : 'n/a';
        if (entry.refineLevel >= 3) row.notes.push('武器精炼特效走WeaponRefinementSystem');
    } else if (entry.category === 'resonance') {
        if (!resIdSet.has(entry.effectId)) row.mech = 'missing';
        row.vfx = 'n/a';
        row.notes.push('共鸣机制在WeaponRefinementResonance');
    } else if (entry.category === 'affix') {
        if (!affixIds.has(entry.effectId)) row.mech = 'missing';
        row.vfx = 'n/a';
        row.lab = 'partial';
        row.notes.push('纯属性词缀');
    }

    row.status = grade(row.mech, row.vfx, row.lab);
    row.notes = row.notes.join('; ');
    rows.push(row);
});

const summary = {
    total: rows.length,
    ok: rows.filter(r => r.status === 'ok').length,
    partial: rows.filter(r => r.status === 'partial').length,
    missing: rows.filter(r => r.status === 'missing').length,
    byCategory: {}
};
['power', 'set', 'build', 'weapon', 'resonance', 'affix'].forEach(cat => {
    const list = rows.filter(r => r.category === cat);
    summary.byCategory[cat] = {
        total: list.length,
        ok: list.filter(r => r.status === 'ok').length,
        partial: list.filter(r => r.status === 'partial').length,
        missing: list.filter(r => r.status === 'missing').length
    };
});

const unwiredMods = [...modKeys].filter(k => !wiredKeys.has(k));
const report = {
    generatedAt: new Date().toISOString(),
    summary,
    unwiredModifierKeys: unwiredMods,
    missing: rows.filter(r => r.status === 'missing'),
    partialHighlights: rows.filter(r => r.status === 'partial' && (
        r.mech === 'missing' || r.vfx === 'missing' || r.notes.includes('未接线')
    )),
    all: rows
};

const outPath = path.join(root, 'equipment_lab_audit.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ summary, unwiredModifierKeys: unwiredMods, missingCount: report.missing.length }, null, 2));
