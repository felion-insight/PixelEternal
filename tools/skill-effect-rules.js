/**
 * 职业技能效果规则 — 按技能名映射 primary（无伤害）/ hybrid（伤害+效果）
 * 供 gen-skill-config.js 与 apply-skill-effects.js 共用
 */
'use strict';

const RESOURCE_LABEL = {
    rage: '怒气', focus: '集中', mana: '法力', energy: '能量',
    guard: '守护', pet_energy: '宠物能量', ammo: '弹药', wind_mark: '风印',
    soul_shard: '灵魂碎片', combo_point: '连击点', illusion: '幻象', poison_stack: '毒层'
};

/** @type {Record<string, object>} */
const PRIMARY_BY_NAME = {
    '防御姿态': { type: 'damage_reduction', damageReduction: 30, durationMs: 5000, tags: ['defense'] },
    '战吼': { type: 'attack_buff', attackPercent: 15, durationMs: 8000, tags: ['buff'] },
    '魔力增幅': { type: 'attack_buff', attackPercent: 20, durationMs: 10000, tags: ['buff'], magicOnly: true },
    '猎人印记': { type: 'mark', range: 120, damageBonus: 15, critBonus: 10, durationMs: 8000, tags: ['debuff'] },
    '快速射击': { type: 'attack_speed_buff', attackSpeedPercent: 40, durationMs: 4000, tags: ['buff'] },
    '冰甲术': {
        type: 'ice_armor', durationMs: 8000, damageReduction: 15,
        attackerSlowMultiplier: 0.7, attackerSlowDurationMs: 2000,
        tags: ['defense', 'ice_armor']
    },
    '闪现': { type: 'blink', distance: 120, tags: ['utility'] },
    '奥术护盾': { type: 'shield', absorbPercent: 20, durationMs: 8000, tags: ['defense'] },
    '隐身': { type: 'stealth', durationMs: 4000, moveSpeed: 30, dodge: 25, tags: ['utility'] },
    '嘲讽': { type: 'taunt', damageReduction: 30, durationMs: 4000, range: 120, tags: ['defense'] },
    '盾墙': { type: 'damage_reduction', damageReduction: 60, durationMs: 4000, tags: ['defense'] },
    '援护': { type: 'guard', damageReduction: 50, durationMs: 3000, tags: ['defense'] },
    '狂暴': { type: 'berserk', attackPercent: 25, defensePenalty: 15, durationMs: 8000, tags: ['buff'] },
    '守护光环': { type: 'damage_reduction', damageReduction: 15, durationMs: 10000, tags: ['defense'] },
    '守护之盾': { type: 'shield', absorbPercent: 20, durationMs: 6000, tags: ['defense'] },
    '铁壁': { type: 'damage_reduction', damageReduction: 40, durationMs: 8000, tags: ['defense'] },
    '自然之触': { type: 'heal', healPercent: 25, tags: ['heal'] },
    '弱点标记': { type: 'mark', range: 130, damageBonus: 15, critBonus: 20, durationMs: 6000, tags: ['debuff'] },
    '疾风步': { type: 'blink', distance: 80, grantMoveSpeed: 8, grantMoveSpeedMs: 4000, tags: ['utility'] },
    '风之庇护': { type: 'dodge_buff', dodge: 25, moveSpeed: 20, durationMs: 4000, tags: ['defense'] },
    '元素护盾': { type: 'shield', absorbPercent: 22, durationMs: 8000, tags: ['defense'] },
    '治疗波': { type: 'heal', healPercent: 25, tags: ['heal'] },
    '净化': { type: 'cleanse', immunityMs: 3000, tags: ['heal'] },
    '复苏': { type: 'heal', healPercent: 35, tags: ['heal'] },
    '闪避姿态': { type: 'dodge_buff', dodge: 30, durationMs: 5000, tags: ['defense'] },
    '神圣之盾': { type: 'shield', absorbPercent: 15, durationMs: 8000, tags: ['defense'] },
    '复活': { type: 'heal', healPercent: 50, tags: ['heal'] },
    '狂怒': { type: 'berserk', attackPercent: 50, attackSpeedPercent: 50, durationMs: 10000, tags: ['buff'] },
    '神盾': { type: 'shield', absorbPercent: 40, durationMs: 8000, tags: ['defense'] },
    '群体援护': { type: 'guard', damageReduction: 70, durationMs: 2000, tags: ['defense'] },
    '神圣干预': { type: 'heal', healPercent: 25, tags: ['heal'] },
    '群体复苏': { type: 'heal', healPercent: 40, tags: ['heal'] },
    '相位转移': { type: 'blink', distance: 100, tags: ['utility'] },
    '影步': { type: 'blink', distance: 80, tags: ['utility'] }
};

