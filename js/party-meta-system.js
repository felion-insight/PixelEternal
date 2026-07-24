/**
 * 四人编队局外养成：等级、经验银行、职业数据
 */
(function () {
    'use strict';

    const DEFAULT_ORDER = ['warrior', 'archer', 'mage', 'assassin'];

    function cfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.AUTO_BATTLER_CONFIG) ||
            (typeof window !== 'undefined' && window.AUTO_BATTLER_CONFIG) ||
            {};
    }

    function makeHero(baseClass, level) {
        const ab = cfg();
        const names = ab.classDisplayNames || {};
        return {
            id: baseClass,
            baseClass: baseClass,
            displayName: names[baseClass] || baseClass,
            level: level || 1,
            exp: 0,
            classData: {
                baseClass: baseClass,
                firstAdvancement: null,
                secondAdvancement: null
            }
        };
    }

    function createDefaultPartyMeta() {
        const order = (cfg().partyOrder || DEFAULT_ORDER).slice();
        return {
            heroes: order.map((id) => makeHero(id, 1)),
            expBank: 0,
            highestRunLayer: 0,
            runsCompleted: 0,
            unlockedRelicIds: [],
            unlockedSkillIds: []
        };
    }

    function normalizePartyMeta(raw) {
        const def = createDefaultPartyMeta();
        if (!raw || typeof raw !== 'object') return def;
        const order = (cfg().partyOrder || DEFAULT_ORDER).slice();
        const byId = {};
        (raw.heroes || []).forEach((h) => {
            if (h && h.baseClass) byId[h.baseClass] = h;
        });
        def.heroes = order.map((id) => {
            const h = byId[id];
            if (!h) return makeHero(id, 1);
            return {
                id: id,
                baseClass: id,
                displayName: h.displayName || (cfg().classDisplayNames || {})[id] || id,
                level: Math.max(1, h.level | 0 || 1),
                exp: Math.max(0, h.exp | 0 || 0),
                classData: (typeof window.normalizeClassData === 'function')
                    ? window.normalizeClassData(h.classData || { baseClass: id })
                    : (h.classData || { baseClass: id, firstAdvancement: null, secondAdvancement: null })
            };
        });
        def.expBank = Math.max(0, raw.expBank | 0 || 0);
        def.highestRunLayer = Math.max(0, raw.highestRunLayer | 0 || 0);
        def.runsCompleted = Math.max(0, raw.runsCompleted | 0 || 0);
        def.unlockedRelicIds = Array.isArray(raw.unlockedRelicIds) ? raw.unlockedRelicIds.slice() : [];
        def.unlockedSkillIds = Array.isArray(raw.unlockedSkillIds) ? raw.unlockedSkillIds.slice() : [];
        return def;
    }

    function expToNextLevel(level) {
        if (typeof window.computePlayerExpToNextLevel === 'function') {
            return window.computePlayerExpToNextLevel(level);
        }
        return 80 + 12 * level * level;
    }

    function getActiveClassIdForHero(hero) {
        if (typeof window.getActiveClassId === 'function') {
            return window.getActiveClassId(hero.classData);
        }
        const cd = hero.classData || {};
        return cd.secondAdvancement || cd.firstAdvancement || cd.baseClass || hero.baseClass;
    }

    function getStartingActiveSkillId(hero) {
        const ab = cfg();
        const map = ab.startingActiveByClass || {};
        const activeId = getActiveClassIdForHero(hero);
        return map[activeId] || map[hero.baseClass] || 'shield_slam';
    }

    function getBasicAttackId(hero) {
        const ab = cfg();
        const map = ab.basicAttackByClass || {};
        return map[hero.baseClass] || (hero.baseClass + '_basic');
    }

    function heroCombatStats(hero) {
        const level = hero.level || 1;
        let base = { hp: 100, attack: 10, defense: 4, speed: 70, range: 50 };
        if (typeof window.getClassDefinition === 'function') {
            const def = window.getClassDefinition(hero.baseClass);
            if (def && def.baseStats) {
                const g = def.growthPerLevel || {};
                base = {
                    hp: (def.baseStats.hp || 100) + (g.hp || 15) * (level - 1),
                    attack: (def.baseStats.attack || 10) + (g.attack || 2) * (level - 1),
                    defense: (def.baseStats.defense || 4) + (g.defense || 1) * (level - 1),
                    speed: 55 + (def.baseStats.speed || 5) * 3,
                    range: hero.baseClass === 'archer' || hero.baseClass === 'mage' ? 155 : 48
                };
            }
        } else {
            base.hp = 90 + level * 18;
            base.attack = 8 + level * 2;
            base.defense = 3 + level;
            if (hero.baseClass === 'archer' || hero.baseClass === 'mage') base.range = 155;
        }
        return base;
    }

    /**
     * 从经验银行分配经验给指定英雄；升级在局外完成。
     * @returns {{ ok: boolean, spent: number, levelsGained: number, message?: string }}
     */
    function allocateExpToHero(meta, heroId, amount) {
        if (!meta || amount <= 0) return { ok: false, spent: 0, levelsGained: 0, message: '无效数量' };
        const hero = meta.heroes.find((h) => h.baseClass === heroId || h.id === heroId);
        if (!hero) return { ok: false, spent: 0, levelsGained: 0, message: '未找到角色' };
        const spend = Math.min(amount, meta.expBank);
        if (spend <= 0) return { ok: false, spent: 0, levelsGained: 0, message: '经验银行为空' };
        meta.expBank -= spend;
        hero.exp += spend;
        let levelsGained = 0;
        let guard = 0;
        while (guard++ < 100) {
            const need = expToNextLevel(hero.level);
            if (hero.exp < need) break;
            hero.exp -= need;
            hero.level += 1;
            levelsGained += 1;
        }
        return { ok: true, spent: spend, levelsGained: levelsGained };
    }

    function tryAdvanceJob(hero, advancementId) {
        if (!hero || !advancementId) return { ok: false, message: '无效转职' };
        const cd = hero.classData || { baseClass: hero.baseClass };
        const level = hero.level || 1;
        if (!cd.firstAdvancement) {
            if (level < 20) return { ok: false, message: '需要等级 20 才能一转' };
            cd.firstAdvancement = advancementId;
            hero.classData = cd;
            return { ok: true, message: '一转成功：' + advancementId };
        }
        if (!cd.secondAdvancement) {
            if (level < 40) return { ok: false, message: '需要等级 40 才能二转' };
            cd.secondAdvancement = advancementId;
            hero.classData = cd;
            return { ok: true, message: '二转成功：' + advancementId };
        }
        return { ok: false, message: '已完成全部转职' };
    }

    function getAdvancementOptions(hero) {
        const cd = hero.classData || {};
        const baseId = cd.baseClass || hero.baseClass;
        const cc = (typeof window !== 'undefined' && window.CLASS_CONFIG)
            || (typeof CONFIG !== 'undefined' && CONFIG.CLASS_CONFIG)
            || null;
        if (cc) {
            if (!cd.firstAdvancement && cc.baseClasses && cc.baseClasses[baseId]) {
                return (cc.baseClasses[baseId].advancements || []).slice();
            }
            if (cd.firstAdvancement && !cd.secondAdvancement && cc.firstAdvancements) {
                const a = cc.firstAdvancements[cd.firstAdvancement];
                return (a && a.advancements) || [];
            }
        }
        if (typeof window.getClassDefinition === 'function') {
            const def = window.getClassDefinition(cd.firstAdvancement ? cd.firstAdvancement : baseId);
            return (def && def.advancements) || [];
        }
        return [];
    }

    window.PartyMetaSystem = {
        createDefaultPartyMeta,
        normalizePartyMeta,
        expToNextLevel,
        getActiveClassIdForHero,
        getStartingActiveSkillId,
        getBasicAttackId,
        heroCombatStats,
        allocateExpToHero,
        tryAdvanceJob,
        getAdvancementOptions,
        makeHero
    };
})();
