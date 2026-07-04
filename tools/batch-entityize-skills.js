#!/usr/bin/env node
/**
 * 批量实体化：将 skill-entity-config / skill-primary-effects 合并进 skill-config，
 * 并对缺失条目的 active 技能按规则自动生成 entityType + entityConfig。
 *
 * 用法:
 *   node tools/batch-entityize-skills.js
 *   node tools/batch-entityize-skills.js --dry-run
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PRIMARY_FILE = path.join(ROOT, 'config', 'skill-primary-effects.json');
const ENTITY_FILE = path.join(ROOT, 'config', 'skill-entity-config.json');
const SKILL_CFG = path.join(ROOT, 'config', 'skill-config.json');

const PASSIVE_SLOTS = new Set(['legendary', 'adv_passive']);

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function isPassiveSkill(skill) {
    return skill.type === 'passive' || PASSIVE_SLOTS.has(skill.slotType);
}

function stripCombatEffectFields(skill) {
    delete skill.entityType;
    delete skill.entityConfig;
    delete skill.skillEffect;
    delete skill.effectTags;
}

function applyPrimaryPatch(skill, patch) {
    stripCombatEffectFields(skill);
    if (patch.skillEffect) skill.skillEffect = deepClone(patch.skillEffect);
    if (patch.effectTags) skill.effectTags = [...patch.effectTags];
}

function applyEntityPatch(skill, patch) {
    delete skill.skillEffect;
    skill.entityType = patch.entityType;
    skill.entityConfig = deepClone(patch.entityConfig);
    if (patch.effectTags) skill.effectTags = [...patch.effectTags];
}

function statusFromSkill(skill) {
    if (!Array.isArray(skill.statusEffects) || !skill.statusEffects.length) return undefined;
    return skill.statusEffects.map(se => ({
        type: se.type,
        durationMs: se.durationMs || 3000,
        stacks: se.stacks || 1
    }));
}

function dmgMult(skill) {
    return typeof skill.dmg === 'number' ? skill.dmg : 1;
}

function inferEntityType(skill) {
    const hay = `${skill.id} ${skill.name} ${(skill.tags || []).join(' ')}`.toLowerCase();

    if (/summon|wolf|bear|skeleton|illusion|decoy|beast_pack|phantom_clone|召唤|狼|熊|骷髅|幻象/.test(hay)) {
        return 'summon';
    }
    if (/blink|vanish|shadow_step|wind_step|reality_shift|phase|闪现|消失|暗影步|风之步|相位|转移/.test(hay)) {
        return 'blink';
    }
    if (/charge|冲锋/.test(hay)) {
        return 'charge';
    }
    if (/trap|mine|domain|storm|plague|mist|gate|meteor|lava|outbreak|nightfall|element_domain|陷阱|领域|风暴|瘟疫|毒雾|门|陨石|熔岩|夜幕/.test(hay)) {
        return 'field';
    }
    if (/chain_lightning|闪电链|连锁/.test(hay)) {
        return 'instant';
    }
    if (/arrow|bolt|missile|gaze|headshot|aimed|shot|flame_bolt|void_arrow|piercing|judgment|箭|弹|射击|凝视|爆头|精准|穿透|火球|飞弹/.test(hay)) {
        return 'projectile';
    }
    if (skill.slotType === 'ultimate') {
        return 'field';
    }
    if (skill.aoeRadius > 0) {
        return 'field';
    }
    if (skill.slotType === 'basic') {
        const rangedClasses = ['mage', 'wizard', 'archmage', 'archer', 'ranger', 'sharpshooter'];
        if (rangedClasses.includes(skill.classId) || /missile|arrow|shot|bolt/.test(hay)) {
            return 'projectile';
        }
    }
    return 'instant';
}

function inferEntityConfig(skill, entityType) {
    const mult = dmgMult(skill);
    const statusOnHit = statusFromSkill(skill);
    const color = skill.color || '#cccccc';
    const base = { damageMultiplier: mult, color };

    if (entityType === 'projectile') {
        const homing = /homing|追踪|寻的|missile|飞弹/.test(`${skill.id} ${skill.name}`);
        return {
            ...base,
            speed: skill.slotType === 'basic' ? 520 : 640,
            maxRange: skill.range || 480,
            trajectory: homing ? 'homing' : 'straight_toward_target',
            pierceCount: /pierce|穿透|multi/.test(`${skill.id} ${skill.name}`) ? 3 : 0,
            collisionRadius: skill.slotType === 'basic' ? 12 : 18,
            ...(statusOnHit ? { statusOnHit } : {})
        };
    }

    if (entityType === 'summon') {
        const unitId = /wolf|狼/.test(skill.id) ? 'wolf'
            : /bear|熊/.test(skill.id) ? 'bear'
            : /skeleton|骷髅/.test(skill.id) ? 'skeleton'
            : /illusion|幻象|decoy/.test(skill.id) ? 'illusion'
            : 'wolf';
        return {
            ...base,
            unitId,
            count: skill.slotType === 'ultimate' ? 2 : 1,
            durationMs: skill.slotType === 'ultimate' ? 20000 : 12000,
            spawnRadius: 40,
            damageMultiplier: mult > 0 ? mult : 0.8
        };
    }

    if (entityType === 'blink') {
        return {
            distance: skill.range || 120,
            direction: 'facing',
            windupMs: 80,
            invincibleMs: 200
        };
    }

    if (entityType === 'charge') {
        return {
            distance: skill.range || 140,
            speed: 520,
            windupMs: 100,
            damageMultiplier: mult,
            knockback: 80,
            ...(statusOnHit ? { statusOnHit } : {})
        };
    }

    if (entityType === 'field') {
        const delayed = /meteor|陨石|delayed|落/.test(`${skill.id} ${skill.name}`);
        const proximity = /trap|mine|陷阱/.test(`${skill.id} ${skill.name}`);
        if (delayed) {
            return {
                ...base,
                triggerType: 'delayed_strike',
                fieldRadius: skill.aoeRadius || 80,
                delayMs: 1200,
                targeted: true,
                triggerHitImpact: true,
                ...(statusOnHit ? { statusOnHit } : {})
            };
        }
        if (proximity) {
            return {
                ...base,
                triggerType: 'proximity_mine',
                fieldRadius: skill.aoeRadius || 60,
                armMs: 400,
                onTrigger: { damageMultiplier: mult },
                ...(statusOnHit ? { statusOnHit } : {})
            };
        }
        if (skill.slotType === 'ultimate') {
            return {
                ...base,
                triggerType: 'instant_burst',
                fieldRadius: skill.aoeRadius || 100,
                targeted: true,
                ...(statusOnHit ? { statusOnHit } : {})
            };
        }
        return {
            ...base,
            triggerType: 'periodic',
            fieldRadius: skill.aoeRadius || 70,
            fieldDurationMs: 5000,
            tickIntervalMs: 500,
            damageMultiplier: mult * 0.35,
            ...(statusOnHit ? { statusOnHit } : {})
        };
    }

    // instant
    const chain = /chain|闪电链/.test(`${skill.id} ${skill.name}`);
    const execute = /execute|处决/.test(`${skill.id} ${skill.name}`);
    const radial = skill.aoeRadius > 0 || /whirlwind|旋风|爆发|冲击|wave|震击|横扫/.test(`${skill.id} ${skill.name}`);

    if (chain) {
        return {
            ...base,
            shape: 'chain',
            range: skill.range || 400,
            chainCount: 4,
            chainRadius: 120,
            damageMultiplier: mult,
            ...(statusOnHit ? { statusOnHit } : {})
        };
    }

    if (execute) {
        return {
            ...base,
            shape: 'single',
            range: skill.range || 80,
            executeThreshold: 0.25,
            damageMultiplier: mult,
            windupMs: 200
        };
    }

    if (radial) {
        return {
            ...base,
            shape: 'radial',
            range: skill.aoeRadius || 65,
            damageMultiplier: mult,
            windupMs: skill.slotType === 'basic' ? 80 : 140,
            ...(statusOnHit ? { statusOnHit } : {})
        };
    }

    return {
        ...base,
        shape: 'cone',
        range: skill.range || 65,
        halfAngleDeg: /whirlwind|旋风|slash|斩|横扫/.test(`${skill.id} ${skill.name}`) ? 120 : 55,
        damageMultiplier: mult,
        windupMs: skill.slotType === 'basic' ? 80 : 120,
        ...(statusOnHit ? { statusOnHit } : {})
    };
}

function autoInferEntity(skill) {
    const entityType = inferEntityType(skill);
    const entityConfig = inferEntityConfig(skill, entityType);
    return { entityType, entityConfig };
}

/**
 * @param {Record<string, object>} skills
 * @param {{ writeNewEntities?: boolean, dryRun?: boolean }} options
 */