/** @type {Record<string, object>} */
const HYBRID_BY_NAME = {
    '盾击': { type: 'stun', stunMs: 1500, breakMult: 1.5, tags: ['control'] },
    '神圣盾击': { type: 'stun', stunMs: 1500, aoeRadius: 100, status: 'dark_erosion', breakMult: 2, tags: ['control'] },
    '审判之盾': { type: 'stun', stunMs: 2000, status: 'dark_erosion', breakMult: 2, healOnHitPercent: 5, tags: ['control'] },
    '冲锋': { type: 'charge', distance: 150, slowMult: 0.6, slowMs: 2000, pathDamageMult: 0.8, tags: ['utility'] },
    '狂暴冲锋': { type: 'charge', distance: 200, pathDamageMult: 1.2, knockback: true, tags: ['utility'] },
    '毁灭冲锋': { type: 'charge', distance: 220, pathDamageMult: 2.5, chargeMs: 1000, superArmor: true, tags: ['utility'] },
    '后跳射击': { type: 'backstep', distance: 100, damageMult: 0.6, projectiles: 3, tags: ['utility'] },
    '毒箭': { type: 'poison_dot', instantMult: 0.8, dotMult: 0.4, dotDurationMs: 4000, status: 'poison', tags: ['dot'] },
    '闪电链': { type: 'chain_lightning', damageMult: 2.0, chainCount: 3, status: 'shock', tags: ['burst'] },
    '火球术': { type: 'fireball', aoeRadius: 70, damageMult: 1.8, status: 'burn', tags: ['burst'] },
    '烈焰弹': { type: 'fireball', aoeRadius: 90, damageMult: 2.88, status: 'burn', chargeMs: 1500, tags: ['burst'] },
    '熔岩风暴': { type: 'fireball', aoeRadius: 110, damageMult: 0.8, status: 'burn', channelMs: 3000, tags: ['burst', 'channel'] },
    '暗影步': { type: 'blink_behind', distance: 80, bonusDamageMult: 1.8, tags: ['utility'] },
    '断筋': { type: 'slow', slowMult: 0.5, slowMs: 3000, tags: ['control'] },
    '冰冻陷阱': { type: 'freeze', freezeMs: 2000, aoeRadius: 60, tags: ['control'] },
    '诅咒': { type: 'poison_dot', instantMult: 0.3, dotMult: 0.3, dotDurationMs: 8000, tags: ['dot'] },
    '生命吸取': { type: 'life_drain', damageMult: 0.8, healPercent: 30, tags: ['heal'] },
    '死亡缠绕': { type: 'stun', stunMs: 2000, tags: ['control'] },
    '迷惑': { type: 'slow', slowMult: 0.4, slowMs: 4000, tags: ['control'] },
    '毒刃': { type: 'poison_dot', instantMult: 1.0, dotMult: 0.35, dotDurationMs: 5000, tags: ['dot'] },
    '烟雾弹': { type: 'dodge_buff', dodge: 30, durationMs: 4000, damageMult: 0, tags: ['utility'] }
};

/** 流派核心被动 — 定义 Build 方向 */
const BUILD_PASSIVE_DESC = {
    '流派·惩戒': '神圣打击消耗所有神圣能量，每层使范围+30%，消耗3层时变为全屏AOE',
    '流派·血魔': 'HP越低伤害越高（每少1%HP+0.5%伤害），HP无法超过50%',
    '流派·荆棘': '永久减伤+10%，每次受击反弹（减伤前伤害的50%）',
    '流派·处刑人': '对HP高于80%和低于20%的敌人伤害+60%，对中间血量敌人伤害-20%',
    '流派·奥术': '法力上限翻倍、消耗翻倍，每消耗1点法力技能伤害+0.1%（上限50%）',
    '流派·时空': '所有冷却-30%，治疗效果-40%；可存储2次闪现充能',
    '流派·尸爆': '骷髅无法攻击，改为跟随玩家；技能键引爆所有骷髅造成AOE（每只=100%法术伤害）',
    '流派·暗夜': '脱战永久隐身，首次攻击后显形且伤害-50%，3秒后重新隐身',
    '流派·传染': '击杀中毒敌人时，将其毒层数×2传播给15码内敌人，传播不消耗原目标层数',
    '流派·野性': '宠物死亡时爆炸造成其最大HP 200% 的AOE伤害',
    '流派·无影': '分身存在期间本体闪避+40%',
    '流派·千面': '每个幻象死亡时对周围敌人造成100%法术伤害',
    '流派·处刑人': '对HP高于80%和低于20%的敌人伤害+60%',
    '流派·血魔': 'HP越低伤害越高，HP无法超过50%'
};

