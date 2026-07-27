/**
 * 职业变异：开局为每角色 roll 2 个变异方向
 */
(function () {
    'use strict';

    function variantCfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.CLASS_VARIANTS_CONFIG) ||
            window.CLASS_VARIANTS_CONFIG || {};
    }

    function isEnabled() {
        return window.AscensionHub && window.AscensionHub.isEnabled('classVariants');
    }

    function variantsForClass(classId) {
        const c = variantCfg();
        const pool = (c.variants || c.CLASS_VARIANTS_CONFIG?.variants || {})[classId] || [];
        return pool.slice();
    }

    function choicesPerClass() {
        const hub = window.AscensionHub ? window.AscensionHub.flag('classVariants') : {};
        return hub.choicesPerClass != null ? hub.choicesPerClass : (variantCfg().choicesPerClass || 2);
    }

    function shuffle(arr, rng) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    function onRunStart(run, rng) {
        if (!isEnabled() || !run) return;
        rng = rng || (window.RunStateSystem && window.RunStateSystem.rngFromRun
            ? window.RunStateSystem.rngFromRun(run) : Math.random);
        run.ascension = run.ascension || {};
        run.ascension.variantChoices = {};
        (run.heroes || []).forEach((h) => {
            const pool = variantsForClass(h.baseClass);
            run.ascension.variantChoices[h.heroId] = shuffle(pool, rng).slice(0, choicesPerClass());
        });
    }

    function needsSelection(run) {
        if (!isEnabled() || !run) return false;
        return (run.heroes || []).some((h) => !h.classVariant);
    }

    function applyChoice(run, heroId, variantId) {
        if (!run) return { ok: false, message: '无效 Run' };
        const hero = (run.heroes || []).find((h) => h.heroId === heroId);
        if (!hero) return { ok: false, message: '无效角色' };
        const choices = (run.ascension && run.ascension.variantChoices && run.ascension.variantChoices[heroId]) || [];
        const pick = choices.find((v) => v.id === variantId);
        if (!pick) return { ok: false, message: '无效变异' };
        hero.classVariant = pick.id;
        hero.classVariantDef = pick;
        return { ok: true, hero: hero, variant: pick };
    }

    function getVariantDef(hero) {
        if (!hero || !hero.classVariant) return null;
        if (hero.classVariantDef) return hero.classVariantDef;
        const pool = variantsForClass(hero.baseClass);
        return pool.find((v) => v.id === hero.classVariant) || null;
    }

    function applyToCombatStats(stats, hero) {
        const v = getVariantDef(hero);
        if (!v || !stats) return stats;
        if (v.attackMult) stats.attack = Math.floor(stats.attack * v.attackMult);
        if (v.defenseMult) stats.defense = Math.floor(stats.defense * v.defenseMult);
        if (v.maxHpMult) stats.hp = Math.floor(stats.hp * v.maxHpMult);
        if (v.speedMult) stats.speed = Math.floor(stats.speed * v.speedMult);
        if (v.rangeMult) stats.range = Math.floor(stats.range * v.rangeMult);
        if (v.critChance) stats.critChance = (stats.critChance || 0) + v.critChance;
        if (v.dodgeBonus) stats.dodgeBonus = (stats.dodgeBonus || 0) + v.dodgeBonus;
        if (v.basicIntervalMult) stats.basicIntervalMult = (stats.basicIntervalMult || 1) * v.basicIntervalMult;
        if (v.skillDamageMult) stats.skillDamageMult = (stats.skillDamageMult || 1) * v.skillDamageMult;
        return stats;
    }

    function getDisplay(hero) {
        const v = getVariantDef(hero);
        return v ? { id: v.id, name: v.name, desc: v.desc } : null;
    }

    window.ClassVariantSystem = {
        isEnabled,
        onRunStart,
        needsSelection,
        applyChoice,
        getVariantDef,
        applyToCombatStats,
        getDisplay,
        variantsForClass
    };
})();
