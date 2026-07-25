/**
 * 写入 lineages / duoSparks / 质变技能 到 auto-battler-config.json
 * 运行: node tools/patch-skill-lineages.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CFG_PATH = path.join(ROOT, 'config', 'auto-battler-config.json');

function up(id, name, rarity, mutate, desc) {
    return { id, name, rarity: rarity || 'common', mutate, description: desc || name };
}

function branch(id, name, skillIds, upgrades, evolve) {
    const b = { id, name, skillIds: skillIds || [], upgrades: upgrades || [] };
    if (evolve) b.evolve = evolve;
    return b;
}

function lineage(id, name, seeds, branches, tag) {
    return { id, name, seeds: seeds || [], branches: branches || [], tag: tag || null };
}

function cloneSkill(base, id, name, description, patchEffects) {
    const s = JSON.parse(JSON.stringify(base));
    s.id = id;
    s.name = name;
    if (description) s.description = description;
    if (typeof patchEffects === 'function') s.effects = patchEffects(s.effects || []);
    s.evolved = true;
    return s;
}

const lineages = [
    lineage('immortal', '不灭甲胄', ['iron_will', 'retaliation', 'shield_wall', 'last_stand'], [
        branch('immortal_aegis', '凝盾支', ['iron_will', 'retaliation'], [
            up('immortal_aegis_thick', '厚茧', 'common', { shieldPctMult: 1.55 }, '护盾量大幅提升'),
            up('immortal_aegis_swift', '迅凝', 'common', { shieldDurationMult: 1.5, shieldPctMult: 1.2 }, '盾更厚更久'),
            up('immortal_aegis_echo', '碎盾回响', 'uncommon', {
                shieldPctMult: 1.25,
                appendEffects: [{ type: 'damage', mult: 1.0, aoe: true }]
            }, '护盾更厚，并反震周围')
        ], { from: 'iron_will', into: 'iron_will_bulwark', needUpgrades: 2 }),
        branch('immortal_mitigate', '卸力支', ['shield_wall', 'iron_will'], [
            up('immortal_mitigate_ease', '卸劲', 'common', {
                appendEffects: [{ type: 'buff', stat: 'damageTaken', pct: -0.18, durationMs: 5000, target: 'self' }]
            }, '施放后自身大幅减伤'),
            up('immortal_mitigate_sit', '磐坐', 'common', { defenseBuffMult: 1.6, shieldPctMult: 1.2 }, '防御与盾同升'),
            up('immortal_mitigate_wall', '厚壁', 'uncommon', {
                shieldPctMult: 1.4, cooldownMult: 0.85,
                appendEffects: [{ type: 'shield', target: 'front_allies', pct: 0.1, durationMs: 4000 }]
            }, '更快、更厚，并护前排')
        ], { from: 'shield_wall', into: 'shield_wall_titan', needUpgrades: 2 }),
        branch('immortal_ember', '残息支', ['last_stand'], [
            up('immortal_ember_flame', '残焰', 'common', { healMissingMult: 1.5 }, '残血回复大幅提升'),
            up('immortal_ember_ash', '余烬盾', 'uncommon', {
                healMissingMult: 1.25,
                appendEffects: [{ type: 'shield', target: 'self', pct: 0.18, durationMs: 5000 }]
            }, '回血并裹上厚盾'),
            up('immortal_ember_stand', '不屈', 'rare', {
                healMissingMult: 1.3,
                appendEffects: [
                    { type: 'buff', stat: 'deathSave', pct: 1, durationMs: 8000, target: 'self' },
                    { type: 'shield', target: 'self', pct: 0.15, durationMs: 5000 }
                ]
            }, '免死姿态 + 护盾')
        ], { from: 'last_stand', into: 'last_stand_undying', needUpgrades: 2 })
    ], 'tank'),

    lineage('vitality', '圣泉咏叹', ['mend_shot', 'holy_nova', 'rally'], [
        branch('vitality_spring', '涌泉支', ['mend_shot'], [
            up('vitality_spring_gush', '涌泉', 'common', { healMult: 1.45 }, '治疗量大幅提升'),
            up('vitality_spring_rush', '急涌', 'common', { cooldownMult: 0.78, healMult: 1.15 }, '更快更猛的奶'),
            up('vitality_spring_dual', '双注', 'uncommon', {
                healMult: 1.25,
                appendEffects: [
                    { type: 'heal', target: 'lowest_ally', pct: 0.16 },
                    { type: 'shield', target: 'lowest_ally', pct: 0.08, durationMs: 3500 }
                ]
            }, '额外奶最低血并给薄盾')
        ], { from: 'mend_shot', into: 'mend_shot_spring', needUpgrades: 2 }),
        branch('vitality_ripple', '涟漪支', ['holy_nova', 'rally'], [
            up('vitality_ripple_wave', '涟漪', 'common', { healMult: 1.4, forceAoe: true }, '群疗大幅提升'),
            up('vitality_ripple_soft', '柔光', 'common', {
                healMult: 1.3,
                appendEffects: [{ type: 'buff', stat: 'damageTaken', pct: -0.1, durationMs: 4000, target: 'allies' }]
            }, '疗伤并短时减伤'),
            up('vitality_ripple_ring', '圣环', 'uncommon', {
                healMult: 1.25,
                appendEffects: [{ type: 'shield', target: 'allies', pct: 0.12, durationMs: 4000 }]
            }, '群疗后全队薄盾')
        ], { from: 'holy_nova', into: 'holy_nova_dawn', needUpgrades: 2 }),
        branch('vitality_overflow', '圣溢支', ['mend_shot', 'holy_nova', 'rally'], [
            up('vitality_overflow_cup', '圣溢', 'common', {
                healMult: 1.2,
                appendEffects: [{ type: 'shield', target: 'allies', pct: 0.1, durationMs: 4000 }]
            }, '治疗溢出转全队盾'),
            up('vitality_overflow_gospel', '福音律', 'uncommon', { healMult: 1.35, cooldownMult: 0.85 }, '疗↑·CD↓'),
            up('vitality_overflow_pulse', '脉泉', 'rare', {
                healMult: 1.3, shieldPctMult: 1.35, cooldownMult: 0.9
            }, '疗盾节奏同升')
        ])
    ], 'heal'),

    lineage('knight_aegis', '誓盾轮回', ['shield_slam', 'shield_bash', 'shield_wall', 'iron_will', 'retaliation'], [
        branch('knight_bash', '盾击支', ['shield_slam', 'shield_bash'], [
            up('knight_bash_heavy', '重盾', 'common', { damageMult: 1.4, stunDurationBonusMs: 250 }, '更重更晕'),
            up('knight_bash_long', '久震', 'common', {
                stunDurationBonusMs: 550,
                appendEffects: [{ type: 'debuff', stat: 'defense', pct: -0.12, durationMs: 4000 }]
            }, '长晕并碎甲'),
            up('knight_bash_bloom', '盾花', 'uncommon', {
                damageMult: 1.25,
                appendEffects: [
                    { type: 'shield', target: 'self', pct: 0.18, durationMs: 4500 },
                    { type: 'stun', durationMs: 700 }
                ]
            }, '命中给厚盾并再晕')
        ], { from: 'shield_slam', into: 'shield_slam_oath', needUpgrades: 2 }),
        branch('knight_wall', '盾墙支', ['shield_wall', 'iron_will'], [
            up('knight_wall_cycle', '轮转', 'common', { cooldownMult: 0.78, shieldPctMult: 1.25 }, '盾墙更快更厚'),
            up('knight_wall_thick', '加厚', 'common', { shieldPctMult: 1.5 }, '盾量暴涨'),
            up('knight_wall_cover', '友军覆盖', 'uncommon', {
                shieldPctMult: 1.3,
                appendEffects: [{ type: 'shield', target: 'front_allies', pct: 0.16, durationMs: 5000 }]
            }, '前排覆盖厚盾')
        ], { from: 'shield_wall', into: 'shield_wall_cycle', needUpgrades: 2 }),
        branch('knight_oath', '守誓支', ['retaliation'], [
            up('knight_oath_stance', '反击姿态', 'common', {
                shieldPctMult: 1.4,
                appendEffects: [{ type: 'damage', mult: 0.9, aoe: true }]
            }, '反击盾↑并反震'),
            up('knight_oath_guard', '守誓防', 'common', {
                defenseBuffMult: 1.5,
                appendEffects: [{ type: 'buff', stat: 'damageTaken', pct: -0.12, durationMs: 4000, target: 'self' }]
            }, '防御与减伤'),
            up('knight_oath_haste', '受击缩隙', 'uncommon', {
                cooldownMult: 0.8, shieldPctMult: 1.25, damageMult: 1.2
            }, '更快反击')
        ], { from: 'retaliation', into: 'retaliation_oath', needUpgrades: 2 })
    ], 'knight'),

    lineage('berserk_blood', '赤哮血河', ['bloodthirst', 'whirlwind', 'cleave', 'hammerfall', 'charge'], [
        branch('berserk_leech', '嗜血支', ['bloodthirst'], [
            up('berserk_leech_deep', '深噬', 'common', { addLifestealPct: 0.25, damageMult: 1.2 }, '大量吸血'),
            up('berserk_leech_thirst', '渴血', 'uncommon', {
                addLifestealPct: 0.2, damageMult: 1.35,
                executeBonus: { threshold: 0.4, bonusMult: 2.4 }
            }, '残血越咬越狠'),
            up('berserk_leech_frenzy', '血渴', 'rare', {
                damageMult: 1.3, cooldownMult: 0.85, addLifestealPct: 0.15, forceAoe: true, splashMult: 1.15
            }, '嗜血成片狂打')
        ], { from: 'bloodthirst', into: 'bloodthirst_roar', needUpgrades: 2 }),
        branch('berserk_storm', '狂岚支', ['whirlwind', 'cleave'], [
            up('berserk_storm_spin', '血旋', 'common', {
                splashMult: 1.45, damageMult: 1.25, forceAoe: true, addLifestealPct: 0.1
            }, '更大旋风并吸血'),
            up('berserk_storm_gale', '狂岚', 'common', {
                damageMult: 1.4, forceAoe: true, splashMult: 1.35
            }, '狂岚大范围'),
            up('berserk_storm_river', '血河', 'uncommon', {
                damageMult: 1.3, forceAoe: true, splashMult: 1.4, addLifestealPct: 0.18
            }, '血河旋风：群殴吸血')
        ], { from: 'whirlwind', into: 'whirlwind_blood', needUpgrades: 2 }),
        branch('berserk_break', '崩血支', ['hammerfall', 'charge'], [
            up('berserk_break_line', '崩折', 'common', {
                damageMult: 1.25,
                executeBonus: { threshold: 0.42, bonusMult: 3.2 }
            }, '更容易崩杀'),
            up('berserk_break_charge', '血冲', 'common', {
                damageMult: 1.4, forceAoe: true, splashMult: 1.2,
                appendEffects: [{ type: 'stun', durationMs: 600 }]
            }, '冲锋重击并短晕'),
            up('berserk_break_crush', '崩锤', 'uncommon', {
                damageMult: 1.35, splashMult: 1.35, forceAoe: true,
                executeBonus: { threshold: 0.4, bonusMult: 2.8 }
            }, '崩锤溅射斩杀')
        ], { from: 'hammerfall', into: 'hammerfall_blood', needUpgrades: 2 })
    ], 'berserker'),

    lineage('poison', '腐骨花', ['poison_arrow', 'poison_blade', 'barbed_arrow', 'hemorrhage', 'garrote'], [
        branch('poison_stack', '叠毒支', ['poison_arrow', 'poison_blade'], [
            up('poison_stack_thick', '浓毒', 'common', {
                dotMult: 1.5,
                appendEffects: [{ type: 'dot', pctOfAttack: 0.32, durationMs: 5000, ticks: 5 }]
            }, '浓毒追加'),
            up('poison_stack_long', '长蚀', 'common', {
                dotDurationMult: 1.5, dotMult: 1.3, damageMult: 1.15
            }, '毒伤更久更痛'),
            up('poison_stack_fang', '毒牙', 'uncommon', {
                damageMult: 1.25, forceAoe: true, splashMult: 1.15,
                appendEffects: [{ type: 'dot', pctOfAttack: 0.3, durationMs: 4500, ticks: 4 }]
            }, '毒牙溅射')
        ], { from: 'poison_arrow', into: 'poison_arrow_vine', needUpgrades: 2 }),
        branch('poison_bone', '骨花支', ['barbed_arrow', 'hemorrhage'], [
            up('poison_bone_barb', '倒刺', 'common', {
                stackDotBonus: 2, damageMult: 1.2,
                appendEffects: [{ type: 'dot', pctOfAttack: 0.25, durationMs: 4500, ticks: 4 }]
            }, '倒刺叠层与流血'),
            up('poison_bone_bloom', '骨花爆', 'uncommon', {
                damageMult: 1.35, dotMult: 1.4, forceAoe: true, splashMult: 1.2
            }, '叠满爆裂成片'),
            up('poison_bone_thorn', '骨刺', 'rare', {
                damageMult: 1.3, splashMult: 1.3, forceAoe: true, dotMult: 1.25
            }, '骨刺扩散')
        ], { from: 'barbed_arrow', into: 'barbed_arrow_bone', needUpgrades: 2 }),
        branch('poison_spread', '蔓生支', ['garrote', 'poison_arrow', 'poison_blade'], [
            up('poison_spread_aoe', '蔓延', 'common', {
                forceAoe: true, splashMult: 1.25,
                appendEffects: [{ type: 'dot_aoe', pctOfAttack: 0.28, durationMs: 5000 }]
            }, '毒素蔓延成片'),
            up('poison_spread_breath', '疫息', 'uncommon', {
                dotMult: 1.4, forceAoe: true, splashMult: 1.35, damageMult: 1.2
            }, '疫息毒潮'),
            up('poison_spread_root', '根蔓', 'rare', {
                cooldownMult: 0.85, dotMult: 1.35, forceAoe: true,
                appendEffects: [{ type: 'stun', durationMs: 500, aoe: true }]
            }, '毒蔓缠绕短控')
        ])
    ], 'poison'),

    lineage('marksman_snipe', '穿云一矢', ['snipe', 'hunters_mark', 'power_shot', 'piercing_shot'], [
        branch('snipe_far', '远狙支', ['snipe', 'power_shot'], [
            up('snipe_far_range', '远瞄', 'common', { rangeBonus: 55, damageMult: 1.25 }, '超远狙杀'),
            up('snipe_far_steady', '稳狙', 'common', { damageMult: 1.4, rangeBonus: 25 }, '重矢直伤'),
            up('snipe_far_wind', '穿风', 'uncommon', {
                rangeBonus: 40, damageMult: 1.3, cooldownMult: 0.9
            }, '更远更快更痛')
        ], { from: 'snipe', into: 'snipe_cloud', needUpgrades: 2 }),
        branch('snipe_pierce', '穿云支', ['snipe', 'piercing_shot'], [
            up('snipe_pierce_bolt', '穿云', 'common', {
                damageMult: 1.4, addChainJumps: 1
            }, '穿云并贯穿'),
            up('snipe_pierce_line', '透射', 'uncommon', {
                addChainJumps: 2, chainFalloff: 1, damageMult: 1.25
            }, '多段贯穿不衰减'),
            up('snipe_pierce_focus', '凝矢', 'rare', {
                damageMult: 1.5, addChainJumps: 1,
                executeBonus: { threshold: 0.35, bonusMult: 2.6 }
            }, '凝矢重击斩杀')
        ]),
        branch('snipe_eye', '点睛支', ['hunters_mark', 'snipe'], [
            up('snipe_eye_mark', '点睛', 'common', {
                markAmpMult: 1.5, damageMult: 1.2,
                appendEffects: [{ type: 'mark', amp: 0.2, durationMs: 5500 }]
            }, '强力易伤烙印'),
            up('snipe_eye_long', '长印', 'common', {
                markDurationMult: 1.6, markAmpMult: 1.3, damageMult: 1.15
            }, '印记更深更久'),
            up('snipe_eye_hunt', '猎眼', 'uncommon', {
                damageMult: 1.35, markAmpMult: 1.35, rangeBonus: 25,
                executeBonus: { threshold: 0.4, bonusMult: 2.5 }
            }, '猎眼集火')
        ], { from: 'hunters_mark', into: 'hunters_mark_eye', needUpgrades: 2 })
    ], 'marksman'),

    lineage('burn', '劫灰', ['fireball', 'flame_wave', 'meteor', 'blizzard'], [
        branch('burn_core', '燃芯支', ['fireball', 'flame_wave'], [
            up('burn_core_ignite', '燃芯', 'common', {
                appendEffects: [{ type: 'dot', pctOfAttack: 0.35, durationMs: 5000, ticks: 5 }],
                damageMult: 1.1
            }, '命中点燃：每跳约35%攻击，持续5秒'),
            up('burn_core_flame', '焰伤', 'common', { damageMult: 1.35 }, '火焰直伤大幅提升'),
            up('burn_core_wave', '焰潮', 'uncommon', {
                damageMult: 1.2, forceAoe: true, splashMult: 1.15,
                appendEffects: [{ type: 'dot_aoe', pctOfAttack: 0.18, durationMs: 4000 }]
            }, '火球炸成片，并留下灼烧地带')
        ], { from: 'fireball', into: 'fireball_inferno', needUpgrades: 2 }),
        branch('burn_meteor', '坠星支', ['meteor'], [
            up('burn_meteor_crash', '坠星', 'common', { damageMult: 1.4, cooldownMult: 1.05 }, '陨石重击'),
            up('burn_meteor_ash', '烬域', 'uncommon', {
                splashMult: 1.5, forceAoe: true,
                appendEffects: [{ type: 'dot_aoe', pctOfAttack: 0.22, durationMs: 4500 }]
            }, '撞击溅射并烧焦地面'),
            up('burn_meteor_hell', '烬狱', 'rare', { damageMult: 1.25, splashMult: 1.35, forceAoe: true }, '烬狱大爆炸')
        ], { from: 'meteor', into: 'meteor_ash', needUpgrades: 2 }),
        branch('burn_ember', '余烬支', ['blizzard', 'flame_wave', 'fireball'], [
            up('burn_ember_dot', '余烬', 'common', { dotMult: 1.45, dotDurationMult: 1.2 }, '灼烧伤害与时长提升'),
            up('burn_ember_soil', '焦土', 'uncommon', {
                forceAoe: true, splashMult: 1.25,
                appendEffects: [{ type: 'dot_aoe', pctOfAttack: 0.2, durationMs: 5000 }]
            }, '留下焦土持续灼烧'),
            up('burn_ember_linger', '残焰', 'rare', {
                dotDurationMult: 1.4, damageMult: 1.2,
                appendEffects: [{ type: 'dot', pctOfAttack: 0.25, durationMs: 4000, ticks: 4 }]
            }, '命中追加长燃')
        ])
    ], 'burn'),

    lineage('archmage_arcana', '星轨奥涌', ['arcane_missiles', 'arcane_burst', 'static_surge', 'arcane_shield'], [
        branch('arcana_volley', '连珠支', ['arcane_missiles'], [
            up('arcana_volley_chain', '连珠', 'common', { addChainJumps: 2, damageMult: 1.15 }, '弹射+2'),
            up('arcana_volley_rain', '星雨', 'uncommon', {
                addChainJumps: 2, chainFalloff: 1, damageMult: 1.2
            }, '星雨不衰减'),
            up('arcana_volley_flood', '洪流', 'rare', {
                addChainJumps: 3, chainFalloff: 1, damageMult: 1.25, cooldownMult: 0.9
            }, '奥能洪流')
        ], { from: 'arcane_missiles', into: 'arcane_missiles_orbit', needUpgrades: 2 }),
        branch('arcana_burst', '爆涌支', ['arcane_burst', 'static_surge'], [
            up('arcana_burst_surge', '爆涌', 'common', {
                damageMult: 1.4, forceAoe: true, splashMult: 1.25
            }, '奥能大爆'),
            up('arcana_burst_static', '静电', 'uncommon', {
                addChainJumps: 2, damageMult: 1.25, forceAoe: true, splashMult: 1.15
            }, '静电跳爆'),
            up('arcana_burst_nova', '奥爆', 'rare', {
                damageMult: 1.4, forceAoe: true, splashMult: 1.45,
                appendEffects: [{ type: 'stun', durationMs: 500, aoe: true }]
            }, '奥爆震晕')
        ]),
        branch('arcana_swift', '捷咒支', ['arcane_missiles', 'arcane_burst', 'static_surge', 'arcane_shield'], [
            up('arcana_swift_cd', '捷咒', 'common', { cooldownMult: 0.75, startReady: true }, '冷却大减，开场就绪'),
            up('arcana_swift_ready', '先机', 'uncommon', {
                startReady: true, cooldownMult: 0.8, damageMult: 1.2
            }, '先手洪流'),
            up('arcana_swift_flow', '咒流', 'rare', {
                cooldownMult: 0.72, damageMult: 1.25, addChainJumps: 1
            }, '连放洪流')
        ])
    ], 'mage'),

    lineage('execute', '断罪', ['execution', 'hammerfall', 'snipe', 'backstab'], [
        branch('execute_line', '抬线支', ['execution', 'hammerfall'], [
            up('execute_line_raise', '抬线', 'common', {
                damageMult: 1.15,
                executeBonus: { threshold: 0.32, bonusMult: 2.4 }
            }, '略易触发斩杀'),
            up('execute_line_watch', '盯梢', 'common', {
                damageMult: 1.22,
                executeBonus: { threshold: 0.3, bonusMult: 2.5 }
            }, '处刑直伤'),
            up('execute_line_doom', '终焉感', 'uncommon', {
                damageMult: 1.2,
                executeBonus: { threshold: 0.34, bonusMult: 2.6 }
            }, '终焉点名')
        ], { from: 'execution', into: 'execution_final', needUpgrades: 2 }),
        branch('execute_heavy', '重刑支', ['execution', 'hammerfall', 'snipe'], [
            up('execute_heavy_blow', '重刑', 'common', {
                damageMult: 1.2,
                executeBonus: { threshold: 0.28, bonusMult: 2.7 }
            }, '斩杀倍率提升'),
            up('execute_heavy_strike', '处刑一击', 'uncommon', {
                damageMult: 1.3,
                executeBonus: { threshold: 0.3, bonusMult: 2.6 }
            }, '一击重刑'),
            up('execute_heavy_judge', '断罪', 'rare', {
                damageMult: 1.25, cooldownMult: 0.92, splashMult: 1.1,
                executeBonus: { threshold: 0.32, bonusMult: 2.6 }
            }, '断罪强化')
        ], { from: 'hammerfall', into: 'hammerfall_judge', needUpgrades: 2 }),
        branch('execute_reap', '收割支', ['backstab', 'execution'], [
            up('execute_reap_cut', '收割', 'common', {
                damageMult: 1.2, addLifestealPct: 0.1,
                executeBonus: { threshold: 0.3, bonusMult: 2.4 }
            }, '收割吸血'),
            up('execute_reap_cd', '回隙', 'uncommon', {
                cooldownMult: 0.88, damageMult: 1.15,
                executeBonus: { threshold: 0.3, bonusMult: 2.4 }
            }, '斩杀后更快出手'),
            up('execute_reap_shadow', '影割', 'rare', {
                damageMult: 1.22, addLifestealPct: 0.12, cooldownMult: 0.9,
                executeBonus: { threshold: 0.32, bonusMult: 2.5 }
            }, '影割连斩')
        ])
    ], 'execute'),

    lineage('cleave', '横扫裂帛', ['cleave', 'whirlwind', 'blade_flurry', 'fan_of_knives'], [
        branch('cleave_edge', '开刃支', ['cleave'], [
            up('cleave_edge_open', '开刃', 'common', {
                damageMult: 1.4, splashMult: 1.25, forceAoe: true
            }, '顺劈更痛更开'),
            up('cleave_edge_wide', '阔刃', 'common', {
                splashMult: 1.55, forceAoe: true, damageMult: 1.25
            }, '阔刃大溅射'),
            up('cleave_edge_rift', '裂帛', 'uncommon', {
                damageMult: 1.35, splashMult: 1.4, forceAoe: true,
                appendEffects: [{ type: 'debuff', stat: 'defense', pct: -0.12, durationMs: 4000, aoe: true }]
            }, '裂帛碎甲')
        ], { from: 'cleave', into: 'cleave_rift', needUpgrades: 2 }),
        branch('cleave_spin', '旋帛支', ['whirlwind', 'blade_flurry'], [
            up('cleave_spin_cut', '旋切', 'common', {
                damageMult: 1.4, forceAoe: true, splashMult: 1.35
            }, '旋切大片'),
            up('cleave_spin_rain', '帛雨', 'uncommon', {
                forceAoe: true, splashMult: 1.5, damageMult: 1.3, cooldownMult: 0.9
            }, '帛雨乱舞'),
            up('cleave_spin_storm', '旋岚', 'rare', {
                damageMult: 1.35, cooldownMult: 0.82, forceAoe: true, splashMult: 1.4
            }, '旋岚节奏')
        ], { from: 'whirlwind', into: 'whirlwind_rift', needUpgrades: 2 }),
        branch('cleave_skull', '裂颅支', ['cleave', 'fan_of_knives'], [
            up('cleave_skull_stun', '裂颅', 'common', {
                damageMult: 1.25, forceAoe: true, splashMult: 1.2,
                appendEffects: [{ type: 'stun', durationMs: 900, aoe: true }]
            }, '群体裂颅晕'),
            up('cleave_skull_break', '碎甲', 'uncommon', {
                damageMult: 1.3, forceAoe: true,
                appendEffects: [
                    { type: 'debuff', stat: 'defense', pct: -0.2, durationMs: 5000, aoe: true },
                    { type: 'stun', durationMs: 600, aoe: true }
                ]
            }, '群晕碎甲'),
            up('cleave_skull_rift', '裂颅刃', 'rare', {
                damageMult: 1.35, splashMult: 1.4, forceAoe: true, stunDurationBonusMs: 350
            }, '裂颅强化')
        ])
    ], 'cleave'),

    lineage('chain', '连霄雷', ['chain_lightning', 'static_surge', 'piercing_shot', 'arcane_missiles'], [
        branch('chain_add', '添雷支', ['chain_lightning', 'static_surge'], [
            up('chain_add_jump', '添跳', 'common', { addChainJumps: 2, damageMult: 1.15 }, '弹射+2'),
            up('chain_add_flash', '再闪', 'uncommon', {
                addChainJumps: 2, damageMult: 1.25, chainFalloff: 0.95
            }, '再跳且少衰减'),
            up('chain_add_sky', '连霄', 'rare', {
                addChainJumps: 3, chainFalloff: 1, damageMult: 1.2
            }, '连霄不衰减')
        ], { from: 'chain_lightning', into: 'chain_lightning_sky', needUpgrades: 2 }),
        branch('chain_pierce', '霆贯支', ['piercing_shot', 'arcane_missiles'], [
            up('chain_pierce_jump', '霆贯', 'common', {
                addChainJumps: 2, damageMult: 1.2
            }, '霆贯多跳'),
            up('chain_pierce_full', '落雷', 'uncommon', {
                addChainJumps: 2, chainFalloff: 1, damageMult: 1.3
            }, '落雷不衰减'),
            up('chain_pierce_bolt', '霆矢', 'rare', {
                damageMult: 1.35, addChainJumps: 2, forceAoe: true, splashMult: 1.15
            }, '霆矢溅射')
        ], { from: 'piercing_shot', into: 'piercing_shot_thunder', needUpgrades: 2 }),
        branch('chain_dmg', '雷伤支', ['chain_lightning', 'static_surge', 'piercing_shot'], [
            up('chain_dmg_wrath', '霆怒', 'common', {
                damageMult: 1.4, addChainJumps: 1
            }, '雷伤暴涨'),
            up('chain_dmg_spark', '余电', 'uncommon', {
                damageMult: 1.25, addChainJumps: 1,
                appendEffects: [{ type: 'stun', durationMs: 700 }]
            }, '余电晕眩'),
            up('chain_dmg_storm', '雷暴', 'rare', {
                damageMult: 1.35, splashMult: 1.3, forceAoe: true, addChainJumps: 1,
                appendEffects: [{ type: 'stun', durationMs: 500, aoe: true }]
            }, '雷暴成片')
        ])
    ], 'chain'),

    lineage('sustain', '噬生轮回', ['bloodthirst', 'life_drain', 'hemorrhage', 'shadow_bolt'], [
        branch('sustain_deep', '深噬支', ['bloodthirst', 'life_drain'], [
            up('sustain_deep_leech', '深噬', 'common', {
                addLifestealPct: 0.28, damageMult: 1.25
            }, '大量吸血'),
            up('sustain_deep_drain', '啜取', 'common', {
                healMult: 1.4, addLifestealPct: 0.18, damageMult: 1.2
            }, '汲取强化'),
            up('sustain_deep_vein', '血脉', 'uncommon', {
                damageMult: 1.35, addLifestealPct: 0.22, forceAoe: true, splashMult: 1.15
            }, '血脉成片吸血')
        ], { from: 'bloodthirst', into: 'bloodthirst_cycle', needUpgrades: 2 }),
        branch('sustain_cycle', '轮回支', ['life_drain', 'shadow_bolt'], [
            up('sustain_cycle_kill', '轮回', 'common', {
                addLifestealPct: 0.2, onKillHealPct: 0.15, damageMult: 1.25
            }, '击杀回血'),
            up('sustain_cycle_sip', '回息', 'uncommon', {
                addLifestealPct: 0.22, cooldownMult: 0.85, damageMult: 1.25
            }, '更快啜魂'),
            up('sustain_cycle_soul', '噬魂', 'rare', {
                damageMult: 1.4, addLifestealPct: 0.25, forceAoe: true, splashMult: 1.2
            }, '噬魂扩散')
        ], { from: 'life_drain', into: 'life_drain_cycle', needUpgrades: 2 }),
        branch('sustain_thirst', '渴血支', ['bloodthirst', 'hemorrhage'], [
            up('sustain_thirst_low', '渴血', 'common', {
                damageMult: 1.4,
                executeBonus: { threshold: 0.45, bonusMult: 2.4 },
                addLifestealPct: 0.12
            }, '残血越打越痛'),
            up('sustain_thirst_frenzy', '狂噬', 'uncommon', {
                damageMult: 1.35, addLifestealPct: 0.2, cooldownMult: 0.88
            }, '狂噬续命'),
            up('sustain_thirst_river', '血河斩', 'rare', {
                damageMult: 1.45, splashMult: 1.3, forceAoe: true, addLifestealPct: 0.18
            }, '血河成片')
        ])
    ], 'sustain')
];

/** 次级派系：每支至少带 1 个「形态变化」，禁止纯 8%~12% 微调 */
function pushLineage(id, name, seeds, branches, tag) {
    lineages.push(lineage(id, name, seeds, branches, tag || null));
}