function getResourceLabel(skill) {
    const rt = skill.resourceType;
    if (!rt) return '资源';
    return RESOURCE_LABEL[rt] || rt;
}

function buildDescription(skill) {
    const se = skill.skillEffect;
    if (!se) return skill.description || skill.name;
    const res = getResourceLabel(skill);
    const cd = skill.cooldownMs > 0 ? `冷却 ${(skill.cooldownMs / 1000).toFixed(1)} 秒` : '';
    const cost = skill.resourceCost > 0 ? `消耗 ${skill.resourceCost} 点${res}` : '';
    const tail = [cost, cd].filter(Boolean).join('，');
    const suffix = tail ? ` ${tail}。` : '。';

    if (se.mode === 'primary') {
        switch (se.type) {
            case 'ice_armor': {
                const dr = se.damageReduction || 15;
                const dur = ((se.durationMs || 8000) / 1000).toFixed(0);
                const slow = Math.round((1 - (se.attackerSlowMultiplier || 0.7)) * 100);
                return `【防御】${skill.name}：${dur} 秒内减伤 ${dr}%，近战攻击你的敌人减速 ${slow}%。${suffix}`;
            }
            case 'damage_reduction': {
                const dur = ((se.durationMs || 5000) / 1000).toFixed(0);
                return `【防御】${skill.name}：${dur} 秒内减伤 ${se.damageReduction || 20}%。${suffix}`;
            }
            case 'shield': {
                const dur = ((se.durationMs || 8000) / 1000).toFixed(0);
                return `【护盾】${skill.name}：获得相当于最大生命 ${se.absorbPercent || 20}% 的护盾，持续 ${dur} 秒。${suffix}`;
            }
            case 'heal':
                return `【治疗】${skill.name}：恢复最大生命 ${se.healPercent || 25}% 的生命值。${suffix}`;
            case 'attack_buff': {
                const dur = ((se.durationMs || 8000) / 1000).toFixed(0);
                return `【增益】${skill.name}：${dur} 秒内攻击力提升 ${se.attackPercent || 15}%。${suffix}`;
            }
            case 'attack_speed_buff': {
                const dur = ((se.durationMs || 4000) / 1000).toFixed(0);
                return `【增益】${skill.name}：${dur} 秒内攻击速度提升 ${se.attackSpeedPercent || 40}%。${suffix}`;
            }
            case 'mark': {
                const dur = ((se.durationMs || 8000) / 1000).toFixed(0);
                const rng = se.range || skill.range || 120;
                return `【标记】${skill.name}：对 ${rng} 码内敌人施加印记 ${dur} 秒，对其伤害提升 ${se.damageBonus || 15}%。${suffix}`;
            }
            case 'blink':
                return `【位移】${skill.name}：向面朝方向瞬移 ${se.distance || 100} 码。${suffix}`;
            case 'stealth': {
                const dur = ((se.durationMs || 4000) / 1000).toFixed(0);
                return `【潜行】${skill.name}：${dur} 秒内进入隐身，闪避大幅提升。${suffix}`;
            }
            case 'taunt': {
                const dur = ((se.durationMs || 4000) / 1000).toFixed(0);
                return `【嘲讽】${skill.name}：${dur} 秒内减伤 ${se.damageReduction || 30}%，吸引附近敌人。${suffix}`;
            }
            case 'guard': {
                const dur = ((se.durationMs || 3000) / 1000).toFixed(0);
                return `【援护】${skill.name}：${dur} 秒内减伤 ${se.damageReduction || 50}%。${suffix}`;
            }
            case 'berserk': {
                const dur = ((se.durationMs || 8000) / 1000).toFixed(0);
                let t = `【狂暴】${skill.name}：${dur} 秒内攻击力提升 ${se.attackPercent || 25}%`;
                if (se.defensePenalty) t += `，防御降低 ${se.defensePenalty}%`;
                if (se.attackSpeedPercent) t += `，攻速提升 ${se.attackSpeedPercent}%`;
                return t + `。${suffix}`;
            }
            case 'dodge_buff': {
                const dur = ((se.durationMs || 4000) / 1000).toFixed(0);
                let t = `【闪避】${skill.name}：${dur} 秒内闪避提升 ${se.dodge || 25}%`;
                if (se.moveSpeed) t += `，移速提升 ${se.moveSpeed}%`;
                return t + `。${suffix}`;
            }
            case 'cleanse':
                return `【净化】${skill.name}：清除负面效果，${((se.immunityMs || 3000) / 1000).toFixed(0)} 秒内免疫减速。${suffix}`;
            default:
                return skill.description || skill.name;
        }
    }

    if (se.mode === 'hybrid') {
        const pct = Math.round((se.damageMult || skill.damageMultiplier || 1) * 100);
        let base;
        if (se.type === 'fireball' || (se.aoeRadius || skill.aoeRadius)) {
            const r = se.aoeRadius || skill.aoeRadius || 70;
            base = `对周围 ${r} 范围内敌人造成 ${pct}% 攻击力伤害`;
        } else if (se.type === 'backstep') {
            base = `后跳 ${se.distance || 100} 码并射出 ${se.projectiles || 3} 箭，每箭 ${Math.round((se.damageMult || 0.6) * 100)}% 伤害`;
        } else if (se.damageMult === 0) {
            base = skill.name;
        } else {
            base = `对 ${skill.range || 80} 码内敌人造成 ${pct}% 攻击力伤害`;
        }
        const extras = [];
        if (se.type === 'stun') extras.push(`眩晕 ${((se.stunMs || 1500) / 1000).toFixed(1)} 秒`);
        if (se.type === 'slow') extras.push(`减速 ${Math.round((1 - (se.slowMult || 0.5)) * 100)}%`);
        if (se.type === 'poison_dot') extras.push('附带持续毒伤');
        if (se.type === 'charge') extras.push('冲锋并减速目标');
        if (se.type === 'blink_behind') extras.push('瞬移至目标身后');
        if (se.type === 'freeze') extras.push('冰冻敌人');
        if (se.type === 'life_drain') extras.push(`并恢复 ${se.healPercent || 30}% 生命`);
        if (se.type === 'dodge_buff') extras.push(`获得 ${se.dodge || 30}% 闪避`);
        let text = `【技能】${base}`;
        if (extras.length) text += '，' + extras.join('，');
        return text + `。${suffix}`;
    }
    return skill.description || skill.name;
}

