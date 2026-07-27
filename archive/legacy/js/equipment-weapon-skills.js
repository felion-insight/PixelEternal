/**
 * 程序化武器技能（按 weaponType + 品质 + 精炼等级，不依赖静态装备名）
 */
(function () {
    'use strict';

    const BASE = {
        sword: { name: '裂地斩', cooldown: 8000, damageMultiplier: 1.5, rangeMult: 1.0, castMode: 'target_lock', showLockMarker: true, description: '对锁定目标造成150%攻击力伤害' },
        axe: { name: '旋风斧', cooldown: 9000, damageMultiplier: 1.65, rangeMult: 1.2, castMode: 'radial', description: '对周围敌人造成165%攻击力伤害' },
        hammer: { name: '震地猛击', cooldown: 10000, damageMultiplier: 1.8, rangeMult: 1.1, castMode: 'target_lock', showLockMarker: true, description: '对锁定目标造成180%攻击力伤害并小幅击退' },
        spear: { name: '贯星刺', cooldown: 8500, damageMultiplier: 1.55, rangeMult: 1.3, castMode: 'target_lock', showLockMarker: true, description: '对锁定目标造成155%攻击力伤害' },
        bow: { name: '精准射击', cooldown: 7000, damageMultiplier: 1.45, rangeMult: 1.4, castMode: 'target_lock', showLockMarker: true, description: '对锁定目标造成145%攻击力伤害' },
        crossbow: { name: '重弩齐射', cooldown: 9500, damageMultiplier: 1.75, rangeMult: 1.2, castMode: 'target_lock', showLockMarker: true, description: '对锁定目标造成175%攻击力伤害' },
        longbow: { name: '长弓狙击', cooldown: 9000, damageMultiplier: 1.7, rangeMult: 1.5, castMode: 'target_lock', showLockMarker: true, description: '对锁定目标造成170%攻击力伤害，暴击率+10%' },
        shortbow: { name: '速射', cooldown: 6000, damageMultiplier: 1.35, rangeMult: 1.2, castMode: 'target_lock', showLockMarker: true, description: '对锁定目标造成135%攻击力伤害' },
        staff: { name: '奥术飞弹', cooldown: 7500, damageMultiplier: 1.5, rangeMult: 1.2, castMode: 'target_lock', showLockMarker: true, description: '对锁定目标造成150%魔法攻击伤害', magic: true },
        book: { name: '秘典轰击', cooldown: 8500, damageMultiplier: 1.6, rangeMult: 1.1, castMode: 'target_lock', showLockMarker: true, description: '对锁定目标造成160%魔法攻击伤害', magic: true },
        orb: { name: '法球爆发', cooldown: 8000, damageMultiplier: 1.55, rangeMult: 1.0, castMode: 'radial', description: '对周围造成155%魔法攻击伤害', magic: true },
        rune: { name: '符文箭', cooldown: 7800, damageMultiplier: 1.52, rangeMult: 1.25, castMode: 'target_lock', showLockMarker: true, description: '对锁定目标造成152%魔法攻击伤害', magic: true },
        dagger: { name: '影袭', cooldown: 6500, damageMultiplier: 1.4, rangeMult: 0.9, castMode: 'target_lock', showLockMarker: true, description: '对锁定目标造成140%攻击力伤害' },
        claw: { name: '连爪', cooldown: 6000, damageMultiplier: 1.32, rangeMult: 0.85, castMode: 'target_lock', showLockMarker: true, description: '快速连击，造成132%攻击力伤害' },
        shortblade: { name: '闪刃', cooldown: 6800, damageMultiplier: 1.42, rangeMult: 1.0, castMode: 'target_lock', showLockMarker: true, description: '对锁定目标造成142%攻击力伤害' },
        chainblade: { name: '链刃横扫', cooldown: 8200, damageMultiplier: 1.58, rangeMult: 1.3, castMode: 'radial', description: '链刃横扫，造成158%攻击力范围伤害' }
    };

    const QUALITY_MULT = {
        normal: { dmg: 1.0, cd: 1.0 },
        magic: { dmg: 1.08, cd: 0.95 },
        rare: { dmg: 1.15, cd: 0.92 },
        epic: { dmg: 1.25, cd: 0.88 },
        legendary: { dmg: 1.4, cd: 0.85 },
        mythic: { dmg: 1.55, cd: 0.8 }
    };

    /**
     * 16 类武器显式登记在精炼体系中。各类型使用同一套累计阶级规则，
     * 武器差异由 BASE 决定，精炼等级因此可跨类型直接比较。
     */
    const REFINE_TYPE_NAMES = {
        sword: '剑',
        axe: '斧',
        hammer: '锤',
        spear: '枪',
        bow: '弓',
        crossbow: '弩',
        longbow: '长弓',
        shortbow: '短弓',
        staff: '法杖',
        book: '法典',
        orb: '法球',
        rune: '符文',
        dagger: '匕首',
        claw: '利爪',
        shortblade: '短刃',
        chainblade: '链刃'
    };

    /** 每项都是到达该星级后的累计效果，战斗层只应用当前星级一项。 */
    const REFINE_TIERS = [
        { damageMultiplier: 0.08 },
        { damageMultiplier: 0.16, cooldownReduction: 400 },
        { damageMultiplier: 0.24, cooldownReduction: 700, rangeMultiplier: 0.08 },
        { damageMultiplier: 0.32, cooldownReduction: 1100, rangeMultiplier: 0.1, critRateBonus: 5 },
        { damageMultiplier: 0.4, cooldownReduction: 1600, rangeMultiplier: 0.12, critRateBonus: 8, extraDamage: 0.2 }
    ];

    function normalizeRefineLevel(refineLevel) {
        const level = Number(refineLevel);
        return Number.isFinite(level) ? Math.max(0, Math.min(5, Math.floor(level))) : 0;
    }

    function buildNumericalDescription(typeName, level, effect) {
        const parts = [`技能伤害+${Math.round(effect.damageMultiplier * 100)}%`];
        if (effect.cooldownReduction) parts.push(`冷却-${effect.cooldownReduction / 1000}秒`);
        if (effect.rangeMultiplier) parts.push(`范围+${Math.round(effect.rangeMultiplier * 100)}%`);
        if (effect.critRateBonus) parts.push(`暴击率+${effect.critRateBonus}%`);
        if (effect.extraDamage) parts.push(`额外${Math.round(effect.extraDamage * 100)}%攻击力伤害`);
        return `${typeName}技精炼${level}阶：${parts.join('，')}`;
    }

    function buildRefineDescription(weaponType, typeName, level, effect) {
        const parts = [buildNumericalDescription(typeName, level, effect)];
        const mechanics = window.WeaponRefinementSystem
            && window.WeaponRefinementSystem.getMechanic(weaponType);
        if (mechanics && level >= 3) parts.push(`解锁「${mechanics.core.name}」：${mechanics.core.description}`);
        if (mechanics && level >= 5) parts.push(`普通武器进阶「${mechanics.capstone.name}」：${mechanics.capstone.description}`);
        return parts.join('；');
    }

    function getRefineEffects(weaponType) {
        const typeName = REFINE_TYPE_NAMES[weaponType] || REFINE_TYPE_NAMES.sword;
        return REFINE_TIERS.map((tier, index) => Object.assign(
            { level: index + 1 },
            tier,
            {
                numericDescription: buildNumericalDescription(typeName, index + 1, tier),
                description: buildRefineDescription(weaponType, typeName, index + 1, tier),
                coreMechanic: index + 1 >= 3 && window.WeaponRefinementSystem
                    ? window.WeaponRefinementSystem.getMechanic(weaponType)?.core : null,
                capstoneMechanic: index + 1 >= 5 && window.WeaponRefinementSystem
                    ? window.WeaponRefinementSystem.getMechanic(weaponType)?.capstone : null
            }
        ));
    }

    window.getWeaponRefineEffectDescription = function getWeaponRefineEffectDescription(item, effect, level) {
        if (!effect) return '';
        const parts = [effect.numericDescription || effect.description];
        const mechanics = window.WeaponRefinementSystem
            && window.WeaponRefinementSystem.getResolvedMechanics(item);
        if (mechanics && level >= 3) {
            parts.push(`3星类型核心「${mechanics.core.name}」：${mechanics.core.description}`);
        }
        if (mechanics && level >= 5 && mechanics.capstone) {
            const sourceNames = { set: '套装共鸣', weaponType: '基础进阶' };
            parts.push(`5星${sourceNames[mechanics.capstone.source] || '身份共鸣'}「${mechanics.capstone.name}」：${mechanics.capstone.description}`);
        }
        return parts.join('；');
    };

    function applyRefineEffect(skill, effect) {
        if (!effect) return skill;
        skill.damageMultiplier = Math.round(skill.damageMultiplier * (1 + effect.damageMultiplier) * 100) / 100;
        skill.cooldown = Math.max(1000, skill.cooldown - (effect.cooldownReduction || 0));
        skill.range = Math.floor(skill.range * (1 + (effect.rangeMultiplier || 0)));
        if (effect.critRateBonus) skill.critRateBonus = (skill.critRateBonus || 0) + effect.critRateBonus;
        if (effect.extraDamage) skill.extraDamage = effect.extraDamage;
        skill.description = `${skill.description}；${effect.description}`;
        return skill;
    }

    /**
     * 获取程序化武器技能统一结果。
     * refineLevel=0 保持原技能数值；1～5 返回已应用对应累计精炼效果的技能。
     * 返回对象始终暴露 refineLevel、refineEffect 与 refineEffects。
     */
    window.getProceduralWeaponSkill = function getProceduralWeaponSkill(weaponType, quality, refineLevel) {
        const wt = typeof window.resolveWeaponTypeFromLegacy === 'function'
            ? window.resolveWeaponTypeFromLegacy(weaponType || 'sword') : (weaponType || 'sword');
        const base = BASE[wt] || BASE.sword;
        const q = quality || 'normal';
        const qm = QUALITY_MULT[q] || QUALITY_MULT.normal;
        const normalizedRefineLevel = normalizeRefineLevel(refineLevel);
        const refineEffects = getRefineEffects(wt);
        const refineEffect = normalizedRefineLevel > 0 ? refineEffects[normalizedRefineLevel - 1] : null;
        const rangeBase = (window.CONFIG && window.CONFIG.PLAYER_ATTACK_RANGE) || 50;
        const skill = {
            name: base.name,
            cooldown: Math.floor(base.cooldown * qm.cd),
            description: base.description,
            damageMultiplier: Math.round(base.damageMultiplier * qm.dmg * 100) / 100,
            range: Math.floor(rangeBase * (base.rangeMult || 1)),
            castMode: base.castMode || 'target_lock',
            magic: !!base.magic,
            weaponType: wt,
            quality: q,
            refineLevel: normalizedRefineLevel,
            refineEffect,
            refineEffects
        };
        if (base.showLockMarker) skill.showLockMarker = true;
        if (wt === 'longbow' && q !== 'normal') skill.critBonus = 0.1;
        return applyRefineEffect(skill, refineEffect);
    };
})();