pushLineage('glass', '琉璃劫火', ['fireball', 'snipe', 'backstab', 'arcane_burst'], [
    branch('glass_thin', '薄命支', ['fireball', 'snipe', 'backstab', 'arcane_burst'], [
        up('glass_thin_edge', '薄刃', 'common', { damageMult: 1.4, cooldownMult: 0.95 }, '玻璃炮：直伤大幅提升'),
        up('glass_thin_risk', '孤注', 'uncommon', {
            damageMult: 1.55,
            appendEffects: [{ type: 'buff', stat: 'damageTaken', pct: 0.08, durationMs: 3000, target: 'self' }]
        }, '爆发更高，施放后短暂更脆'),
        up('glass_thin_break', '碎命', 'rare', {
            damageMult: 1.35,
            executeBonus: { threshold: 0.45, bonusMult: 2.4 }
        }, '残血目标额外重击')
    ]),
    branch('glass_burst', '爆裂支', ['fireball', 'snipe', 'backstab', 'arcane_burst'], [
        up('glass_burst_boom', '爆裂', 'common', {
            forceAoe: true, splashMult: 1.25, damageMult: 1.2,
            appendEffects: [{ type: 'dot', pctOfAttack: 0.22, durationMs: 3500, ticks: 3 }]
        }, '命中爆炸成片并点燃'),
        up('glass_burst_pierce', '贯通', 'uncommon', {
            forceAoe: true, splashMult: 1.4, damageMult: 1.25, addChainJumps: 1
        }, '爆炸贯通：溅射更远并弹射一次'),
        up('glass_burst_nova', '琉璃爆', 'rare', {
            forceAoe: true, splashMult: 1.55, damageMult: 1.3, cooldownMult: 0.9,
            appendEffects: [{ type: 'dot_aoe', pctOfAttack: 0.2, durationMs: 4000 }]
        }, '大爆炸 + 灼烧地带')
    ])
], 'glass');