function batchEntityize(skills, options = {}) {
    const primaryData = JSON.parse(fs.readFileSync(PRIMARY_FILE, 'utf8')).skills;
    const entityDoc = JSON.parse(fs.readFileSync(ENTITY_FILE, 'utf8'));
    const entityData = entityDoc.skills;

    const stats = { primary: 0, entity: 0, auto: 0, passive: 0, skipped: 0 };
    const newEntityEntries = {};

    for (const [id, skill] of Object.entries(skills)) {
        if (isPassiveSkill(skill)) {
            stats.passive++;
            continue;
        }

        if (primaryData[id]) {
            applyPrimaryPatch(skill, primaryData[id]);
            stats.primary++;
            continue;
        }

        if (entityData[id]) {
            applyEntityPatch(skill, entityData[id]);
            stats.entity++;
            continue;
        }

        const inferred = autoInferEntity(skill);
        applyEntityPatch(skill, inferred);
        newEntityEntries[id] = inferred;
        stats.auto++;
    }

    if (options.writeNewEntities && Object.keys(newEntityEntries).length && !options.dryRun) {
        Object.assign(entityData, newEntityEntries);
        entityDoc.skills = entityData;
        fs.writeFileSync(ENTITY_FILE, JSON.stringify(entityDoc, null, 2), 'utf8');
    }

    return { stats, newEntityEntries };
}

function syncDeployment() {
    const pairs = [
        ['config/skill-config.json', 'deployment/config/skill-config.json'],
        ['config/skill-entity-config.json', 'deployment/config/skill-entity-config.json'],
        ['config/skill-primary-effects.json', 'deployment/config/skill-primary-effects.json']
    ];
    for (const [src, dest] of pairs) {
        fs.copyFileSync(path.join(ROOT, src), path.join(ROOT, dest));
    }
}

module.exports = { batchEntityize, autoInferEntity, inferEntityType, syncDeployment };

if (require.main === module) {
    const dryRun = process.argv.includes('--dry-run');
    const config = JSON.parse(fs.readFileSync(SKILL_CFG, 'utf8'));
    const { stats, newEntityEntries } = batchEntityize(config.skills, {
        writeNewEntities: true,
        dryRun
    });

    if (!dryRun) {
        fs.writeFileSync(SKILL_CFG, JSON.stringify(config, null, 2), 'utf8');
        syncDeployment();
    }

    console.log('batch-entityize:', stats);
    if (Object.keys(newEntityEntries).length) {
        console.log('auto-generated entity entries:', Object.keys(newEntityEntries).join(', '));
    }
}
