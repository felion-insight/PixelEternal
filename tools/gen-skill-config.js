#!/usr/bin/env node
/**
 * 生成 config/skill-config.json（v2.0：8 核心槽位 + 技能进化）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const classConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'class-config.json'), 'utf8'));

/** 8 核心槽位解锁等级（20/40 为进化节点，不新增槽位） */
const SLOT_UNLOCK_LEVELS = [1, 3, 6, 10, 15, 30, 55, 60];
const SLOT_TYPES = ['basic', 'core1', 'core2', 'team', 'survival', 'adv_feature', 'ultimate', 'legendary'];
const EVOLUTION_LEVELS = { first: 20, second: 40 };

const RESOURCE_TO_FAMILY = {
    rage: 'rage', guard: 'rage',
    focus: 'focus', pet_energy: 'focus', ammo: 'focus', wind_mark: 'focus',
    mana: 'mana', soul_shard: 'mana',
    energy: 'energy', combo_point: 'energy', illusion: 'energy', poison_stack: 'energy'
};

const FAMILY_META = {
    rage: { name: '怒气', max: 100, regenPerSec: 5, onBasicAttack: 8, onHitTaken: 5, outOfCombatDecay: 3 },
    focus: { name: '集中', max: 100, regenPerSec: 4, onCrit: 10 },
    mana: { name: '法力', max: 200, regenPerSec: 6 },
    energy: { name: '能量', max: 120, regenPerSec: 12 }
};

const BASE_SKILLS = {
    warrior: {
        basic: { id: 'warrior_basic', name: '横斩' },
        core1: { id: 'shield_bash', name: '盾击', breakMult: 1.5 },
        core2: { id: 'charge', name: '冲锋' },
        team: { id: 'war_cry', name: '战吼' },
        survival: { id: 'defensive_stance', name: '防御姿态' }
    },
    archer: {
        basic: { id: 'archer_basic', name: '精准射击' },
        core1: { id: 'backstep_shot', name: '后跳射击' },
        core2: { id: 'poison_arrow', name: '毒箭', status: 'poison' },
        team: { id: 'hunters_mark', name: '猎人印记' },
        survival: { id: 'rapid_shot', name: '快速射击' }
    },
    mage: {
        basic: { id: 'arcane_missile', name: '奥术飞弹' },
        core1: { id: 'fireball', name: '火球术', status: 'burn' },
        core2: { id: 'ice_armor', name: '冰甲术' },
        team: { id: 'arcane_amplify', name: '魔力增幅' },
        survival: { id: 'blink', name: '闪现' }
    },
    assassin: {
        basic: { id: 'assassin_basic', name: '刺击' },
        core1: { id: 'shadow_step', name: '暗影步' },
        core2: { id: 'smoke_bomb', name: '烟雾弹' },
        team: { id: 'poison_blade', name: '毒刃', status: 'poison' },
        survival: { id: 'vanish', name: '消失' }
    }
};