pushLineage('wizard_inferno', '焚天烬狱', ['fireball', 'meteor', 'flame_wave'], [
    branch('wizard_core', '燃芯支', ['fireball', 'flame_wave'], [
        up('wizard_core_ignite', '焚芯', 'common', {
            appendEffects: [{ type: 'dot', pctOfAttack: 0.4, durationMs: 5000, ticks: 5 }],
            damageMult: 1.15
        }, '强力点燃'),
        up('wizard_core_burst', '焚爆', 'uncommon', {
            forceAoe: true, splashMult: 1.3, damageMult: 1.25,
            appendEffects: [{ type: 'dot', pctOfAttack: 0.28, durationMs: 4000, ticks: 4 }]
        }, '火球炸开并持续燃烧'),
        up('wizard_core_sky', '焚天', 'rare', {
            forceAoe: true, splashMult: 1.45, damageMult: 1.35, cooldownMult: 0.92
        }, '焚天大焰爆')
    ], { from: 'fireball', into: 'fireball_inferno', needUpgrades: 2 }),
    branch('wizard_meteor', '坠星支', ['meteor', 'flame_wave'], [
        up('wizard_meteor_fall', '坠焰', 'common', { damageMult: 1.35, splashMult: 1.25, forceAoe: true }, '坠星溅射'),
        up('wizard_meteor_field', '焰域', 'uncommon', {
            forceAoe: true, splashMult: 1.4,
            appendEffects: [{ type: 'dot_aoe', pctOfAttack: 0.25, durationMs: 5000 }]
        }, '坠落后留下焰域')
    ])
], 'wizard');

