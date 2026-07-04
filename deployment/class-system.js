/**
 * Pixel Eternal - 职业 / 装备槽位 / 品质 / 亲和 核心工具
 */

(function () {
    'use strict';

    const EQUIPMENT_SLOT_ORDER = [
        'weapon', 'offHand', 'helmet', 'body', 'hands', 'legs', 'feet', 'amulet', 'ring', 'belt'
    ];

    const QUALITY_GS_MULTIPLIER = {
        normal: 1.0,
        magic: 1.3,
        rare: 1.6,
        epic: 2.0,
        legendary: 2.5,
        mythic: 3.0
    };

    const CLASS_STAT_KEYS = ['hp', 'attack', 'defense', 'magicAttack', 'magicDefense', 'speed', 'critical', 'dodge'];

    window.EQUIPMENT_SLOT_ORDER = EQUIPMENT_SLOT_ORDER;

    window.createEmptyEquipmentSlots = function createEmptyEquipmentSlots() {
        const eq = {};
        for (const slot of EQUIPMENT_SLOT_ORDER) eq[slot] = null;
        return eq;
    };

    window.normalizeEquipmentSlot = function normalizeEquipmentSlot(slot) {
        if (!slot || !EQUIPMENT_SLOT_ORDER.includes(slot)) {
            throw new Error('无效装备槽位: ' + slot);
        }
        return slot;
    };

    window.normalizeEquipmentQuality = function normalizeEquipmentQuality(quality) {
        const q = String(quality || 'normal');
        if (!QUALITY_GS_MULTIPLIER[q]) {
            throw new Error('无效装备品质: ' + quality);
        }
        return q;
    };

    window.resolveQualityDisplay = function resolveQualityDisplay(quality) {
        const canonical = window.normalizeEquipmentQuality(quality);
        const colors = window.QUALITY_COLORS || {};
        const names = window.QUALITY_NAMES || {};
        return {
            canonical,
            color: colors[canonical] || '#ffffff',
            name: names[canonical] || canonical
        };
    };

    window.normalizeClassData = function normalizeClassData(raw) {
        if (!raw || raw.baseClass == null || raw.baseClass === '') {
            return {
                baseClass: null,
                firstAdvancement: null,
                secondAdvancement: null
            };
        }
        const validBases = ['warrior', 'archer', 'mage', 'assassin'];
        if (!validBases.includes(raw.baseClass)) {
            throw new Error('无效基础职业: ' + raw.baseClass);
        }
        return {
            baseClass: raw.baseClass,
            firstAdvancement: raw.firstAdvancement || null,
            secondAdvancement: raw.secondAdvancement || null
        };
    };

    window.hasPlayerClass = function hasPlayerClass(classData) {
        const cd = window.normalizeClassData(classData);
        return cd.baseClass != null;
    };

    window.getActiveClassId = function getActiveClassId(classData) {
        const cd = window.normalizeClassData(classData);
        if (!cd.baseClass) return null;
        return cd.secondAdvancement || cd.firstAdvancement || cd.baseClass;
    };

    window.getClassDefinition = function getClassDefinition(classId) {
        const cfg = window.CLASS_CONFIG;
        if (!cfg || !classId) return null;
        if (cfg.baseClasses && cfg.baseClasses[classId]) return cfg.baseClasses[classId];
        if (cfg.firstAdvancements && cfg.firstAdvancements[classId]) return cfg.firstAdvancements[classId];
        if (cfg.secondAdvancements && cfg.secondAdvancements[classId]) return cfg.secondAdvancements[classId];
        return null;
    };

    window.getClassDisplayName = function getClassDisplayName(classData) {
        const cd = window.normalizeClassData(classData);
        if (!cd.baseClass) return '无职业';
        const id = window.getActiveClassId(cd);
        const def = window.getClassDefinition(id);
        if (def && def.name) return def.name;
        const base = window.getClassDefinition(cd.baseClass);
        return (base && base.name) || cd.baseClass;
    };

    window.getPlayerBaseClassId = function getPlayerBaseClassId(classData) {
        const cd = window.normalizeClassData(classData);
        if (!cd.baseClass) return null;
        if (cd.secondAdvancement && window.CLASS_CONFIG && window.CLASS_CONFIG.secondAdvancements) {
            const sec = window.CLASS_CONFIG.secondAdvancements[cd.secondAdvancement];
            if (sec && sec.firstAdvancement && window.CLASS_CONFIG.firstAdvancements[sec.firstAdvancement]) {
                return window.CLASS_CONFIG.firstAdvancements[sec.firstAdvancement].baseClass;
            }
        }
        if (cd.firstAdvancement && window.CLASS_CONFIG && window.CLASS_CONFIG.firstAdvancements) {
            const first = window.CLASS_CONFIG.firstAdvancements[cd.firstAdvancement];
            if (first && first.baseClass) return first.baseClass;
        }
        return cd.baseClass;
    };

    window.computeClassBaseStats = function computeClassBaseStats(classData, level) {
        const cd = window.normalizeClassData(classData);
        if (!cd.baseClass) return null;
        const cfg = window.CLASS_CONFIG;
        const lv = Math.max(1, Math.floor(Number(level)) || 1);
        if (!cfg || !cfg.baseClasses || !cfg.baseClasses[cd.baseClass]) {
            throw new Error('职业配置未加载: ' + cd.baseClass);
        }
        const baseDef = cfg.baseClasses[cd.baseClass];
        const stats = {};
        for (const key of CLASS_STAT_KEYS) {
            const baseVal = (baseDef.baseStats && baseDef.baseStats[key]) || 0;
            const growth = (baseDef.growthPerLevel && baseDef.growthPerLevel[key]) || 0;
            stats[key] = baseVal + growth * (lv - 1);
        }
        const modifiers = [];
        if (cd.firstAdvancement && cfg.firstAdvancements && cfg.firstAdvancements[cd.firstAdvancement]) {
            modifiers.push(cfg.firstAdvancements[cd.firstAdvancement].statsModifier || {});
        }
        if (cd.secondAdvancement && cfg.secondAdvancements && cfg.secondAdvancements[cd.secondAdvancement]) {
            modifiers.push(cfg.secondAdvancements[cd.secondAdvancement].statsModifier || {});
        }
        for (const mod of modifiers) {
            for (const key of CLASS_STAT_KEYS) {
                if (mod[key] != null && stats[key] != null) stats[key] *= mod[key];
            }
        }
        for (const key of CLASS_STAT_KEYS) {
            if (['hp', 'attack', 'defense', 'magicAttack', 'magicDefense'].includes(key)) {
                stats[key] = Math.floor(stats[key]);
            } else {
                stats[key] = Math.round(stats[key] * 10) / 10;
            }
        }
        return stats;
    };

    window.resolveWeaponTypeFromLegacy = function resolveWeaponTypeFromLegacy(weaponType) {
        const wt = weaponType || 'sword';
        if (window.WEAPON_AFFINITY_CONFIG && window.WEAPON_AFFINITY_CONFIG.weaponTypes && window.WEAPON_AFFINITY_CONFIG.weaponTypes[wt]) {
            return wt;
        }
        if (wt === 'melee') return 'sword';
        if (wt === 'ranged') return 'bow';
        throw new Error('无效武器类型: ' + weaponType);
    };

    window.getWeaponAffinityGrade = function getWeaponAffinityGrade(classId, weaponType) {
        const cfg = window.WEAPON_AFFINITY_CONFIG;
        if (!cfg || !weaponType || !classId) return 'B';
        const resolvedType = window.resolveWeaponTypeFromLegacy(weaponType);
        let lookupId = classId;
        if (cfg.classWeaponAffinity && !cfg.classWeaponAffinity[lookupId] && cfg.secondAdvancementInherits) {
            lookupId = cfg.secondAdvancementInherits[classId] || lookupId;
        }
        const table = cfg.classWeaponAffinity && cfg.classWeaponAffinity[lookupId];
        if (!table) {
            const baseTable = cfg.classWeaponAffinity && cfg.classWeaponAffinity[window.getPlayerBaseClassId({ baseClass: classId, firstAdvancement: null, secondAdvancement: null })];
            if (!baseTable) return 'B';
            for (const grade of ['A', 'B', 'C', 'D']) {
                if (Array.isArray(baseTable[grade]) && baseTable[grade].includes(resolvedType)) return grade;
            }
            return 'D';
        }
        for (const grade of ['A', 'B', 'C', 'D']) {
            if (Array.isArray(table[grade]) && table[grade].includes(resolvedType)) return grade;
        }
        return 'D';
    };

    window.getWeaponAffinityMultiplier = function getWeaponAffinityMultiplier(classId, weaponType) {
        const grade = window.getWeaponAffinityGrade(classId, weaponType);
        const cfg = window.WEAPON_AFFINITY_CONFIG;
        const grades = cfg && cfg.affinityGrades;
        if (grades && grades[grade] && grades[grade].statMultiplier != null) {
            return grades[grade].statMultiplier;
        }
        return ({ A: 1.2, B: 1.0, C: 0.8, D: 0.5 })[grade] || 1.0;
    };

    window.getPlayerEffectiveAttack = function getPlayerEffectiveAttack(player) {
        if (!player) return 0;
        const weapon = player.equipment && player.equipment.weapon;
        const wt = weapon && weapon.weaponType;
        const resolved = window.resolveWeaponTypeFromLegacy(wt);
        const isMagic = ['staff', 'book', 'orb', 'rune'].includes(resolved);
        const base = isMagic ? (player.baseMagicAttack || 0) : (player.baseAttack || 0);
        const classId = window.getActiveClassId(player.classData);
        const aff = window.getWeaponAffinityMultiplier(classId, wt || resolved);
        return Math.max(1, Math.floor(base * aff));
    };

    window.computeEquipmentGearScore = function computeEquipmentGearScore(equipment) {
        if (!equipment) return 0;
        const q = window.normalizeEquipmentQuality(equipment.quality);
        const qMult = QUALITY_GS_MULTIPLIER[q] || 1;
        const lv = Math.max(1, equipment.level || 1);
        const enhance = equipment.enhanceLevel || 0;
        let statSum = 0;
        const st = equipment.stats || {};
        const weights = {
            attack: 3, magicAttack: 3, defense: 2, magicDefense: 2,
            health: 0.5, critRate: 2, critDamage: 1.5, dodge: 2,
            attackSpeed: 1.5, moveSpeed: 1
        };
        for (const [k, w] of Object.entries(weights)) {
            if (st[k]) statSum += st[k] * w;
        }
        const baseScore = (10 + lv * 2 + statSum) * qMult;
        return Math.max(1, Math.floor(baseScore + enhance * 3 + (equipment.refineLevel || 0) * 5));
    };

    window.getGearScoreStars = function getGearScoreStars(score) {
        const s = Math.max(0, score || 0);
        if (s >= 200) return 5;
        if (s >= 150) return 4;
        if (s >= 100) return 3;
        if (s >= 60) return 2;
        if (s >= 30) return 1;
        return 0;
    };

    window.getEquipmentAffinityGrade = function getEquipmentAffinityGrade(equipment, classId) {
        if (!equipment || !classId) return 'B';
        if (equipment.slot === 'weapon' && equipment.weaponType) {
            return window.getWeaponAffinityGrade(classId, equipment.weaponType);
        }
        if (equipment.classAffinity) {
            const baseClass = typeof window.getPlayerBaseClassId === 'function'
                ? window.getPlayerBaseClassId({ baseClass: classId, firstAdvancement: null, secondAdvancement: null })
                : classId;
            if (equipment.classAffinity === baseClass || equipment.classAffinity === classId) return 'A';
            const families = { warrior: 'warrior', archer: 'archer', mage: 'mage', assassin: 'assassin' };
            if (families[equipment.classAffinity] === families[baseClass]) return 'B';
            return 'C';
        }
        return 'B';
    };

    window.getEquipmentAffinityMultiplier = function getEquipmentAffinityMultiplier(equipment, classId) {
        const grade = window.getEquipmentAffinityGrade(equipment, classId);
        const cfg = window.WEAPON_AFFINITY_CONFIG;
        const grades = cfg && cfg.affinityGrades;
        if (grades && grades[grade] && grades[grade].statMultiplier != null) {
            return grades[grade].statMultiplier;
        }
        return ({ A: 1.2, B: 1.0, C: 0.8, D: 0.5 })[grade] || 1.0;
    };

    window.computeEquipmentGearScoreV2 = function computeEquipmentGearScoreV2(equipment) {
        if (!equipment) return 0;
        let score = typeof window.computeEquipmentGearScore === 'function'
            ? window.computeEquipmentGearScore(equipment) : 0;
        const affixScore = ((equipment.prefixes || []).length + (equipment.suffixes || []).length) * 8;
        const powerScore = (equipment.legendaryPowers || []).length * 25;
        const setBonus = equipment.setId ? 15 : 0;
        const tierBonus = [...(equipment.prefixes || []), ...(equipment.suffixes || [])]
            .reduce((s, a) => s + (a.tier || 1) * 3, 0);
        return Math.max(1, Math.floor(score + affixScore + powerScore + setBonus + tierBonus));
    };
})();