/** 一转特色 + 二转团队/终极/传说被动 */
const BRANCH_SKILLS = {
    knight: {
        adv_feature: { id: 'taunt', name: '嘲讽' },
        passive: { id: 'shield_wall_passive', name: '盾墙', desc: '持有盾牌时永久减伤+10%，格挡率+15%' }
    },
    paladin: {
        team: { id: 'holy_shield_team', name: '神圣之盾' },
        ultimate: { id: 'resurrection', name: '复活' },
        legendary: { id: 'build_retribution', name: '流派·惩戒', buildId: 'retribution' }
    },
    berserker: {
        adv_feature: { id: 'berserk', name: '狂暴' },
        passive: { id: 'bloodthirst_passive', name: '嗜血', desc: '攻击回复伤害量8%生命；HP<30%时回复翻倍' }
    },
    destroyer: {
        adv_feature: { id: 'execute', name: '处决' },
        ultimate: { id: 'fury', name: '狂怒' },
        legendary: { id: 'build_blood_demon', name: '流派·血魔', buildId: 'blood_demon' }
    },
    guardian: {
        adv_feature: { id: 'guardian_shield', name: '守护之盾' },
        passive: { id: 'counter_passive', name: '反击', desc: '受击时30%概率自动反击，造成80%伤害' }
    },
    temple_knight: {
        team: { id: 'aegis', name: '神盾' },
        ultimate: { id: 'final_guard', name: '最终守护' },
        legendary: { id: 'build_thorns', name: '流派·荆棘', buildId: 'thorns' }
    },
    ranger: {
        adv_feature: { id: 'frozen_trap', name: '冰冻陷阱', status: 'frostbite' },
        passive: { id: 'pet_master', name: '驯兽', desc: '宠物攻击附带中毒' }
    },
    beastmaster: {
        adv_feature: { id: 'beast_fusion', name: '野兽融合' },
        ultimate: { id: 'natures_wrath', name: '自然之怒' },
        legendary: { id: 'build_wild_heart', name: '流派·野性', buildId: 'wild_heart' }
    },
    marksman: {
        adv_feature: { id: 'piercing_arrow', name: '穿透箭' },
        passive: { id: 'weakpoint', name: '弱点洞察', desc: '暴击率+10%' }
    },
    deadeye: {
        adv_feature: { id: 'headshot', name: '爆头' },
        ultimate: { id: 'death_gaze', name: '死神之眼' },
        legendary: { id: 'build_executioner', name: '流派·处刑人', buildId: 'executioner' }
    },
    windrunner: {
        adv_feature: { id: 'wind_blade', name: '风刃' },
        passive: { id: 'wind_dance', name: '风之舞', desc: '移动时攻速+15%' }
    },
    phantom: {
        adv_feature: { id: 'void_arrow', name: '虚空箭' },
        ultimate: { id: 'phantom_storm', name: '幻影风暴' },
        legendary: { id: 'build_shadowless', name: '流派·无影', buildId: 'shadowless' }
    },
    wizard: {
        adv_feature: { id: 'chain_lightning', name: '闪电链', status: 'shock' },
        passive: { id: 'element_mastery', name: '元素掌握', desc: '不同元素法术叠加精通层数，每层+8%伤害' }
    },
    archmage: {
        team: { id: 'element_domain', name: '元素领域' },
        ultimate: { id: 'meteor', name: '陨石术' },
        legendary: { id: 'build_arcane', name: '流派·奥术', buildId: 'arcane' }
    },
    sage: {
        adv_feature: { id: 'healing_wave', name: '治疗波' },
        passive: { id: 'purify', name: '净化', desc: '治疗附带净化效果' }
    },
    oracle: {
        adv_feature: { id: 'prophecy', name: '预言' },
        ultimate: { id: 'fate_reverse', name: '命运逆转' },
        legendary: { id: 'build_chrono', name: '流派·时空', buildId: 'chrono' }
    },
    warlock: {
        adv_feature: { id: 'shadow_bolt', name: '暗影箭', status: 'dark_erosion' },
        passive: { id: 'life_drain_passive', name: '生命吸取', desc: '法术伤害10%转化为生命' }
    },
    necromancer: {
        adv_feature: { id: 'death_coil', name: '死亡缠绕' },
        ultimate: { id: 'nether_gate', name: '冥界之门' },
        legendary: { id: 'build_corpse_explosion', name: '流派·尸爆', buildId: 'corpse_explosion' }
    },
    shadowdancer: {
        adv_feature: { id: 'shadow_strike', name: '影袭' },
        passive: { id: 'evasion_stance', name: '闪避姿态', desc: '闪避+15%' }
    },
    nightblade: {
        adv_feature: { id: 'night_slash', name: '夜刃斩' },
        ultimate: { id: 'nightfall', name: '暗夜降临' },
        legendary: { id: 'build_night_lord', name: '流派·暗夜', buildId: 'night_lord' }
    },
    trickster: {
        adv_feature: { id: 'decoy', name: '替身' },
        passive: { id: 'trickery', name: '诡计', desc: '闪避成功后下次攻击+30%' }
    },
    illusionist: {
        adv_feature: { id: 'mind_control', name: '精神控制' },
        ultimate: { id: 'reality_shift', name: '虚实转换' },
        legendary: { id: 'build_thousand_faces', name: '流派·千面', buildId: 'thousand_faces' }
    },
    venomancer: {
        adv_feature: { id: 'poison_mist', name: '毒雾', status: 'poison' },
        passive: { id: 'toxic_blade', name: '剧毒之刃', desc: '攻击附带中毒' }
    },
    plaguebringer: {
        adv_feature: { id: 'contagion', name: '传染' },
        ultimate: { id: 'plague_outbreak', name: '瘟疫爆发' },
        legendary: { id: 'build_infection', name: '流派·传染', buildId: 'infection' }
    }
};