pushLineage('bulwark', '千仞壁', ['iron_will', 'shield_wall', 'battle_shout'], [
    branch('bulwark_wall', '承壁支', ['iron_will', 'shield_wall'], [
        up('bulwark_wall_thick', '承壁', 'common', { shieldPctMult: 1.45 }, '护盾量大幅提升'),
        up('bulwark_wall_cover', '壁垒', 'uncommon', {
            shieldPctMult: 1.25,
            appendEffects: [{ type: 'shield', target: 'front_allies', pct: 0.12, durationMs: 4500 }]
        }, '为前排覆盖护盾')
    ]),
    branch('bulwark_guard', '护阵支', ['shield_wall', 'battle_shout', 'iron_will'], [
        up('bulwark_guard_ease', '护阵', 'common', {
            appendEffects: [{ type: 'buff', stat: 'damageTaken', pct: -0.15, durationMs: 4500, target: 'front_allies' }]
        }, '前排短时大幅减伤'),
        up('bulwark_guard_rally', '镇守', 'uncommon', {
            defenseBuffMult: 1.5, shieldPctMult: 1.2, cooldownMult: 0.9
        }, '防御与盾量同升')
    ])
], 'tank');

pushLineage('tempo', '刻漏疾响', ['war_cry', 'charge', 'shadow_step', 'fireball', 'arcane_missiles'], [
    branch('tempo_tick', '急刻支', ['war_cry', 'charge', 'shadow_step', 'fireball', 'arcane_missiles'], [
        up('tempo_tick_haste', '急刻', 'common', { cooldownMult: 0.78, startReady: true }, '冷却大幅缩短，开场更快就绪'),
        up('tempo_tick_rush', '连响', 'uncommon', { cooldownMult: 0.72, damageMult: 1.15 }, '技能洪流：更快更痛')
    ]),
    branch('tempo_echo', '连响支', ['charge', 'shadow_step', 'fireball', 'arcane_missiles'], [
        up('tempo_echo_double', '回响', 'common', {
            cooldownMult: 0.88,
            appendEffects: [{ type: 'damage', mult: 0.7 }]
        }, '施放后追加一记余波伤害'),
        up('tempo_echo_chain', '叠响', 'uncommon', {
            cooldownMult: 0.85, addChainJumps: 1, damageMult: 1.12
        }, '更快，并多一段传导')
    ])
], 'tempo');

