/**
 * 程序化武器技能（按 weaponType + 品质，不依赖静态装备名）
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

    window.getProceduralWeaponSkill = function getProceduralWeaponSkill(weaponType, quality) {
        const wt = typeof window.resolveWeaponTypeFromLegacy === 'function'
            ? window.resolveWeaponTypeFromLegacy(weaponType || 'sword') : (weaponType || 'sword');
        const base = BASE[wt] || BASE.sword;
        const q = quality || 'normal';
        const qm = QUALITY_MULT[q] || QUALITY_MULT.normal;
        const rangeBase = (window.CONFIG && window.CONFIG.PLAYER_ATTACK_RANGE) || 50;
        const skill = {
            name: base.name,
            cooldown: Math.floor(base.cooldown * qm.cd),
            description: base.description,
            damageMultiplier: Math.round(base.damageMultiplier * qm.dmg * 100) / 100,
            range: Math.floor(rangeBase * (base.rangeMult || 1)),
            castMode: base.castMode || 'target_lock',
            magic: !!base.magic
        };
        if (base.showLockMarker) skill.showLockMarker = true;
        if (wt === 'longbow' && q !== 'normal') skill.critBonus = 0.1;
        return skill;
    };
})();