/** 进化技能（独立条目，由 evolutionPath 引用） */
const EVOLUTION_SKILLS = {
    holy_shield_bash: { name: '神圣盾击', classId: 'knight', slotType: 'core1', unlockLevel: 20, status: 'dark_erosion', aoe: 100, dmg: 1.8, breakMult: 2, desc: '前方扇形120°，180%伤害，眩晕1.5秒，施加暗蚀，破防×2' },
    judgment_shield: { name: '审判之盾', classId: 'paladin', slotType: 'core1', unlockLevel: 40, status: 'dark_erosion', dmg: 2.0, breakMult: 2, desc: '投掷盾牌回旋，路径200%伤害+眩晕2秒，每击中一敌恢复5%HP' },
    furious_charge: { name: '狂暴冲锋', classId: 'berserker', slotType: 'core2', unlockLevel: 20, dmg: 1.2, desc: '突进200码，路径120%伤害+击退，结束后攻速+20%持续3秒' },
    devastation_charge: { name: '毁灭冲锋', classId: 'destroyer', slotType: 'core2', unlockLevel: 40, dmg: 2.5, desc: '蓄力冲锋最多1秒，蓄满路径250%伤害+击飞，蓄力期间霸体' },
    guardian_stance: { name: '守护姿态', classId: 'guardian', slotType: 'survival', unlockLevel: 20, desc: '切换：开启时队友减伤15%；关闭时自身减伤25%' },
    holy_domain: { name: '神圣领域', classId: 'temple_knight', slotType: 'survival', unlockLevel: 40, desc: '领域半径100，队友减伤20%+每秒恢复1%HP；自身不可移动但防御+50%' },
    summon_wolf: { name: '召唤战狼', classId: 'ranger', slotType: 'core1', unlockLevel: 20, desc: '召唤战狼协助战斗，攻击附带中毒' },
    beast_pack: { name: '兽群召唤', classId: 'beastmaster', slotType: 'core1', unlockLevel: 40, desc: '同时召唤狼与熊，持续20秒' },
    aimed_shot: { name: '瞄准射击', classId: 'marksman', slotType: 'core2', unlockLevel: 20, dmg: 2.2, desc: '蓄力1秒，造成220%伤害，必暴击' },
    perfect_shot: { name: '完美射击', classId: 'deadeye', slotType: 'core2', unlockLevel: 40, dmg: 3.5, desc: '子弹时间蓄力，350%伤害，无视防御30%' },
    wind_step: { name: '风之步', classId: 'windrunner', slotType: 'survival', unlockLevel: 20, desc: '滑步80码并提升移速' },
    phantom_clone: { name: '幻影分身', classId: 'phantom', slotType: 'survival', unlockLevel: 40, desc: '创造分身吸引仇恨并复制50%伤害' },
    flame_bolt: { name: '烈焰弹', classId: 'wizard', slotType: 'core1', unlockLevel: 20, status: 'burn', aoe: 90, dmg: 2.88, desc: '蓄力1.5秒，爆炸范围+80%，288%伤害，灼烧延长至6秒' },
    lava_storm: { name: '熔岩风暴', classId: 'archmage', slotType: 'core1', unlockLevel: 40, status: 'burn', aoe: 110, dmg: 2.4, channel: true, desc: '引导3秒，每秒3颗熔岩弹，地面留下灼烧区域' },
    healing_wave: { name: '治疗术', classId: 'sage', slotType: 'core2', unlockLevel: 20, desc: '恢复25%最大生命' },
    foresight: { name: '预知', classId: 'oracle', slotType: 'core2', unlockLevel: 40, desc: '为全队施加预言护盾，吸收下一次致命伤害' },
    summon_skeleton: { name: '召唤骷髅', classId: 'warlock', slotType: 'survival', unlockLevel: 20, desc: '召唤骷髅战士，攻击附带暗蚀' },
    skeleton_legion: { name: '骷髅军团', classId: 'necromancer', slotType: 'survival', unlockLevel: 40, desc: '召唤5具骷髅，持续30秒' },
    shadow_strike: { name: '背刺', classId: 'shadowdancer', slotType: 'core1', unlockLevel: 20, dmg: 2.5, desc: '从背后攻击造成250%伤害，破防×2' },
    shadow_assault: { name: '暗影突袭', classId: 'nightblade', slotType: 'core1', unlockLevel: 40, dmg: 3.2, desc: '标记目标后瞬移斩杀，320%伤害' },
    illusion: { name: '幻象', classId: 'trickster', slotType: 'core2', unlockLevel: 20, desc: '创造幻象迷惑敌人' },
    quintuple_illusion: { name: '五重幻象', classId: 'illusionist', slotType: 'core2', unlockLevel: 40, desc: '同时创造5个幻象' },
    venom_blade: { name: '剧毒之刃', classId: 'venomancer', slotType: 'survival', unlockLevel: 20, status: 'poison', desc: '涂毒武器，攻击叠加5层中毒' },
    plague: { name: '瘟疫', classId: 'plaguebringer', slotType: 'survival', unlockLevel: 40, status: 'poison', desc: '瘟疫光环，周围敌人持续中毒并可传播' }
};