pushLineage('fortune', '天骰偏宠', ['execution', 'snipe', 'power_shot', 'backstab'], [
    branch('fortune_crit', '暴骰支', ['execution', 'snipe', 'power_shot', 'backstab'], [
        up('fortune_crit_dice', '暴骰', 'common', { damageMult: 1.45 }, '高额直伤（暴击感）'),
        up('fortune_crit_lucky', '偏宠', 'uncommon', {
            damageMult: 1.3,
            executeBonus: { threshold: 0.4, bonusMult: 2.8 }
        }, '残血时伤害暴涨')
    ]),
    branch('fortune_gamble', '豪赌支', ['execution', 'snipe', 'backstab'], [
        up('fortune_gamble_allin', '豪赌', 'common', {
            damageMult: 1.7, cooldownMult: 1.12
        }, '更慢但极痛的一击'),
        up('fortune_gamble_jack', '通杀', 'uncommon', {
            damageMult: 1.35, forceAoe: true, splashMult: 1.2,
            executeBonus: { threshold: 0.35, bonusMult: 3.0 }
        }, '豪赌成片斩杀')
    ])
], 'fortune');

pushLineage('control', '囚龙枷', ['shield_bash', 'frost_nova', 'smoke_bomb', 'frost_bind'], [
    branch('control_long', '久囚支', ['shield_bash', 'frost_nova', 'frost_bind'], [
        up('control_long_hold', '久囚', 'common', { stunDurationBonusMs: 500 }, '控制时长大幅增加'),
        up('control_long_chain', '枷锁', 'uncommon', {
            stunDurationBonusMs: 350,
            appendEffects: [{ type: 'stun', durationMs: 700 }]
        }, '追加一段控制')
    ]),
    branch('control_aoe', '枷面支', ['frost_nova', 'smoke_bomb', 'shield_bash'], [
        up('control_aoe_wide', '枷面', 'common', {
            forceAoe: true,
            appendEffects: [{ type: 'stun', durationMs: 900, aoe: true }]
        }, '控制扩散为群体'),
        up('control_aoe_lock', '龙枷', 'uncommon', {
            forceAoe: true, stunDurationBonusMs: 400, damageMult: 1.15
        }, '群控并附带伤害')
    ])
], 'control');

pushLineage('guardian_bastion', '苍穹卫阵', ['battle_shout', 'rally', 'iron_will', 'shield_wall'], [
    branch('guardian_array', '卫阵支', ['battle_shout', 'iron_will', 'shield_wall'], [
        up('guardian_array_wall', '卫阵', 'common', {
            appendEffects: [{ type: 'shield', target: 'allies', pct: 0.1, durationMs: 4500 }]
        }, '全队护盾'),
        up('guardian_array_hold', '苍穹', 'uncommon', {
            shieldPctMult: 1.35,
            appendEffects: [{ type: 'buff', stat: 'damageTaken', pct: -0.1, durationMs: 4000, target: 'allies' }]
        }, '全队减伤薄盾')
    ]),
    branch('guardian_shout', '战吼支', ['battle_shout', 'rally'], [
        up('guardian_shout_power', '战吼', 'common', { defenseBuffMult: 1.4, healMult: 1.2 }, '战吼增益强化'),
        up('guardian_shout_ward', '加护', 'uncommon', {
            healMult: 1.25,
            appendEffects: [{ type: 'shield', target: 'allies', pct: 0.08, durationMs: 4000 }]
        }, '治疗后附盾')
    ]),
    branch('guardian_ward', '加护支', ['rally', 'iron_will', 'shield_wall'], [
        up('guardian_ward_shell', '加护罩', 'common', { shieldPctMult: 1.4, shieldDurationMult: 1.3 }, '盾更厚更久'),
        up('guardian_ward_pulse', '卫光', 'uncommon', {
            appendEffects: [
                { type: 'heal', target: 'allies', pct: 0.08 },
                { type: 'shield', target: 'allies', pct: 0.06, durationMs: 3500 }
            ]
        }, '治疗+护盾脉冲')
    ])
], 'guardian');