function applyRuleToSkill(skill) {
    if (!skill) return skill;
    if (skill.slotType === 'legendary' && BUILD_PASSIVE_DESC[skill.name]) {
        skill.description = `【流派被动】${skill.name}：${BUILD_PASSIVE_DESC[skill.name]}`;
        skill.effectTags = ['passive', 'build'];
        return skill;
    }
    if (skill.type === 'passive' || skill.type === 'basic') return skill;
    const primary = PRIMARY_BY_NAME[skill.name];
    const hybrid = HYBRID_BY_NAME[skill.name];
    if (!primary && !hybrid) return skill;

    if (primary) {
        skill.skillEffect = Object.assign({ mode: 'primary' }, primary);
        skill.effectTags = primary.tags ? primary.tags.slice() : ['utility'];
        skill.damageMultiplier = 0;
        skill.aoeRadius = primary.type === 'taunt' ? (primary.range || 120) : 0;
        skill.range = primary.range || 0;
        if (skill.name === '冰甲术') {
            skill.resourceCost = 40;
            skill.cooldownMs = 15000;
        }
        if (skill.name === '战吼') {
            skill.aoeRadius = 0;
            skill.resourceCost = skill.resourceCost || 35;
        }
    } else if (hybrid) {
        skill.skillEffect = Object.assign({ mode: 'hybrid' }, hybrid);
        if (hybrid.tags) skill.effectTags = hybrid.tags.slice();
        if (hybrid.damageMult != null) skill.damageMultiplier = hybrid.damageMult;
        else if (hybrid.instantMult != null) skill.damageMultiplier = hybrid.instantMult;
        if (hybrid.aoeRadius) skill.aoeRadius = hybrid.aoeRadius;
        if (hybrid.type === 'fireball') skill.aoeRadius = hybrid.aoeRadius || 70;
        if (hybrid.type === 'backstep') skill.range = skill.range || 120;
        if (hybrid.type === 'smoke' || hybrid.damageMult === 0) skill.damageMultiplier = 0;
    }

    skill.description = buildDescription(skill);
    return skill;
}

function patchAllSkills(skillsObj) {
    let count = 0;
    for (const id of Object.keys(skillsObj)) {
        const before = JSON.stringify(skillsObj[id].skillEffect);
        applyRuleToSkill(skillsObj[id]);
        if (JSON.stringify(skillsObj[id].skillEffect) !== before) count++;
    }
    return count;
}

module.exports = {
    PRIMARY_BY_NAME,
    HYBRID_BY_NAME,
    applyRuleToSkill,
    patchAllSkills,
    buildDescription,
    getResourceLabel
};