function getResourceFamily(classDef) {
    const t = classDef && classDef.resource && classDef.resource.type;
    return RESOURCE_TO_FAMILY[t] || 'rage';
}

function makeSkill(id, classId, unlockLevel, slotType, name, opts = {}) {
    const isPassive = slotType === 'legendary' || opts.passive;
    const isBasic = slotType === 'basic';
    const isEvolved = opts.evolved === true;
    return {
        id,
        name,
        classId,
        unlockLevel,
        slotType,
        type: isPassive ? 'passive' : (isBasic ? 'basic' : 'active'),
        category: 'class',
        resourceType: opts.resourceType || null,
        resourceCost: isPassive || isBasic ? 0 : (opts.resourceCost != null ? opts.resourceCost : Math.floor(15 + unlockLevel * 1.2)),
        cooldownMs: isPassive || isBasic ? (isBasic ? 800 : 0) : (opts.cooldownMs != null ? opts.cooldownMs : Math.floor(4000 + unlockLevel * 180)),
        damageMultiplier: isPassive ? 0 : (opts.dmg != null ? opts.dmg : (isBasic ? 1.0 : 1.5)),
        range: opts.range || (isBasic ? 55 : 90),
        aoeRadius: opts.aoe || 0,
        effectTags: opts.tags || [],
        statusEffects: opts.status ? [{ type: opts.status, durationMs: 4000 }] : (opts.statusEffects || []),
        breakDamageMultiplier: opts.breakMult || (opts.breakMult === 0 ? 0 : 1.0),
        evolutionPath: opts.evolutionPath || null,
        replacesSlot: opts.replacesSlot || null,
        buildId: opts.buildId || null,
        skillEffect: opts.skillEffect || null,
        description: opts.desc || `${name} — ${classId} Lv${unlockLevel}`
    };
}