pushLineage('wind_kiting', '风痕游猎', ['backstep_shot', 'volley', 'power_shot'], [
    branch('wind_trace', '风痕支', ['backstep_shot', 'power_shot'], [
        up('wind_trace_range', '风痕', 'common', { rangeBonus: 45, damageMult: 1.2 }, '更远更痛'),
        up('wind_trace_step', '游风', 'uncommon', { rangeBonus: 30, cooldownMult: 0.85, damageMult: 1.15 }, '风筝节奏')
    ]),
    branch('wind_hunt', '游猎支', ['volley', 'backstep_shot', 'power_shot'], [
        up('wind_hunt_volley', '游猎', 'common', { forceAoe: true, splashMult: 1.3, damageMult: 1.2 }, '箭雨成片'),
        up('wind_hunt_mark', '猎风', 'uncommon', {
            damageMult: 1.25,
            appendEffects: [{ type: 'debuff', stat: 'defense', pct: -0.12, durationMs: 4000 }]
        }, '命中减防')
    ])
], 'wind');

pushLineage('warlock_curse', '虚帷咒蚀', ['shadow_bolt', 'life_drain', 'death_mark'], [
    branch('warlock_curse_b', '咒蚀支', ['shadow_bolt', 'death_mark'], [
        up('warlock_curse_dot', '咒蚀', 'common', {
            appendEffects: [{ type: 'dot', pctOfAttack: 0.3, durationMs: 5000, ticks: 5 }],
            damageMult: 1.15
        }, '暗箭附带诅咒持续伤害'),
        up('warlock_curse_deep', '虚帷', 'uncommon', {
            dotMult: 1.4, markAmpMult: 1.3, damageMult: 1.2
        }, '诅咒与易伤加深')
    ]),
    branch('warlock_drain', '啜魂支', ['life_drain', 'shadow_bolt'], [
        up('warlock_drain_sip', '啜魂', 'common', { addLifestealPct: 0.22, damageMult: 1.2 }, '大量吸血'),
        up('warlock_drain_veil', '魂蚀', 'uncommon', {
            addLifestealPct: 0.18, damageMult: 1.25,
            appendEffects: [{ type: 'dot', pctOfAttack: 0.22, durationMs: 4000, ticks: 4 }]
        }, '吸血并留下诅咒')
    ])
], 'warlock');

pushLineage('phantom_shadow', '无相割裂', ['shadow_step', 'backstab', 'shadow_pierce'], [
    branch('phantom_form', '无相支', ['shadow_step', 'backstab'], [
        up('phantom_form_step', '无相', 'common', { cooldownMult: 0.8, damageMult: 1.25 }, '影步更快更痛'),
        up('phantom_form_fade', '消影', 'uncommon', {
            damageMult: 1.35,
            appendEffects: [{ type: 'buff', stat: 'damageTaken', pct: -0.12, durationMs: 2500, target: 'self' }]
        }, '出手后短暂减伤')
    ]),
    branch('phantom_cut', '割裂支', ['backstab', 'shadow_pierce'], [
        up('phantom_cut_bleed', '割裂', 'common', {
            damageMult: 1.3,
            appendEffects: [{ type: 'dot', pctOfAttack: 0.28, durationMs: 4500, ticks: 4 }]
        }, '背刺撕开流血'),
        up('phantom_cut_back', '后裂', 'uncommon', {
            damageMult: 1.2, addLifestealPct: 0.08,
            executeBonus: { threshold: 0.3, bonusMult: 2.3 }
        }, '后排斩杀感')
    ])
], 'phantom');

pushLineage('beast_swarm', '千刃虫潮', ['fan_of_knives', 'poison_blade', 'blade_flurry'], [
    branch('beast_swarm_b', '虫潮支', ['fan_of_knives', 'blade_flurry'], [
        up('beast_swarm_wave', '虫潮', 'common', { forceAoe: true, splashMult: 1.25, damageMult: 1.12 }, '刀扇成潮'),
        up('beast_swarm_nest', '虫巢', 'uncommon', {
            forceAoe: true, splashMult: 1.2,
            appendEffects: [{ type: 'dot_aoe', pctOfAttack: 0.16, durationMs: 4000 }]
        }, '群体毒潮')
    ]),
    branch('beast_blades', '千刃支', ['poison_blade', 'fan_of_knives', 'blade_flurry'], [
        up('beast_blades_cut', '千刃', 'common', {
            damageMult: 1.12, addChainJumps: 1,
            appendEffects: [{ type: 'dot', pctOfAttack: 0.18, durationMs: 4000, ticks: 4 }]
        }, '多段切割并带毒'),
        up('beast_blades_flurry', '刃雨', 'uncommon', {
            forceAoe: true, splashMult: 1.2, damageMult: 1.15, cooldownMult: 0.92
        }, '刃雨乱舞')
    ])
], 'beast');

pushLineage('pierce', '透骨线', ['piercing_shot', 'shadow_pierce', 'power_shot'], [
    branch('pierce_bone', '透骨支', ['piercing_shot', 'shadow_pierce', 'power_shot'], [
        up('pierce_bone_line', '透骨', 'common', { addChainJumps: 2, damageMult: 1.2 }, '贯穿两段'),
        up('pierce_bone_full', '穿心', 'uncommon', {
            addChainJumps: 2, chainFalloff: 1, damageMult: 1.25
        }, '贯穿不衰减')
    ]),
    branch('pierce_line', '连线支', ['piercing_shot', 'power_shot'], [
        up('pierce_line_link', '连线', 'common', { addChainJumps: 1, rangeBonus: 35, damageMult: 1.15 }, '更远更连'),
        up('pierce_line_drill', '钻射', 'uncommon', {
            addChainJumps: 2, damageMult: 1.3, forceAoe: true, splashMult: 1.15
        }, '钻射溅射')
    ])
], 'pierce');

pushLineage('stun', '震狱', ['shield_bash', 'hammerfall', 'frost_bind'], [
    branch('stun_long', '久震支', ['shield_bash', 'hammerfall', 'frost_bind'], [
        up('stun_long_hold', '久震', 'common', { stunDurationBonusMs: 550, damageMult: 1.15 }, '眩晕显著加长'),
        up('stun_long_break', '震骨', 'uncommon', {
            stunDurationBonusMs: 400, damageMult: 1.3,
            appendEffects: [{ type: 'debuff', stat: 'defense', pct: -0.15, durationMs: 4000 }]
        }, '晕更久并碎甲')
    ]),
    branch('stun_jail', '狱晕支', ['shield_bash', 'hammerfall', 'frost_bind'], [
        up('stun_jail_aoe', '狱晕', 'common', {
            forceAoe: true,
            appendEffects: [{ type: 'stun', durationMs: 1000, aoe: true }]
        }, '群体震晕'),
        up('stun_jail_quake', '狱震', 'uncommon', {
            forceAoe: true, splashMult: 1.25, damageMult: 1.25, stunDurationBonusMs: 300
        }, '震地群控')
    ])
], 'stun');

pushLineage('shield', '琉璃罩', ['arcane_shield', 'iron_will', 'shield_wall'], [
    branch('shield_thick', '罩厚支', ['arcane_shield', 'iron_will', 'shield_wall'], [
        up('shield_thick_shell', '罩厚', 'common', { shieldPctMult: 1.55 }, '护盾量暴涨'),
        up('shield_thick_mirror', '琉璃', 'uncommon', {
            shieldPctMult: 1.35,
            appendEffects: [{ type: 'damage', mult: 0.8, aoe: true }]
        }, '破罩反震周围')
    ]),
    branch('shield_long', '罩久支', ['arcane_shield', 'iron_will', 'shield_wall'], [
        up('shield_long_time', '罩久', 'common', { shieldDurationMult: 1.5, shieldPctMult: 1.2 }, '盾更久更厚'),
        up('shield_long_pulse', '罩脉', 'uncommon', {
            shieldDurationMult: 1.35, cooldownMult: 0.88,
            appendEffects: [{ type: 'shield', target: 'self', pct: 0.1, durationMs: 4000 }]
        }, '冷却更快，额外叠盾')
    ])
], 'shield');

pushLineage('backline', '影幕远射', ['snipe', 'power_shot', 'arcane_missiles', 'backstep_shot'], [
    branch('backline_veil', '影幕支', ['snipe', 'power_shot', 'backstep_shot'], [
        up('backline_veil_focus', '影幕', 'common', { rangeBonus: 50, damageMult: 1.3 }, '后排专精：更远更痛'),
        up('backline_veil_safe', '帷射', 'uncommon', {
            rangeBonus: 35, damageMult: 1.25, cooldownMult: 0.9
        }, '远射节奏')
    ]),
    branch('backline_far', '远射支', ['snipe', 'arcane_missiles', 'power_shot'], [
        up('backline_far_bolt', '远射', 'common', { rangeBonus: 40, damageMult: 1.35 }, '超远直伤'),
        up('backline_far_pierce', '透幕', 'uncommon', {
            rangeBonus: 30, addChainJumps: 1, damageMult: 1.25
        }, '远距贯穿')
    ])
], 'backline');

pushLineage('barrage', '星雨无尽', ['arcane_missiles', 'volley', 'arrow_storm', 'blade_flurry'], [
    branch('barrage_star', '星雨支', ['arcane_missiles', 'volley', 'arrow_storm'], [
        up('barrage_star_rain', '星雨', 'common', { addChainJumps: 2, damageMult: 1.15 }, '洪流多跳'),
        up('barrage_star_flood', '无尽', 'uncommon', {
            addChainJumps: 2, chainFalloff: 1, cooldownMult: 0.88, damageMult: 1.2
        }, '不衰减的技能洪流')
    ]),
    branch('barrage_endless', '无尽支', ['blade_flurry', 'volley', 'arcane_missiles'], [
        up('barrage_endless_tempo', '连雨', 'common', { cooldownMult: 0.8, forceAoe: true, splashMult: 1.2 }, '更快成片'),
        up('barrage_endless_storm', '暴雨', 'uncommon', {
            cooldownMult: 0.78, forceAoe: true, splashMult: 1.35, damageMult: 1.2
        }, '暴雨倾泻')
    ])
], 'barrage');

pushLineage('ranger_toxin', '碧藤毒誓', ['poison_arrow', 'barbed_arrow', 'garrote'], [
    branch('ranger_toxin_stack', '叠毒支', ['poison_arrow', 'barbed_arrow', 'garrote'], [
        up('ranger_toxin_thick', '浓藤', 'common', {
            dotMult: 1.4,
            appendEffects: [{ type: 'dot', pctOfAttack: 0.3, durationMs: 5000, ticks: 5 }]
        }, '浓毒追加'),
        up('ranger_toxin_spread', '蔓毒', 'uncommon', {
            forceAoe: true, dotMult: 1.3,
            appendEffects: [{ type: 'dot_aoe', pctOfAttack: 0.22, durationMs: 4500 }]
        }, '毒素蔓延成片')
    ]),
    branch('ranger_toxin_vine', '碧藤支', ['poison_arrow', 'garrote', 'barbed_arrow'], [
        up('ranger_toxin_vine_bind', '碧藤', 'common', {
            appendEffects: [
                { type: 'dot', pctOfAttack: 0.28, durationMs: 4500, ticks: 4 },
                { type: 'stun', durationMs: 500 }
            ]
        }, '毒藤缠绕短控'),
        up('ranger_toxin_vine_burst', '藤爆', 'uncommon', {
            damageMult: 1.3, forceAoe: true, splashMult: 1.25, dotMult: 1.25
        }, '藤爆溅毒')
    ])
], 'ranger');

pushLineage('deadeye_execute', '终焉点名', ['execution', 'snipe', 'death_mark'], [
    branch('deadeye_line', '抬线支', ['execution', 'snipe', 'death_mark'], [
        up('deadeye_line_raise', '抬线', 'common', {
            executeBonus: { threshold: 0.32, bonusMult: 2.4 }, damageMult: 1.12
        }, '更容易触发斩杀'),
        up('deadeye_line_doom', '终焉', 'uncommon', {
            executeBonus: { threshold: 0.34, bonusMult: 2.55 }, damageMult: 1.18
        }, '终焉处刑')
    ]),
    branch('deadeye_name', '点名支', ['snipe', 'execution', 'death_mark'], [
        up('deadeye_name_mark', '点名', 'common', {
            markAmpMult: 1.35, damageMult: 1.18,
            appendEffects: [{ type: 'mark', amp: 0.16, durationMs: 5000 }]
        }, '命中附加强标记'),
        up('deadeye_name_shot', '点射', 'uncommon', {
            damageMult: 1.28, rangeBonus: 30,
            executeBonus: { threshold: 0.32, bonusMult: 2.4 }
        }, '点名狙击')
    ])
], 'deadeye');

pushLineage('mark', '猎神烙印', ['hunters_mark', 'death_mark', 'snipe'], [
    branch('mark_deep', '深烙支', ['hunters_mark', 'death_mark', 'snipe'], [
        up('mark_deep_amp', '深烙', 'common', { markAmpMult: 1.5, damageMult: 1.15 }, '易伤大幅提升'),
        up('mark_deep_brand', '死印', 'uncommon', {
            markAmpMult: 1.4, markDurationMult: 1.4, damageMult: 1.25
        }, '更深更久的烙印')
    ]),
    branch('mark_long', '长印支', ['hunters_mark', 'death_mark'], [
        up('mark_long_time', '长印', 'common', { markDurationMult: 1.6, markAmpMult: 1.2 }, '印记更持久'),
        up('mark_long_focus', '猎眼', 'uncommon', {
            markDurationMult: 1.4, damageMult: 1.3,
            appendEffects: [{ type: 'mark', amp: 0.18, durationMs: 6000 }]
        }, '攻击技也带弱标记')
    ]),
    branch('mark_dye', '染印支', ['snipe', 'hunters_mark', 'death_mark'], [
        up('mark_dye_hit', '染印', 'common', {
            appendEffects: [{ type: 'mark', amp: 0.15, durationMs: 4500 }],
            damageMult: 1.2
        }, '普技命中染上烙印'),
        up('mark_dye_burst', '印爆', 'uncommon', {
            damageMult: 1.35,
            appendEffects: [{ type: 'mark', amp: 0.22, durationMs: 5000 }, { type: 'dot', pctOfAttack: 0.2, durationMs: 3000, ticks: 3 }]
        }, '烙印爆发并灼烧')
    ])
], 'mark');

pushLineage('drain', '啜魂', ['life_drain', 'shadow_bolt', 'bloodthirst'], [
    branch('drain_sip', '啜取支', ['life_drain', 'shadow_bolt', 'bloodthirst'], [
        up('drain_sip_deep', '啜取', 'common', { addLifestealPct: 0.25, damageMult: 1.2 }, '大量吸血'),
        up('drain_sip_flood', '魂潮', 'uncommon', {
            addLifestealPct: 0.2, forceAoe: true, splashMult: 1.2, damageMult: 1.2
        }, '群体啜魂')
    ]),
    branch('drain_soul', '魂噬支', ['life_drain', 'shadow_bolt'], [
        up('drain_soul_bite', '魂噬', 'common', {
            addLifestealPct: 0.18, damageMult: 1.3,
            appendEffects: [{ type: 'dot', pctOfAttack: 0.25, durationMs: 4000, ticks: 4 }]
        }, '噬魂并留下诅咒'),
        up('drain_soul_cycle', '轮噬', 'uncommon', {
            addLifestealPct: 0.22, cooldownMult: 0.88, damageMult: 1.25
        }, '更快的啜魂循环')
    ])
], 'drain');