const skills = {};
const progressions = {};

function registerSkill(skill) {
    skills[skill.id] = skill;
    return skill.id;
}

function buildEvolutionPath(baseId, baseSlot, firstAdvId, secondAdvId) {
    const evo = classConfig.evolutionSlots && classConfig.evolutionSlots[firstAdvId];
    if (!evo || evo.slot !== baseSlot) return null;
    const path = { baseSkillId: baseId, slotType: baseSlot };
    path.firstAdvancement = {
        [firstAdvId]: {
            newSkillId: evo.first,
            unlockLevel: EVOLUTION_LEVELS.first,
            description: EVOLUTION_SKILLS[evo.first] && EVOLUTION_SKILLS[evo.first].desc
        }
    };
    if (secondAdvId && evo.second) {
        path.secondAdvancement = {
            [secondAdvId]: {
                newSkillId: evo.second,
                unlockLevel: EVOLUTION_LEVELS.second,
                description: EVOLUTION_SKILLS[evo.second] && EVOLUTION_SKILLS[evo.second].desc
            }
        };
    }
    return path;
}

function addEvolutionSkills() {
    for (const [evoId, meta] of Object.entries(EVOLUTION_SKILLS)) {
        const fam = getResourceFamily(classConfig.firstAdvancements[meta.classId] || classConfig.secondAdvancements[meta.classId] || {});
        registerSkill(makeSkill(evoId, meta.classId, meta.unlockLevel, meta.slotType, meta.name, {
            resourceType: fam,
            dmg: meta.dmg,
            aoe: meta.aoe,
            status: meta.status,
            breakMult: meta.breakMult,
            tags: meta.channel ? ['channel', 'burst'] : ['burst'],
            evolved: true,
            desc: meta.desc
        }));
    }
}

function addBaseClassSkills(baseId, baseDef) {
    const fam = getResourceFamily(baseDef);
    const defs = BASE_SKILLS[baseId];
    if (!defs) return [];
    const ids = [];
    const slotKeys = ['basic', 'core1', 'core2', 'team', 'survival'];
    slotKeys.forEach((key, i) => {
        const meta = defs[key];
        const slotType = SLOT_TYPES[i];
        const unlockLevel = SLOT_UNLOCK_LEVELS[i];
        const tags = [];
        if (slotType === 'team') tags.push('buff');
        const skill = makeSkill(meta.id, baseId, unlockLevel, slotType, meta.name, {
            resourceType: fam,
            status: meta.status,
            breakMult: meta.breakMult,
            tags,
            desc: meta.desc
        });
        ids.push(registerSkill(skill));
    });
    return ids;
}

function addBranchExtras(classId, baseIds, firstAdvId, secondAdvId) {
    const branch = BRANCH_SKILLS[classId] || {};
    const ids = [...baseIds];

    if (branch.adv_feature) {
        const m = branch.adv_feature;
        const fam = getResourceFamily(classConfig.firstAdvancements[firstAdvId] || classConfig.secondAdvancements[classId] || {});
        ids.push(registerSkill(makeSkill(m.id, classId, 30, 'adv_feature', m.name, {
            resourceType: fam,
            status: m.status,
            tags: ['feature'],
            desc: m.desc
        })));
    }

    if (branch.passive) {
        const m = branch.passive;
        ids.push(registerSkill(makeSkill(m.id, classId, 20, 'adv_passive', m.name, {
            passive: true,
            tags: ['passive'],
            desc: m.desc
        })));
    }

    if (branch.team) {
        const m = branch.team;
        const idx = ids.findIndex(id => skills[id] && skills[id].slotType === 'team');
        if (idx >= 0) {
            const old = skills[ids[idx]];
            const override = makeSkill(m.id, classId, old.unlockLevel, 'team', m.name, {
                resourceType: old.resourceType,
                tags: ['buff', 'team'],
                desc: m.desc
            });
            registerSkill(override);
            ids[idx] = m.id;
        }
    }

    if (branch.ultimate) {
        const m = branch.ultimate;
        const fam = getResourceFamily(classConfig.secondAdvancements[classId] || {});
        ids.push(registerSkill(makeSkill(m.id, classId, 55, 'ultimate', m.name, {
            resourceType: fam,
            resourceCost: 100,
            cooldownMs: 90000,
            dmg: 3.0,
            tags: ['burst', 'ultimate'],
            desc: m.desc
        })));
    }

    if (branch.legendary) {
        const m = branch.legendary;
        ids.push(registerSkill(makeSkill(m.id, classId, 60, 'legendary', m.name, {
            passive: true,
            buildId: m.buildId,
            tags: ['passive', 'build'],
            desc: m.desc || `【流派被动】${m.name}：定义你的 Build 方向。`
        })));
    }

    return ids;
}

function attachEvolutionPaths(baseId) {
    for (const firstId of (classConfig.baseClasses[baseId].advancements || [])) {
        const evoMeta = classConfig.evolutionSlots && classConfig.evolutionSlots[firstId];
        if (!evoMeta) continue;
        const baseSkillKey = evoMeta.slot;
        const baseSkillDef = BASE_SKILLS[baseId] && BASE_SKILLS[baseId][baseSkillKey === 'survival' ? 'survival' : baseSkillKey];
        if (!baseSkillDef) continue;
        const baseSkill = skills[baseSkillDef.id];
        if (!baseSkill) continue;
        const secondId = (classConfig.firstAdvancements[firstId].advancements || [])[0];
        baseSkill.evolutionPath = buildEvolutionPath(baseSkill.id, evoMeta.slot, firstId, secondId);
    }
}

addEvolutionSkills();

for (const [baseId, baseDef] of Object.entries(classConfig.baseClasses)) {
    const baseIds = addBaseClassSkills(baseId, baseDef);
    attachEvolutionPaths(baseId);
    progressions[baseId] = baseIds.filter(id => {
        const s = skills[id];
        return s && ['basic', 'core1', 'core2', 'team', 'survival'].includes(s.slotType);
    });

    for (const firstId of (baseDef.advancements || [])) {
        const firstDef = classConfig.firstAdvancements[firstId];
        if (!firstDef) continue;
        let firstIds = addBranchExtras(firstId, [...baseIds], firstId, null);
        progressions[firstId] = firstIds;

        for (const secondId of (firstDef.advancements || [])) {
            const secondDef = classConfig.secondAdvancements[secondId];
            if (!secondDef) continue;
            let secondIds = addBranchExtras(secondId, [...firstIds], firstId, secondId);
            progressions[secondId] = secondIds;
        }
    }
}

const { batchEntityize, syncDeployment } = require('./batch-entityize-skills');
const batchStats = batchEntityize(skills, { writeNewEntities: true });

const skillCount = Object.keys(skills).length;
const out = {
    version: '2.0',
    slotUnlockLevels: SLOT_UNLOCK_LEVELS,
    slotTypes: SLOT_TYPES,
    evolutionLevels: EVOLUTION_LEVELS,
    hotbarSlotCount: 4,
    defaultHotbar: ['core1', 'core2', 'team', 'survival'],
    resourceFamilies: FAMILY_META,
    resourceToFamily: RESOURCE_TO_FAMILY,
    enhanceConfig: {
        maxLevel: 5,
        damagePerLevel: 0.1,
        goldByLevel: [500, 1000, 2000, 4000, 8000]
    },
    skills,
    progressions
};

const target = path.join(ROOT, 'config', 'skill-config.json');
fs.writeFileSync(target, JSON.stringify(out, null, 2), 'utf8');
syncDeployment();
console.log(`Wrote ${target} — ${skillCount} skills, ${Object.keys(progressions).length} progressions`);
console.log('batch-entityize:', batchStats.stats);