const duoSparks = [
    { id: 'spark_heal_wall', name: '圣愈壁垒', need: { immortal: 2, vitality: 2 },
        desc: '治疗溢出转盾加强', effects: { healToShieldBonus: 0.15 } },
    { id: 'spark_oath_spring', name: '誓约圣泉', need: { knight_aegis: 2, vitality: 2 },
        desc: '持盾时群疗↑', effects: { shieldedHealMult: 1.15 } },
    { id: 'spark_blood_doom', name: '血河断罪', need: { berserk_blood: 2, execute: 2 },
        desc: '斩杀击杀短狂暴', effects: { executeKillFrenzyMs: 2500 } },
    { id: 'spark_poison_mark', name: '腐骨烙印', need: { poison: 2, mark: 2 },
        desc: '标记目标毒伤↑', effects: { markedDotMult: 1.25 } },
    { id: 'spark_chain_eye', name: '雷链猎眼', need: { chain: 2, marksman_snipe: 2 },
        desc: '弹射少衰减', effects: { chainFalloffBonus: 0.08 } },
    { id: 'spark_ash_storm', name: '烬狱雷云', need: { burn: 2, chain: 2 },
        desc: '弹射附点燃', effects: { chainAppendIgnite: true } },
    { id: 'spark_rift_wall', name: '裂帛千仞', need: { cleave: 2, bulwark: 2 },
        desc: '群体技给前排盾', effects: { aoeFrontShieldPct: 0.06 } },
    { id: 'spark_glass_tempo', name: '琉璃疾响', need: { glass: 2, tempo: 2 },
        desc: '玻璃炮技能洪流', effects: { glassCooldownMult: 0.9 } }
];

const evolvedDefsMeta = [
    ['iron_will', 'iron_will_bulwark', '磐石之心', '铁壁意志质变：更厚的护盾与防御。', (fx) => fx.map((e) => {
        if (e.type === 'shield') return Object.assign({}, e, { pct: (e.pct || 0.15) * 1.45 });
        if (e.type === 'buff' && e.stat === 'defense') return Object.assign({}, e, { pct: (e.pct || 0.3) * 1.35 });
        return e;
    })],
    ['shield_wall', 'shield_wall_titan', '千钧盾墙', '盾墙质变：覆盖更广、盾量更高。', (fx) => fx.concat([{ type: 'shield', target: 'front_allies', pct: 0.1, durationMs: 5000 }])],
    ['shield_wall', 'shield_wall_cycle', '轮回盾墙', '盾墙质变：冷却更短、轮转更快。', null],
    ['last_stand', 'last_stand_undying', '不死者低语', '背水一战质变：回复更猛，附带薄盾。', (fx) => fx.concat([{ type: 'shield', target: 'self', pct: 0.12, durationMs: 5000 }])],
    ['mend_shot', 'mend_shot_spring', '圣泉矢', '治疗射击质变：涌泉般的回复。', null],
    ['holy_nova', 'holy_nova_dawn', '黎明新星', '圣光新星质变：群疗与薄盾。', (fx) => fx.concat([{ type: 'shield', target: 'allies', pct: 0.08, durationMs: 4000 }])],
    ['shield_slam', 'shield_slam_oath', '誓约盾击', '盾击质变：更重、附盾。', (fx) => fx.concat([{ type: 'shield', target: 'self', pct: 0.12, durationMs: 4000 }])],
    ['retaliation', 'retaliation_oath', '守誓反击', '反击质变：守誓姿态。', null],
    ['bloodthirst', 'bloodthirst_roar', '赤哮', '嗜血质变：赤哮吸血风暴。', null],
    ['bloodthirst', 'bloodthirst_cycle', '血河斩', '嗜血质变：噬生轮回。', null],
    ['whirlwind', 'whirlwind_blood', '血河旋风', '旋风质变：血河狂岚。', null],
    ['whirlwind', 'whirlwind_rift', '裂帛旋风', '旋风质变：裂帛旋切。', null],
    ['hammerfall', 'hammerfall_blood', '崩血锤', '碎骨锤质变：崩血重击。', null],
    ['hammerfall', 'hammerfall_judge', '断罪锤', '碎骨锤质变：断罪重刑。', null],
    ['poison_arrow', 'poison_arrow_vine', '碧藤毒矢', '毒箭质变：碧藤绞杀。', null],
    ['barbed_arrow', 'barbed_arrow_bone', '骨花倒刺', '倒刺箭质变：骨花爆裂。', null],
    ['snipe', 'snipe_cloud', '穿云', '狙击质变：穿云一矢。', null],
    ['hunters_mark', 'hunters_mark_eye', '猎神之眼', '猎人印记质变：点睛集火。', null],
    ['fireball', 'fireball_inferno', '焚天火球', '火球质变：爆炸成片并剧烈点燃，伤害显著提升。', (fx) => {
        const next = fx.map((e) => {
            if (e && e.type === 'damage') {
                return Object.assign({}, e, { mult: (e.mult || 2) * 1.45, aoe: true, splashMult: 1.25 });
            }
            return e;
        });
        next.push({ type: 'dot', pctOfAttack: 0.4, durationMs: 5000, ticks: 5 });
        next.push({ type: 'dot_aoe', pctOfAttack: 0.2, durationMs: 4000 });
        return next;
    }],
    ['meteor', 'meteor_ash', '烬狱陨石', '陨石质变：烬域坠星。', null],
    ['arcane_missiles', 'arcane_missiles_orbit', '星轨飞弹', '奥术飞弹质变：星轨洪流。', null],
    ['execution', 'execution_final', '终焉处决', '处决质变：终焉点名。', null],
    ['cleave', 'cleave_rift', '裂帛顺劈', '顺劈质变：裂帛开刃。', null],
    ['chain_lightning', 'chain_lightning_sky', '连霄闪', '连锁闪电质变：连霄添雷。', null],
    ['piercing_shot', 'piercing_shot_thunder', '透骨霆矢', '穿透射击质变：霆贯。', null],
    ['life_drain', 'life_drain_cycle', '啜魂咒', '生命汲取质变：噬生轮回。', null]
];

function main() {
    const cfg = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
    const pool = cfg.skillPool || [];
    const byId = new Map(pool.map((s) => [s.id, s]));

    evolvedDefsMeta.forEach(([baseId, newId, name, desc, patch]) => {
        const base = byId.get(baseId);
        if (!base) {
            console.warn('missing base skill', baseId, 'for', newId);
            return;
        }
        let sk;
        if (patch) {
            sk = cloneSkill(base, newId, name, desc, patch);
        } else {
            sk = cloneSkill(base, newId, name, desc, (fx) => fx.map((e) => {
                if (e && (e.type === 'damage' || e.type === 'chain' || e.type === 'dot')) {
                    const c = Object.assign({}, e);
                    if (c.mult != null) c.mult *= 1.35;
                    if (c.pctOfAttack != null) c.pctOfAttack *= 1.35;
                    return c;
                }
                if (e && e.type === 'heal') {
                    return Object.assign({}, e, { pct: (e.pct || 0.2) * 1.35 });
                }
                if (e && e.type === 'shield') {
                    return Object.assign({}, e, { pct: (e.pct || 0.15) * 1.4 });
                }
                return e;
            }));
            if (newId.includes('cycle') && sk.cooldownMs) sk.cooldownMs = Math.floor(sk.cooldownMs * 0.85);
            if (newId === 'shield_wall_cycle' && sk.cooldownMs) sk.cooldownMs = Math.floor(sk.cooldownMs * 0.82);
        }
        if (byId.has(newId)) {
            const idx = pool.findIndex((s) => s.id === newId);
            if (idx >= 0) pool[idx] = sk;
        } else {
            pool.push(sk);
        }
        byId.set(newId, sk);
    });

    cfg.skillPool = pool;
    cfg.lineages = lineages;
    cfg.duoSparks = duoSparks;
    if (!cfg.rewards) cfg.rewards = {};
    cfg.rewards.skillUpgradeOfferWeight = 1.0;
    cfg.rewards.newSkillOfferWeight = 0.62;
    cfg.rewards.skillEvolveOfferWeight = 1.25;
    cfg.rewards.maxEvolveOffersPerBattle = 1;
    cfg.rewards.maxUpgradeOffersPerBattle = 2;
    cfg.rewards.guaranteeNewSkillChance = 0.72;
    cfg.rewards.shapeOfferWeightBonus = 1.75;
    cfg.rewards.statOnlyOfferWeightPenalty = 0.55;

    fs.writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
    console.log('Patched lineages:', lineages.length, 'duoSparks:', duoSparks.length, 'skills:', pool.length);
}

main();
